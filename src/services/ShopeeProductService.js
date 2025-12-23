const { requestShopeeAuthed } = require("./ShopeeAuthedHttp");

async function getItemList({
  shopId,
  offset,
  pageSize,
  itemStatus = "NORMAL",
}) {
  return requestShopeeAuthed({
    method: "get",
    path: "/api/v2/product/get_item_list",
    shopId: String(shopId),
    query: { offset, page_size: pageSize, item_status: itemStatus },
  });
}

async function getItemBaseInfo({ shopId, itemIdList }) {
  return requestShopeeAuthed({
    method: "get",
    path: "/api/v2/product/get_item_base_info",
    shopId: String(shopId),
    query: { item_id_list: itemIdList },
  });
}

async function getModelList({ shopId, itemId }) {
  return requestShopeeAuthed({
    method: "get",
    path: "/api/v2/product/get_model_list",
    shopId: String(shopId),
    query: { item_id: String(itemId) },
  });
}

module.exports = { getItemList, getItemBaseInfo, getModelList };
