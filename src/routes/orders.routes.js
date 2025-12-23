const express = require("express");
const OrdersController = require("../controllers/OrdersController");
const OrderSyncController = require("../controllers/OrderSyncController");

const router = express.Router();

router.get("/shops/:shopId/orders", OrdersController.list);
router.get("/shops/:shopId/orders/:orderSn", OrdersController.detail);
router.post("/shops/:shopId/orders/sync", OrderSyncController.sync);

module.exports = router;
