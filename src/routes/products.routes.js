const express = require("express");

const router = express.Router();

router.get("/shops/:shopId/products", (req, res) => {
  res.json({ status: "ok", message: "products route ready (stub)" });
});

module.exports = router;
