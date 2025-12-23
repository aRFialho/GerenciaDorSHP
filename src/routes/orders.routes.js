const express = require("express");
const OrderSyncController = require("../controllers/OrderSyncController");

const router = express.Router();
router.post("/shops/:shopId/orders/sync", OrderSyncController.sync);

module.exports = router;
