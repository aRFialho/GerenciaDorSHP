const env = require("./env");

module.exports = {
  SHOPEE_ADS_API_BASE:
    env.SHOPEE_ADS_API_BASE || "https://openplatform.shopee.com.br",
};
