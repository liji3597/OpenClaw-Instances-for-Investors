#!/usr/bin/env node
/**
 * Delete a price alert
 * Usage: node delete-alert.js <telegram_user_id> <alert_id>
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { initDatabase, findOrCreateUser, deleteAlert } = require(path.join(sharedDir, 'database'));

const telegramId = process.argv[2];
const alertId = parseInt(process.argv[3], 10);

if (!telegramId || isNaN(alertId)) {
    console.error('Usage: node delete-alert.js <telegram_user_id> <alert_id>');
    process.exit(1);
}

initDatabase();
const user = findOrCreateUser(telegramId, '');
const deleted = deleteAlert(alertId, user.id);

if (deleted) {
    console.log(`✅ 警报 #${alertId} 已删除 / Alert deleted`);
} else {
    console.log(`❌ 警报 #${alertId} 不存在 / Alert not found`);
}
