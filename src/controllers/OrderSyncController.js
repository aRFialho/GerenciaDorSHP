const prisma = require("../config/db");
const {
  parseRangeDays,
  syncOrdersForShop,
} = require("../services/OrderSyncService");

async function sync(req, res, next) {
  try {
    if (!req.auth) {
      return res
        .status(401)
        .json({ error: "unauthorized", message: "Não autenticado." });
    }

    const shopDbId = req.auth.activeShopId || null;
    if (!shopDbId) {
      return res.status(409).json({
        error: "select_shop_required",
        message: "Selecione uma loja para continuar.",
      });
    }

    const shop = await prisma.shop.findFirst({
      where: { id: shopDbId, accountId: req.auth.accountId },
      select: { id: true, shopId: true }, // shopId = Shopee shop_id (BigInt)
    });

    if (!shop) {
      return res.status(404).json({ error: "shop_not_found" });
    }

    const rangeDays = parseRangeDays(req.query.rangeDays);

    const result = await syncOrdersForShop({
      shopeeShopId: String(shop.shopId), // ✅ nunca "active"
      rangeDays,
    });

    return res.json(result);
  } catch (e) {
    return next(e);
  }
}

module.exports = { sync };
