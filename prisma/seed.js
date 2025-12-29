const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const superAdminEmail = "cadastro6@drossiinteriores.com.br"
    .toLowerCase()
    .trim();
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || "Alfenas@123";

  // 1) Conta Legacy (sem upsert, porque Account.name não é unique)
  let legacy = await prisma.account.findFirst({ where: { name: "Legacy" } });
  if (!legacy) {
    legacy = await prisma.account.create({ data: { name: "Legacy" } });
  }

  // 2) Backfill: toda Shop sem accountId vai para Legacy
  const backfill = await prisma.shop.updateMany({
    where: { accountId: null },
    data: { accountId: legacy.id },
  });

  // 3) Cria/atualiza SUPER_ADMIN
  const passwordHash = await bcrypt.hash(superAdminPassword, 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      role: "SUPER_ADMIN",
      accountId: legacy.id,
    },
    create: {
      email: superAdminEmail,
      passwordHash,
      role: "SUPER_ADMIN",
      accountId: legacy.id,
    },
    select: { id: true, email: true, role: true, accountId: true },
  });

  console.log("[seed] Legacy account:", legacy);
  console.log("[seed] Shops backfilled:", backfill.count);
  console.log("[seed] SUPER_ADMIN:", superAdmin);
}

main()
  .catch((e) => {
    console.error("[seed] error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
