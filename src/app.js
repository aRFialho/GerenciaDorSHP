const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const cookieParser = require("cookie-parser");

const requestLogger = require("./middlewares/requestLogger");
const errorHandler = require("./middlewares/errorHandler");
const routes = require("./routes");
const env = require("./config/env");

// BigInt -> JSON (uma vez só)
BigInt.prototype.toJSON = function () {
  return this.toString();
};

function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "img-src": ["'self'", "data:", "https:"],
        },
      },
    })
  );

  // Se o frontend está no mesmo domínio, CORS nem seria necessário,
  // mas mantenho como está (só cuide para permitir cookies se usar domínios diferentes).
  app.use(cors({ credentials: true, origin: true }));

  app.use(cookieParser(process.env.SESSION_SECRET || "dev-secret"));

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(requestLogger());

  // Static (sem index automático: / e /login serão rotas controladas)
  app.use(
    express.static(path.join(__dirname, "..", "public"), { index: false })
  );

  app.get("/status", (req, res) => {
    res.json({
      name: "DAVANTTI Shopee API",
      apiBaseUrl: env.API_BASE_URL,
      status: "running",
    });
  });

  app.use(routes);

  app.use(errorHandler);

  return app;
}

module.exports = createApp;
