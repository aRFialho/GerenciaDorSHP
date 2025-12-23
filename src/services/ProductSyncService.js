const prisma = require("../config/db");
const { requestShopeeAuthed } = require("./ShopeeAuthedHttp");

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

  let offset = 0;
  let hasNext = true;

  let fetched = 0;
  let upserted = 0;

  while (hasNext) {
    // Shopee: lista de itens
    const list = await requestShopeeAuthed({
      method: "get",
      path: "/api/v2/product/get_item_list",
      shopId: String(shopeeShopId),
      query: {
        offset,
        page_size: pageSize,
        item_status: "NORMAL",
      },
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

    // Shopee: detalhes base em lote (20)
    for (const batch of chunk(itemIds, 20)) {
      const details = await requestShopeeAuthed({
        method: "get",
        path: "/api/v2/product/get_item_base_info",
        shopId: String(shopeeShopId),
        query: { item_id_list: batch },
      });

      const baseList = details?.response?.item_list || [];

      for (const p of baseList) {
        const itemId = BigInt(String(p.item_id));

        const product = await prisma.product.upsert({
          where: { shopId_itemId: { shopId: shopRow.id, itemId } },
          create: {
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
            hasModel: p.has_model ?? null,
            brand: p.brand?.name || null,
            categoryId: p.category_id ? BigInt(String(p.category_id)) : null,
            shopeeUpdateTime: p.update_time
              ? new Date(Number(p.update_time) * 1000)
              : null,
          },
          update: {
            status: p.item_status || null,
            title: p.item_name || null,
            currency: p.currency || null,
            priceMin: p.price_info?.[0]?.current_price ?? undefined,
            priceMax: p.price_info?.[0]?.current_price ?? undefined,
            stock:
              p.stock_info_v2?.summary_info?.total_available_stock ?? undefined,
            sold: p.sold ?? undefined,
            hasModel: p.has_model ?? undefined,
            brand: p.brand?.name || null,
            categoryId: p.category_id ? BigInt(String(p.category_id)) : null,
            shopeeUpdateTime: p.update_time
              ? new Date(Number(p.update_time) * 1000)
              : null,
          },
        });

        upserted += 1;

        // Imagens: regrava o conjunto (simples e consistente)
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

        // Modelos/variações: busca e regrava
        if (p.has_model) {
          const modelsResp = await requestShopeeAuthed({
            method: "get",
            path: "/api/v2/product/get_model_list",
            shopId: String(shopeeShopId),
            query: { item_id: String(p.item_id) },
          });

          const modelList = modelsResp?.response?.model || [];

          await prisma.productModel.deleteMany({
            where: { productId: product.id },
          });

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
        } else {
          // se não tem modelo, garante que não sobra lixo antigo
          await prisma.productModel.deleteMany({
            where: { productId: product.id },
          });
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
