#!/usr/bin/env node
/**
 * Create a DCA strategy
 * Usage: node create-dca.js <telegram_user_id> <target_token> <amount_usdc> <schedule>
 * schedule: daily | weekly | monthly | 6hours
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { initDatabase, findOrCreateUser, createDcaStrategy } = require(path.join(sharedDir, 'database'));
const { resolveToken } = require(path.join(sharedDir, 'price-service'));

const telegramId = process.argv[2];
const targetToken = process.argv[3];
const amount = parseFloat(process.argv[4]);
const schedule = process.argv[5];

if (!telegramId || !targetToken || isNaN(amount) || !schedule) {
    console.error('Usage: node create-dca.js <telegram_user_id> <target_token> <amount_usdc> <schedule>');
    console.error('  schedule: daily | weekly | monthly | 6hours');
    process.exit(1);
}

const schedules = {
    'daily': '0 9 * * *',
    'weekly': '0 9 * * 1',
    'monthly': '0 9 1 * *',
    '6hours': '0 */6 * * *',
};

const cron = schedules[schedule];
if (!cron) {
    console.error(`❌ 无效的频率 / Invalid schedule: ${schedule}`);
    console.error('  可选: daily, weekly, monthly, 6hours');
    process.exit(1);
}

const mint = resolveToken(targetToken);
if (!mint) {
    console.error(`❌ 未识别的代币 / Unknown token: ${targetToken}`);
    process.exit(1);
}

initDatabase();
const user = findOrCreateUser(telegramId, '');
const symbol = targetToken.toUpperCase();
const name = `DCA ${amount} USDC → ${symbol}`;

const strategyId = createDcaStrategy(user.id, {
    name,
    source_token: 'USDC',
    target_token: symbol,
    amount,
    cron_expression: cron,
});

const scheduleNames = {
    'daily': '每天 9:00 UTC',
    'weekly': '每周一 9:00 UTC',
    'monthly': '每月1日 9:00 UTC',
    '6hours': '每6小时',
};

console.log(`🎉 DCA 策略已创建 / Strategy created!`);
console.log(`  ID: #${strategyId}`);
console.log(`  名称 / Name: ${name}`);
console.log(`  频率 / Schedule: ${scheduleNames[schedule]}`);
console.log(`  状态 / Status: active`);
