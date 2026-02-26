const { aggregateWallets } = require('./wallet');
const { getTokenPrices, mintToSymbol } = require('./price-service');
const { getUserWallets } = require('./database');
const config = require('./config');

/**
 * Get full portfolio data for a user
 * @param {number} userId - database user id
 * @returns {Promise<object>} portfolio data
 */
async function getPortfolio(userId) {
    const wallets = getUserWallets(userId);
    if (wallets.length === 0) {
        return { isEmpty: true, totalValue: 0, holdings: [], walletCount: 0 };
    }

    const addresses = wallets.map(w => w.address);
    const aggregated = await aggregateWallets(addresses);

    // Collect all mints that need pricing
    const allMints = [config.tokens.SOL]; // Always include SOL
    for (const [mint] of aggregated.tokens) {
        allMints.push(mint);
    }

    // Fetch prices
    const prices = await getTokenPrices([...new Set(allMints)]);

    // Build holdings list
    const holdings = [];
    const solPrice = prices.get(config.tokens.SOL) || 0;

    // SOL holding
    if (aggregated.totalSol > 0) {
        holdings.push({
            symbol: 'SOL',
            mint: config.tokens.SOL,
            amount: aggregated.totalSol,
            price: solPrice,
            value: aggregated.totalSol * solPrice,
        });
    }

    // SPL token holdings
    for (const [mint, info] of aggregated.tokens) {
        const price = prices.get(mint) || 0;
        holdings.push({
            symbol: mintToSymbol(mint),
            mint,
            amount: info.amount,
            price,
            value: info.amount * price,
        });
    }

    // Sort by value descending
    holdings.sort((a, b) => b.value - a.value);

    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

    // Calculate percentages
    for (const h of holdings) {
        h.percentage = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
    }

    return {
        isEmpty: false,
        totalValue,
        holdings,
        walletCount: wallets.length,
        wallets: aggregated.wallets,
    };
}

module.exports = { getPortfolio };
