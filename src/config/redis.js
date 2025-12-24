const IORedis = require("ioredis");

const redisUrl = process.env.REDIS_URL;

const client = redisUrl
  ? new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    })
  : null;

module.exports = { client, redisUrl };
