const express = require("express");
const bcrypt = require("bcrypt");
const { sessionAuth, requireAuth } = require("../middlewares/sessionAuth");
const prisma = require("../config/db");
const router = express.Router();

function setSessionCookie(res, sid) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("sid", sid, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
  });
}

function clearSessionCookie(res) {
  res.clearCookie("sid", { path: "/" });
}

router.post("/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "bad_request", message: "Informe e-mail e senha." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({
        error: "invalid_credentials",
        message: "Credenciais inválidas.",
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({
        error: "invalid_credentials",
        message: "Credenciais inválidas.",
      });
    }

    // Descobre shops da conta e tenta setar activeShopId:
    const shops = await prisma.shop.findMany({
      where: { accountId: user.accountId },
      orderBy: { id: "asc" },
      select: { id: true },
      take: 2,
    });

    const activeShopId = shops.length === 1 ? shops[0].id : null;

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 dias
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        activeShopId,
        expiresAt,
      },
    });

    setSessionCookie(res, session.id);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post("/auth/logout", sessionAuth, async (req, res, next) => {
  try {
    const sid = req.cookies?.sid;
    if (sid) {
      await prisma.session.delete({ where: { id: sid } }).catch(() => {});
    }
    clearSessionCookie(res);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.get("/me", sessionAuth, async (req, res, next) => {
  try {
    if (!req.auth) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const shops = await prisma.shop.findMany({
      where: { accountId: req.auth.accountId },
      orderBy: { id: "asc" },
      take: 2,
      select: { id: true, shopId: true, region: true, status: true },
    });

    return res.json({
      user: {
        id: req.auth.userId,
        email: req.auth.email,
        role: req.auth.role,
      },
      account: {
        id: req.auth.accountId,
        name: req.auth.accountName,
      },
      shops,
      activeShopId: req.auth.activeShopId,
    });
  } catch (err) {
    return next(err);
  }
});

router.post(
  "/auth/select-shop",
  sessionAuth,
  requireAuth,
  async (req, res, next) => {
    try {
      const shopId = Number(req.body?.shopId);
      if (!Number.isInteger(shopId)) {
        return res
          .status(400)
          .json({ error: "bad_request", message: "shopId inválido." });
      }

      // Garante que a shop pertence à conta
      const shop = await prisma.shop.findFirst({
        where: { id: shopId, accountId: req.auth.accountId },
        select: { id: true },
      });

      if (!shop) {
        return res.status(404).json({
          error: "not_found",
          message: "Loja não encontrada para esta conta.",
        });
      }

      await prisma.session.update({
        where: { id: req.auth.sid },
        data: { activeShopId: shop.id },
      });

      return res.json({ ok: true, activeShopId: shop.id });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
