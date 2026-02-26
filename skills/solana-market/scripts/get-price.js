#!/usr/bin/env node
/**
 * Get current price for a token
 * Usage: node get-price.js <token_symbol> [--lang en]
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { getTokenPrice } = require(path.join(sharedDir, 'price-service'));
const { formatPrice } = require(path.join(sharedDir, 'formatter'));

const symbol = (process.argv[2] || '').toUpperCase();
const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'zh';

if (!symbol) {
    console.error('Usage: node get-price.js <token_symbol>');
    console.error('  例如 / e.g.: node get-price.js SOL');
    process.exit(1);
}

async function main() {
    const price = await getTokenPrice(symbol);
    if (price > 0) {
        console.log(formatPrice(symbol, price, lang));
    } else {
        console.log(`⚠️ 未能获取 ${symbol} 价格 / Could not fetch ${symbol} price`);
    }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
