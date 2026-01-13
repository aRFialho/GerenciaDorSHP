const express = require("express");
const DebugShopeeController = require("../controllers/DebugShopeeController");
const { requireAuth } = require("../middlewares/sessionAuth");
const { requireDebugToken } = require("../middlewares/debugToken");

const router = express.Router();

// Protege debug (recomendado)
router.use(requireAuth);

router.get("/debug/ping", (req, res) =>
  res.json({ status: "ok", debug: true })
);

router.get(
  "/debug/shops/:shopId/orders/:orderSn/masked-check",
  requireDebugToken,
  DebugShopeeController.testShopeeOrderDetailMask
);

module.exports = router;
