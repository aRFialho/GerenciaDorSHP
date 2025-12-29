const express = require("express");
const prisma = require("../config/db");
const bcrypt = require("bcrypt");
const { requireAuth, requireRole } = require("../middlewares/sessionAuth");

const router = express.Router();
router.use(requireAuth);

// Admin da conta (ADMIN e SUPER_ADMIN)
router.get(
  "/admin/users",
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const users = await prisma.user.findMany({
        where: { accountId: req.auth.accountId },
        orderBy: { id: "asc" },
        select: { id: true, email: true, role: true, createdAt: true },
      });
      res.json({ users });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  "/admin/users",
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();
      const role = String(req.body?.role || "VIEWER").toUpperCase();
      const password = String(req.body?.password || "");

      if (!email || !password) {
        return res
          .status(400)
          .json({ error: "bad_request", message: "Informe email e senha." });
      }

      const allowed = new Set(["ADMIN", "MANAGER", "VIEWER"]);
      if (req.auth.role === "SUPER_ADMIN") allowed.add("SUPER_ADMIN"); // opcional
      if (!allowed.has(role)) {
        return res.status(400).json({ error: "role_invalid" });
      }

      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) return res.status(409).json({ error: "email_in_use" });

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: { email, passwordHash, role, accountId: req.auth.accountId },
        select: { id: true, email: true, role: true },
      });

      res.json({ ok: true, user });
    } catch (e) {
      next(e);
    }
  }
);

// Admin global (somente SUPER_ADMIN)
router.get(
  "/admin-global/accounts",
  requireRole("SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const accounts = await prisma.account.findMany({
        orderBy: { id: "asc" },
        select: { id: true, name: true, createdAt: true },
      });
      res.json({ accounts });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
