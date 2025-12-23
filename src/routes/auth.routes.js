const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const AuthController = require("../controllers/AuthController");

const router = express.Router();

router.get("/auth/url", AuthController.getAuthUrl);
router.get("/auth/callback", asyncHandler(AuthController.callback));
router.post("/auth/refresh", asyncHandler(AuthController.refresh));

module.exports = router;