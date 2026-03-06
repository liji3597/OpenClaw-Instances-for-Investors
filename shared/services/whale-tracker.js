const axios = require('axios');
const config = require('../config');
const { getTokenPrice, mintToSymbol } = require('../price-service');
const { createLogger } = require('../logger');
const { recordMetric } = require('../metrics');

const logger = createLogger('whale-tracker');
const HELIUS_BASE_URL = 'https://api.helius.xyz/v0';
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_MIN_USD = 50_000;

function normalizeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTimestamp(timestamp) {
    const value = normalizeNumber(timestamp, 0);
    if (!value) return new Date().toISOString();
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
}

function normalizeTokenAmount(rawAmount, decimalsHint = null) {
    if (Number.isFinite(Number(rawAmount))) return Number(rawAmount);
    if (!rawAmount || typeof rawAmount !== 'object') return 0;

    if (Number.isFinite(Number(rawAmount.uiAmount))) return Number(rawAmount.uiAmount);
    if (Number.isFinite(Number(rawAmount.uiAmountString))) return Number(rawAmount.uiAmountString);
    if (Number.isFinite(Number(rawAmount.amount)) && Number.isFinite(Number(rawAmount.decimals))) {
        return Number(rawAmount.amount) / (10 ** Number(rawAmount.decimals));
    }
    if (Number.isFinite(Number(rawAmount.amount)) && Number.isFinite(Number(decimalsHint))) {
        return Number(rawAmount.amount) / (10 ** Number(decimalsHint));
    }

    return 0;
}

function classifyDirection(fromAddress, toAddress, trackedAddress) {
    if (fromAddress === trackedAddress && toAddress === trackedAddress) return 'self';
    if (toAddress === trackedAddress) return 'in';
    if (fromAddress === trackedAddress) return 'out';
    return 'unknown';
}

async function estimateUsd(symbolOrMint, amount, memo) {
    const key = String(symbolOrMint || '');
    if (!key || amount <= 0) return 0;

    if (!memo.has(key)) {
        const price = await getTokenPrice(key);
        memo.set(key, Number(price) || 0);
    }
    return (memo.get(key) || 0) * amount;
}

async function parseWhaleEventsFromTransaction(tx, trackedAddress, minUsdValue, priceMemo) {
    const events = [];
    const signature = tx.signature || tx.transactionSignature || tx.txHash || '';
    const timestamp = normalizeTimestamp(tx.timestamp || tx.blockTime);
    const minUsd = normalizeNumber(minUsdValue, DEFAULT_MIN_USD);

    const nativeTransfers = Array.isArray(tx.nativeTransfers) ? tx.nativeTransfers : [];
    for (const transfer of nativeTransfers) {
        const fromAddress = transfer.fromUserAccount || transfer.from || transfer.source || '';
        const toAddress = transfer.toUserAccount || transfer.to || transfer.destination || '';
        if (fromAddress !== trackedAddress && toAddress !== trackedAddress) continue;

        const amountSol = normalizeNumber(transfer.amount) / 1_000_000_000;
        if (amountSol <= 0) continue;

        const usdValue = await estimateUsd(config.tokens.SOL, amountSol, priceMemo);
        if (usdValue < minUsd) continue;

        events.push({
            signature,
            timestamp,
            transferType: 'native',
            symbol: 'SOL',
            mint: config.tokens.SOL,
            amount: amountSol,
            usdValue,
            direction: classifyDirection(fromAddress, toAddress, trackedAddress),
            fromAddress,
            toAddress,
            counterparty: fromAddress === trackedAddress ? toAddress : fromAddress,
        });
    }

    const tokenTransfers = Array.isArray(tx.tokenTransfers) ? tx.tokenTransfers : [];
    for (const transfer of tokenTransfers) {
        const fromAddress = transfer.fromUserAccount || transfer.fromTokenAccount || transfer.from || '';
        const toAddress = transfer.toUserAccount || transfer.toTokenAccount || transfer.to || '';
        if (fromAddress !== trackedAddress && toAddress !== trackedAddress) continue;

        const mint = transfer.mint || transfer.tokenMint || '';
        const amount = normalizeTokenAmount(transfer.tokenAmount, transfer.decimals);
        if (!mint || amount <= 0) continue;

        const usdValue = await estimateUsd(mint, amount, priceMemo);
        if (usdValue < minUsd) continue;

        events.push({
            signature,
            timestamp,
            transferType: 'spl',
            symbol: mintToSymbol(mint),
            mint,
            amount,
            usdValue,
            direction: classifyDirection(fromAddress, toAddress, trackedAddress),
            fromAddress,
            toAddress,
            counterparty: fromAddress === trackedAddress ? toAddress : fromAddress,
        });
    }

    return events;
}

async function fetchAddressTransactions(address, options = {}) {
    if (!config.heliusApiKey) {
        const err = new Error('HELIUS_API_KEY is required for whale tracking');
        err.code = 'HELIUS_API_KEY_MISSING';
        throw err;
    }

    const limit = Math.max(1, Math.min(100, normalizeNumber(options.limit, 25)));
    const params = {
        'api-key': config.heliusApiKey,
        limit,
    };
    if (options.before) params.before = options.before;

    const startedAt = Date.now();
    const response = await axios.get(`${HELIUS_BASE_URL}/addresses/${address}/transactions`, {
        params,
        timeout: 20_000,
    });

    recordMetric('api.latency.ms', Date.now() - startedAt, {
        provider: 'helius',
        endpoint: '/v0/addresses/{address}/transactions',
    });

    return Array.isArray(response.data) ? response.data : [];
}

async function scanWhaleTransfers(options = {}) {
    const address = String(options.address || '').trim();
    if (!address) {
        const err = new Error('Wallet address is required');
        err.code = 'MISSING_WALLET_ADDRESS';
        throw err;
    }

    const transactions = Array.isArray(options.transactions)
        ? options.transactions
        : await fetchAddressTransactions(address, { limit: options.limit || 25 });
    const priceMemo = new Map();
    const minUsdValue = normalizeNumber(options.minUsdValue, DEFAULT_MIN_USD);
    const events = [];

    for (const tx of transactions) {
        const txEvents = await parseWhaleEventsFromTransaction(tx, address, minUsdValue, priceMemo);
        events.push(...txEvents);
    }

    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    recordMetric('event.total', 1, {
        component: 'whale-tracker',
        operation: 'scan',
    });

    return {
        checked: transactions.length,
        events,
    };
}

function createWhaleTracker(options = {}) {
    const address = String(options.address || '').trim();
    const minUsdValue = normalizeNumber(options.minUsdValue, DEFAULT_MIN_USD);
    const pollIntervalMs = Math.max(10_000, normalizeNumber(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS));
    const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    const onError = typeof options.onError === 'function' ? options.onError : () => {};
    const maxSeen = 500;

    let timer = null;
    let running = false;
    let inFlight = false;
    const seenSignatures = new Set();

    function trackSignature(signature) {
        if (!signature) return;
        seenSignatures.add(signature);
        while (seenSignatures.size > maxSeen) {
            const first = seenSignatures.values().next().value;
            seenSignatures.delete(first);
        }
    }

    async function poll(seedOnly = false) {
        if (inFlight) return;
        inFlight = true;
        try {
            const transactions = await fetchAddressTransactions(address, { limit: 25 });
            if (seedOnly) {
                transactions.forEach((tx) => trackSignature(tx.signature || tx.transactionSignature));
                return;
            }

            const newTransactions = transactions.filter((tx) => {
                const signature = tx.signature || tx.transactionSignature;
                return signature && !seenSignatures.has(signature);
            });

            for (const tx of transactions) {
                trackSignature(tx.signature || tx.transactionSignature);
            }
            if (newTransactions.length === 0) return;

            newTransactions.reverse();
            const { events } = await scanWhaleTransfers({
                address,
                minUsdValue,
                transactions: newTransactions,
            });
            for (const event of events) {
                onEvent(event);
            }
        } catch (err) {
            recordMetric('error.total', 1, { component: 'whale-tracker', scope: 'poll' });
            logger.warn('Whale tracker poll failed', { reason: err.message });
            onError(err);
        } finally {
            inFlight = false;
        }
    }

    return {
        async start() {
            if (running) return;
            if (!address) {
                throw new Error('Wallet address is required');
            }

            running = true;
            await poll(true);
            timer = setInterval(() => {
                poll(false).catch((err) => onError(err));
            }, pollIntervalMs);
            logger.info('Whale tracker started', { address, minUsdValue, pollIntervalMs });
        },
        stop() {
            if (!running) return;
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            running = false;
            logger.info('Whale tracker stopped', { address });
        },
        isRunning() {
            return running;
        },
    };
}

module.exports = {
    scanWhaleTransfers,
    createWhaleTracker,
};
