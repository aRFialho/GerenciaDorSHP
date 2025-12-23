const express = require("express");
const DebugShopeeController = require("../controllers/DebugShopeeController");

const router = express.Router();

router.get("/debug/shops/:shopId/orders/list", DebugShopeeController.orderList);
router.get(
  "/debug/shops/:shopId/orders/detail",
  DebugShopeeController.orderDetail
);

module.exports = router;
