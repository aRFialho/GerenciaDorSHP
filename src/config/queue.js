// src/config/queue.js
const { Queue, Worker } = require("bullmq");
const redisConfig = require("./redis");

const connection = redisConfig.connection || { host: "localhost", port: 6379 };

const productSyncQueue = new Queue("productSync", { connection });
const orderSyncQueue = new Queue("orderSync", { connection });

const queues = {
  productSyncQueue,
  orderSyncQueue,
};

let productSyncWorker;
let orderSyncWorker;

function initWorkers() {
  productSyncWorker = new Worker(
    "productSync",
    require("../jobs/productSync.job"),
    {
      connection,
      concurrency: Number(process.env.PRODUCT_SYNC_CONCURRENCY || 2),
    }
  );

  orderSyncWorker = new Worker("orderSync", require("../jobs/orderSync.job"), {
    connection,
    concurrency: Number(process.env.ORDER_SYNC_CONCURRENCY || 2),
  });

  productSyncWorker.on("failed", (job, err) => {
    console.error("[productSyncWorker] failed", { jobId: job?.id, err });
  });

  orderSyncWorker.on("failed", (job, err) => {
    console.error("[orderSyncWorker] failed", { jobId: job?.id, err });
  });
}

async function closeWorkers() {
  if (productSyncWorker) await productSyncWorker.close();
  if (orderSyncWorker) await orderSyncWorker.close();
}

module.exports = {
  queues,
  initWorkers,
  closeWorkers,
};
