module.exports = {
  apps: [
    {
      name: 'service-provider',
      script: 'npm',
      args: 'run dev',
      interpreter: 'none', // Important for npm scripts
      instances: 1, // Single instance (cluster mode not needed for single instance)
      exec_mode: 'fork', // Changed from cluster since instances=1
      autorestart: true,
      watch: true, // Disabled watch for production
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/sp-error.log',
      out_file: './logs/sp-out.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'development',
        PORT: 8001,
        TS_NODE_PROJECT: './tsconfig.json',
         ...require('dotenv').config().parsed,
        APP_ROLE: 'identity-provider' // Explicit role identification
      },
    },
  ],
};