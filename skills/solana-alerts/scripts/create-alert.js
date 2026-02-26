#!/usr/bin/env node
/**
 * Create a price alert
 * Usage: node create-alert.js <telegram_user_id> <token_symbol> <condition> <target_price>
 * condition: above | below
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { initDatabase, findOrCreateUser, createAlert, getActiveAlerts } = require(path.join(sharedDir, 'database'));
const { resolveToken } = require(path.join(sharedDir, 'price-service'));
const { formatUSD } = require(path.join(sharedDir, 'formatter'));

const telegramId = process.argv[2];
const tokenSymbol = (process.argv[3] || '').toUpperCase();
const condition = process.argv[4];
const targetPrice = parseFloat(process.argv[5]);

if (!telegramId || !tokenSymbol || !condition || isNaN(targetPrice)) {
    console.error('Usage: node create-alert.js <telegram_user_id> <token_symbol> <above|below> <target_price>');
    process.exit(1);
}

if (condition !== 'above' && condition !== 'below') {
    console.error('❌ condition must be "above" or "below"');
    process.exit(1);
}

const mint = resolveToken(tokenSymbol);
if (!mint) {
    console.error(`❌ 未识别的代币 / Unknown token: ${tokenSymbol}`);
    process.exit(1);
}

initDatabase();
const user = findOrCreateUser(telegramId, '');
const existing = getActiveAlerts(user.id);

if (existing.length >= 20) {
    console.log('❌ 最多 20 个警报 / Maximum 20 alerts');
    process.exit(1);
}

const alertId = createAlert(user.id, tokenSymbol, mint, condition, targetPrice);
const condStr = condition === 'above' ? '高于/above' : '低于/below';

console.log(`🔔 警报已创建 / Alert created!`);
console.log(`  ID: #${alertId}`);
console.log(`  代币 / Token: ${tokenSymbol}`);
console.log(`  条件 / Condition: ${condStr} ${formatUSD(targetPrice)}`);
