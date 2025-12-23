const { requestShopeeAuthed } = require("../services/ShopeeAuthedHttp");

function parseRangeDays(v) {
  const n = Number(v);
  if ([7, 15, 30, 60].includes(n)) return n;
  return 7;
}

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function buildAlertsFromOrder(order) {
  return {
    addressChanged: false,
    atRisk: false,
    late: false,
  };
}

async function listLastDays(req, res) {
  const { shopId } = req.params;
  const rangeDays = parseRangeDays(req.query.rangeDays);
  const pageSize = req.query.pageSize
    ? Math.min(Number(req.query.pageSize), 100)
    : 50;
  const cursor = req.query.cursor ? String(req.query.cursor) : "";

  const timeTo = nowTs();
  const timeFrom = timeTo - rangeDays * 24 * 60 * 60;

  const list = await requestShopeeAuthed({
    method: "get",
    path: "/api/v2/order/get_order_list",
    shopId,
    query: {
      time_range_field: "update_time",
      time_from: timeFrom,
      time_to: timeTo,
      page_size: pageSize,
      cursor,
    },
  });

  const orderSnList =
    list?.response?.order_sn_list || list?.order_sn_list || [];

  let details = { response: { order_list: [] } };
  if (orderSnList.length > 0) {
    details = await requestShopeeAuthed({
      method: "get",
      path: "/api/v2/order/get_order_detail",
      shopId,
      query: {
        order_sn_list: JSON.stringify(orderSnList),
        response_optional_fields: JSON.stringify([
          "buyer_user_id",
          "buyer_username",
          "recipient_address",
          "item_list",
          "order_status",
          "create_time",
          "update_time",
        ]),
      },
    });
  }

  const orders = details?.response?.order_list || details?.order_list || [];
  const enriched = orders.map((o) => ({
    ...o,
    alerts: buildAlertsFromOrder(o),
  }));

  res.json({
    status: "ok",
    shop_id: String(shopId),
    rangeDays,
    paging: {
      cursor: list?.response?.next_cursor ?? list?.next_cursor ?? null,
      more: list?.response?.more ?? list?.more ?? null,
    },
    orders: enriched,
  });
}

module.exports = { listLastDays };
