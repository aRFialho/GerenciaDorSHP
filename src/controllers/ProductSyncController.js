const { syncProductsForShop } = require("../services/ProductSyncService");

async function sync(req, res) {
  const { shopId } = req.params;
  const result = await syncProductsForShop({ shopeeShopId: shopId });
  res.json(result);
}

module.exports = { sync };
