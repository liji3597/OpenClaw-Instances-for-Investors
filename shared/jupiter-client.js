const axios = require('axios');
const { createLogger } = require('./logger');
const { recordMetric } = require('./metrics');

const logger = createLogger('jupiter-client');
const JUPITER_PRICE_ENDPOINT = 'https://lite-api.jup.ag/price/v3';

function normalizePrice(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function fetchJupiterPrices(mints, options = {}) {
    const uniqueMints = [...new Set((Array.isArray(mints) ? mints : []).filter(Boolean))];
    const prices = new Map();
    if (uniqueMints.length === 0) return prices;

    const startedAt = Date.now();
    try {
        const response = await axios.get(JUPITER_PRICE_ENDPOINT, {
            params: {
                ids: uniqueMints.join(','),
            },
            timeout: Number(options.timeoutMs) || 10_000,
        });

        const data = response.data || {};
        for (const mint of uniqueMints) {
            const row = data[mint] || {};
            const price = normalizePrice(row.usdPrice ?? row.price);
            if (price > 0) prices.set(mint, price);
        }

        recordMetric('api.latency.ms', Date.now() - startedAt, {
            provider: 'jupiter',
            endpoint: '/price/v3',
        });
        return prices;
    } catch (err) {
        recordMetric('api.latency.ms', Date.now() - startedAt, {
            provider: 'jupiter',
            endpoint: '/price/v3',
            status: 'error',
        });
        recordMetric('error.total', 1, { component: 'jupiter-client', scope: 'fetch_prices' });
        logger.warn('Jupiter price API error', { reason: err.message });
        return prices;
    }
}

module.exports = {
    fetchJupiterPrices,
    JUPITER_PRICE_ENDPOINT,
};
