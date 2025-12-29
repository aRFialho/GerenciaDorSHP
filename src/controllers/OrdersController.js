const prisma = require("../config/db");

async function getActiveShopOrFail(req, res) {
  if (!req.auth) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }

  const shopDbId = req.auth.activeShopId || null;
  if (!shopDbId) {
    res.status(409).json({
      error: "select_shop_required",
      message: "Selecione uma loja para continuar.",
    });
    return null;
  }

  const shop = await prisma.shop.findFirst({
    where: { id: shopDbId, accountId: req.auth.accountId },
  });

  if (!shop) {
    res.status(404).json({ error: "shop_not_found" });
    return null;
  }

  return shop;
}

async function list(req, res) {
  const shop = await getActiveShopOrFail(req, res);
  if (!shop) return;

  const limit = Math.min(Number(req.query.limit || 60), 200);

  const q = String(req.query.q || "").trim();
  const qDigitsOnly = /^\d+$/.test(q);

  const where = {
    shopId: shop.id,
    ...(q
      ? {
          OR: [
            ...(qDigitsOnly ? [{ itemId: BigInt(q) }] : []),
            { title: { contains: q, mode: "insensitive" } },
            { models: { some: { sku: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const items = await prisma.order.findMany({
    where,
    orderBy: { shopeeUpdateTime: "desc" },
    take: limit,
    select: {
      orderSn: true,
      orderStatus: true,
      shipByDate: true,
      daysToShip: true,
      shopeeCreateTime: true,
      shopeeUpdateTime: true,
      region: true,
      currency: true,
    },
  });

  res.json({ items });
}

async function detail(req, res) {
  const { orderSn } = req.params;

  const shop = await getActiveShopOrFail(req, res);
  if (!shop) return;

  const order = await prisma.order.findUnique({
    where: { shopId_orderSn: { shopId: shop.id, orderSn: String(orderSn) } },
    include: { addressSnapshots: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!order) return res.status(404).json({ error: "order_not_found" });

  res.json({
    order,
    lastAddressSnapshot: order.addressSnapshots[0] || null,
  });
}

module.exports = { list, detail };
