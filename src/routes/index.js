const express = require("express");
const healthRoutes = require("./health.routes");
const authRoutes = require("./auth.routes");
const ordersRoutes = require("./orders.routes");
const productsRoutes = require("./products.routes");
const debugRoutes = require("./debug.routes");

const router = express.Router();
const ordersRoutes = require("./orders.routes");

if (process.env.ENABLE_DEBUG_ROUTES === "true") {
  router.use(debugRoutes);
}

router.use(healthRoutes);
router.use(authRoutes);
router.use(ordersRoutes);
router.use(productsRoutes);

module.exports = router;
