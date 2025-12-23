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

function getAuthUrl(req, res) {
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

  if (!code || !shopId) {
    const err = new Error("Callback inválido: faltando code ou shop_id");
    err.statusCode = 400;
    throw err;
  }

  const payload = await ShopeeAuthService.exchangeCodeForToken({
    code: String(code),
    shopId: String(shopId),
    mainAccountId: mainAccountId ? String(mainAccountId) : undefined
  });

  res.json({
    status: "ok",
    shop_id: String(shopId),
    received: {
      expire_in: payload.expire_in,
      refresh_expire_in: payload.refresh_expire_in
    }
  });
}

async function refresh(req, res) {
  const { shop_id: shopId } = req.body;

  if (!shopId) {
    const err = new Error("Informe shop_id no body");
    err.statusCode = 400;
    throw err;
  }

  const payload = await ShopeeAuthService.refreshAccessToken({ shopId: String(shopId) });

  res.json({
    status: "ok",
    shop_id: String(shopId),
    received: {
      expire_in: payload.expire_in,
      refresh_expire_in: payload.refresh_expire_in
    }
  });
}

module.exports = {
  getAuthUrl,
  callback,
  refresh
};