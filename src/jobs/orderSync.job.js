// src/jobs/orderSync.job.js
const prisma = require("../config/db");
const OrderSyncService = require("../services/OrderSyncService");

module.exports = async (job) => {
  const { shopId, rangeDays } = job.data;

  // tenta interpretar shopId como ID interno primeiro
  let shop = await prisma.shop.findUnique({
    where: { id: Number(shopId) },
    select: { id: true, shopId: true },
  });

  // se não achou, tenta interpretar como Shopee shop_id
  if (!shop) {
    shop = await prisma.shop.findUnique({
      where: { shopId: BigInt(String(shopId)) },
      select: { id: true, shopId: true },
    });
  }

  if (!shop) {
    throw new Error(`Shop não encontrado para shopId=${shopId}`);
  }

  console.log("[orderSync] start", {
    jobId: job.id,
    shopIdInternal: shop.id,
    shopeeShopId: String(shop.shopId),
    rangeDays,
  });

  return await OrderSyncService.syncOrdersForShop({
    shopeeShopId: String(shop.shopId),
    rangeDays,
  });
};
