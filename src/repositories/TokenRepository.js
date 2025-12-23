const prisma = require("../config/db");

function toBigIntShopId(shopId) {
  if (shopId === undefined || shopId === null) {
    const err = new Error("shopId ausente");
    err.statusCode = 400;
    throw err;
  }

  const s = String(shopId).trim();
  if (!s) {
    const err = new Error("shopId vazio");
    err.statusCode = 400;
    throw err;
  }

  try {
    return BigInt(s);
  } catch {
    const err = new Error(
      "shopId inválido (não foi possível converter para BigInt)"
    );
    err.statusCode = 400;
    throw err;
  }
}

async function upsertShop(shopId, region) {
  const shopeeShopId = toBigIntShopId(shopId);

  return prisma.shop.upsert({
    where: { shopId: shopeeShopId },
    update: {
      region: region || undefined,
      status: "AUTHORIZED",
    },
    create: {
      shopId: shopeeShopId,
      region: region || null,
      status: "AUTHORIZED",
    },
  });
}

async function saveTokens({
  shopId,
  accessToken,
  accessExpiresIn,
  refreshToken,
  refreshExpiresIn,
}) {
  const shop = await upsertShop(shopId, null);

  const accessTokenExpiresAt = accessExpiresIn
    ? new Date(Date.now() + Number(accessExpiresIn) * 1000)
    : null;

  const refreshTokenExpiresAt = refreshExpiresIn
    ? new Date(Date.now() + Number(refreshExpiresIn) * 1000)
    : null;

  return prisma.oAuthToken.upsert({
    where: { shopId: shop.id }, // FK para Shop.id (Int)
    update: {
      accessToken: accessToken || undefined,
      accessTokenExpiresAt,
      refreshToken: refreshToken || undefined,
      refreshTokenExpiresAt,
    },
    create: {
      shopId: shop.id,
      accessToken: accessToken || null,
      accessTokenExpiresAt,
      refreshToken: refreshToken || null,
      refreshTokenExpiresAt,
    },
  });
}

async function getTokensByShopId(shopId) {
  const shopeeShopId = toBigIntShopId(shopId);

  const shop = await prisma.shop.findUnique({
    where: { shopId: shopeeShopId },
    include: { tokens: true },
  });

  if (!shop || !shop.tokens) return null;

  return { shop, tokens: shop.tokens };
}

module.exports = {
  saveTokens,
  getTokensByShopId,
};
