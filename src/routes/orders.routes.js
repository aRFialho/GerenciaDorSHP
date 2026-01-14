const express = require("express");
const OrdersController = require("../controllers/OrdersController");
const OrderSyncController = require("../controllers/OrderSyncController");
const { requireAuth } = require("../middlewares/sessionAuth");
const DebugShopeeController = require("../controllers/DebugShopeeController");
const { requireDebugToken } = require("../middlewares/debugToken");
const OrderAddressAlertsController = require("../controllers/OrderAddressAlertsController");
const GeoSalesController = require("../controllers/GeoSalesController");
const DashboardController = require("../controllers/DashboardController");
const router = express.Router();

router.use(requireAuth);

// 🌎 Geografia de vendas (mapa)
router.get("/shops/active/geo/sales", GeoSalesController.byState);
router.get("/shops/active/geo/sales/:uf", GeoSalesController.byCityInState);

router.get(
  "/shops/active/orders/:orderSn/debug-shopee-detail",
  requireDebugToken,
  DebugShopeeController.testShopeeOrderDetailMask
);
router.get(
  "/shops/:shopId/orders/:orderSn/debug-shopee-detail",
  requireDebugToken,
  DebugShopeeController.testShopeeOrderDetailMask
);
router.get(
  "/shops/active/dashboard/monthly-sales",
  DashboardController.monthlySales
);
const DebugController = require("../controllers/DebugController");
router.get("/debug/egress-ip", requireDebugToken, DebugController.egressIp);

// ✅ Alertas (popup + modal + resolver)
router.get(
  "/shops/active/orders/address-alerts",
  OrderAddressAlertsController.listOpen
);
router.get(
  "/shops/active/orders/:orderSn/address-alerts",
  OrderAddressAlertsController.getOpenByOrderSn
);
router.patch(
  "/shops/active/orders/address-alerts/:id/resolve",
  OrderAddressAlertsController.resolve
);

router.get("/shops/:shopId/orders", OrdersController.list);
router.get("/shops/:shopId/orders/:orderSn", OrdersController.detail);
router.post("/shops/active/orders/sync", OrderSyncController.sync);
router.post("/shops/:shopId/orders/sync", OrderSyncController.sync);

module.exports = router;
