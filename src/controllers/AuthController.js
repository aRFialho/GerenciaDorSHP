const prisma = require("../config/db");
const shopee = require("../config/shopee");
const { hmacSha256Hex } = require("../utils/crypto");
const ShopeeAuthService = require("../services/ShopeeAuthService");

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function signAuthPartner(path, timestamp) {
  const base = `${shopee.PARTNER_ID}${path}${timestamp}`;
  return hmacSha256Hex(String(shopee.PARTNER_KEY || ""), base);
}

async function getAuthUrl(req, res) {
  const mode = String(req.query?.mode || "").toLowerCase();

  // se for adicionar loja, exige ADMIN/SUPER_ADMIN e respeita limite 2
  if (mode === "add_shop") {
    if (
      !req.auth ||
      (req.auth.role !== "ADMIN" && req.auth.role !== "SUPER_ADMIN")
    ) {
      return res.status(403).json({
        error: "forbidden",
        message: "Apenas ADMIN pode adicionar loja.",
      });
    }

    const accountId = req.auth.accountId;
    const shopsCount = await prisma.shop.count({ where: { accountId } });

    if (shopsCount >= 2) {
      return res.status(400).json({
        error: "shop_limit_reached",
        message: "Limite de 2 lojas por conta atingido.",
      });
    }
  }
  const timestamp = nowTs();
  const path = "/api/v2/shop/auth_partner";
  const sign = signAuthPartner(path, timestamp);

  const redirect = encodeURIComponent(shopee.REDIRECT_URL || "");
  const url =
    `${shopee.SHOPEE_API_BASE}${path}` +
    `?partner_id=${shopee.PARTNER_ID}` +
    `&timestamp=${timestamp}` +
    `&sign=${sign}` +
    `&redirect=${redirect}`;

  res.json({ auth_url: url });
}

async function callback(req, res) {
  const { code, shop_id: shopId, main_account_id: mainAccountId } = req.query;

  const accountId = req.auth?.accountId;
  const sessionId = req.auth?.sessionId || null;

  if (!accountId) {
    const err = new Error(
      "Não autenticado: não foi possível identificar a conta para vincular a loja."
    );
    err.statusCode = 401;
    throw err;
  }

  if (!code || !shopId) {
    const err = new Error("Callback inválido: faltando code ou shop_id");
    err.statusCode = 400;
    throw err;
  }

  // troca o code por tokens
  const payload = await ShopeeAuthService.exchangeCodeForToken({
    code: String(code),
    shopId: String(shopId),
    mainAccountId: mainAccountId ? String(mainAccountId) : undefined,
  });

  const accessToken = payload?.access_token ?? payload?.accessToken ?? null;
  const refreshToken = payload?.refresh_token ?? payload?.refreshToken ?? null;

  const expireInSec = Number(payload?.expire_in ?? payload?.expireIn ?? 0);
  const refreshExpireInSec = Number(
    payload?.refresh_expire_in ?? payload?.refreshExpireIn ?? 0
  );

  const accessTokenExpiresAt =
    Number.isFinite(expireInSec) && expireInSec > 0
      ? new Date(Date.now() + expireInSec * 1000)
      : null;

  const refreshTokenExpiresAt =
    Number.isFinite(refreshExpireInSec) && refreshExpireInSec > 0
      ? new Date(Date.now() + refreshExpireInSec * 1000)
      : null;

  const shopeeShopId = BigInt(String(shopId));

  // verifica conflito multi-tenant
  const existingShop = await prisma.shop.findUnique({
    where: { shopId: shopeeShopId },
    select: { id: true, accountId: true },
  });

  if (existingShop?.accountId && existingShop.accountId !== accountId) {
    return res.status(409).json({
      error: "shop_already_linked",
      message: "Esta loja já está vinculada a outra conta.",
    });
  }

  // limite 2 lojas por conta (defesa em profundidade)
  if (!existingShop) {
    const count = await prisma.shop.count({ where: { accountId } });
    if (count >= 2) {
      return res.status(400).json({
        error: "shop_limit_reached",
        message: "Limite de 2 lojas por conta atingido.",
      });
    }
  }

  const shop = await prisma.shop.upsert({
    where: { shopId: shopeeShopId },
    update: {
      accountId: existingShop?.accountId ?? accountId,
      status: "AUTHORIZED",
    },
    create: {
      accountId,
      shopId: shopeeShopId,
      region: null,
      status: "AUTHORIZED",
    },
    select: { id: true },
  });

  await prisma.oAuthToken.upsert({
    where: { shopId: shop.id },
    update: {
      accessToken: accessToken ? String(accessToken) : null,
      refreshToken: refreshToken ? String(refreshToken) : null,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    },
    create: {
      shopId: shop.id,
      accessToken: accessToken ? String(accessToken) : null,
      refreshToken: refreshToken ? String(refreshToken) : null,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    },
  });

  if (sessionId) {
    await prisma.session.update({
      where: { id: String(sessionId) },
      data: { activeShopId: shop.id },
    });
  }

  // volta pro dashboard
  return res.redirect("/");
}

async function refresh(req, res) {
  const { shop_id: shopId } = req.body;

  if (!shopId) {
    const err = new Error("Informe shop_id no body");
    err.statusCode = 400;
    throw err;
  }

  const payload = await ShopeeAuthService.refreshAccessToken({
    shopId: String(shopId),
  });

  res.json({
    status: "ok",
    shop_id: String(shopId),
    received: {
      expire_in: payload.expire_in,
      refresh_expire_in: payload.refresh_expire_in,
    },
  });
}

module.exports = {
  getAuthUrl,
  callback,
  refresh,
};
