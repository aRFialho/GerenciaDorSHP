const { requestShopeeAuthed } = require("../services/ShopeeAuthedHttp");

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

async function orderList(req, res) {
  const shopId = normalizeNumericId(req.params.shopId, "shopId");
  const rangeDays = req.query.rangeDays ? Number(req.query.rangeDays) : 7;

  const timeTo = nowTs();
  const timeFrom = timeTo - rangeDays * 24 * 60 * 60;

  const payload = await requestShopeeAuthed({
    method: "get",
    path: "/api/v2/order/get_order_list",
    shopId,
    query: {
      time_range_field: "update_time",
      time_from: timeFrom,
      time_to: timeTo,
      page_size: 20,
      cursor: "",
    },
  });

  res.json(payload);
}

async function orderDetail(req, res) {
  const shopId = normalizeNumericId(req.params.shopId, "shopId");
  const orderSn = String(req.query.order_sn || "").trim();

  if (!orderSn) {
    const err = new Error("Informe order_sn na query (?order_sn=...)");
    err.statusCode = 400;
    throw err;
  }

  const payload = await requestShopeeAuthed({
    method: "get",
    path: "/api/v2/order/get_order_detail",
    shopId,
    query: {
      order_sn_list: [orderSn],
      response_optional_fields: [
        "buyer_user_id",
        "buyer_username",
        "buyer_cpf_id",
        "recipient_address",
        "order_status",
        "create_time",
        "update_time",
        "pay_time",
        "payment_method",
        "payment_info",
        "invoice_data",
        "item_list",
        "total_amount",
      ],
    },
  });

  res.json(payload);
}

async function orderDetailRaw(req, res) {
  const shopId = normalizeNumericId(req.params.shopId, "shopId");

  const payload = await requestShopeeAuthed({
    method: "get",
    path: "/api/v2/order/get_order_detail",
    shopId,
    query: {
      order_sn_list: [String(orderSn)],
      response_optional_fields: [
        "buyer_user_id",
        "buyer_username",
        "buyer_cpf_id",
        "recipient_address",
        "order_status",
        "create_time",
        "update_time",
        "pay_time",
        "payment_method",
        "payment_info",
        "invoice_data",
        "item_list",
        "total_amount",
      ],
    },
  });

  res.json(payload);
}
function normalizeNumericId(value, fieldName) {
  const raw = String(value ?? "").trim();

  // aceita só dígitos
  if (!/^\d+$/.test(raw)) {
    const err = new Error(`${fieldName} inválido (deve conter apenas dígitos)`);
    err.statusCode = 400;
    throw err;
  }

  return raw;
}
module.exports = { orderList, orderDetail, orderDetailRaw };
