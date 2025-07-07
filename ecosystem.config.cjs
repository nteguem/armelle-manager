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
            DB_DATABASE: 'armelle_manager',
            NELLYS_COIN_API_URL: 'https://testbox-nellys-coin.ejaraapis.xyz',
            NELLYS_COIN_PANEL_URL: 'https://testbox-baptiste-panel.ejara.tech',
            NELLYS_COIN_TIMEOUT: 30000,
            NELLYS_COIN_DEBUG: false,
            NELLYS_COIN_CLIENT_ID: '1ec980cbbc',
            NELLYS_COIN_CLIENT_SECRET: 'rmwZk@efh!S1eEc59ZMix74dZ',
        },
        error_file: 'logs/err.log',
        out_file: 'logs/out.log',
        log_file: 'logs/combined.log',
        time: true,
        watch: false
    }]
}

