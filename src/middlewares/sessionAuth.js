const prisma = require("../config/db");

function getSid(req) {
  return req.cookies?.sid || null;
}

async function sessionAuth(req, res, next) {
  try {
    const sid = getSid(req);
    if (!sid) {
      req.auth = null;
      return next();
    }

    const session = await prisma.session.findUnique({
      where: { id: sid },
      include: {
        user: { include: { account: true } },
      },
    });

    if (!session) {
      req.auth = null;
      return next();
    }

    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      // expirada: apaga e segue como deslogado
      await prisma.session.delete({ where: { id: sid } }).catch(() => {});
      req.auth = null;
      return next();
    }

    req.auth = {
      sid: session.id,
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
      accountId: session.user.accountId,
      accountName: session.user.account?.name || null,
      activeShopId: session.activeShopId || null, // Shop.id
      impersonating: Boolean(session.impersonating),
      realUserId: session.realUserId || null,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

function requireAuth(req, res, next) {
  if (!req.auth) {
    return res
      .status(401)
      .json({ error: "unauthorized", message: "Não autenticado." });
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) {
      return res
        .status(401)
        .json({ error: "unauthorized", message: "Não autenticado." });
    }
    if (!roles.includes(req.auth.role)) {
      return res
        .status(403)
        .json({ error: "forbidden", message: "Sem permissão." });
    }
    return next();
  };
}

module.exports = {
  sessionAuth,
  requireAuth,
  requireRole,
};
