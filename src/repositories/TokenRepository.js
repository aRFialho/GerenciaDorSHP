const prisma = require("../config/db");

async function upsertShop(shopId, region) {
  if (shopId === undefined || shopId === null) {
    const err = new Error("shopId ausente ao salvar tokens");
    err.statusCode = 500;
    throw err;
  }

  return prisma.shop.upsert({
    where: { shopId: BigInt(shopId) },
    update: { region: region || undefined, status: "AUTHORIZED" },
    create: {
      shopId: BigInt(shopId),
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
    where: { shopId: shop.id },
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
  const shop = await prisma.shop.findUnique({
    where: { shopId: BigInt(shopId) },
    include: { tokens: true },
  });

  if (!shop || !shop.tokens) return null;
  return { shop, tokens: shop.tokens };
}

module.exports = {
  saveTokens,
  getTokensByShopId,
};
