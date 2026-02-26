#!/usr/bin/env node
/**
 * Resume a paused DCA strategy
 * Usage: node resume-strategy.js <telegram_user_id> <strategy_id>
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { initDatabase, findOrCreateUser, getUserStrategies, updateStrategyStatus } = require(path.join(sharedDir, 'database'));

const telegramId = process.argv[2];
const strategyId = parseInt(process.argv[3], 10);

if (!telegramId || isNaN(strategyId)) {
    console.error('Usage: node resume-strategy.js <telegram_user_id> <strategy_id>');
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

if (strategy.status === 'active') {
    console.log(`⚠️ 策略 #${strategyId} 已处于活跃状态 / Already active`);
} else {
    updateStrategyStatus(strategyId, 'active');
    console.log(`🟢 策略 #${strategyId} 已恢复 / Strategy resumed`);
}
