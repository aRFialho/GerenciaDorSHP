const createApp = require("./app");
const env = require("./config/env");

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`[server] listening on port ${env.PORT}`);
});
