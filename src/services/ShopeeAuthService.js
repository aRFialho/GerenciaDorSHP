const { requestShopee } = require("./ShopeeHttp");
const TokenRepository = require("../repositories/TokenRepository");

async function exchangeCodeForToken({ code, shopId, mainAccountId }) {
  const data = await requestShopee({
    method: "post",
    path: "/api/v2/auth/token/get",
    body: {
      code,
      shop_id: Number(shopId),
      main_account_id: mainAccountId ? Number(mainAccountId) : undefined
    }
  });

  const payload = data && data.data ? data.data : null;
  if (!payload) {
    const err = new Error("Resposta inválida da Shopee (token/get)");
    err.statusCode = 502;
    throw err;
  }

  await TokenRepository.saveTokens({
    shopId,
    accessToken: payload.access_token,
    accessExpiresIn: payload.expire_in,
    refreshToken: payload.refresh_token,
    refreshExpiresIn: payload.refresh_expire_in
  });

  return payload;
}

async function refreshAccessToken({ shopId }) {
  const found = await TokenRepository.getTokensByShopId(shopId);
  if (!found || !found.tokens.refreshToken) {
    const err = new Error("Refresh token não encontrado para este shop_id");
    err.statusCode = 400;
    throw err;
  }

  const data = await requestShopee({
    method: "post",
    path: "/api/v2/auth/access_token/get",
    body: {
      shop_id: Number(shopId),
      refresh_token: found.tokens.refreshToken
    }
  });

  const payload = data && data.data ? data.data : null;
  if (!payload) {
    const err = new Error("Resposta inválida da Shopee (access_token/get)");
    err.statusCode = 502;
    throw err;
  }

  await TokenRepository.saveTokens({
    shopId,
    accessToken: payload.access_token,
    accessExpiresIn: payload.expire_in,
    refreshToken: payload.refresh_token,
    refreshExpiresIn: payload.refresh_expire_in
  });

  return payload;
}

module.exports = {
  exchangeCodeForToken,
  refreshAccessToken
};