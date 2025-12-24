const { requestShopeeAuthed } = require("./ShopeeAuthedHttp");

async function getProductPerformance({
  shopId,
  periodType,
  startDate,
  endDate,
  pageNo,
  pageSize,
  orderType,
  channel,
  itemId,
}) {
  return requestShopeeAuthed({
    method: "get",
    path: "/api/v2/ams/get_product_performance",
    shopId: String(shopId),
    query: {
      period_type: periodType,
      start_date: startDate,
      end_date: endDate,
      page_no: pageNo,
      page_size: pageSize,
      order_type: orderType,
      channel,
      ...(itemId ? { item_id: String(itemId) } : {}),
    },
  });
}

module.exports = { getProductPerformance };
