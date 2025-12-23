const axios = require("axios");
const { hmacSha256Hex } = require("../utils/crypto");
const shopee = require("../config/shopee");

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function buildSignBase({ path, timestamp, accessToken, shopId }) {
  const partnerId = String(shopee.PARTNER_ID || "");
  const token = accessToken ? String(accessToken) : "";
  const sid = shopId !== undefined && shopId !== null ? String(shopId) : "";

  return `${partnerId}${path}${timestamp}${token}${sid}`;
}

function sign({ path, timestamp, accessToken, shopId }) {
  const base = buildSignBase({ path, timestamp, accessToken, shopId });
  return hmacSha256Hex(String(shopee.PARTNER_KEY || ""), base);
}

async function requestShopee({ method, path, query = {}, body, accessToken, shopId }) {
  const timestamp = nowTs();
  const signature = sign({ path, timestamp, accessToken, shopId });

  const url = `${shopee.SHOPEE_API_BASE}${path}`;

  const params = {
    ...query,
    partner_id: shopee.PARTNER_ID,
    timestamp,
    sign: signature
  };

  if (accessToken) params.access_token = accessToken;
  if (shopId !== undefined && shopId !== null) params.shop_id = shopId;

  const res = await axios({
    method,
    url,
    params,
    data: body,
    timeout: 20000
  });

  return res.data;
}

module.exports = {
  requestShopee
};