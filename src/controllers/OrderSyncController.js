const {
  parseRangeDays,
  syncOrdersForShop,
} = require("../services/OrderSyncService");

async function sync(req, res) {
  const { shopId } = req.params;
  const rangeDays = parseRangeDays(req.query.rangeDays);

  const result = await syncOrdersForShop({
    shopeeShopId: shopId,
    rangeDays,
  });

  res.json(result);
}

module.exports = { sync };
