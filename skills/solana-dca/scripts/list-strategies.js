#!/usr/bin/env node
/**
 * List DCA strategies for a user
 * Usage: node list-strategies.js <telegram_user_id>
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { initDatabase, findOrCreateUser, getUserStrategies } = require(path.join(sharedDir, 'database'));
const { formatStrategy } = require(path.join(sharedDir, 'formatter'));

const telegramId = process.argv[2];
const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'zh';

if (!telegramId) {
    console.error('Usage: node list-strategies.js <telegram_user_id>');
    process.exit(1);
}

initDatabase();
const user = findOrCreateUser(telegramId, '');
const strategies = getUserStrategies(user.id);

if (strategies.length === 0) {
    console.log('📭 没有策略 / No strategies');
} else {
    console.log(`📊 共 ${strategies.length} 个策略 / ${strategies.length} strategies:\n`);
    for (const s of strategies) {
        console.log(formatStrategy(s, lang));
        console.log('');
    }
}
