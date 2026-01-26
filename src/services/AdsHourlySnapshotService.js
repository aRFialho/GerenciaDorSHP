// src/services/AdsHourlySnapshotService.js
const prisma = require("../config/db");
const ShopeeAdsService = require("./ShopeeAdsService");
const AuthService = require("./ShopeeAuthService");

function moneyToCents(v) {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function toShopeeDateFromIso(iso) {
  const [y, m, d] = String(iso || "").split("-");
  if (!y || !m || !d) return null;
  return `${d}-${m}-${y}`;
}

function isoTodayUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DEFAULT_TZ_OFFSET = process.env.SHOPEE_REPORT_TZ_OFFSET || "-03:00"; // BR padrão

function shopeeDateHourToDate(
  dateDDMMYYYY,
  hour,
  tzOffset = DEFAULT_TZ_OFFSET,
) {
  const [dd, mm, yyyy] = String(dateDDMMYYYY || "").split("-");
  const HH = String(Number(hour || 0)).padStart(2, "0");
  if (!dd || !mm || !yyyy) return null;

  // interpreta como hora local (offset) e converte internamente para UTC
  return new Date(`${yyyy}-${mm}-${dd}T${HH}:00:00.000${tzOffset}`);
}

function isInvalidAccessTokenResp(rawOrErr) {
  const err = String(
    rawOrErr?.error || rawOrErr?.response?.data?.error || "",
  ).toLowerCase();
  return err === "invalid_acceess_token" || err === "invalid_access_token";
}

async function getDbTokenRow(dbShopId) {
  return prisma.oAuthToken.findUnique({
    where: { shopId: Number(dbShopId) },
    select: { accessToken: true },
  });
}

async function refreshAndReloadAccessToken({ dbShopId, shopeeShopId }) {
  await AuthService.refreshAccessToken({ shopId: String(shopeeShopId) });
  const refreshed = await getDbTokenRow(dbShopId);
  return refreshed?.accessToken || null;
}

async function callAdsWithAutoRefresh({ shop, call }) {
  const tokenRow = await getDbTokenRow(shop.id);
  const token = tokenRow?.accessToken || null;
  if (!token) {
    const err = new Error("Loja sem access_token. Conecte a loja novamente.");
    err.statusCode = 400;
    throw err;
  }

  try {
    return await call(token);
  } catch (e) {
    const data = e?.response?.data || null;
    if (!isInvalidAccessTokenResp(data)) throw e;

    const newToken = await refreshAndReloadAccessToken({
      dbShopId: shop.id,
      shopeeShopId: shop.shopId,
    });

    if (!newToken) throw e;
    return await call(newToken);
  }
}

async function listTargetShops() {
  const tokenRows = await prisma.oAuthToken.findMany({
    where: { accessToken: { not: null } },
    select: { shopId: true },
  });

  const shopIds = tokenRows.map((t) => t.shopId).filter(Boolean);
  if (!shopIds.length) return [];

  return prisma.shop.findMany({
    where: { id: { in: shopIds } },
    select: { id: true, shopId: true, region: true },
  });
}

const AdsHourlySnapshotService = {
  async run() {
    const shops = await listTargetShops();

    let processedShops = 0;
    let upserts = 0;

    // hoje (e opcionalmente ontem nas primeiras horas, pra pegar atrasos)
    const todayIso = isoTodayUTC();
    const todayPerf = toShopeeDateFromIso(todayIso);

    // Se quiser “ontem” nas 2 primeiras horas UTC:
    const now = new Date();
    const includeYesterday = now.getUTCHours() <= 2;

    const datesToFetch = [todayPerf].filter(Boolean);

    if (includeYesterday) {
      const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yIso = `${y.getUTCFullYear()}-${String(y.getUTCMonth() + 1).padStart(2, "0")}-${String(y.getUTCDate()).padStart(2, "0")}`;
      const yPerf = toShopeeDateFromIso(yIso);
      if (yPerf) datesToFetch.push(yPerf);
    }

    for (const shop of shops) {
      processedShops += 1;

      for (const performanceDate of datesToFetch) {
        const raw = await callAdsWithAutoRefresh({
          shop,
          call: (accessToken) =>
            ShopeeAdsService.get_all_cpc_ads_hourly_performance({
              accessToken,
              shopId: shop.shopId,
              performanceDate, // DD-MM-YYYY
            }),
        });

        // Shopee: response é array (como você colou)
        const rows = Array.isArray(raw?.response) ? raw.response : [];
        if (!rows.length) continue;

        for (const r of rows) {
          const dateHour = shopeeDateHourToDate(r.date, r.hour);
          if (!dateHour) continue;

          const spendCents = moneyToCents(r.expense);
          const gmvDirectRawCents = moneyToCents(r.direct_gmv);
          const gmvBroadRawCents = moneyToCents(r.broad_gmv);

          await prisma.adsHourlyMetric.upsert({
            where: {
              shopId_channel_dateHour: {
                shopId: shop.id,
                channel: "CPC",
                dateHour,
              },
            },
            create: {
              shopId: shop.id,
              channel: "CPC",
              dateHour,
              spendCents,
              gmvDirectRawCents,
              gmvBroadRawCents,
              raw: r, // Json no Prisma
            },
            update: {
              spendCents,
              gmvDirectRawCents,
              gmvBroadRawCents,
              raw: r,
              capturedAt: new Date(),
            },
          });

          upserts += 1;
        }
      }
    }

    return { ok: true, processedShops, upserts };
  },
};

module.exports = AdsHourlySnapshotService;
