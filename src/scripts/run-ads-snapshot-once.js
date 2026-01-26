const prisma = require("../config/db");
const AdsHourlySnapshotService = require("../services/AdsHourlySnapshotService");

async function main() {
  const out = await AdsHourlySnapshotService.run({});
  console.log("snapshot out:", out);

  const count = await prisma.adsHourlyMetric.count();
  console.log("AdsHourlyMetric.count =", count);

  const last = await prisma.adsHourlyMetric.findFirst({
    orderBy: { dateHour: "desc" },
    select: { dateHour: true, spendCents: true, raw: true },
  });
  console.log("last:", last);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
