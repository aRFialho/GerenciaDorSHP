// src/scheduler.js
const { adsHourlySnapshotQueue } = require("./config/queue");

async function registerRepeatableJobs() {
  const every15m = 15 * 60 * 1000;

  // Evita duplicar: mesma "name" + mesma config de repeat
  const existing = await adsHourlySnapshotQueue.getRepeatableJobs();

  const already = existing.some(
    (j) => j.name === "run" && j.every === every15m,
  );
  if (!already) {
    await adsHourlySnapshotQueue.add(
      "run",
      {},
      {
        repeat: { every: every15m },
        // jobId fixo ajuda a não criar múltiplos em deploys
        jobId: "adsHourlySnapshot:repeat:15m",
      },
    );
  }
}

module.exports = { registerRepeatableJobs };
