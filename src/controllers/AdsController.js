const ShopeeAdsService = require("../services/ShopeeAdsService");
const { resolveShop } = require("../utils/resolveShop");
const prisma = require("../config/db");

function toShopeeDate(iso) {
  const [y, m, d] = String(iso || "").split("-");
  if (!y || !m || !d) return null;
  return `${d}-${m}-${y}`;
}

function isoDayFromShopee(ddmmyyyy) {
  const [d, m, y] = String(ddmmyyyy || "").split("-");
  if (!y || !m || !d) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

async function getShopAccessToken(dbShopId) {
  const tokenRow = await prisma.oAuthToken.findUnique({
    where: { shopId: Number(dbShopId) },
    select: { accessToken: true },
  });
  return tokenRow?.accessToken || null;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function balance(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);
    const accessToken = await getShopAccessToken(shop.id);
    if (!accessToken) {
      return res.status(400).json({
        error: {
          message: "Loja sem access_token. Conecte a loja novamente.",
        },
      });
    }

    const raw = await ShopeeAdsService.get_total_balance({
      accessToken,
      shopId: shop.shopId,
    });

    res.json(raw);
  } catch (e) {
    next(e);
  }
}

async function dailyPerformance(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);
    const accessToken = await getShopAccessToken(shop.id);
    if (!accessToken) {
      return res.status(400).json({
        error: {
          message: "Loja sem access_token. Conecte a loja novamente.",
        },
      });
    }

    const { dateFrom, dateTo } = req.query;
    const startDate = toShopeeDate(dateFrom);
    const endDate = toShopeeDate(dateTo);
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: { message: "dateFrom/dateTo inválidos. Use YYYY-MM-DD." },
      });
    }

    const raw = await ShopeeAdsService.get_all_cpc_ads_daily_performance({
      accessToken,
      shopId: shop.shopId,
      startDate,
      endDate,
    });

    const rows = Array.isArray(raw?.response) ? raw.response : [];
    const series = rows.map((r) => ({
      date: isoDayFromShopee(r.date),
      impression: r.impression ?? 0,
      clicks: r.clicks ?? 0,
      expense: r.expense ?? 0,
      direct_gmv: r.direct_gmv ?? 0,
      broad_gmv: r.broad_gmv ?? 0,
      direct_order: r.direct_order ?? 0,
      broad_order: r.broad_order ?? 0,
      ctr: r.ctr ?? 0,
      direct_roas: r.direct_roas ?? 0,
      broad_roas: r.broad_roas ?? 0,
    }));

    const totals = series.reduce(
      (acc, x) => {
        acc.impression += x.impression;
        acc.clicks += x.clicks;
        acc.expense += x.expense;
        acc.direct_gmv += x.direct_gmv;
        acc.broad_gmv += x.broad_gmv;
        acc.direct_order += x.direct_order;
        acc.broad_order += x.broad_order;
        return acc;
      },
      {
        impression: 0,
        clicks: 0,
        expense: 0,
        direct_gmv: 0,
        broad_gmv: 0,
        direct_order: 0,
        broad_order: 0,
      }
    );

    res.json({
      request_id: raw?.request_id,
      warning: raw?.warning,
      error: raw?.error || "",
      message: raw?.message,
      response: { series, totals },
    });
  } catch (e) {
    next(e);
  }
}

async function listCampaignIds(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);
    const accessToken = await getShopAccessToken(shop.id);
    if (!accessToken) {
      return res.status(400).json({
        error: {
          message: "Loja sem access_token. Conecte a loja novamente.",
        },
      });
    }

    const adType = String(req.query.adType || "all"); // all|auto|manual|""
    const raw = await ShopeeAdsService.get_product_level_campaign_id_list({
      accessToken,
      shopId: shop.shopId,
      adType,
      offset: Number(req.query.offset || 0),
      limit: Number(req.query.limit || 5000),
    });

    res.json(raw);
  } catch (e) {
    next(e);
  }
}

async function campaignsDailyPerformance(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);
    const accessToken = await getShopAccessToken(shop.id);
    if (!accessToken) {
      return res.status(400).json({
        error: {
          message: "Loja sem access_token. Conecte a loja novamente.",
        },
      });
    }

    const { dateFrom, dateTo } = req.query;
    const startDate = toShopeeDate(dateFrom);
    const endDate = toShopeeDate(dateTo);
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: { message: "dateFrom/dateTo inválidos. Use YYYY-MM-DD." },
      });
    }

    const adType = String(req.query.adType || "all");

    // 1) pega todos os campaign ids
    const idsResp = await ShopeeAdsService.get_product_level_campaign_id_list({
      accessToken,
      shopId: shop.shopId,
      adType,
      offset: 0,
      limit: 5000,
    });

    const campaignList = idsResp?.response?.campaign_list || [];
    const campaignIds = campaignList.map((c) => c.campaign_id).filter(Boolean);

    if (!campaignIds.length) {
      return res.json({
        request_id: idsResp?.request_id,
        error: "",
        response: {
          campaigns: [],
          seriesByCampaignId: {},
        },
      });
    }

    // 2) busca performance em lotes (max 100)
    const batches = chunk(campaignIds, 100);
    const rawParts = [];

    for (const batch of batches) {
      const part =
        await ShopeeAdsService.get_product_campaign_daily_performance({
          accessToken,
          shopId: shop.shopId,
          startDate,
          endDate,
          campaignIdList: batch,
        });
      rawParts.push(part);
    }

    // 3) normaliza: uma linha por campanha, e série diária por campanha
    const campaigns = [];
    const seriesByCampaignId = {}; // { [campaignId]: [{date,...metrics}] }

    for (const raw of rawParts) {
      const respArr = Array.isArray(raw?.response) ? raw.response : [];
      for (const shopBlock of respArr) {
        const cl = shopBlock?.campaign_list || [];
        for (const c of cl) {
          const campaignId = String(c.campaign_id);
          const adType = c.ad_type || null;
          const placement = c.campaign_placement || null;
          const name = c.ad_name || null;

          const metricsList = Array.isArray(c.metrics_list)
            ? c.metrics_list
            : [];
          const series = metricsList.map((m) => ({
            date: isoDayFromShopee(m.date),
            impression: m.impression ?? 0,
            clicks: m.clicks ?? 0,
            expense: m.expense ?? 0,
            direct_gmv: m.direct_gmv ?? 0,
            broad_gmv: m.broad_gmv ?? 0,
            direct_order: m.direct_order ?? 0,
            broad_order: m.broad_order ?? 0,
            direct_roi: m.direct_roi ?? 0,
            broad_roi: m.broad_roi ?? 0,
            direct_cir: m.direct_cir ?? 0,
            broad_cir: m.broad_cir ?? 0,
            direct_cr: m.direct_cr ?? 0,
            cr: m.cr ?? 0,
            cpc: m.cpc ?? 0,
          }));

          seriesByCampaignId[campaignId] = (
            seriesByCampaignId[campaignId] || []
          ).concat(series);

          const totals = series.reduce(
            (acc, x) => {
              acc.impression += x.impression;
              acc.clicks += x.clicks;
              acc.expense += x.expense;
              acc.direct_gmv += x.direct_gmv;
              acc.broad_gmv += x.broad_gmv;
              acc.direct_order += x.direct_order;
              acc.broad_order += x.broad_order;
              return acc;
            },
            {
              impression: 0,
              clicks: 0,
              expense: 0,
              direct_gmv: 0,
              broad_gmv: 0,
              direct_order: 0,
              broad_order: 0,
            }
          );

          campaigns.push({
            campaign_id: campaignId,
            ad_type: adType,
            campaign_placement: placement,
            ad_name: name,
            metrics: totals,
          });
        }
      }
    }

    res.json({
      request_id: rawParts?.[0]?.request_id,
      warning: rawParts?.[0]?.warning,
      error: rawParts?.[0]?.error || "",
      response: {
        campaigns,
        seriesByCampaignId,
      },
    });
  } catch (e) {
    next(e);
  }
}

async function campaignSettings(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);
    const accessToken = await getShopAccessToken(shop.id);
    if (!accessToken) {
      return res.status(400).json({
        error: {
          message: "Loja sem access_token. Conecte a loja novamente.",
        },
      });
    }

    const campaignIdsRaw = String(req.query.campaignIds || "").trim();
    if (!campaignIdsRaw) {
      return res
        .status(400)
        .json({ error: { message: "campaignIds é obrigatório (csv)." } });
    }

    const campaignIdList = campaignIdsRaw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    if (campaignIdList.length > 100) {
      return res
        .status(400)
        .json({ error: { message: "Máximo 100 campaignIds por chamada." } });
    }

    const infoTypesRaw = String(req.query.infoTypes || "1,2,3,4");
    const infoTypeList = infoTypesRaw
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x));

    if (!infoTypeList.length) {
      return res
        .status(400)
        .json({ error: { message: "infoTypes inválido." } });
    }

    const raw = await ShopeeAdsService.get_product_level_campaign_setting_info({
      accessToken,
      shopId: shop.shopId,
      infoTypeList,
      campaignIdList,
    });

    // Normalização leve: ids como string, timestamps -> ISO (se quiser)
    const campaigns = (raw?.response?.campaign_list || []).map((c) => {
      const common = c.common_info || {};
      const duration = common.campaign_duration || {};

      return {
        campaign_id: String(c.campaign_id),
        common_info: {
          ad_type: common.ad_type || null,
          ad_name: common.ad_name || null,
          campaign_status: common.campaign_status || null,
          bidding_method: common.bidding_method || null,
          campaign_placement: common.campaign_placement || null,
          campaign_budget: common.campaign_budget ?? null,
          campaign_duration: {
            start_time: duration.start_time ?? null,
            end_time: duration.end_time ?? null,
          },
          item_id_list: Array.isArray(common.item_id_list)
            ? common.item_id_list.map((id) => String(id))
            : [],
        },
        manual_bidding_info: c.manual_bidding_info || null,
        auto_bidding_info: c.auto_bidding_info || null,
        auto_product_ads_info: Array.isArray(c.auto_product_ads_info)
          ? c.auto_product_ads_info.map((p) => ({
              product_name: p.product_name || null,
              status: p.status || null,
              item_id: p.item_id != null ? String(p.item_id) : null,
            }))
          : [],
      };
    });

    res.json({
      request_id: raw?.request_id,
      warning: raw?.warning,
      error: raw?.error || "",
      message: raw?.message,
      response: {
        shop_id: raw?.response?.shop_id,
        region: raw?.response?.region,
        campaign_list: campaigns,
      },
    });
  } catch (e) {
    next(e);
  }
}

async function gmsCampaignPerformance(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);
    const accessToken = await getShopAccessToken(shop.id);
    if (!accessToken) {
      return res.status(400).json({
        error: {
          message: "Loja sem access_token. Conecte a loja novamente.",
        },
      });
    }

    const { campaignId, dateFrom, dateTo } = req.body || {};
    const startDate = toShopeeDate(dateFrom);
    const endDate = toShopeeDate(dateTo);

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: { message: "dateFrom/dateTo inválidos. Use YYYY-MM-DD." },
      });
    }

    const payload = {
      start_date: startDate,
      end_date: endDate,
    };

    if (campaignId != null && String(campaignId).trim() !== "") {
      payload.campaign_id = Number(campaignId);
    }

    const raw = await ShopeeAdsService.get_gms_campaign_performance({
      accessToken,
      shopId: shop.shopId,
      payload,
    });

    // Normaliza "report" para o front
    const report = raw?.response?.report || null;

    res.json({
      request_id: raw?.request_id,
      warning: raw?.warning,
      error: raw?.error || "",
      message: raw?.message,
      response: {
        campaign_id:
          raw?.response?.campaign_id != null
            ? String(raw.response.campaign_id)
            : null,
        report,
      },
    });
  } catch (e) {
    next(e);
  }
}

async function gmsItemsPerformance(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);
    const accessToken = await getShopAccessToken(shop.id);
    if (!accessToken) {
      return res.status(400).json({
        error: {
          message: "Loja sem access_token. Conecte a loja novamente.",
        },
      });
    }

    const { campaignId, dateFrom, dateTo, offset, limit } = req.body || {};
    const startDate = toShopeeDate(dateFrom);
    const endDate = toShopeeDate(dateTo);

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: { message: "dateFrom/dateTo inválidos. Use YYYY-MM-DD." },
      });
    }

    const payload = {
      start_date: startDate,
      end_date: endDate,
      offset: Number.isFinite(Number(offset)) ? Number(offset) : 0,
      limit: Number.isFinite(Number(limit)) ? Number(limit) : 50,
    };

    if (payload.limit > 100) payload.limit = 100;

    if (campaignId != null && String(campaignId).trim() !== "") {
      payload.campaign_id = Number(campaignId);
    }

    const raw = await ShopeeAdsService.get_gms_item_performance({
      accessToken,
      shopId: shop.shopId,
      payload,
    });

    const resultList = Array.isArray(raw?.response?.result_list)
      ? raw.response.result_list
      : [];

    const items = resultList
      .map((x) => ({
        item_id: x?.item_id != null ? String(x.item_id) : null,
        report: x?.report || null,
      }))
      .filter((x) => x.item_id);
    // Enrichment: traz title + 1 imagem do seu DB
    let enrichedItems = items;

if (items.length) {
  const itemIdsBigInt = items.map((x) => BigInt(x.item_id));

    const products = await prisma.product.findMany({
      where: {
        shopId: shop.id,
        itemId: { in: itemIdsBigInt },
      },
      select: {
        itemId: true,
        title: true,
        images: {
          select: { url: true },
          take: 1,
        },
      },
    });

    const productByItemId = new Map(
      products.map((p) => [
        String(p.itemId),
        { title: p.title || null, image_url: p.images?.[0]?.url || null },
      ])
    );

    const enrichedItems = items.map((it) => {
      const extra = productByItemId.get(it.item_id) || {};
      return {
        ...it,
        title: extra.title || null,
        image_url: extra.image_url || null,
      };
    });

    res.json({
      request_id: raw?.request_id,
      warning: raw?.warning,
      error: raw?.error || "",
      message: raw?.message,
      response: {
        campaign_id:
          raw?.response?.campaign_id != null
            ? String(raw.response.campaign_id)
            : null,
        items: enrichedItems,
        total: raw?.response?.total ?? null,
        has_next_page: Boolean(raw?.response?.has_next_page),
      },
    });
  } catch (e) {
    next(e);
  }
}

async function gmsEligibility(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);
    const accessToken = await getShopAccessToken(shop.id);
    if (!accessToken) {
      return res.status(400).json({
        error: {
          message: "Loja sem access_token. Conecte a loja novamente.",
        },
      });
    }

    const raw =
      await ShopeeAdsService.check_create_gms_product_campaign_eligibility({
        accessToken,
        shopId: shop.shopId,
      });

    res.json(raw);
  } catch (e) {
    next(e);
  }
}

async function gmsCreateCampaign(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);
    const accessToken = await getShopAccessToken(shop.id);
    if (!accessToken) {
      return res.status(400).json({
        error: {
          message: "Loja sem access_token. Conecte a loja novamente.",
        },
      });
    }

    const { dateFrom, dateTo, dailyBudget, roasTarget, referenceId } =
      req.body || {};

    const startDate = toShopeeDate(dateFrom);
    const endDate = dateTo ? toShopeeDate(dateTo) : null;

    if (!startDate) {
      return res
        .status(400)
        .json({ error: { message: "dateFrom obrigatório (YYYY-MM-DD)." } });
    }
    if (dailyBudget == null || !Number.isFinite(Number(dailyBudget))) {
      return res
        .status(400)
        .json({ error: { message: "dailyBudget obrigatório (number)." } });
    }

    const payload = {
      start_date: startDate,
      daily_budget: Number(dailyBudget),
    };

    if (endDate) payload.end_date = endDate;
    if (roasTarget != null && roasTarget !== "")
      payload.roas_target = Number(roasTarget);
    if (referenceId) payload.reference_id = String(referenceId);

    const raw = await ShopeeAdsService.create_gms_product_campaign({
      accessToken,
      shopId: shop.shopId,
      payload,
    });

    res.json(raw);
  } catch (e) {
    next(e);
  }
}

async function gmsEditCampaign(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);
    const accessToken = await getShopAccessToken(shop.id);
    if (!accessToken) {
      return res.status(400).json({
        error: {
          message: "Loja sem access_token. Conecte a loja novamente.",
        },
      });
    }

    const {
      campaignId,
      editAction,
      dailyBudget,
      dateFrom,
      dateTo,
      roasTarget,
      referenceId,
    } = req.body || {};

    if (!campaignId) {
      return res
        .status(400)
        .json({ error: { message: "campaignId é obrigatório." } });
    }
    if (!editAction) {
      return res
        .status(400)
        .json({ error: { message: "editAction é obrigatório." } });
    }

    const payload = {
      campaign_id: Number(campaignId),
      edit_action: String(editAction),
    };

    // Campos opcionais (dependem do edit_action)
    if (dailyBudget != null && dailyBudget !== "")
      payload.daily_budget = Number(dailyBudget);

    if (dateFrom) {
      const startDate = toShopeeDate(dateFrom);
      if (!startDate)
        return res
          .status(400)
          .json({ error: { message: "dateFrom inválido (YYYY-MM-DD)." } });
      payload.start_date = startDate;
    }

    if (dateTo) {
      const endDate = toShopeeDate(dateTo);
      if (!endDate)
        return res
          .status(400)
          .json({ error: { message: "dateTo inválido (YYYY-MM-DD)." } });
      payload.end_date = endDate;
    }

    if (roasTarget != null && roasTarget !== "")
      payload.roas_target = Number(roasTarget);
    if (referenceId) payload.reference_id = String(referenceId);

    const raw = await ShopeeAdsService.edit_gms_product_campaign({
      accessToken,
      shopId: shop.shopId,
      payload,
    });

    res.json(raw);
  } catch (e) {
    next(e);
  }
}

async function gmsDeletedItems(req, res, next) {
  try {
    const shop = await resolveShop(req, req.params.shopId);
    const accessToken = await getShopAccessToken(shop.id);
    if (!accessToken) {
      return res.status(400).json({
        error: {
          message: "Loja sem access_token. Conecte a loja novamente.",
        },
      });
    }

    const { offset, limit } = req.body || {};
    const payload = {
      offset: Number.isFinite(Number(offset)) ? Number(offset) : 0,
      limit: Number.isFinite(Number(limit)) ? Number(limit) : 50,
    };
    if (payload.limit > 100) payload.limit = 100;

    const raw = await ShopeeAdsService.list_gms_user_deleted_item({
      accessToken,
      shopId: shop.shopId,
      payload,
    });

    // Normaliza item_id_list para string (facilita join)
    const itemIds = Array.isArray(raw?.response?.item_id_list)
      ? raw.response.item_id_list
      : [];

    res.json({
      request_id: raw?.request_id,
      warning: raw?.warning,
      error: raw?.error || "",
      message: raw?.message,
      response: {
        campaign_id:
          raw?.response?.campaign_id != null
            ? String(raw.response.campaign_id)
            : null,
        item_id_list: itemIds.map((x) => String(x)),
        total: raw?.response?.total ?? null,
        has_next_page: Boolean(raw?.response?.has_next_page),
      },
    });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  balance,
  dailyPerformance,
  listCampaignIds,
  campaignsDailyPerformance,
  campaignSettings,
  gmsCampaignPerformance,
  gmsItemsPerformance,
  gmsDeletedItems,
  gmsEditCampaign,
  gmsCreateCampaign,
  gmsEligibility,
};
