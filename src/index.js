const config = require('./config');
const { initDatabase, closeDatabase } = require('./db/database');
const { createBot } = require('./bot');
const { initDcaScheduler, stopAllJobs } = require('./strategies/dca');
const { startAlertMonitor, stopAlertMonitor } = require('./strategies/alerts');

async function main() {
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('   🦅 OpenClaw Investor Suite  v1.0.0');
    console.log('   AI Investment Assistant for Solana');
    console.log('═══════════════════════════════════════════════');
    console.log('');

    // Validate configuration
    config.validate();
    console.log(`🌐 Network: ${config.solanaNetwork}`);
    console.log(`📡 RPC: ${config.rpcUrl.replace(/api-key=.*/, 'api-key=***')}`);

    // Initialize database
    initDatabase();

    // Start Telegram bot
    const { bot, notifyFn } = createBot();

    // Start DCA scheduler
    initDcaScheduler(notifyFn);

    // Start price alert monitor
    startAlertMonitor(notifyFn);

    console.log('');
    console.log('✅ All systems online! Waiting for Telegram messages...');
    console.log('');

    // Graceful shutdown
    const shutdown = () => {
        console.log('\n🛑 Shutting down...');
        stopAllJobs();
        stopAlertMonitor();
        bot.stopPolling();
        closeDatabase();
        console.log('Goodbye! 👋');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
