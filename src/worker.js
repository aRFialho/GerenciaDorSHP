// src/worker.js
const { Worker } = require("bullmq");
const { client: redis } = require("./config/redis");
const { registerRepeatableJobs } = require("./scheduler");

const adsHourlySnapshotProcessor = require("./jobs/adsHourlySnapshot.job");
const adsAttributionProcessor = require("./jobs/adsAttribution.job");

async function main() {
  await registerRepeatableJobs();

  const w1 = new Worker("adsHourlySnapshot", adsHourlySnapshotProcessor, {
    connection: redis,
    concurrency: 1, // snapshot é “sensível”; manter 1 evita sobreposição
  });

  const w2 = new Worker("adsAttribution", adsAttributionProcessor, {
    connection: redis,
    concurrency: 1,
  });

  w1.on("completed", (job, result) => {
    console.log("[worker] adsHourlySnapshot completed", {
      jobId: job.id,
      result,
    });
  });
  w1.on("failed", (job, err) => {
    console.error("[worker] adsHourlySnapshot failed", {
      jobId: job?.id,
      err: String(err?.message || err),
    });
  });

  w2.on("completed", (job, result) => {
    console.log("[worker] adsAttribution completed", { jobId: job.id, result });
  });
  w2.on("failed", (job, err) => {
    console.error("[worker] adsAttribution failed", {
      jobId: job?.id,
      err: String(err?.message || err),
    });
  });

  console.log("[worker] up");
}

main().catch((e) => {
  console.error("[worker] fatal", e);
  process.exit(1);
});
