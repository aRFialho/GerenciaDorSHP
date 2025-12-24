const axios = require("axios");
const { hmacSha256Hex } = require("../utils/crypto");
const shopee = require("../config/shopee");
const qs = require("qs");

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function signAuthBase({ path, timestamp }) {
  const partnerId = String(shopee.PARTNER_ID || "");
  return `${partnerId}${path}${timestamp}`;
}

function signApiBase({ path, timestamp, accessToken, shopId }) {
  const partnerId = String(shopee.PARTNER_ID || "");
  const token = accessToken ? String(accessToken) : "";
  const sid = shopId !== undefined && shopId !== null ? String(shopId) : "";
  return `${partnerId}${path}${timestamp}${token}${sid}`;
}

function sign({ path, timestamp, accessToken, shopId, signType = "api" }) {
  const base =
    signType === "auth"
      ? signAuthBase({ path, timestamp })
      : signApiBase({ path, timestamp, accessToken, shopId });

  return hmacSha256Hex(String(shopee.PARTNER_KEY || ""), base);
}

async function requestShopee({
  method,
  path,
  query = {},
  body,
  accessToken,
  shopId,
  signType = "api",
}) {
  const partnerId = shopee.PARTNER_ID;
  const partnerKey = shopee.PARTNER_KEY;

  if (!partnerId || !partnerKey) {
    const e = new Error("Config Shopee ausente: PARTNER_ID/PARTNER_KEY");
    e.statusCode = 500;
    throw e;
  }

  const timestamp = nowTs();
  const signature = sign({ path, timestamp, accessToken, shopId, signType });

  const url = `${shopee.SHOPEE_API_BASE}${path}`;

  const params = {
    ...query,
    partner_id: Number(partnerId),
    timestamp,
    sign: signature,
  };

  if (accessToken) params.access_token = accessToken;
  if (shopId !== undefined && shopId !== null) params.shop_id = Number(shopId);

  let data = body;

  // ✅ garante compatibilidade com endpoints de AUTH que exigem partner_id no body
  if (
    signType === "auth" &&
    data &&
    typeof data === "object" &&
    !Array.isArray(data)
  ) {
    data = { partner_id: Number(partnerId), ...data };
  }

  console.log("[ShopeeHttp] URL:", url);

  try {
    const res = await axios({
      method,
      url,
      params,
      paramsSerializer: (p) => qs.stringify(p, { arrayFormat: "repeat" }),
      data,
      timeout: 20000,
    });
    return res.data;
  } catch (err) {
    const status = err.response ? err.response.status : 502;
    const payload = err.response ? err.response.data : { message: err.message };

    const e = new Error("Shopee API error");
    e.statusCode = status;
    e.shopee = payload;
    throw e;
  }
}

module.exports = {
  requestShopee,
};
