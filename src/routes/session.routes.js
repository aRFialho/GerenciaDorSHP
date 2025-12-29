const express = require("express");
const path = require("path");
const { sessionAuth } = require("../middlewares/sessionAuth");

const router = express.Router();

router.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "..", "public", "login.html"));
});

router.get("/", sessionAuth, (req, res) => {
  if (!req.auth) return res.redirect("/login");
  return res.sendFile(path.join(__dirname, "..", "..", "public", "index.html"));
});

module.exports = router;
