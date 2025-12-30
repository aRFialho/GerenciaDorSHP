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
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
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
      const name = String(req.body?.name || "").trim();
      if (!name || !email || !password) {
        return res.status(400).json({
          error: "bad_request",
          message: "Informe nome, email e senha.",
        });
      }

      const allowed = new Set(["ADMIN", "VIEWER"]);
      if (!allowed.has(role)) {
        return res.status(400).json({
          error: "role_invalid",
          message: "Role inválida. Use ADMIN ou VIEWER.",
        });
      }

      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) return res.status(409).json({ error: "email_in_use" });

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          role,
          accountId: req.auth.accountId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
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

router.patch(
  "/admin/users/:id/role",
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const role = String(req.body?.role || "").toUpperCase();
      if (!Number.isFinite(id))
        return res
          .status(400)
          .json({ error: "bad_request", message: "ID inválido." });
      if (role !== "ADMIN" && role !== "VIEWER")
        return res.status(400).json({
          error: "role_invalid",
          message: "Role inválida. Use ADMIN ou VIEWER.",
        });

      const target = await prisma.user.findFirst({
        where: { id, accountId: req.auth.accountId },
        select: { id: true, role: true },
      });
      if (!target) return res.status(404).json({ error: "not_found" });

      if (String(target.role) === "ADMIN" && role === "VIEWER") {
        const adminsCount = await prisma.user.count({
          where: { accountId: req.auth.accountId, role: "ADMIN" },
        });
        if (adminsCount <= 1)
          return res.status(400).json({
            error: "last_admin",
            message: "Não é possível remover o último ADMIN da conta.",
          });
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { role },
        select: { id: true, name: true, email: true, role: true },
      });
      return res.json({ ok: true, user: updated });
    } catch (e) {
      next(e);
    }
  }
);

router.patch(
  "/admin/users/:id",
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return res
          .status(400)
          .json({ error: "bad_request", message: "ID inválido." });

      const nameRaw = req.body?.name;
      const emailRaw = req.body?.email;
      const passwordRaw = req.body?.password;

      const target = await prisma.user.findFirst({
        where: { id, accountId: req.auth.accountId },
        select: { id: true, email: true, role: true },
      });
      if (!target) return res.status(404).json({ error: "not_found" });

      const data = {};

      if (nameRaw != null) {
        const name = String(nameRaw).trim();
        if (!name)
          return res
            .status(400)
            .json({ error: "bad_request", message: "Nome inválido." });
        data.name = name;
      }

      if (emailRaw != null) {
        const email = String(emailRaw).trim().toLowerCase();
        if (!email || !email.includes("@")) {
          return res
            .status(400)
            .json({ error: "bad_request", message: "E-mail inválido." });
        }

        const exists = await prisma.user.findUnique({ where: { email } });
        if (exists && exists.id !== id) {
          return res
            .status(409)
            .json({ error: "email_in_use", message: "E-mail já está em uso." });
        }

        data.email = email;
      }

      if (passwordRaw != null) {
        const password = String(passwordRaw);
        if (password.length < 6)
          return res.status(400).json({
            error: "bad_request",
            message: "Senha deve ter pelo menos 6 caracteres.",
          });
        const passwordHash = await bcrypt.hash(password, 10);
        data.passwordHash = passwordHash;
      }

      if (Object.keys(data).length === 0) {
        return res
          .status(400)
          .json({ error: "bad_request", message: "Nada para atualizar." });
      }

      const updated = await prisma.user.update({
        where: { id },
        data,
        select: { id: true, name: true, email: true, role: true },
      });

      return res.json({ ok: true, user: updated });
    } catch (e) {
      next(e);
    }
  }
);

router.delete(
  "/admin/users/:id",
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return res
          .status(400)
          .json({ error: "bad_request", message: "ID inválido." });

      const target = await prisma.user.findFirst({
        where: { id, accountId: req.auth.accountId },
        select: { id: true, role: true },
      });
      if (!target) return res.status(404).json({ error: "not_found" });

      // não deixar remover o último ADMIN
      if (String(target.role) === "ADMIN") {
        const adminsCount = await prisma.user.count({
          where: { accountId: req.auth.accountId, role: "ADMIN" },
        });
        if (adminsCount <= 1)
          return res.status(400).json({
            error: "last_admin",
            message: "Não é possível excluir o último ADMIN da conta.",
          });
      }

      // importante: se existir Session ligada ao user, você pode querer revogar sessões
      await prisma.session.deleteMany({ where: { userId: id } });

      await prisma.user.delete({ where: { id } });
      return res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
