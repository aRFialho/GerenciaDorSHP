const prisma = require("../config/db");

async function health(req, res) {
  let db = "unknown";

  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch (e) {
    db = "down";
  }

  res.json({
    status: "ok",
    uptimeSec: Math.floor(process.uptime()),
    db
  });
}

module.exports = {
  health
};