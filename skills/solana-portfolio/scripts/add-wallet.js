#!/usr/bin/env node
/**
 * Add a Solana wallet to a user's account
 * Usage: node add-wallet.js <telegram_user_id> <solana_address>
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { initDatabase, findOrCreateUser, addWallet, getUserWallets } = require(path.join(sharedDir, 'database'));
const { isValidAddress } = require(path.join(sharedDir, 'wallet'));

const telegramId = process.argv[2];
const address = process.argv[3];

if (!telegramId || !address) {
    console.error('Usage: node add-wallet.js <telegram_user_id> <solana_address>');
    process.exit(1);
}

initDatabase();

if (!isValidAddress(address)) {
    console.log('❌ 无效的 Solana 地址 / Invalid Solana address');
    process.exit(1);
}

const user = findOrCreateUser(telegramId, '');
const wallets = getUserWallets(user.id);

if (wallets.length >= 5) {
    console.log('❌ 最多支持 5 个钱包 / Maximum 5 wallets allowed');
    process.exit(1);
}

const added = addWallet(user.id, address);
if (added) {
    console.log(`✅ 钱包已添加 / Wallet added: ${address.slice(0, 6)}...${address.slice(-4)}`);
    console.log(`当前共 ${wallets.length + 1} 个钱包 / Total: ${wallets.length + 1} wallets`);
} else {
    console.log('⚠️ 该钱包已存在 / Wallet already exists');
}
