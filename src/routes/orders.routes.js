const express = require("express");
const OrdersController = require("../controllers/OrdersController");
const OrderSyncController = require("../controllers/OrderSyncController");
const { requireAuth } = require("../middlewares/sessionAuth");
const DebugShopeeController = require("../controllers/DebugShopeeController");
const { requireDebugToken } = require("../middlewares/debugToken");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/shops/:shopId/orders/:orderSn/debug-shopee-detail",
  requireDebugToken,
  DebugShopeeController.testShopeeOrderDetailMask
);

const DebugController = require("../controllers/DebugController");

router.get("/debug/egress-ip", requireDebugToken, DebugController.egressIp);

router.get("/shops/:shopId/orders", OrdersController.list);
router.get("/shops/:shopId/orders/:orderSn", OrdersController.detail);
router.post("/shops/:shopId/orders/sync", OrderSyncController.sync);

module.exports = router;
