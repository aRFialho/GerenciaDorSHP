// src/services/AdsAttributionService.js
const prisma = require("../config/db");

const DEFAULT_TZ_OFFSET_MINUTES = Number(
  process.env.SHOPEE_REPORT_TZ_OFFSET_MINUTES || -180,
); // -03:00

function floorToHourWithOffset(date, offsetMinutes) {
  const ms = date.getTime();
  const shifted = ms + offsetMinutes * 60 * 1000;
  const flooredShifted =
    Math.floor(shifted / (60 * 60 * 1000)) * (60 * 60 * 1000);
  const back = flooredShifted - offsetMinutes * 60 * 1000;
  return new Date(back);
}

function minutesIntoLocalHour(date, offsetMinutes) {
  const ms = date.getTime();
  const shifted = ms + offsetMinutes * 60 * 1000;
  const min = Math.floor((shifted / (60 * 1000)) % 60);
  return min < 0 ? min + 60 : min;
}

function hourKey(d) {
  return d.toISOString(); // DateTime no Prisma guarda instante; ISO é chave estável
}

function metricHasSignal(m) {
  if (!m) return false;

  const spend = Number(m.spendCents || 0);
  const gmv =
    Number(m.gmvBroadRawCents || 0) +
    Number(m.gmvDirectRawCents || 0) +
    Number(m.gmvRawCents || 0);

  const raw = m.raw || {};
  const cap = Math.max(
    0,
    Number(raw?.broad_order || 0),
    Number(raw?.direct_order || 0),
  );

  return spend > 0 || gmv > 0 || cap > 0;
}

function capacityFromMetric(m) {
  const raw = m?.raw || {};
  return Math.max(
    0,
    Number(raw?.broad_order || 0),
    Number(raw?.direct_order || 0),
  );
}

const AdsAttributionService = {
  async run() {
    const sinceMs = Date.now() - 48 * 60 * 60 * 1000; // últimos 2 dias
    const since = new Date(sinceMs);

    const shops = await prisma.shop.findMany({
      select: { id: true, shopId: true, region: true },
    });

    let processedOrders = 0;
    let created = 0;
    let skippedNoCandidates = 0;

    for (const shop of shops) {
      // 1) pedidos elegíveis
      const orders = await prisma.order.findMany({
        where: {
          shopId: shop.id,
          shopeeCreateTime: { not: null, gte: since },
          itemsSubtotalCents: { not: null },
          adsAttribution: null,
        },
        orderBy: { shopeeCreateTime: "asc" },
        take: 500,
        select: {
          id: true,
          shopeeCreateTime: true,
          itemsSubtotalCents: true,
        },
      });

      if (!orders.length) continue;

      processedOrders += orders.length;

      // 2) range de horas necessárias (min/max bucket ±1h)
      const offsetMin = DEFAULT_TZ_OFFSET_MINUTES;

      const buckets = orders.map((o) =>
        floorToHourWithOffset(new Date(o.shopeeCreateTime), offsetMin),
      );

      const minBucket = new Date(
        Math.min(...buckets.map((d) => d.getTime())) - 60 * 60 * 1000,
      );
      const maxBucket = new Date(
        Math.max(...buckets.map((d) => d.getTime())) + 60 * 60 * 1000,
      );

      // 3) carregar métricas hourly do Ads nesse range
      const metrics = await prisma.adsHourlyMetric.findMany({
        where: {
          shopId: shop.id,
          channel: "CPC",
          dateHour: { gte: minBucket, lte: maxBucket },
        },
        select: {
          dateHour: true,
          spendCents: true,
          gmvRawCents: true,
          gmvDirectRawCents: true,
          gmvBroadRawCents: true,
          raw: true,
        },
      });

      const metricByHour = new Map(
        metrics.map((m) => [hourKey(m.dateHour), m]),
      );

      // 4) carregar quantos já foram atribuídos por hora (pra respeitar capacidade)
      const existing = await prisma.orderAdsAttribution.findMany({
        where: {
          shopId: shop.id,
          channel: "CPC",
          matchedHour: { gte: minBucket, lte: maxBucket },
        },
        select: { matchedHour: true },
      });

      const usedByHour = new Map();
      for (const x of existing) {
        const k = hourKey(x.matchedHour);
        usedByHour.set(k, (usedByHour.get(k) || 0) + JobsSafeOne());
      }

      // helper local (evita eslint reclamar de ++ em alguns setups)
      function JobsSafeOne() {
        return 1;
      }

      // 5) matching pedido a pedido
      for (const o of orders) {
        const createTime = new Date(o.shopeeCreateTime);
        const same = floorToHourWithOffset(createTime, offsetMin);
        const prev = new Date(same.getTime() - 60 * 60 * 1000);
        const next = new Date(same.getTime() + 60 * 60 * 1000);

        const candidates = [
          { hour: same, kind: "same" },
          { hour: prev, kind: "prev" },
          { hour: next, kind: "next" },
        ];

        let picked = null;

        for (const c of candidates) {
          const k = hourKey(c.hour);
          const m = metricByHour.get(k);

          if (!metricHasSignal(m)) continue;

          const cap = capacityFromMetric(m);
          const used = usedByHour.get(k) || 0;

          // se a Shopee reporta 0 pedidos atribuídos nessa hora, não atribui (evita inflar)
          if (cap <= 0) continue;
          if (used >= cap) continue;

          picked = { ...c, cap, used };
          break;
        }

        if (!picked) {
          skippedNoCandidates += 1;
          continue;
        }

        const mins = minutesIntoLocalHour(createTime, offsetMin);

        let confidence = "LOW";
        let rule = "pm1h_low";

        if (picked.kind === "same") {
          if (mins <= 15) {
            confidence = "HIGH";
            rule = "same_hour_high_15m";
          } else {
            confidence = "MEDIUM";
            rule = "same_hour_medium";
          }
        } else {
          confidence = "LOW";
          rule = picked.kind === "prev" ? "prev_hour_low" : "next_hour_low";
        }

        await prisma.orderAdsAttribution.create({
          data: {
            shopId: shop.id,
            orderId: o.id,
            channel: "CPC",
            matchedHour: picked.hour,
            amountCents: Number(o.itemsSubtotalCents || 0),
            confidence,
            orderCreateTime: createTime,
            rule,
          },
        });

        const hk = hourKey(picked.hour);
        usedByHour.set(hk, (usedByHour.get(hk) || 0) + 1);
        created += 1;
      }
    }

    return {
      ok: true,
      processedOrders,
      created,
      skippedNoCandidates,
    };
  },
};

module.exports = AdsAttributionService;
