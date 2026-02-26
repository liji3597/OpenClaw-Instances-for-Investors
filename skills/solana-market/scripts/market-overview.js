#!/usr/bin/env node
/**
 * Show Solana ecosystem market overview
 * Usage: node market-overview.js [--lang en]
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { getKnownTokens, getTokenPrices } = require(path.join(sharedDir, 'price-service'));
const { formatUSD } = require(path.join(sharedDir, 'formatter'));

const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'zh';
const isZh = lang === 'zh';

async function main() {
    const tokens = getKnownTokens();
    const mints = tokens.map(t => t.mint);
    const prices = await getTokenPrices(mints);

    console.log(isZh ? '📊 Solana 生态市场概览\n' : '📊 Solana Ecosystem Overview\n');

    for (const token of tokens) {
        const price = prices.get(token.mint) || 0;
        if (price > 0) {
            console.log(`  ${token.symbol.padEnd(6)} ${formatUSD(price)}`);
        } else {
            console.log(`  ${token.symbol.padEnd(6)} --`);
        }
    }

    console.log(`\n${isZh ? '数据来源: CoinGecko' : 'Source: CoinGecko'} | ${new Date().toLocaleTimeString()}`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
