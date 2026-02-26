#!/usr/bin/env node
/**
 * Get portfolio summary for a user
 * Usage: node get-portfolio.js <telegram_user_id> [--lang en]
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { initDatabase, findOrCreateUser } = require(path.join(sharedDir, 'database'));
const { getPortfolio } = require(path.join(sharedDir, 'tracker'));
const { formatPortfolioSummary } = require(path.join(sharedDir, 'formatter'));

const telegramId = process.argv[2];
const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'zh';

if (!telegramId) {
    console.error('Usage: node get-portfolio.js <telegram_user_id> [--lang en]');
    process.exit(1);
}

async function main() {
    initDatabase();
    const user = findOrCreateUser(telegramId, '');
    const portfolio = await getPortfolio(user.id);
    console.log(formatPortfolioSummary(portfolio, lang));
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
