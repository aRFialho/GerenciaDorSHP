const express = require("express");
const DebugShopeeController = require("../controllers/DebugShopeeController");

const router = express.Router();

router.get("/debug/ping", (req, res) =>
  res.json({ status: "ok", debug: true })
);
router.get("/debug/shops/:shopId/orders/list", DebugShopeeController.orderList);
router.get(
  "/debug/shops/:shopId/orders/detail",
  DebugShopeeController.orderDetail
);
router.get(
  "/debug/shops/:shopId/orders/:orderSn/raw",
  DebugShopeeController.orderDetailRaw
);
module.exports = router;
