const { PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { getConnection, withRetry } = require('./connection');
const config = require('../config');

/**
 * Validate a Solana wallet address
 * @param {string} address
 * @returns {boolean}
 */
function isValidAddress(address) {
    try {
        new PublicKey(address);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get SOL balance for a wallet address
 * @param {string} address
 * @returns {Promise<number>} balance in SOL
 */
async function getSolBalance(address) {
    const conn = getConnection();
    const pubkey = new PublicKey(address);
    const lamports = await withRetry(() => conn.getBalance(pubkey));
    return lamports / LAMPORTS_PER_SOL;
}

/**
 * Get all SPL token accounts for a wallet
 * @param {string} address
 * @returns {Promise<Array<{mint: string, amount: number, decimals: number}>>}
 */
async function getTokenAccounts(address) {
    const conn = getConnection();
    const pubkey = new PublicKey(address);

    const response = await withRetry(() =>
        conn.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID })
    );

    return response.value
        .map(account => {
            const info = account.account.data.parsed.info;
            return {
                mint: info.mint,
                amount: parseFloat(info.tokenAmount.uiAmountString || '0'),
                decimals: info.tokenAmount.decimals,
            };
        })
        .filter(t => t.amount > 0); // exclude zero balances
}

/**
 * Get full wallet holdings (SOL + all SPL tokens)
 * @param {string} address
 * @returns {Promise<{sol: number, tokens: Array}>}
 */
async function getWalletHoldings(address) {
    const [solBalance, tokenAccounts] = await Promise.all([
        getSolBalance(address),
        getTokenAccounts(address),
    ]);

    return {
        address,
        sol: solBalance,
        tokens: tokenAccounts,
    };
}

/**
 * Aggregate holdings across multiple wallets
 * @param {string[]} addresses
 * @returns {Promise<{totalSol: number, tokens: Map<string, {amount: number, decimals: number}>, wallets: Array}>}
 */
async function aggregateWallets(addresses) {
    const results = await Promise.all(
        addresses.map(addr => getWalletHoldings(addr))
    );

    let totalSol = 0;
    const tokenMap = new Map(); // mint → { amount, decimals }

    for (const wallet of results) {
        totalSol += wallet.sol;
        for (const token of wallet.tokens) {
            const existing = tokenMap.get(token.mint);
            if (existing) {
                existing.amount += token.amount;
            } else {
                tokenMap.set(token.mint, { amount: token.amount, decimals: token.decimals });
            }
        }
    }

    return { totalSol, tokens: tokenMap, wallets: results };
}

module.exports = {
    isValidAddress,
    getSolBalance,
    getTokenAccounts,
    getWalletHoldings,
    aggregateWallets,
};
