const prisma = require("../config/db");
const { paidOrderWhere } = require("../utils/orderStatusRules");

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
      0,
    ).getDate();
    const dayOfMonth = now.getDate();

    const orders = await prisma.order.findMany({
      where: {
        shopId: shop.id,
        ...paidOrderWhere(),
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

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    res.json({
      period: {
        label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
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
    res.status(500).json({
      error: "dashboard_monthly_sales_failed",
      message: String(e?.message || e),
    });
  }
}

async function todaySales(req, res) {
  try {
    const shop = await getActiveShopOrFail(req, res);
    if (!shop) return;

    const now = new Date();
    const startToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startYesterday = new Date(startToday);
    startYesterday.setDate(startYesterday.getDate() - 1);

    const orders = await prisma.order.findMany({
      where: {
        shopId: shop.id,
        ...paidOrderWhere(),
        OR: [
          { shopeeCreateTime: { gte: startYesterday, lte: now } },
          {
            shopeeCreateTime: null,
            createdAt: { gte: startYesterday, lte: now },
          },
        ],
      },
      select: { shopeeCreateTime: true, createdAt: true, gmvCents: true },
    });

    const hourlyToday = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      gmvCents: 0,
    }));
    const hourlyYesterday = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      gmvCents: 0,
    }));

    let gmvTodayCents = 0;
    let gmvYesterdayCents = 0;
    let ordersCountToday = 0;
    let ordersCountYesterday = 0;

    for (const o of orders) {
      const dt = o.shopeeCreateTime || o.createdAt;
      const cents = Number(o.gmvCents || 0);

      if (dt >= startToday) {
        hourlyToday[dt.getHours()].gmvCents += cents;
        gmvTodayCents += cents;
        ordersCountToday += 1;
      } else if (dt >= startYesterday && dt < startToday) {
        hourlyYesterday[dt.getHours()].gmvCents += cents;
        gmvYesterdayCents += cents;
        ordersCountYesterday += 1;
      }
    }

    const currentHour = now.getHours();

    const sumUpToHour = (arr, h) =>
      arr.slice(0, h + 1).reduce((s, x) => s + Number(x.gmvCents || 0), 0);

    const cumTodayCents = sumUpToHour(hourlyToday, currentHour);
    const cumYesterdayCents = sumUpToHour(hourlyYesterday, currentHour);

    const deltaCents = cumTodayCents - cumYesterdayCents;
    const deltaPct =
      cumYesterdayCents > 0
        ? Math.round((deltaCents / cumYesterdayCents) * 100)
        : null;

    const ticketAvgTodayCents = ordersCountToday
      ? Math.round(gmvTodayCents / ordersCountToday)
      : 0;

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    res.json({
      period: {
        label: "Hoje",
        dayLabel: now.toLocaleDateString("pt-BR"),
      },
      metrics: {
        gmvTodayCents,
        ordersCountToday,
        ticketAvgTodayCents,
        gmvYesterdayCents,
        ordersCountYesterday,
        currentHour,
        deltaCents,
        deltaPct,
      },
      hourlyBarsToday: hourlyToday,
      hourlyBarsYesterday: hourlyYesterday,
    });
  } catch (e) {
    console.error("dashboard.todaySales failed:", e);
    res.status(500).json({
      error: "dashboard_today_sales_failed",
      message: String(e?.message || e),
    });
  }
}

/**
 * Fallback: como não existe OrderItem no schema, não dá pra calcular "top vendidos do mês" real.
 * Aqui usamos Product.sold (geral) como ranking para preencher o widget.
 */
async function topSellersMonth(req, res) {
  try {
    const shop = await getActiveShopOrFail(req, res);
    if (!shop) return;

    const items = await prisma.product.findMany({
      where: { shopId: shop.id },
      orderBy: [{ sold: "desc" }, { updatedAt: "desc" }],
      take: 5,
      select: {
        itemId: true,
        title: true,
        sold: true,
        priceMin: true,
        priceMax: true,
      },
    });

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    res.json({ items });
  } catch (e) {
    console.error("dashboard.topSellersMonth failed:", e);
    res.status(500).json({
      error: "dashboard_top_sellers_failed",
      message: String(e?.message || e),
    });
  }
}

module.exports = { monthlySales, todaySales, topSellersMonth };
