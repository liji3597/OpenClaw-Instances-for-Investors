const { Connection } = require('@solana/web3.js');
const config = require('./config');

let connection = null;

/**
 * Get or create a Solana RPC connection with retry support.
 */
function getConnection() {
    if (!connection) {
        connection = new Connection(config.rpcUrl, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000,
        });
        console.log(`✅ Solana RPC connected (${config.solanaNetwork})`);
    }
    return connection;
}

/**
 * Execute an RPC call with exponential backoff retry.
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Max retry attempts
 * @returns {Promise<any>}
 */
async function withRetry(fn, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt === maxRetries) throw err;
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
            console.warn(`RPC call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

module.exports = { getConnection, withRetry };
