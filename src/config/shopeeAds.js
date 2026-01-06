const env = require("./env");

module.exports = {
  SHOPEE_ADS_API_BASE:
    env.SHOPEE_ADS_API_BASE || "https://openplatform.shopee.com.br",

  // Path do endpoint Shopee Ads que retorna performance por item (CPC).
  // Exemplo esperado: "/api/v2/ads/SEU_ENDPOINT_AQUI"
  CPC_ITEM_PERFORMANCE_PATH: env.SHOPEE_ADS_CPC_ITEM_PERFORMANCE_PATH || "",
};
