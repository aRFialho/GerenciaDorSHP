const axios = require("axios");
const shopee = require("../config/shopee");
const shopeeAds = require("../config/shopeeAds");
const { hmacSha256Hex } = require("../utils/crypto"); // ajuste pro seu helper real

function buildSignBase({ path, partnerId, timestamp, accessToken, shopId }) {
  // padrão v2: partner_id + path + timestamp + access_token + shop_id
  return `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
}

function signV2({
  path,
  partnerId,
  timestamp,
  accessToken,
  shopId,
  partnerKey,
}) {
  const base = buildSignBase({
    path,
    partnerId,
    timestamp,
    accessToken,
    shopId,
  });
  return hmacSha256Hex(String(partnerKey), base);
}

async function shopeeAdsGet({ path, accessToken, shopId, query }) {
  const partnerId = Number(shopee.PARTNER_ID);
  const timestamp = Math.floor(Date.now() / 1000);

  const sign = signV2({
    path,
    partnerId,
    timestamp,
    accessToken,
    shopId,
    partnerKey: shopee.PARTNER_KEY,
  });

  const url = `${shopeeAds.SHOPEE_ADS_API_BASE}${path}`;

  const params = {
    partner_id: partnerId,
    timestamp,
    access_token: accessToken,
    shop_id: Number(shopId),
    sign,
    ...(query || {}),
  };

  try {
    const resp = await axios.get(url, { params, timeout: 60_000 });
    return resp.data;
  } catch (err) {
    console.error("[ShopeeAds] GET failed", {
      url,
      path,
      shop_id: params.shop_id,
      partner_id: params.partner_id,
      timestamp: params.timestamp,
      status: err?.response?.status,
      data: err?.response?.data,
    });
    throw err;
  }
}

async function get_total_balance({ accessToken, shopId }) {
  return shopeeAdsGet({
    path: "/api/v2/ads/get_total_balance",
    accessToken,
    shopId,
  });
}

async function get_all_cpc_ads_daily_performance({
  accessToken,
  shopId,
  startDate,
  endDate,
}) {
  return shopeeAdsGet({
    path: "/api/v2/ads/get_all_cpc_ads_daily_performance",
    accessToken,
    shopId,
    query: {
      start_date: startDate, // formato "DD-MM-YYYY"
      end_date: endDate,
    },
  });
}

async function get_product_level_campaign_id_list({
  accessToken,
  shopId,
  adType = "",
  offset = 0,
  limit = 5000,
}) {
  adType = adType === "all" ? "" : adType;

  return shopeeAdsGet({
    path: "/api/v2/ads/get_product_level_campaign_id_list",
    accessToken,
    shopId,
    query: {
      ad_type: adType, // "", "auto", "manual"
      offset,
      limit,
    },
  });
}

async function get_product_campaign_daily_performance({
  accessToken,
  shopId,
  startDate,
  endDate,
  campaignIdList,
}) {
  return shopeeAdsGet({
    path: "/api/v2/ads/get_product_campaign_daily_performance",
    accessToken,
    shopId,
    query: {
      start_date: startDate, // "DD-MM-YYYY"
      end_date: endDate, // "DD-MM-YYYY"
      campaign_id_list: campaignIdList.join(","), // max 100
    },
  });
}

async function get_product_level_campaign_setting_info({
  accessToken,
  shopId,
  infoTypeList,
  campaignIdList,
}) {
  return shopeeAdsGet({
    path: "/api/v2/ads/get_product_level_campaign_setting_info",
    accessToken,
    shopId,
    query: {
      info_type_list: infoTypeList.join(","), // ex: [1,2,3,4]
      campaign_id_list: campaignIdList.join(","), // max 100
    },
  });
}

async function shopeeAdsPost({ path, accessToken, shopId, query, body }) {
  const partnerId = Number(shopee.PARTNER_ID);
  const timestamp = Math.floor(Date.now() / 1000);

  const sign = signV2({
    path,
    partnerId,
    timestamp,
    accessToken,
    shopId,
    partnerKey: shopee.PARTNER_KEY,
  });

  const url = `${shopeeAds.SHOPEE_ADS_API_BASE}${path}`;

  const params = {
    partner_id: partnerId,
    timestamp,
    access_token: accessToken,
    shop_id: Number(shopId),
    sign,
    ...(query || {}),
  };

  try {
    const resp = await axios.post(url, body || {}, { params, timeout: 60_000 });
    return resp.data;
  } catch (err) {
    console.error("[ShopeeAds] POST failed", {
      url,
      path,
      shop_id: params.shop_id,
      partner_id: params.partner_id,
      timestamp: params.timestamp,
      status: err?.response?.status,
      data: err?.response?.data,
    });
    throw err;
  }
}

async function get_gms_item_performance({ accessToken, shopId, payload }) {
  return shopeeAdsPost({
    path: "/api/v2/ads/get_gms_item_performance",
    accessToken,
    shopId,
    body: payload,
  });
}

async function get_gms_campaign_performance({ accessToken, shopId, payload }) {
  return shopeeAdsPost({
    path: "/api/v2/ads/get_gms_campaign_performance",
    accessToken,
    shopId,
    body: payload,
  });
}

async function check_create_gms_product_campaign_eligibility({
  accessToken,
  shopId,
}) {
  return shopeeAdsGet({
    path: "/api/v2/ads/check_create_gms_product_campaign_eligibility",
    accessToken,
    shopId,
  });
}

async function create_gms_product_campaign({ accessToken, shopId, payload }) {
  return shopeeAdsPost({
    path: "/api/v2/ads/create_gms_product_campaign",
    accessToken,
    shopId,
    body: payload,
  });
}

async function edit_gms_product_campaign({ accessToken, shopId, payload }) {
  return shopeeAdsPost({
    path: "/api/v2/ads/edit_gms_product_campaign",
    accessToken,
    shopId,
    body: payload,
  });
}

async function list_gms_user_deleted_item({ accessToken, shopId, payload }) {
  return shopeeAdsPost({
    path: "/api/v2/ads/list_gms_user_deleted_item",
    accessToken,
    shopId,
    body: payload,
  });
}

async function get_cpc_item_performance({ accessToken, shopId, payload }) {
  const path =
    shopeeAds.CPC_ITEM_PERFORMANCE_PATH ||
    process.env.SHOPEE_ADS_CPC_ITEM_PERFORMANCE_PATH;

  if (!path) {
    const err = new Error(
      "CPC item performance path não configurado (CPC_ITEM_PERFORMANCE_PATH / SHOPEE_ADS_CPC_ITEM_PERFORMANCE_PATH)."
    );
    err.statusCode = 500;
    throw err;
  }

  return shopeeAdsPost({
    path,
    accessToken,
    shopId,
    body: payload,
  });
}

module.exports = {
  get_total_balance,
  get_all_cpc_ads_daily_performance,
  get_product_level_campaign_id_list,
  get_product_campaign_daily_performance,
  get_product_level_campaign_setting_info,
  get_gms_item_performance,
  get_gms_campaign_performance,
  check_create_gms_product_campaign_eligibility,
  create_gms_product_campaign,
  edit_gms_product_campaign,
  list_gms_user_deleted_item,
  get_cpc_item_performance,
};
