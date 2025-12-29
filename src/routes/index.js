const express = require("express");
const healthRoutes = require("./health.routes");
const authRoutes = require("./auth.routes"); // Shopee OAuth existente
const authLocalRoutes = require("./authLocal.routes");
const sessionRoutes = require("./session.routes");
const ordersRoutes = require("./orders.routes");
const productsRoutes = require("./products.routes");
const debugRoutes = require("./debug.routes");
const adminRoutes = require("./admin.routes");
const { sessionAuth } = require("../middlewares/sessionAuth");

const router = express.Router();

if (process.env.ENABLE_DEBUG_ROUTES === "true") {
  router.use(debugRoutes);
}

// Pages
router.use(sessionRoutes);

// Attach auth context for API routes (optional, but good)
router.use(sessionAuth);

router.use(healthRoutes);
router.use(authLocalRoutes);
router.use(authRoutes);
router.use(adminRoutes);
router.use(ordersRoutes);
router.use(productsRoutes);

module.exports = router;
