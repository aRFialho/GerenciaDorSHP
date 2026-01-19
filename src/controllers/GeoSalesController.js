const prisma = require("../config/db");
const { Prisma } = require("@prisma/client");
const { PAID_EXCLUDED_STATUSES } = require("../utils/orderStatusRules");

function normalizeStr(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMonths(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 6;
  return Math.min(Math.max(Math.floor(n), 1), 12);
}

// Mapa fixo BR: UF -> nomes normalizados que podem aparecer em stateNorm
const UF_TO_STATE_NORMS = {
  AC: ["ac", "acre"],
  AL: ["al", "alagoas"],
  AP: ["ap", "amapa"],
  AM: ["am", "amazonas"],
  BA: ["ba", "bahia"],
  CE: ["ce", "ceara"],
  DF: ["df", "distrito federal"],
  ES: ["es", "espirito santo"],
  GO: ["go", "goias"],
  MA: ["ma", "maranhao"],
  MT: ["mt", "mato grosso"],
  MS: ["ms", "mato grosso do sul"],
  MG: ["mg", "minas gerais"],
  PA: ["pa", "para"],
  PB: ["pb", "paraiba"],
  PR: ["pr", "parana"],
  PE: ["pe", "pernambuco"],
  PI: ["pi", "piaui"],
  RJ: ["rj", "rio de janeiro"],
  RN: ["rn", "rio grande do norte"],
  RS: ["rs", "rio grande do sul"],
  RO: ["ro", "rondonia"],
  RR: ["rr", "roraima"],
  SC: ["sc", "santa catarina"],
  SP: ["sp", "sao paulo"],
  SE: ["se", "sergipe"],
  TO: ["to", "tocantins"],
};

const STATE_NORM_TO_UF = (() => {
  const m = new Map();
  for (const [uf, arr] of Object.entries(UF_TO_STATE_NORMS)) {
    for (const k of arr) m.set(k, uf);
  }
  return m;
})();

function toUF(stateNormOrRaw) {
  const s = normalizeStr(stateNormOrRaw);
  if (s.length === 2) return s.toUpperCase();
  return STATE_NORM_TO_UF.get(s) || null;
}

function normsForUF(uf) {
  const key = String(uf || "").toUpperCase();
  return UF_TO_STATE_NORMS[key] || [];
}

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

async function byState(req, res) {
  const shop = await getActiveShopOrFail(req, res);
  if (!shop) return;

  const months = parseMonths(req.query.months);
  const mode = String(req.query.mode || "total").toLowerCase();

  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - months);

  let rows;

  if (mode === "pagos") {
    rows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT oga."stateNorm" AS "stateNorm",
               oga."state"     AS "state",
               COUNT(*)        AS "count"
        FROM "OrderGeoAddress" oga
        JOIN "Order" o ON o."id" = oga."orderId"
        WHERE oga."shopId" = ${shop.id}
          AND oga."shopeeCreateTime" >= ${from}
          AND o."orderStatus" IS NOT NULL
          AND o."orderStatus" NOT IN (${Prisma.join(PAID_EXCLUDED_STATUSES)})
        GROUP BY oga."stateNorm", oga."state"
      `,
    );
  } else {
    // total/feitos: mesmo comportamento atual (sem filtro por status)
    const grouped = await prisma.orderGeoAddress.groupBy({
      by: ["stateNorm", "state"],
      where: {
        shopId: shop.id,
        shopeeCreateTime: { gte: from },
      },
      _count: { _all: true },
    });

    rows = grouped.map((r) => ({
      stateNorm: r.stateNorm,
      state: r.state,
      count: r._count._all,
    }));
  }

  const agg = new Map(); // uf -> { uf, count }
  for (const r of rows) {
    const uf = toUF(r.stateNorm || r.state);
    if (!uf) continue;

    const prev = agg.get(uf) || { uf, count: 0 };
    prev.count += Number(r.count) || 0;
    agg.set(uf, prev);
  }

  const items = Array.from(agg.values()).sort((a, b) => b.count - a.count);
  const total = items.reduce((s, x) => s + x.count, 0);

  res.json({ months, from, to, total, items });
}

async function byCityInState(req, res) {
  const shop = await getActiveShopOrFail(req, res);
  if (!shop) return;

  const months = parseMonths(req.query.months);
  const uf = String(req.params.uf || "").toUpperCase();
  const stateNorms = normsForUF(uf);
  const mode = String(req.query.mode || "total").toLowerCase();

  if (!stateNorms.length) {
    res.status(400).json({ error: "invalid_uf", message: "UF inválida." });
    return;
  }

  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - months);

  let rows;

  if (mode === "pagos") {
    rows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT oga."cityNorm" AS "cityNorm",
               oga."city"     AS "city",
               COUNT(*)       AS "count"
        FROM "OrderGeoAddress" oga
        JOIN "Order" o ON o."id" = oga."orderId"
        WHERE oga."shopId" = ${shop.id}
          AND oga."shopeeCreateTime" >= ${from}
          AND oga."stateNorm" IN (${Prisma.join(stateNorms)})
          AND oga."cityNorm" IS NOT NULL
          AND o."orderStatus" IS NOT NULL
          AND o."orderStatus" NOT IN (${Prisma.join(PAID_EXCLUDED_STATUSES)})
        GROUP BY oga."cityNorm", oga."city"
      `,
    );
  } else {
    const grouped = await prisma.orderGeoAddress.groupBy({
      by: ["cityNorm", "city"],
      where: {
        shopId: shop.id,
        shopeeCreateTime: { gte: from },
        stateNorm: { in: stateNorms },
        cityNorm: { not: null },
      },
      _count: { _all: true },
    });

    rows = grouped.map((r) => ({
      cityNorm: r.cityNorm,
      city: r.city,
      count: r._count._all,
    }));
  }

  const items = rows
    .map((r) => ({
      city: r.city,
      cityNorm: r.cityNorm,
      count: Number(r.count) || 0,
    }))
    .sort((a, b) => b.count - a.count);

  const total = items.reduce((s, x) => s + x.count, 0);

  res.json({ uf, months, from, to, total, items });
}

module.exports = { byState, byCityInState };
