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
function normalizeStatus(s) {
  return String(s || "")
    .toUpperCase()
    .trim();
}
const HIDDEN_STATUSES = [
  "COMPLETED", // finalizado
  "CANCELLED", // cancelado
  "RETURNED", // devolvido
  "TO_CONFIRM_RECEIVE", // entregue/aguardando confirmação (geralmente “já entregue”)
  "IN_CANCEL", // em cancelamento
  "TO_RETURN", // em devolução
];
async function list(req, res) {
  const shop = await getActiveShopOrFail(req, res);
  if (!shop) return;
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 60), 1), 200);
  const limit = Math.min(Number(req.query.limit || 60), 200);
  let whereClause = { shopId: shop.id };
  let usePagination = true; // ✅ Se vier status (CSV), filtra explicitamente e NÃO aplica hidden
  if (req.query.status) {
    const statuses = String(req.query.status)
      .split(",")
      .map(normalizeStatus)
      .filter(Boolean);
    whereClause.orderStatus = { in: statuses };
  } else {
    // ✅ Compatibilidade: mantém a regra atual quando não há status
    whereClause.NOT = { orderStatus: { in: HIDDEN_STATUSES } };
  } // ✅ Compatibilidade: se veio limit e NÃO veio page/pageSize, mantém resposta antiga {items}
  if (req.query.limit && !req.query.page && !req.query.pageSize) {
    usePagination = false;
  }
  const total = await prisma.order.count({ where: whereClause });
  let items;
  if (usePagination) {
    const skip = (page - 1) * pageSize;
    items = await prisma.order.findMany({
      where: whereClause,
      orderBy: { shopeeUpdateTime: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
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
  } else {
    items = await prisma.order.findMany({
      where: whereClause,
      orderBy: { shopeeUpdateTime: "desc" },
      take: limit,
      select: {
        id: true,
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
  }
  if (!items.length) {
    const response = usePagination
      ? {
          items: [],
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        }
      : { items: [] };
    res.json(response);
    return;
  }
  const orderIds = items.map((o) => o.id);
  const grouped = await prisma.orderAddressChangeAlert.groupBy({
    by: ["orderId"],
    where: { resolvedAt: null, orderId: { in: orderIds } },
    _count: { _all: true },
  });
  const countMap = new Map(grouped.map((g) => [g.orderId, g._count._all]));
  const enrichedItems = items.map((o) => {
    const c = countMap.get(o.id) || 0;
    return {
      ...o,
      hasAddressAlert: c > 0,
      addressAlertCount: c,
    };
  });
  const response = usePagination
    ? {
        items: enrichedItems,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    : { items: enrichedItems };
  res.json(response);
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
