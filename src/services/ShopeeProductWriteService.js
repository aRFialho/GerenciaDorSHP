const { requestShopeeAuthed } = require("./ShopeeAuthedHttp");

async function updateItem({ shopId, body }) {
  return requestShopeeAuthed({
    method: "post",
    path: "/api/v2/product/update_item",
    shopId: String(shopId),
    body,
  });
}
async function updatePrice({ shopId, body }) {
  return requestShopeeAuthed({
    method: "post",
    path: "/api/v2/product/update_price",
    shopId: String(shopId),
    body,
  });
}
async function updateStock({ shopId, body }) {
  return requestShopeeAuthed({
    method: "post",
    path: "/api/v2/product/update_stock",
    shopId: String(shopId),
    body,
  });
}

module.exports = { updateItem, updatePrice, updateStock };
