const prisma = require("../config/db");
const ShopeeProductService = require("./ShopeeProductService");

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
    Number(process.env.MODEL_FETCH_CONCURRENCY || 6)
  );

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

      // 1) Pré-busca modelos em paralelo (apenas quem tem variação)
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
        }
      );

      const modelsByItemId = new Map();
      for (const r of modelResults) {
        if (r.status === "fulfilled") {
          modelsByItemId.set(r.value.item_id, r.value.models);
        }
      }

      // 2) Persistência no DB
      for (const p of baseList) {
        const itemId = BigInt(String(p.item_id));

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
            description: null,
            currency: p.currency || null,
            priceMin: p.price_info?.[0]?.current_price ?? null,
            priceMax: p.price_info?.[0]?.current_price ?? null,
            stock: p.stock_info_v2?.summary_info?.total_available_stock ?? null,
            sold: p.sold ?? null,
            ratingStar: p.rating?.rating_star ?? null,
            ratingCount: p.rating?.rating_count ?? null,
            hasModel: p.has_model ?? null,
            brand: p.brand?.name || null,
            categoryId: p.category_id ? BigInt(String(p.category_id)) : null,
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
            currency: p.currency || null,
            priceMin: p.price_info?.[0]?.current_price ?? undefined,
            priceMax: p.price_info?.[0]?.current_price ?? undefined,
            stock:
              p.stock_info_v2?.summary_info?.total_available_stock ?? undefined,
            sold: p.sold ?? undefined,
            ratingStar: p.rating?.rating_star ?? null,
            ratingCount: p.rating?.rating_count ?? null,
            hasModel: p.has_model ?? undefined,
            brand: p.brand?.name || null,
            categoryId: p.category_id ? BigInt(String(p.category_id)) : null,
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
          const modelList = modelsByItemId.get(String(p.item_id)) || [];

          if (modelList.length) {
            await prisma.productModel.createMany({
              data: modelList.map((m) => ({
                productId: product.id,
                modelId: BigInt(String(m.model_id)),
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
