const express = require("express");
const ProductsController = require("../controllers/ProductsController");
const ProductSyncController = require("../controllers/ProductSyncController");
const uploadImages = require("../middlewares/uploadImages");
const { requireAuth } = require("../middlewares/sessionAuth");
const router = express.Router();
router.use(requireAuth);

router.get(
  "/shops/:shopId/products/performance",
  ProductsController.performance
);
router.get("/shops/:shopId/products", ProductsController.list);
router.get("/shops/:shopId/products/:itemId", ProductsController.detail);
router.post("/shops/:shopId/products/sync", ProductSyncController.sync);

router.get(
  "/shops/:shopId/products/:itemId/full",
  ProductsController.fullDetail
);
// CRUD
router.patch("/shops/:shopId/products/:itemId", ProductsController.updateItem);
router.patch(
  "/shops/:shopId/products/:itemId/price",
  ProductsController.updatePrice
);
router.patch(
  "/shops/:shopId/products/:itemId/stock",
  ProductsController.updateStock
);

// Imagens
router.post(
  "/shops/:shopId/products/:itemId/images",
  uploadImages,
  ProductsController.uploadAndApplyImages
);
router.post(
  "/shops/:shopId/products/:itemId/images/add",
  uploadImages,
  ProductsController.addImages
);
router.post(
  "/shops/:shopId/products/:itemId/images/remove",
  ProductsController.removeImages
);

module.exports = router;
