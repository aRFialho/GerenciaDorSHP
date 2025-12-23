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
    payload.error.shopee = err.shopee;
  }

  if (process.env.NODE_ENV !== "production") {
    payload.error.details = err.message;
    payload.error.stack = err.stack;
  }

  return res.status(status).json(payload);
}

module.exports = errorHandler;
