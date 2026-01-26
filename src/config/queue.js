// src/config/queue.js
const { Queue, Worker, QueueScheduler } = require("bullmq");
const redisConfig = require("./redis");

const connection = redisConfig.connection || { host: "localhost", port: 6379 };

// Queues existentes
const productSyncQueue = new Queue("productSync", { connection });
const orderSyncQueue = new Queue("orderSync", { connection });

// ✅ Novas queues (Ads)
const adsHourlySnapshotQueue = new Queue("adsHourlySnapshot", { connection });
const adsAttributionQueue = new Queue("adsAttribution", { connection });

// ✅ Recomendado: schedulers (stalled/delayed/repeatable)
const productSyncScheduler = new QueueScheduler("productSync", { connection });
const orderSyncScheduler = new QueueScheduler("orderSync", { connection });
const adsHourlySnapshotScheduler = new QueueScheduler("adsHourlySnapshot", {
  connection,
});
const adsAttributionScheduler = new QueueScheduler("adsAttribution", {
  connection,
});

const queues = {
  productSyncQueue,
  orderSyncQueue,
  adsHourlySnapshotQueue,
  adsAttributionQueue,
};

let productSyncWorker;
let orderSyncWorker;
let adsHourlySnapshotWorker;
let adsAttributionWorker;

async function ensureRepeatables() {
  const every15m = 15 * 60 * 1000;

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
        // jobId fixo ajuda em deploys (mesmo que você chame ensureRepeatables mais de uma vez)
        jobId: "adsHourlySnapshot:repeat:15m",
      },
    );
  }
}

async function initWorkers() {
  // ✅ Agenda repeatable do snapshot (se você chamar isso só no worker do Render, melhor)
  await ensureRepeatables();

  productSyncWorker = new Worker(
    "productSync",
    require("../jobs/productSync.job"),
    {
      connection,
      concurrency: Number(process.env.PRODUCT_SYNC_CONCURRENCY || 2),
    },
  );

  orderSyncWorker = new Worker("orderSync", require("../jobs/orderSync.job"), {
    connection,
    concurrency: Number(process.env.ORDER_SYNC_CONCURRENCY || 2),
  });

  // ✅ Workers Ads
  adsHourlySnapshotWorker = new Worker(
    "adsHourlySnapshot",
    require("../jobs/adsHourlySnapshot.job"),
    {
      connection,
      concurrency: Number(process.env.ADS_HOURLY_SNAPSHOT_CONCURRENCY || 1),
    },
  );

  adsAttributionWorker = new Worker(
    "adsAttribution",
    require("../jobs/adsAttribution.job"),
    {
      connection,
      concurrency: Number(process.env.ADS_ATTRIBUTION_CONCURRENCY || 1),
    },
  );

  productSyncWorker.on("failed", (job, err) => {
    console.error("[productSyncWorker] failed", { jobId: job?.id, err });
  });

  orderSyncWorker.on("failed", (job, err) => {
    console.error("[orderSyncWorker] failed", { jobId: job?.id, err });
  });

  adsHourlySnapshotWorker.on("failed", (job, err) => {
    console.error("[adsHourlySnapshotWorker] failed", { jobId: job?.id, err });
  });

  adsAttributionWorker.on("failed", (job, err) => {
    console.error("[adsAttributionWorker] failed", { jobId: job?.id, err });
  });
}

async function closeWorkers() {
  if (productSyncWorker) await productSyncWorker.close();
  if (orderSyncWorker) await orderSyncWorker.close();
  if (adsHourlySnapshotWorker) await adsHourlySnapshotWorker.close();
  if (adsAttributionWorker) await adsAttributionWorker.close();

  // schedulers (opcional fechar também)
  await productSyncScheduler.close();
  await orderSyncScheduler.close();
  await adsHourlySnapshotScheduler.close();
  await adsAttributionScheduler.close();
}

module.exports = {
  queues,
  adsAttributionQueue,
  adsHourlySnapshotQueue,
  initWorkers,
  closeWorkers,
};
