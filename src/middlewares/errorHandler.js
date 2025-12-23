function redactShopeePayload(shopee) {
  if (!shopee || typeof shopee !== "object") return shopee;
  const safe = { ...shopee };
  if (safe.access_token) safe.access_token = "[REDACTED]";
  if (safe.refresh_token) safe.refresh_token = "[REDACTED]";
  return safe;
}

function errorHandler(err, req, res, next) {
  const status =
    err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;

  const payload = {
    error: {
      message: status === 500 ? "Erro interno do servidor" : err.message,
      code: err.code || undefined,
    },
  };

  if (err.shopee) {
    payload.error.type = "shopee_error";
    payload.error.shopee = redactShopeePayload(err.shopee);
  }

  // Diagnóstico SEM stack: ajuda muito no Render
  if (status === 500) {
    payload.error.details = err.message;
  } else if (process.env.NODE_ENV !== "production") {
    payload.error.details = err.message;
    payload.error.stack = err.stack;
  }

  return res.status(status).json(payload);
}

module.exports = errorHandler;
