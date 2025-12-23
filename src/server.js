const path = require("path");
const express = require("express");
const createApp = require("./app");
const env = require("./config/env");

const app = createApp();

app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(env.PORT, () => {
  console.log(`[server] listening on port ${env.PORT}`);
});