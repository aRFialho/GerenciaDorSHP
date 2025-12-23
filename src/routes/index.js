const express = require("express");
const healthRoutes = require("./health.routes");

const router = express.Router();

router.use(healthRoutes);

module.exports = router;