const prisma = require("../config/db");

async function getActiveShopOrFail(req, res) {
  if (!req.auth) return res.status(401).json({ error: "unauthorized" });
  const shopDbId = req.auth.activeShopId || null;
  if (!shopDbId) return res.status(409).json({ error: "select_shop_required" });

  const shop = await prisma.shop.findFirst({
    where: { id: shopDbId, accountId: req.auth.accountId },
  });
  if (!shop) return res.status(404).json({ error: "shop_not_found" });
  return shop;
}

async function monthlySales(req, res) {
  try {
    const shop = await getActiveShopOrFail(req, res);
    if (!shop) return;

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0
    ).getDate();
    const dayOfMonth = now.getDate();

    const orders = await prisma.order.findMany({
      where: {
        shopId: shop.id,
        OR: [
          { shopeeCreateTime: { gte: start, lte: now } },
          { shopeeCreateTime: null, createdAt: { gte: start, lte: now } },
        ],
      },
      select: { shopeeCreateTime: true, createdAt: true, gmvCents: true },
    });

    const dailyBars = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      gmvCents: 0,
    }));
    let gmvMtdCents = 0;

    for (const o of orders) {
      const dt = o.shopeeCreateTime || o.createdAt;
      const cents = Number(o.gmvCents || 0);
      gmvMtdCents += cents;
      dailyBars[dt.getDate() - 1].gmvCents += cents;
    }

    const avgPerDayCents = Math.round(gmvMtdCents / Math.max(1, dayOfMonth));
    const projectionCents = avgPerDayCents * daysInMonth;
    const ordersCountMtd = orders.length;
    const ticketAvgCents = ordersCountMtd
      ? Math.round(gmvMtdCents / ordersCountMtd)
      : 0;

    res.json({
      period: {
        label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
          2,
          "0"
        )}`,
        dayOfMonth,
        daysInMonth,
        progressPct: Math.round((dayOfMonth / daysInMonth) * 100),
      },
      metrics: {
        gmvMtdCents,
        avgPerDayCents,
        projectionCents,
        ordersCountMtd,
        ticketAvgCents,
        adsAttributedCents: null,
        adsStatus: "not_configured",
        organicEstimatedCents: gmvMtdCents,
      },
      dailyBars,
    });
  } catch (e) {
    console.error("dashboard.monthlySales failed:", e);
    res
      .status(500)
      .json({
        error: "dashboard_monthly_sales_failed",
        message: String(e?.message || e),
      });
  }
}

module.exports = { monthlySales };
