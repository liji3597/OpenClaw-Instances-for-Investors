#!/usr/bin/env node
/**
 * List active price alerts for a user
 * Usage: node list-alerts.js <telegram_user_id>
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { initDatabase, findOrCreateUser, getActiveAlerts } = require(path.join(sharedDir, 'database'));
const { formatAlert } = require(path.join(sharedDir, 'formatter'));

const telegramId = process.argv[2];
const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'zh';

if (!telegramId) {
    console.error('Usage: node list-alerts.js <telegram_user_id>');
    process.exit(1);
}

initDatabase();
const user = findOrCreateUser(telegramId, '');
const alerts = getActiveAlerts(user.id);

if (alerts.length === 0) {
    console.log('📭 没有活跃的警报 / No active alerts');
} else {
    console.log(`🔔 共 ${alerts.length} 个警报 / ${alerts.length} alerts:\n`);
    for (const a of alerts) {
        console.log(formatAlert(a, lang));
    }
}
