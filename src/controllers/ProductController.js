const { requestShopeeAuthed } = require("../services/ShopeeAuthedHttp");

function parseStatus(v) {
  const s = String(v || "active").toLowerCase();
  if (["active", "inactive", "all"].includes(s)) return s;
  return "active";
}

function parseSortBy(v) {
  const s = String(v || "createdAt");
  if (["createdAt", "sales", "rating"].includes(s)) return s;
  return "createdAt";
}

function parseSortDir(v) {
  const s = String(v || "desc").toLowerCase();
  if (["asc", "desc"].includes(s)) return s;
  return "desc";
}

function sortProducts(list, sortBy, sortDir) {
  const dir = sortDir === "asc" ? 1 : -1;

  return list.sort((a, b) => {
    const av =
      sortBy === "sales"
        ? Number(a?.sales ?? a?.historical_sold ?? 0)
        : sortBy === "rating"
        ? Number(a?.rating ?? a?.item_rating?.rating_star ?? 0)
        : Number(a?.create_time ?? a?.created_time ?? 0);

    const bv =
      sortBy === "sales"
        ? Number(b?.sales ?? b?.historical_sold ?? 0)
        : sortBy === "rating"
        ? Number(b?.rating ?? b?.item_rating?.rating_star ?? 0)
        : Number(b?.create_time ?? b?.created_time ?? 0);

    return (av - bv) * dir;
  });
}

async function list(req, res) {
  const { shopId } = req.params;
  const status = parseStatus(req.query.status);
  const sortBy = parseSortBy(req.query.sortBy);
  const sortDir = parseSortDir(req.query.sortDir);

  const pageSize = req.query.pageSize
    ? Math.min(Number(req.query.pageSize), 100)
    : 50;
  const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

  // 1) listar item ids
  const listResp = await requestShopeeAuthed({
    method: "post",
    path: "/api/v2/product/get_item_list",
    shopId,
    body: {
      page_size: pageSize,
      cursor: cursor || "",
      item_status: status === "all" ? undefined : status.toUpperCase(), // pode variar na Shopee; ajustamos após 1 payload real
    },
  });

  const itemIdList =
    listResp?.response?.item_id_list || listResp?.item_id_list || [];

  // 2) detalhes
  let infoResp = { response: { item_list: [] } };
  if (itemIdList.length > 0) {
    infoResp = await requestShopeeAuthed({
      method: "post",
      path: "/api/v2/product/get_item_base_info",
      shopId,
      body: { item_id_list: itemIdList },
    });
  }

  const items = infoResp?.response?.item_list || infoResp?.item_list || [];
  const sorted = sortProducts(items, sortBy, sortDir);

  res.json({
    status: "ok",
    shop_id: String(shopId),
    filters: { status, sortBy, sortDir },
    paging: {
      cursor: listResp?.response?.next_cursor ?? listResp?.next_cursor ?? null,
      more:
        listResp?.response?.has_next_page ?? listResp?.has_next_page ?? null,
    },
    products: sorted,
  });
}

module.exports = { list };
