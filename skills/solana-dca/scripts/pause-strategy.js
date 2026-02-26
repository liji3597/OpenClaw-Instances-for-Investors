#!/usr/bin/env node
/**
 * Pause a DCA strategy
 * Usage: node pause-strategy.js <telegram_user_id> <strategy_id>
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { initDatabase, findOrCreateUser, getUserStrategies, updateStrategyStatus } = require(path.join(sharedDir, 'database'));

const telegramId = process.argv[2];
const strategyId = parseInt(process.argv[3], 10);

if (!telegramId || isNaN(strategyId)) {
    console.error('Usage: node pause-strategy.js <telegram_user_id> <strategy_id>');
    process.exit(1);
}

initDatabase();
const user = findOrCreateUser(telegramId, '');
const strategies = getUserStrategies(user.id);
const strategy = strategies.find(s => s.id === strategyId);

if (!strategy) {
    console.log(`❌ 策略 #${strategyId} 不存在 / Strategy not found`);
    process.exit(1);
}

if (strategy.status === 'paused') {
    console.log(`⚠️ 策略 #${strategyId} 已处于暂停状态 / Already paused`);
} else {
    updateStrategyStatus(strategyId, 'paused');
    console.log(`🟡 策略 #${strategyId} 已暂停 / Strategy paused`);
}
