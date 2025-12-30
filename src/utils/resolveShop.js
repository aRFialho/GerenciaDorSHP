const prisma = require("../config/db");

async function resolveShop(req, shopIdParam) {
  const accountId = req.auth?.accountId ?? null;
  const activeShopId = req.auth?.activeShopId ?? null;

  if (!accountId) {
    const err = new Error("Não autenticado.");
    err.statusCode = 401;
    throw err;
  }

  if (String(shopIdParam) === "active") {
    if (!activeShopId) {
      const err = new Error("Selecione uma loja ativa.");
      err.statusCode = 400;
      throw err;
    }

    const shop = await prisma.shop.findFirst({
      where: { id: Number(activeShopId), accountId },
      select: { id: true, shopId: true },
    });

    if (!shop) {
      const err = new Error("Loja ativa inválida para esta conta.");
      err.statusCode = 404;
      throw err;
    }

    return shop; // id (DB), shopId (Shopee BigInt)
  }

  const dbShopId = Number(shopIdParam);
  if (!Number.isFinite(dbShopId)) {
    const err = new Error("shopId inválido.");
    err.statusCode = 400;
    throw err;
  }

  const shop = await prisma.shop.findFirst({
    where: { id: dbShopId, accountId },
    select: { id: true, shopId: true },
  });

  if (!shop) {
    const err = new Error("Loja não encontrada para esta conta.");
    err.statusCode = 404;
    throw err;
  }

  return shop;
}

module.exports = { resolveShop };
