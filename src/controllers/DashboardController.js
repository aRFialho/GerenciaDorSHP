const prisma = require("../config/db");
const { paidOrderWhere } = require("../utils/orderStatusRules");
const SHOPEE_TZ = process.env.SHOPEE_REPORT_TZ_OFFSET || "-03:00";
const { hourIndexInOffset, tzOffsetToMinutes } = require("../utils/timezone");

function isoDateInOffsetNow(tzOffset) {
  const offsetMin = tzOffsetToMinutes(tzOffset);
  const now = new Date();
  const shifted = new Date(now.getTime() + offsetMin * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

function addDaysIso(isoYmd, deltaDays) {
  const d = new Date(`${isoYmd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfIsoDayInOffset(isoYmd, tzOffset) {
  return new Date(`${isoYmd}T00:00:00.000${tzOffset}`);
}
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

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(d, n) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function clampDayOfMonth(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, lastDay);
}

function pctDelta(curVal, prevVal) {
  if (!prevVal) return null;
  return Math.round(((curVal - prevVal) / prevVal) * 100);
}

async function aggMtd({ shopId, from, to }) {
  const agg = await prisma.order.aggregate({
    where: {
      shopId,
      ...paidOrderWhere(),
      OR: [
        { shopeeCreateTime: { gte: from, lte: to } },
        { shopeeCreateTime: null, createdAt: { gte: from, lte: to } },
      ],
    },
    _sum: { gmvCents: true },
    _count: { _all: true },
  });

  const gmv = Number(agg?._sum?.gmvCents || 0);
  const orders = Number(agg?._count?._all || 0);
  const ticket = orders > 0 ? Math.round(gmv / orders) : 0;

  return { gmvMtdCents: gmv, ordersCountMtd: orders, ticketAvgCents: ticket };
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

    // ----- RANGE MTD "espelho" do mês anterior (mesmos dias/horário) -----
    const prevMonthDate = addMonths(now, -1);
    const prevFrom = startOfMonth(prevMonthDate);

    const prevDay = clampDayOfMonth(
      prevFrom.getFullYear(),
      prevFrom.getMonth(),
      now.getDate(),
    );
    const prevTo = new Date(
      prevFrom.getFullYear(),
      prevFrom.getMonth(),
      prevDay,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );

    const prevAgg = await aggMtd({
      shopId: shop.id,
      from: prevFrom,
      to: prevTo,
    });

    // ----- Pedidos do mês (para montar dailyBars) -----
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

      const d = dt.getDate();
      if (d >= 1 && d <= daysInMonth) {
        dailyBars[d - 1].gmvCents += cents;
      }
    }

    const avgPerDayCents = Math.round(gmvMtdCents / Math.max(1, dayOfMonth));
    const projectionCents = avgPerDayCents * daysInMonth;

    const ordersCountMtd = orders.length;
    const ticketAvgCents = ordersCountMtd
      ? Math.round(gmvMtdCents / ordersCountMtd)
      : 0;

    const compare = {
      prev: prevAgg,
      delta: {
        gmvDeltaCents: gmvMtdCents - prevAgg.gmvMtdCents,
        gmvDeltaPct: pctDelta(gmvMtdCents, prevAgg.gmvMtdCents),

        ordersDeltaCount: ordersCountMtd - prevAgg.ordersCountMtd,
        ordersDeltaPct: pctDelta(ordersCountMtd, prevAgg.ordersCountMtd),

        ticketDeltaCents: ticketAvgCents - prevAgg.ticketAvgCents,
        ticketDeltaPct: pctDelta(ticketAvgCents, prevAgg.ticketAvgCents),
      },
    };

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
      compare,
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

    // “Hoje” e “ontem” no fuso do relatório (ex.: -03:00)
    const todayIso = isoDateInOffsetNow(SHOPEE_TZ);
    const yesterdayIso = addDaysIso(todayIso, -1);

    // Início de hoje/ontem (instantes UTC equivalentes ao 00:00 local do offset)
    const startToday = startOfIsoDayInOffset(todayIso, SHOPEE_TZ);
    const startYesterday = startOfIsoDayInOffset(yesterdayIso, SHOPEE_TZ);

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
        const h = hourIndexInOffset(dt, SHOPEE_TZ);
        hourlyToday[h].gmvCents += cents;
        gmvTodayCents += cents;
        ordersCountToday += 1;
      } else if (dt >= startYesterday && dt < startToday) {
        const h = hourIndexInOffset(dt, SHOPEE_TZ);
        hourlyYesterday[h].gmvCents += cents;
        gmvYesterdayCents += cents;
        ordersCountYesterday += 1;
      }
    }

    const currentHour = hourIndexInOffset(now, SHOPEE_TZ);

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
        dayLabel: todayIso, // evita confusão de timezone no servidor
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
 * Fallback: sem OrderItem ainda, não dá pra calcular top do mês por GMV real.
 * Aqui retorna "quantity" baseado em Product.sold (geral) e "gmvCents" zerado
 * só pra não quebrar o widget no front.
 */
async function topSellersMonth(req, res) {
  try {
    const shop = await getActiveShopOrFail(req, res);
    if (!shop) return;

    const items = await prisma.product.findMany({
      where: { shopId: shop.id },
      orderBy: [{ sold: "desc" }, { updatedAt: "desc" }],
      take: 5,
      select: { title: true, sold: true },
    });

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    res.json({
      items: items.map((p) => ({
        title: p.title || "—",
        quantity: Number(p.sold || 0),
        gmvCents: 0,
      })),
    });
  } catch (e) {
    console.error("dashboard.topSellersMonth failed:", e);
    res.status(500).json({
      error: "dashboard_top_sellers_failed",
      message: String(e?.message || e),
    });
  }
}

module.exports = { monthlySales, todaySales, topSellersMonth };
