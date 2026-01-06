const { requestShopeeAuthed } = require("./ShopeeAuthedHttp");

async function getConversionReport({
  shopId,
  pageNo,
  pageSize,
  orderStatus,
  orderCompletedTimeStart,
  orderCompletedTimeEnd,
}) {
  return requestShopeeAuthed({
    method: "get",
    path: "/api/v2/ams/get_conversion_report",
    shopId: String(shopId),
    query: {
      page_no: pageNo,
      page_size: pageSize,
      ...(orderStatus ? { order_status: orderStatus } : {}),
      ...(orderCompletedTimeStart
        ? { order_completed_time_start: Number(orderCompletedTimeStart) }
        : {}),
      ...(orderCompletedTimeEnd
        ? { order_completed_time_end: Number(orderCompletedTimeEnd) }
        : {}),
    },
  });
}

module.exports = {
  getConversionReport,
};
