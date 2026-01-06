const prisma = require("../config/db");
const { resolveShop } = require("../utils/resolveShop");

function toStrList(v) {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];

  const seen = new Set();
  return arr
    .map(String)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
}

async function list(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);

    const groups = await prisma.adsCampaignGroup.findMany({
      where: { shopId: shop.id },
      orderBy: { updatedAt: "desc" },
      include: {
        campaigns: {
          select: { campaignId: true },
          orderBy: { campaignId: "asc" },
        },
      },
    });

    const payload = groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description || null,
      campaign_ids: g.campaigns.map((c) => String(c.campaignId)),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));

    return res.json({ response: { groups: payload } });
  } catch (e) {
    return next(e);
  }
}

async function create(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);

    const name = String(req.body?.name || "").trim();
    const description =
      req.body?.description != null ? String(req.body.description) : null;
    const campaignIds = toStrList(req.body?.campaignIds);

    if (!name) {
      return res
        .status(400)
        .json({ error: { message: "name é obrigatório." } });
    }
    if (!campaignIds.length) {
      return res.status(400).json({
        error: { message: "campaignIds é obrigatório (array ou csv)." },
      });
    }
    if (campaignIds.length > 500) {
      return res
        .status(400)
        .json({ error: { message: "Máximo 500 campaignIds por grupo." } });
    }

    const created = await prisma.adsCampaignGroup.create({
      data: {
        shopId: shop.id,
        name,
        description,
        campaigns: {
          create: campaignIds.map((id) => ({ campaignId: String(id) })),
        },
      },
      include: { campaigns: { select: { campaignId: true } } },
    });

    return res.status(201).json({
      response: {
        group: {
          id: created.id,
          name: created.name,
          description: created.description || null,
          campaign_ids: created.campaigns.map((c) => String(c.campaignId)),
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
      },
    });
  } catch (e) {
    // conflito de @@unique([groupId, campaignId]) não deve acontecer aqui pois estamos criando novo grupo,
    // mas deixo o next(e) para lidar com erros do prisma.
    return next(e);
  }
}

async function update(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);

    const groupId = Number(req.params.groupId);
    if (!Number.isFinite(groupId)) {
      return res.status(400).json({ error: { message: "groupId inválido." } });
    }

    const name = req.body?.name != null ? String(req.body.name).trim() : null;
    const description =
      req.body?.description != null ? String(req.body.description) : null;
    const campaignIds =
      req.body?.campaignIds != null ? toStrList(req.body.campaignIds) : null;

    const existing = await prisma.adsCampaignGroup.findFirst({
      where: { id: groupId, shopId: shop.id },
      select: { id: true },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ error: { message: "Grupo não encontrado." } });
    }
    if (campaignIds != null && !campaignIds.length) {
      return res.status(400).json({
        error: { message: "campaignIds não pode ser vazio quando enviado." },
      });
    }
    // Estratégia simples e consistente: se campaignIds vier, substitui a lista inteira
    const updated = await prisma.adsCampaignGroup.update({
      where: { id: groupId },
      data: {
        ...(name != null ? { name } : {}),
        ...(description != null ? { description } : {}),
        ...(campaignIds != null
          ? {
              campaigns: {
                deleteMany: {},
                create: campaignIds.map((id) => ({ campaignId: String(id) })),
              },
            }
          : {}),
      },

      include: { campaigns: { select: { campaignId: true } } },
    });

    return res.json({
      response: {
        group: {
          id: updated.id,
          name: updated.name,
          description: updated.description || null,
          campaign_ids: updated.campaigns.map((c) => String(c.campaignId)),
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      },
    });
  } catch (e) {
    return next(e);
  }
}

async function remove(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);

    const groupId = Number(req.params.groupId);
    if (!Number.isFinite(groupId)) {
      return res.status(400).json({ error: { message: "groupId inválido." } });
    }

    const existing = await prisma.adsCampaignGroup.findFirst({
      where: { id: groupId, shopId: shop.id },
      select: { id: true },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ error: { message: "Grupo não encontrado." } });
    }

    await prisma.adsCampaignGroup.delete({ where: { id: groupId } });

    return res.json({ response: { ok: true } });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  list,
  create,
  update,
  remove,
};
