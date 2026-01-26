const prisma = require("../config/db");
const ShopeeProductService = require("./ShopeeProductService");
const { getItemRatingSummary } = require("./ShopeeProductCommentService");

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function mapLimit(list, limit, fn) {
  const ret = [];
  const executing = new Set();

  for (const item of list) {
    const p = Promise.resolve().then(() => fn(item));
    ret.push(p);
    executing.add(p);
    p.finally(() => executing.delete(p));

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.allSettled(ret);
}

function toBigInt(v) {
  return BigInt(String(v));
}

function asItemIdStr(v) {
  return String(v ?? "").trim();
}

function isRatingFresh(ratingSyncedAt, ttlMs) {
  if (!ratingSyncedAt) return false;
  const t = new Date(ratingSyncedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ttlMs;
}

async function syncProductsForShop({ shopeeShopId, pageSize = 50 }) {
  const shopRow = await prisma.shop.findUnique({
    where: { shopId: BigInt(String(shopeeShopId)) },
  });

  if (!shopRow) {
    const err = new Error("Shop não cadastrado no banco");
    err.statusCode = 400;
    throw err;
  }

  const MODEL_CONCURRENCY = Math.max(
    1,
    Number(process.env.MODEL_FETCH_CONCURRENCY || 6),
  );

  const COMMENT_CONCURRENCY = Math.max(
    1,
    Number(process.env.COMMENT_FETCH_CONCURRENCY || 4),
  );

  const RATING_TTL_MS = 24 * 60 * 60 * 1000; // 24h

  let offset = 0;
  let hasNext = true;

  let fetched = 0;
  let upserted = 0;

  while (hasNext) {
    const list = await ShopeeProductService.getItemList({
      shopId: shopeeShopId,
      offset,
      pageSize,
      itemStatus: "NORMAL",
    });

    const items = list?.response?.item || [];
    const itemIds = items.map((x) => x.item_id).filter(Boolean);

    fetched += itemIds.length;

    if (itemIds.length === 0) {
      hasNext = Boolean(list?.response?.has_next_page);
      offset = Number(list?.response?.next_offset || 0);
      if (!hasNext) break;
      continue;
    }

    for (const batch of chunk(itemIds, 20)) {
      const details = await ShopeeProductService.getItemBaseInfo({
        shopId: shopeeShopId,
        itemIdList: batch,
      });

      const baseList = details?.response?.item_list || [];
      if (!baseList.length) continue;

      // 0) Pré-carrega do DB (pra TTL de 24h e fallback)
      const baseItemIdsBig = baseList
        .map((p) => (p?.item_id ? toBigInt(p.item_id) : null))
        .filter(Boolean);

      const existingRows = await prisma.product.findMany({
        where: {
          shopId: shopRow.id,
          itemId: { in: baseItemIdsBig },
        },
        select: {
          itemId: true,
          ratingStar: true,
          ratingCount: true,
          ratingOver500: true,
          ratingSyncedAt: true,
        },
      });

      const existingByItemId = new Map();
      for (const r of existingRows) {
        existingByItemId.set(String(r.itemId), r);
      }

      // 1) Ratings por comentários (com TTL 24h)
      const ratingResults = await mapLimit(
        baseList,
        COMMENT_CONCURRENCY,
        async (p) => {
          if (!p?.item_id) return null;

          const itemIdStr = asItemIdStr(p.item_id);
          const existing = existingByItemId.get(itemIdStr) || null;

          // TTL: se está fresco, não chama Shopee
          if (
            existing &&
            isRatingFresh(existing.ratingSyncedAt, RATING_TTL_MS)
          ) {
            return {
              itemId: itemIdStr,
              ok: true,
              usedCache: true,
              avgStar: existing.ratingStar ?? null,
              ratingCount: existing.ratingCount ?? null,
              over500: existing.ratingOver500 ?? false,
            };
          }

          // Recalcular via get_comment
          const r = await getItemRatingSummary({
            shopId: String(shopeeShopId),
            itemId: itemIdStr,
            max: 500,
            pageSize: 100,
          });

          return {
            itemId: itemIdStr,
            ok: true,
            usedCache: false,
            avgStar: Number.isFinite(r.avgStar) ? r.avgStar : 0,
            ratingCount: Number.isInteger(r.ratingCount) ? r.ratingCount : 0,
            over500: Boolean(r.over500),
          };
        },
      );

      const ratingByItemId = new Map();
      const ratingComputedNow = new Set(); // itemIds que realmente recalcularam (não cache)

      for (const r of ratingResults) {
        if (r.status === "fulfilled" && r.value?.itemId && r.value?.ok) {
          ratingByItemId.set(r.value.itemId, r.value);
          if (!r.value.usedCache) ratingComputedNow.add(r.value.itemId);
        }
      }

      // 2) Pré-busca modelos em paralelo (apenas quem tem variação)
      const withModel = baseList.filter((p) => p?.has_model && p?.item_id);

      const modelResults = await mapLimit(
        withModel,
        MODEL_CONCURRENCY,
        async (p) => {
          const resp = await ShopeeProductService.getModelList({
            shopId: shopeeShopId,
            itemId: p.item_id,
          });

          return {
            item_id: String(p.item_id),
            models: resp?.response?.model || [],
          };
        },
      );

      const modelsByItemId = new Map();
      for (const r of modelResults) {
        if (r.status === "fulfilled") {
          modelsByItemId.set(r.value.item_id, r.value.models);
        }
      }

      // 3) Persistência no DB
      for (const p of baseList) {
        if (!p?.item_id) continue;

        const itemIdStr = asItemIdStr(p.item_id);
        const itemId = toBigInt(p.item_id);

        const rr = ratingByItemId.get(itemIdStr) || null;
        const existing = existingByItemId.get(itemIdStr) || null;

        // Preferência:
        // a) se rr existe -> usa rr (cache ou recalculado)
        // b) se rr falhou -> usa existing
        // c) senão -> cai no p.rating do Shopee (base info)
        const ratingStarFinal =
          rr && rr.avgStar !== null
            ? rr.avgStar
            : (existing?.ratingStar ?? p.rating?.rating_star ?? null);

        const ratingCountFinal =
          rr && rr.ratingCount !== null
            ? rr.ratingCount
            : (existing?.ratingCount ?? p.rating?.rating_count ?? null);

        const ratingOver500Final = rr
          ? Boolean(rr.over500)
          : Boolean(existing?.ratingOver500 ?? false);

        const shouldUpdateRatingSyncedAt = ratingComputedNow.has(itemIdStr);

        const product = await prisma.product.upsert({
          where: { shopId_itemId: { shopId: shopRow.id, itemId } },
          create: {
            shopeeCreateTime: p.create_time
              ? new Date(Number(p.create_time) * 1000)
              : null,
            shopId: shopRow.id,
            itemId,
            status: p.item_status || null,
            title: p.item_name || null,
            description: p.description || null,
            attributes: p.attribute_list ?? null,
            logistics: p.logistic_info ?? null,
            dimension: p.dimension ?? null,
            weight: p.weight != null ? Number(p.weight) : null,
            daysToShip: p.pre_order?.days_to_ship ?? null,
            itemSku: p.item_sku || null,
            brand: p.brand?.original_brand_name || null,
            currency: p.currency || null,
            priceMin: p.price_info?.[0]?.current_price ?? null,
            priceMax: p.price_info?.[0]?.current_price ?? null,
            stock: p.stock_info_v2?.summary_info?.total_available_stock ?? null,
            sold: p.sold ?? null,

            ratingStar: ratingStarFinal,
            ratingCount: ratingCountFinal,
            ratingOver500: ratingOver500Final,
            ratingSyncedAt: shouldUpdateRatingSyncedAt ? new Date() : null,

            hasModel: p.has_model ?? null,
            categoryId: p.category_id ? toBigInt(p.category_id) : null,
            shopeeUpdateTime: p.update_time
              ? new Date(Number(p.update_time) * 1000)
              : null,
          },
          update: {
            shopeeCreateTime: p.create_time
              ? new Date(Number(p.create_time) * 1000)
              : undefined,
            status: p.item_status || null,
            title: p.item_name || null,
            description: p.description ?? undefined,
            itemSku: p.item_sku ?? undefined,
            attributes: p.attribute_list ?? undefined,
            logistics: p.logistic_info ?? undefined,
            dimension: p.dimension ?? undefined,
            weight: p.weight != null ? Number(p.weight) : undefined,
            daysToShip: p.pre_order?.days_to_ship ?? undefined,
            brand: p.brand?.original_brand_name || null,
            currency: p.currency ?? undefined,
            priceMin: p.price_info?.[0]?.current_price ?? undefined,
            priceMax: p.price_info?.[0]?.current_price ?? undefined,
            stock:
              p.stock_info_v2?.summary_info?.total_available_stock ?? undefined,
            sold: p.sold ?? undefined,

            ratingStar: ratingStarFinal,
            ratingCount: ratingCountFinal,
            ratingOver500: ratingOver500Final,
            ...(shouldUpdateRatingSyncedAt
              ? { ratingSyncedAt: new Date() }
              : {}),

            hasModel: p.has_model ?? undefined,
            categoryId: p.category_id ? toBigInt(p.category_id) : null,
            shopeeUpdateTime: p.update_time
              ? new Date(Number(p.update_time) * 1000)
              : null,
          },
        });

        upserted += 1;

        // Imagens
        if (Array.isArray(p.image?.image_url_list)) {
          await prisma.productImage.deleteMany({
            where: { productId: product.id },
          });

          if (p.image.image_url_list.length) {
            await prisma.productImage.createMany({
              data: p.image.image_url_list.map((url) => ({
                productId: product.id,
                url,
              })),
              skipDuplicates: true,
            });
          }
        }

        // Modelos
        await prisma.productModel.deleteMany({
          where: { productId: product.id },
        });

        if (p.has_model) {
          const modelList = modelsByItemId.get(itemIdStr) || [];

          if (modelList.length) {
            await prisma.productModel.createMany({
              data: modelList.map((m) => ({
                productId: product.id,
                modelId: toBigInt(m.model_id),
                name: m.model_name || null,
                sku: m.sku || null,
                price: m.price_info?.[0]?.current_price ?? null,
                stock:
                  m.stock_info_v2?.summary_info?.total_available_stock ?? null,
                sold: m.sold ?? null,
              })),
              skipDuplicates: true,
            });
          }
        }
      }
    }

    hasNext = Boolean(list?.response?.has_next_page);
    offset = Number(list?.response?.next_offset || 0);
    if (!hasNext) break;
  }

  return {
    status: "ok",
    shop_id: String(shopeeShopId),
    summary: { fetched, upserted },
  };
}

module.exports = { syncProductsForShop };
