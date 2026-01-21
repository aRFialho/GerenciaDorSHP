const multer = require("multer");
const prisma = require("../config/db");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 }, // 80MB
});

const MODEL_ORDER = [
  "account",
  "user",
  "shop",
  "oAuthToken",
  "product",
  "productImage",
  "productModel",
  "order",
  "orderGeoAddress",
  "orderAddressSnapshot",
  "orderAddressChangeAlert",
  "orderItem",
  "adsCampaignGroup",
  "adsCampaignGroupCampaign",
];

// Campos BigInt (precisam ir/voltar como string no JSON)
const BIGINT_FIELDS = {
  shop: ["shopId"],
  product: ["itemId", "categoryId"],
  productModel: ["modelId"],
  orderItem: ["itemId", "modelId"],
};

function assertAdmin(req) {
  const role = String(req?.auth?.user?.role || req?.auth?.role || "");
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/* ---------- BigInt-safe JSON ---------- */
function serializeForJson(value) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) return value.map(serializeForJson);

  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeForJson(v);
    return out;
  }

  return value;
}

function reviveBigInts(modelKey, rows) {
  const fields = BIGINT_FIELDS[modelKey] || [];
  if (!fields.length) return rows;

  return (Array.isArray(rows) ? rows : []).map((r) => {
    const o = { ...r };
    for (const f of fields) {
      if (o[f] == null) continue;
      // aceita string/number; converte para BigInt
      o[f] = BigInt(o[f]);
    }
    return o;
  });
}

/* ---------- Postgres sequences ---------- */
async function resetSequencesPostgres(tx) {
  // Ajusta sequences para IDs autoincrement Int @id
  // (se sua tabela/sequence tiver nomes custom, pode precisar adaptar)
  const tables = [
    { table: "Account", pk: "id" },
    { table: "User", pk: "id" },
    { table: "Shop", pk: "id" },
    { table: "OAuthToken", pk: "id" },
    { table: "Order", pk: "id" },
    { table: "OrderGeoAddress", pk: "id" },
    { table: "OrderAddressSnapshot", pk: "id" },
    { table: "OrderAddressChangeAlert", pk: "id" },
    { table: "OrderItem", pk: "id" },
    { table: "Product", pk: "id" },
    { table: "ProductImage", pk: "id" },
    { table: "ProductModel", pk: "id" },
    { table: "AdsCampaignGroup", pk: "id" },
    { table: "AdsCampaignGroupCampaign", pk: "id" },
  ];

  for (const { table, pk } of tables) {
    // setval(pg_get_serial_sequence('"Table"', 'id'), COALESCE(MAX(id), 1))
    await tx.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"','${pk}'), COALESCE((SELECT MAX("${pk}") FROM "${table}"), 1));`,
    );
  }
}
async function createManyBatched(delegate, rows, batchSize = 1000) {
  for (let i = 0; i < rows.length; i += batchSize) {
    await delegate.createMany({
      data: rows.slice(i, i + batchSize),
      skipDuplicates: false,
    });
  }
}
const AdminDbController = {
  uploadMiddleware: upload.single("file"),

  async backup(req, res) {
    if (!assertAdmin(req)) return res.status(403).json({ error: "forbidden" });

    const data = {};
    for (const m of MODEL_ORDER) {
      const delegate = prisma[m];
      if (!delegate?.findMany) {
        return res
          .status(500)
          .json({ error: `delegate Prisma não encontrado: ${m}` });
      }
      const rows = await delegate.findMany();
      data[m] = serializeForJson(rows);
    }

    const payload = {
      meta: {
        version: 1,
        createdAt: new Date().toISOString(),
        provider: "postgresql",
        models: MODEL_ORDER,
      },
      data,
    };

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="db-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return res.status(200).send(JSON.stringify(payload));
  },

  async restore(req, res) {
    if (!assertAdmin(req)) return res.status(403).json({ error: "forbidden" });
    if (!req.file?.buffer)
      return res.status(400).json({ error: "Arquivo ausente (field: file)." });

    let payload;
    try {
      payload = JSON.parse(req.file.buffer.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "JSON inválido." });
    }

    const models = payload?.meta?.models;
    const data = payload?.data;

    if (!Array.isArray(models) || !data || typeof data !== "object") {
      return res
        .status(400)
        .json({ error: "Formato inválido (meta.models/data)." });
    }

    // Exige compatibilidade estrita
    const same =
      models.length === MODEL_ORDER.length &&
      models.every((m, i) => m === MODEL_ORDER[i]);

    if (!same) {
      return res.status(400).json({
        error: "Backup incompatível com o schema atual (lista de modelos).",
        details: { expected: MODEL_ORDER, file: models },
      });
    }

    await prisma.$transaction(
      async (tx) => {
        // 1) TRUNCATE (Postgres) — rápido e já reseta sequences
        await tx.$executeRawUnsafe(`
  TRUNCATE TABLE
    "AdsCampaignGroupCampaign",
    "AdsCampaignGroup",
    "OrderItem",
    "OrderAddressChangeAlert",
    "OrderAddressSnapshot",
    "OrderGeoAddress",
    "Order",
    "ProductModel",
    "ProductImage",
    "Product",
    "OAuthToken",
    "Shop",
    "User",
    "Account"
  RESTART IDENTITY CASCADE;
`);

        // 2) INSERT (ordem direta)
        for (const m of models) {
          const delegate = tx[m];
          if (!delegate?.createMany)
            throw new Error(`createMany indisponível: ${m}`);

          const rowsRaw = Array.isArray(data[m]) ? data[m] : [];
          if (!rowsRaw.length) continue;

          const rows = reviveDates(reviveBigInts(m, rowsRaw));

          await createManyBatched(delegate, rows, 1000);
        }
        // 3) Ajusta sequences do Postgres (necessário após inserts com id explícito)
        await resetSequencesPostgres(tx);
      },
      {
        maxWait: 20000, // tempo máx. esperando conexão
        timeout: 600000, // 10 min (ajuste conforme tamanho do DB)
      },
    );

    return res.status(200).json({ ok: true });
  },
};

const DATE_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "expiresAt",
  "shipByDate",
  "shopeeCreateTime",
  "shopeeUpdateTime",
  "accessTokenExpiresAt",
  "refreshTokenExpiresAt",
  "detectedAt",
  "resolvedAt",
]);

function reviveDates(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const o = { ...r };

    for (const k of Object.keys(o)) {
      if (!DATE_KEYS.has(k)) continue;

      const v = o[k];

      // backup antigo bugado: Date virou {}
      if (v && typeof v === "object" && Object.keys(v).length === 0) {
        delete o[k]; // deixa Prisma/default cuidar (quando houver default)
        continue;
      }

      if (typeof v === "string" && v) {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) o[k] = d;
      }
    }

    return o;
  });
}

module.exports = AdminDbController;
