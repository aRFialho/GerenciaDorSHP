const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const requestLogger = require("./middlewares/requestLogger");
const errorHandler = require("./middlewares/errorHandler");
const routes = require("./routes");
const env = require("./config/env");

function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.use(helmet());
  app.use(cors());

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(requestLogger());

  app.get("/", (req, res) => {
    res.json({
      name: "DAVANTTI Shopee API",
      apiBaseUrl: env.API_BASE_URL,
      status: "running"
    });
  });

  app.use(routes);

  app.use(errorHandler);

  return app;
}

module.exports = createApp;