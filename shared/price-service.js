const axios = require('axios');
const config = require('./config');

// In-memory price cache to reduce API calls
const priceCache = new Map(); // mint → { price, timestamp }
const CACHE_TTL = 30_000; // 30 seconds

// Map Solana mint addresses to CoinGecko IDs for reliable pricing
const MINT_TO_COINGECKO_ID = {
    'So11111111111111111111111111111111111111112': 'solana',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'usd-coin',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'tether',
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'jupiter-exchange-solana',
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'raydium',
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'bonk',
};

// Reverse map for CoinGecko responses
const COINGECKO_ID_TO_MINT = {};
for (const [mint, id] of Object.entries(MINT_TO_COINGECKO_ID)) {
    COINGECKO_ID_TO_MINT[id] = mint;
}

/**
 * Resolve token symbol to mint address
 */
function resolveToken(symbolOrMint) {
    const upper = symbolOrMint.toUpperCase();
    if (config.tokens[upper]) return config.tokens[upper];
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(symbolOrMint)) return symbolOrMint;
    return null;
}

/**
 * Reverse lookup: mint address → symbol
 */
function mintToSymbol(mint) {
    for (const [symbol, addr] of Object.entries(config.tokens)) {
        if (addr === mint) return symbol;
    }
    return mint.slice(0, 4) + '...' + mint.slice(-4);
}

/**
 * Get current prices for one or more tokens.
 * Uses CoinGecko (free, no API key) as primary source.
 *
 * @param {string[]} mints - array of token mint addresses
 * @returns {Promise<Map<string, number>>} mint → price in USD
 */
async function getTokenPrices(mints) {
    if (mints.length === 0) return new Map();

    // Check cache first
    const uncached = [];
    const result = new Map();
    const now = Date.now();

    for (const mint of mints) {
        const cached = priceCache.get(mint);
        if (cached && (now - cached.timestamp) < CACHE_TTL) {
            result.set(mint, cached.price);
        } else {
            uncached.push(mint);
        }
    }

    if (uncached.length === 0) return result;

    // Try CoinGecko first (free, no API key needed)
    const ok = await fetchFromCoinGecko(uncached, result, now);

    // Fallback: try Jupiter token price via contract addresses
    if (!ok) {
        await fetchFromCoinGeckoContract(uncached, result, now);
    }

    return result;
}

/**
 * Fetch prices from CoinGecko using known coin IDs (most reliable)
 */
async function fetchFromCoinGecko(mints, result, now) {
    try {
        // Map mints to CoinGecko IDs
        const idMap = new Map(); // coingecko_id → mint
        for (const mint of mints) {
            const cgId = MINT_TO_COINGECKO_ID[mint];
            if (cgId) idMap.set(cgId, mint);
        }

        if (idMap.size === 0) {
            // No known CoinGecko IDs, try contract address method
            return await fetchFromCoinGeckoContract(mints, result, now);
        }

        const ids = [...idMap.keys()].join(',');
        const response = await axios.get(
            'https://api.coingecko.com/api/v3/simple/price',
            {
                params: {
                    ids,
                    vs_currencies: 'usd',
                },
                timeout: 10000,
            }
        );

        const data = response.data || {};
        let found = false;

        for (const [cgId, mint] of idMap) {
            const price = data[cgId]?.usd || 0;
            result.set(mint, price);
            if (price > 0) {
                priceCache.set(mint, { price, timestamp: now });
                found = true;
            }
        }

        // Handle any mints without CoinGecko IDs
        for (const mint of mints) {
            if (!result.has(mint)) {
                result.set(mint, 0);
            }
        }

        return found;
    } catch (err) {
        console.error('CoinGecko price API error:', err.message);
        return false;
    }
}

/**
 * Fallback: fetch prices from CoinGecko using Solana contract addresses
 */
async function fetchFromCoinGeckoContract(mints, result, now) {
    try {
        const contractAddresses = mints.join(',');
        const response = await axios.get(
            'https://api.coingecko.com/api/v3/simple/token_price/solana',
            {
                params: {
                    contract_addresses: contractAddresses,
                    vs_currencies: 'usd',
                },
                timeout: 10000,
            }
        );

        const data = response.data || {};
        let found = false;

        for (const mint of mints) {
            const lower = mint.toLowerCase();
            const price = data[lower]?.usd || 0;
            result.set(mint, price);
            if (price > 0) {
                priceCache.set(mint, { price, timestamp: now });
                found = true;
            }
        }

        return found;
    } catch (err) {
        console.error('CoinGecko contract price fallback error:', err.message);
        for (const mint of mints) {
            if (!result.has(mint)) result.set(mint, 0);
        }
        return false;
    }
}

/**
 * Get price for a single token
 */
async function getTokenPrice(mintOrSymbol) {
    const mint = resolveToken(mintOrSymbol);
    if (!mint) return 0;
    const prices = await getTokenPrices([mint]);
    return prices.get(mint) || 0;
}

/**
 * Get a swap quote from Jupiter
 */
async function getSwapQuote({ inputMint, outputMint, amount, slippageBps }) {
    const response = await axios.get(`${config.jupiterQuoteApiBase}/quote`, {
        params: {
            inputMint,
            outputMint,
            amount: Math.floor(amount).toString(),
            slippageBps: slippageBps || config.defaultSlippageBps,
        },
        timeout: 15000,
    });
    return response.data;
}

/**
 * Get formatted token list (well-known tokens)
 */
function getKnownTokens() {
    return Object.entries(config.tokens).map(([symbol, mint]) => ({ symbol, mint }));
}

/**
 * Clear price cache
 */
function clearPriceCache() {
    priceCache.clear();
}

module.exports = {
    resolveToken,
    mintToSymbol,
    getTokenPrices,
    getTokenPrice,
    getSwapQuote,
    getKnownTokens,
    clearPriceCache,
};
