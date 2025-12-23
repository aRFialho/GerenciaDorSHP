// src/jobs/orderSync.job.js
const OrderSyncService = require("../services/OrderSyncService");

module.exports = async (job) => {
  const { shopId, rangeDays } = job.data;

  console.log("[orderSync] start", { jobId: job.id, shopId, rangeDays });

  const result = await OrderSyncService.syncOrdersForShop({
    shopeeShopId: shopId,
    rangeDays,
  });

  console.log("[orderSync] done", { jobId: job.id, shopId, rangeDays, result });
  return result;
};
