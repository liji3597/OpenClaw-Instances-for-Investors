const { initDatabase, getDb } = require('../database');
const { getTokenPrice } = require('../price-service');

function normalizeSymbol(tokenSymbol) {
    return String(tokenSymbol || '').trim().toUpperCase();
}

function getCostBasisRow(userId, tokenSymbol) {
    return getDb().prepare(
        'SELECT * FROM cost_basis WHERE user_id = ? AND token_symbol = ?'
    ).get(userId, tokenSymbol);
}

function updateCostBasis(userId, tokenSymbol, amount, costUsd) {
    initDatabase();

    const symbol = normalizeSymbol(tokenSymbol);
    const amountNum = Number(amount);
    const costNum = Number(costUsd);
    if (!userId || !symbol || !Number.isFinite(amountNum) || !Number.isFinite(costNum)) {
        return null;
    }
    if (amountNum <= 0 || costNum < 0) {
        return null;
    }

    getDb().prepare(`
        INSERT INTO cost_basis (user_id, token_symbol, total_amount, total_cost_usd, avg_cost_basis, updated_at)
        VALUES (?, ?, ?, ?, CASE WHEN ? > 0 THEN ? / ? ELSE 0 END, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, token_symbol) DO UPDATE SET
            total_amount = cost_basis.total_amount + excluded.total_amount,
            total_cost_usd = cost_basis.total_cost_usd + excluded.total_cost_usd,
            avg_cost_basis = CASE
                WHEN (cost_basis.total_amount + excluded.total_amount) > 0
                THEN (cost_basis.total_cost_usd + excluded.total_cost_usd) / (cost_basis.total_amount + excluded.total_amount)
                ELSE 0
            END,
            updated_at = CURRENT_TIMESTAMP
    `).run(userId, symbol, amountNum, costNum, amountNum, costNum, amountNum);

    return getCostBasisRow(userId, symbol);
}

function calculateUnrealizedPnl(userId, tokenSymbol, currentPrice) {
    initDatabase();
    const symbol = normalizeSymbol(tokenSymbol);
    const row = getCostBasisRow(userId, symbol);
    if (!row) {
        return 0;
    }

    const amount = Number(row.total_amount) || 0;
    const avgCost = Number(row.avg_cost_basis) || 0;
    const price = Number(currentPrice);
    return Number.isFinite(price) ? (price - avgCost) * amount : 0;
}

function calculateRealizedPnl(userId, tokenSymbol) {
    initDatabase();
    const symbol = normalizeSymbol(tokenSymbol);
    const row = getCostBasisRow(userId, symbol);
    return row ? Number(row.realized_pnl) || 0 : 0;
}

async function getPortfolioPnl(userId, holdings = []) {
    initDatabase();
    const output = [];

    for (const holding of holdings) {
        const symbol = normalizeSymbol(holding.symbol);
        if (!symbol) continue;

        const amount = Number(holding.amount) || 0;
        const currentPrice = Number.isFinite(Number(holding.price))
            ? Number(holding.price)
            : await getTokenPrice(symbol);

        const row = getCostBasisRow(userId, symbol);
        const avgCost = row ? Number(row.avg_cost_basis) || 0 : 0;
        const realizedPnl = row ? Number(row.realized_pnl) || 0 : 0;
        const unrealizedPnl = avgCost > 0 ? (currentPrice - avgCost) * amount : 0;

        output.push({
            symbol,
            amount,
            avgCost,
            unrealizedPnl,
            realizedPnl,
        });
    }

    return output;
}

module.exports = {
    updateCostBasis,
    calculateUnrealizedPnl,
    calculateRealizedPnl,
    getPortfolioPnl,
};
