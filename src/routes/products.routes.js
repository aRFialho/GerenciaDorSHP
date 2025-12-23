const express = require("express");
const ProductsController = require("../controllers/ProductsController");
const ProductSyncController = require("../controllers/ProductSyncController");

const router = express.Router();

router.get("/shops/:shopId/products", ProductsController.list);
router.get("/shops/:shopId/products/:itemId", ProductsController.detail);
router.post("/shops/:shopId/products/sync", ProductSyncController.sync);

module.exports = router;
