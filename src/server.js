const path = require("path");
const express = require("express");
const createApp = require("./app");
const env = require("./config/env");

const app = createApp();

app.use(express.static(path.join(__dirname, "..", "public"), { index: false }));

app.use((err, req, res, next) => {
  const status = err.statusCode || 500;

  if (err.shopee) {
    return res.status(status).json({
      error: "shopee_error",
      shopee: err.shopee,
    });
  }

  return res.status(status).json({
    error: "internal_error",
    message: err.message || "Erro interno",
  });
});

app.listen(env.PORT, () => {
  console.log(`[server] listening on port ${env.PORT}`);
});
