module.exports = {
  apps: [
    {
      name: "whatsapp-server",
      script: "src/server.js",
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "whatsapp-cron",
      script: "src/cron.js",
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
