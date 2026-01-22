const express = require("express");
const OrdersController = require("../controllers/OrdersController");
const OrderSyncController = require("../controllers/OrderSyncController");
const { requireAuth } = require("../middlewares/sessionAuth");
const DebugShopeeController = require("../controllers/DebugShopeeController");
const { requireDebugToken } = require("../middlewares/debugToken");
const OrderAddressAlertsController = require("../controllers/OrderAddressAlertsController");
const GeoSalesController = require("../controllers/GeoSalesController");
const DashboardController = require("../controllers/DashboardController");
const DebugController = require("../controllers/DebugController");

const router = express.Router();
router.use(requireAuth);

// 🌎 Geografia de vendas (mapa)
router.get("/shops/active/geo/sales", GeoSalesController.byState);
router.get("/shops/active/geo/sales/:uf", GeoSalesController.byCityInState);

// Dashboard
router.get(
  "/shops/active/dashboard/monthly-sales",
  DashboardController.monthlySales,
);
router.get(
  "/shops/active/dashboard/today-sales",
  DashboardController.todaySales,
);
router.get(
  "/shops/active/dashboard/top-sellers-month",
  DashboardController.topSellersMonth,
);

// Debug
router.get("/debug/egress-ip", requireDebugToken, DebugController.egressIp);

// ✅ Alertas (MUITO IMPORTANTE: antes de /orders/:orderSn)
router.get(
  "/shops/active/orders/address-alerts",
  OrderAddressAlertsController.listOpen,
);
router.get(
  "/shops/active/orders/:orderSn/address-alerts",
  OrderAddressAlertsController.getOpenByOrderSn,
);
router.patch(
  "/shops/active/orders/address-alerts/:id/resolve",
  OrderAddressAlertsController.resolve,
);

// Sync (colocar antes de /:orderSn também é boa prática)
router.post("/shops/active/orders/sync", OrderSyncController.sync);
router.post("/shops/:shopId/orders/sync", OrderSyncController.sync);

// Debug Shopee / Totals (antes de /:orderSn)
router.get(
  "/shops/active/orders/:orderSn/debug-shopee-detail",
  requireDebugToken,
  DebugShopeeController.testShopeeOrderDetailMask,
);
router.get(
  "/shops/:shopId/orders/:orderSn/debug-shopee-detail",
  requireDebugToken,
  DebugShopeeController.testShopeeOrderDetailMask,
);
router.get(
  "/shops/active/orders/:orderSn/debug-totals",
  requireDebugToken,
  DebugShopeeController.debugOrderTotals,
);

// Orders (genéricas por último)
router.get("/shops/active/orders", OrdersController.list);
router.get("/shops/active/orders/:orderSn", OrdersController.detail);

router.get("/shops/:shopId/orders", OrdersController.list);
router.get("/shops/:shopId/orders/:orderSn", OrdersController.detail);

module.exports = router;
