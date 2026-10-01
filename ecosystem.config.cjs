const path = require("node:path");
module.exports = {
  apps: [{
    name: "knowledge-site",
    cwd: path.join(__dirname, "site"),
    script: "server/start.js",
    env: { NODE_ENV: "production", KB_HOST: "127.0.0.1", KB_PORT: "8796" }
  }]
};
