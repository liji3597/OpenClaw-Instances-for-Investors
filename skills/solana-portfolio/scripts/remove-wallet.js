#!/usr/bin/env node
/**
 * Remove a wallet from a user's account
 * Usage: node remove-wallet.js <telegram_user_id> <solana_address>
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { initDatabase, findOrCreateUser, removeWallet } = require(path.join(sharedDir, 'database'));

const telegramId = process.argv[2];
const address = process.argv[3];

if (!telegramId || !address) {
    console.error('Usage: node remove-wallet.js <telegram_user_id> <solana_address>');
    process.exit(1);
}

initDatabase();
const user = findOrCreateUser(telegramId, '');
const removed = removeWallet(user.id, address);

if (removed) {
    console.log(`✅ 钱包已移除 / Wallet removed: ${address.slice(0, 6)}...${address.slice(-4)}`);
} else {
    console.log('❌ 未找到该钱包 / Wallet not found');
}
