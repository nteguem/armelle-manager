module.exports = {
  apps: [{
    name: 'armelle-manager-api',
    script: 'build/bin/server.js',
    cwd: '/var/www/test-backend',
    instances: 1,
    env: {
      NODE_ENV: 'production',
      PORT: 3002,
      APP_KEY: 'aZKy5AZaa87iVRKYdCM9Vhv4psH26rMV',
      HOST: '0.0.0.0',
      LOG_LEVEL: 'info',
      TZ: 'UTC',

      // Variables DB obligatoires
      DB_HOST: '127.0.0.1',
      DB_PORT: 5432,
      DB_USER: 'postgres',
      DB_PASSWORD: 'admin',
      DB_DATABASE: 'armelle_manager'
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,
    watch: false
  }]
}

