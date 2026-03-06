const DEFAULT_BENCHMARKS = {
    conservative: {
        SOL: 25,
        USDC: 35,
        USDT: 15,
        JUP: 10,
        RAY: 10,
        BONK: 5,
    },
    moderate: {
        SOL: 40,
        USDC: 20,
        USDT: 10,
        JUP: 15,
        RAY: 10,
        BONK: 5,
    },
    aggressive: {
        SOL: 50,
        JUP: 20,
        RAY: 15,
        BONK: 10,
        USDC: 5,
    },
};

function normalizeSymbol(symbol) {
    return String(symbol || '').trim().toUpperCase();
}

function normalizeBenchmarkMap(benchmarkMap = {}) {
    const entries = Object.entries(benchmarkMap)
        .map(([symbol, weight]) => [normalizeSymbol(symbol), Number(weight)])
        .filter(([symbol, weight]) => symbol && Number.isFinite(weight) && weight > 0);

    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    if (total <= 0) return {};

    return Object.fromEntries(
        entries.map(([symbol, weight]) => [symbol, (weight / total) * 100])
    );
}

function pickBenchmark(profileOrName = 'moderate') {
    const key = normalizeSymbol(profileOrName).toLowerCase();
    return DEFAULT_BENCHMARKS[key] || DEFAULT_BENCHMARKS.moderate;
}

function aggregateCurrentAllocations(holdings = [], benchmarkMap = {}) {
    const benchmarkSymbols = new Set(Object.keys(benchmarkMap));
    const current = {};

    for (const holding of holdings) {
        const symbol = normalizeSymbol(holding.symbol);
        const percentage = Number(holding.percentage);
        if (!symbol || !Number.isFinite(percentage) || percentage <= 0) continue;

        if (benchmarkSymbols.has(symbol)) {
            current[symbol] = (current[symbol] || 0) + percentage;
        } else {
            current.OTHER = (current.OTHER || 0) + percentage;
        }
    }

    return current;
}

function generateRebalanceSuggestion(portfolio, options = {}) {
    const benchmark = normalizeBenchmarkMap(options.benchmark || pickBenchmark(options.profile));
    const rebalanceThresholdPct = Number(options.rebalanceThresholdPct);
    const thresholdPct = Number.isFinite(rebalanceThresholdPct) && rebalanceThresholdPct > 0
        ? rebalanceThresholdPct
        : 5;
    const holdings = Array.isArray(portfolio?.holdings) ? portfolio.holdings : [];
    const totalValue = Number(portfolio?.totalValue) || 0;
    const current = aggregateCurrentAllocations(holdings, benchmark);

    const symbols = new Set([
        ...Object.keys(benchmark),
        ...Object.keys(current),
    ]);

    const comparisons = [];
    for (const symbol of symbols) {
        const currentPct = Number(current[symbol] || 0);
        const targetPct = Number(benchmark[symbol] || 0);
        const driftPct = currentPct - targetPct;
        comparisons.push({
            symbol,
            currentPct,
            targetPct,
            driftPct,
            driftUsd: totalValue * (driftPct / 100),
        });
    }

    const suggestions = comparisons
        .filter((item) => Math.abs(item.driftPct) >= thresholdPct && item.symbol !== 'OTHER')
        .map((item) => ({
            symbol: item.symbol,
            action: item.driftPct > 0 ? 'reduce' : 'increase',
            currentPct: item.currentPct,
            targetPct: item.targetPct,
            driftPct: item.driftPct,
            notionalUsd: Math.abs(item.driftUsd),
        }))
        .sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct));

    const stablecoinShare = Number(current.USDC || 0) + Number(current.USDT || 0);
    const divergenceScore = comparisons.reduce((sum, item) => sum + Math.abs(item.driftPct), 0) / 2;

    return {
        benchmark,
        current,
        comparisons,
        suggestions,
        stablecoinShare,
        divergenceScore,
        thresholdPct,
    };
}

module.exports = {
    DEFAULT_BENCHMARKS,
    pickBenchmark,
    generateRebalanceSuggestion,
};
