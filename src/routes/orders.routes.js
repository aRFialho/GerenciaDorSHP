const express = require("express");
const OrdersController = require("../controllers/OrdersController");

const router = express.Router();

router.get("/shops/:shopId/orders", OrdersController.listLastDays);

module.exports = router;
