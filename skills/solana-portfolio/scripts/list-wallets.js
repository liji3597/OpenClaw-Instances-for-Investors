#!/usr/bin/env node
/**
 * List all wallets for a user
 * Usage: node list-wallets.js <telegram_user_id>
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { initDatabase, findOrCreateUser, getUserWallets } = require(path.join(sharedDir, 'database'));

const telegramId = process.argv[2];
if (!telegramId) {
    console.error('Usage: node list-wallets.js <telegram_user_id>');
    process.exit(1);
}

initDatabase();
const user = findOrCreateUser(telegramId, '');
const wallets = getUserWallets(user.id);

if (wallets.length === 0) {
    console.log('📭 没有连接的钱包 / No wallets connected');
} else {
    console.log(`💼 已连接 ${wallets.length} 个钱包 / ${wallets.length} wallets connected:\n`);
    wallets.forEach((w, i) => {
        console.log(`  ${i + 1}. ${w.address}${w.label ? ` (${w.label})` : ''}`);
    });
}
