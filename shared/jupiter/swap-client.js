'use strict';

const axios = require('axios');
const { createLogger } = require('../logger');
const { getConnection } = require('../solana-connection');
const RouteCache = require('./route-cache');
const ExecutionReporter = require('./execution-reporter');

const DEFAULT_ENDPOINTS = Object.freeze({
    quote: 'https://lite-api.jup.ag/swap/v1/quote',
    swap: 'https://lite-api.jup.ag/swap/v1/swap',
});

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Hard-coded Alpha safety limits, aligned with risk-controller defaults.
 */
const SAFETY_LIMITS = Object.freeze({
    perTxUsdCap: 100,
    dailyUsdCap: 500,
    maxSlippageBps: 300,
});

/**
 * Jupiter swap execution client:
 * quote -> build swap tx -> sign -> broadcast -> confirm.
 */
class JupiterSwapClient {
    /**
     * @param {Object} [options]
     * @param {import('axios').AxiosInstance} [options.httpClient]
     * @param {Object} [options.connection] - Solana web3 Connection-like client.
     * @param {Object} [options.transactionSigner] - Signer with `signSwapTransaction`.
     * @param {RouteCache} [options.routeCache]
     * @param {ExecutionReporter} [options.executionReporter]
     * @param {Object} [options.endpoints]
     * @param {number} [options.timeoutMs]
     */
    constructor(options = {}) {
        this.httpClient = options.httpClient || axios.create({
            timeout: toPositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS),
        });
        this.connection = options.connection || getConnection();
        this.transactionSigner = options.transactionSigner || null;
        this.routeCache = options.routeCache || new RouteCache({ ttlMs: options.routeCacheTtlMs });
        this.executionReporter = options.executionReporter || null;
        this.endpoints = {
            ...DEFAULT_ENDPOINTS,
            ...(options.endpoints || {}),
        };
        this.logger = createLogger('jupiter-swap-client');
    }

    /**
     * Fetch quote from Jupiter Quote API.
     * @param {Object} params
     * @param {string} params.inputMint
     * @param {string} params.outputMint
     * @param {string|number} params.amountAtomic
     * @param {number} params.slippageBps
     * @param {string} [params.swapMode]
     * @param {boolean} [params.onlyDirectRoutes]
     * @param {boolean} [params.restrictIntermediateTokens]
     * @param {number} [params.cacheTtlMs]
     * @returns {Promise<Object>}
     */
    async fetchQuote(params = {}) {
        const inputMint = requireString(params.inputMint, 'inputMint', 'INVALID_INPUT_MINT');
        const outputMint = requireString(params.outputMint, 'outputMint', 'INVALID_OUTPUT_MINT');
        const amountAtomic = requireAtomicAmount(params.amountAtomic);
        const slippageBps = requireSlippageBps(params.slippageBps);

        const cacheKey = this.routeCache.buildQuoteKey({
            inputMint,
            outputMint,
            amountAtomic,
            slippageBps,
            swapMode: params.swapMode || 'ExactIn',
            onlyDirectRoutes: Boolean(params.onlyDirectRoutes),
            restrictIntermediateTokens: params.restrictIntermediateTokens !== false,
        });

        const cached = this.routeCache.get(cacheKey);
        if (cached) {
            this.logger.debug('Jupiter quote cache hit', { inputMint, outputMint, amountAtomic, slippageBps });
            return cached;
        }

        const response = await this._requestWithRetry(
            () => this.httpClient.get(this.endpoints.quote, {
                params: {
                    inputMint,
                    outputMint,
                    amount: amountAtomic,
                    slippageBps,
                    swapMode: params.swapMode || 'ExactIn',
                    onlyDirectRoutes: params.onlyDirectRoutes ? 'true' : 'false',
                    restrictIntermediateTokens: params.restrictIntermediateTokens !== false ? 'true' : 'false',
                },
            }),
            { scope: 'fetch_quote', maxAttempts: 3, errorCode: 'JUPITER_QUOTE_FAILED' }
        );

        const quote = response && response.data;
        if (!quote || typeof quote !== 'object') {
            const err = new Error('Jupiter quote API returned invalid payload.');
            err.code = 'JUPITER_QUOTE_INVALID';
            throw err;
        }

        this.routeCache.set(cacheKey, quote, params.cacheTtlMs);
        this.logger.info('Jupiter quote fetched', {
            inputMint,
            outputMint,
            amountAtomic,
            slippageBps,
            outAmount: quote.outAmount || null,
            priceImpactPct: quote.priceImpactPct || null,
        });

        return quote;
    }

    /**
     * Build swap transaction through Jupiter Swap API.
     * @param {Object} params
     * @param {Object} params.quoteResponse
     * @param {string} params.userPublicKey
     * @param {boolean} [params.wrapAndUnwrapSol]
     * @param {boolean} [params.dynamicComputeUnitLimit]
     * @param {string|number} [params.prioritizationFeeLamports]
     * @returns {Promise<Object>}
     */
    async fetchSwapTransaction(params = {}) {
        if (!params.quoteResponse || typeof params.quoteResponse !== 'object') {
            const err = new Error('quoteResponse is required.');
            err.code = 'INVALID_QUOTE_RESPONSE';
            throw err;
        }

        const userPublicKey = requireString(params.userPublicKey, 'userPublicKey', 'INVALID_USER_PUBLIC_KEY');

        const response = await this._requestWithRetry(
            () => this.httpClient.post(this.endpoints.swap, {
                quoteResponse: params.quoteResponse,
                userPublicKey,
                wrapAndUnwrapSol: params.wrapAndUnwrapSol !== false,
                dynamicComputeUnitLimit: params.dynamicComputeUnitLimit !== false,
                prioritizationFeeLamports: params.prioritizationFeeLamports || 'auto',
            }),
            { scope: 'fetch_swap_transaction', maxAttempts: 3, errorCode: 'JUPITER_SWAP_TX_BUILD_FAILED' }
        );

        const payload = response && response.data;
        const txBase64 = firstString([
            payload && payload.swapTransaction,
            payload && payload.swapTransactionBase64,
        ]);

        if (!txBase64) {
            const err = new Error('Jupiter swap API response missing swapTransaction.');
            err.code = 'JUPITER_SWAP_TX_INVALID';
            throw err;
        }

        this.logger.info('Jupiter swap transaction built', {
            userPublicKey,
            lastValidBlockHeight: payload.lastValidBlockHeight || null,
            prioritizationFeeLamports: payload.prioritizationFeeLamports || null,
        });

        return payload;
    }

    /**
     * Broadcast a signed transaction to Solana RPC.
     * @param {Object} params
     * @param {string} params.signedTransactionBase64
     * @param {Object} [params.sendOptions]
     * @returns {Promise<{signature: string, sentAt: string}>}
     */
    async broadcastSignedTransaction(params = {}) {
        const signedTransactionBase64 = requireString(
            params.signedTransactionBase64,
            'signedTransactionBase64',
            'INVALID_SIGNED_TRANSACTION'
        );

        const rawTransaction = Buffer.from(signedTransactionBase64, 'base64');
        if (!rawTransaction || rawTransaction.length === 0) {
            const err = new Error('signedTransactionBase64 is invalid.');
            err.code = 'INVALID_SIGNED_TRANSACTION';
            throw err;
        }

        const sendOptions = params.sendOptions && typeof params.sendOptions === 'object'
            ? params.sendOptions
            : {};

        const signature = await this.connection.sendRawTransaction(rawTransaction, {
            skipPreflight: Boolean(sendOptions.skipPreflight),
            maxRetries: toPositiveInteger(sendOptions.maxRetries, 3),
            preflightCommitment: sendOptions.preflightCommitment || 'confirmed',
        });

        this.logger.info('Signed swap transaction broadcasted', { signature });

        return {
            signature,
            sentAt: new Date().toISOString(),
        };
    }

    /**
     * Await transaction confirmation with retries and status polling.
     * @param {Object} params
     * @param {string} params.signature
     * @param {string} [params.blockhash]
     * @param {number} [params.lastValidBlockHeight]
     * @param {number} [params.maxAttempts]
     * @param {number} [params.pollIntervalMs]
     * @param {'confirmed'|'finalized'|'processed'} [params.commitment]
     * @returns {Promise<{signature: string, confirmed: boolean, confirmationStatus: string, slot: number|null, confirmations: number|null}>}
     */
    async awaitConfirmation(params = {}) {
        const signature = requireString(params.signature, 'signature', 'INVALID_SIGNATURE');
        const maxAttempts = toPositiveInteger(params.maxAttempts, 8);
        const pollIntervalMs = toPositiveInteger(params.pollIntervalMs, 1_200);
        const commitment = params.commitment || 'confirmed';
        const blockhash = normalizeString(params.blockhash);
        const lastValidBlockHeight = Number.isFinite(Number(params.lastValidBlockHeight))
            ? Number(params.lastValidBlockHeight)
            : null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                if (blockhash && Number.isFinite(lastValidBlockHeight)) {
                    const confirmed = await this.connection.confirmTransaction(
                        { signature, blockhash, lastValidBlockHeight },
                        commitment
                    );
                    if (confirmed && confirmed.value && confirmed.value.err) {
                        const err = new Error(`Transaction failed on-chain: ${JSON.stringify(confirmed.value.err)}`);
                        err.code = 'TRANSACTION_EXECUTION_FAILED';
                        throw err;
                    }
                }

                const statusResponse = await this.connection.getSignatureStatuses(
                    [signature],
                    { searchTransactionHistory: true }
                );
                const status = statusResponse && statusResponse.value ? statusResponse.value[0] : null;

                if (status && status.err) {
                    const err = new Error(`Transaction reverted: ${JSON.stringify(status.err)}`);
                    err.code = 'TRANSACTION_EXECUTION_FAILED';
                    throw err;
                }

                if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
                    this.logger.info('Transaction confirmed', {
                        signature,
                        confirmationStatus: status.confirmationStatus,
                        slot: status.slot || null,
                    });
                    return {
                        signature,
                        confirmed: true,
                        confirmationStatus: status.confirmationStatus,
                        slot: Number.isFinite(status.slot) ? status.slot : null,
                        confirmations: Number.isFinite(status.confirmations) ? status.confirmations : null,
                    };
                }

                if (attempt < maxAttempts) {
                    await sleep(pollIntervalMs * attempt);
                }
            } catch (err) {
                const retryable = isRetryableConfirmationError(err) && attempt < maxAttempts;
                this.logger.warn('Confirmation attempt failed', {
                    signature,
                    attempt,
                    maxAttempts,
                    retryable,
                    reason: err.message,
                });

                if (!retryable) {
                    throw withCode(err, err.code || 'CONFIRMATION_FAILED');
                }

                await sleep(pollIntervalMs * attempt);
            }
        }

        const timeoutErr = new Error(`Transaction confirmation timeout after ${maxAttempts} attempts.`);
        timeoutErr.code = 'CONFIRMATION_TIMEOUT';
        throw timeoutErr;
    }

    /**
     * Execute end-to-end swap:
     * quote -> build tx -> sign -> broadcast -> confirm.
     * @param {Object} params
     * @param {string} params.userId
     * @param {string} params.userPublicKey
     * @param {string} params.inputMint
     * @param {string} params.outputMint
     * @param {string|number} params.amountAtomic
     * @param {number} params.usdNotional
     * @param {number} params.dailyUsedUsd
     * @param {number} params.slippageBps
     * @param {string} params.idempotencyKey
     * @param {string} [params.signerProvider]
     * @param {string} [params.keyRef]
     * @param {Object<string, any>} [params.signerContext]
     * @param {Object} [params.sendOptions]
     * @param {Object} [params.confirmationOptions]
     * @param {Object} [params.quoteOptions]
     * @param {Object} [params.transactionSigner] - Optional override signer.
     * @returns {Promise<Object>}
     */
    async executeSwap(params = {}) {
        const startedAt = Date.now();
        const userId = requireString(params.userId, 'userId', 'INVALID_USER_ID');
        const userPublicKey = requireString(params.userPublicKey, 'userPublicKey', 'INVALID_USER_PUBLIC_KEY');
        const inputMint = requireString(params.inputMint, 'inputMint', 'INVALID_INPUT_MINT');
        const outputMint = requireString(params.outputMint, 'outputMint', 'INVALID_OUTPUT_MINT');
        const amountAtomic = requireAtomicAmount(params.amountAtomic);
        const idempotencyKey = requireString(params.idempotencyKey, 'idempotencyKey', 'IDEMPOTENCY_KEY_REQUIRED');
        const slippageBps = requireSlippageBps(params.slippageBps);

        const safetyCheck = this._enforceSafetyLimits({
            usdNotional: params.usdNotional,
            dailyUsedUsd: params.dailyUsedUsd,
            slippageBps,
        });

        const signer = params.transactionSigner || this.transactionSigner;
        if (!signer || typeof signer.signSwapTransaction !== 'function') {
            const err = new Error('transactionSigner with signSwapTransaction() is required.');
            err.code = 'TRANSACTION_SIGNER_REQUIRED';
            throw err;
        }

        const reporterContext = {
            userId,
            idempotencyKey,
            severity: 'INFO',
        };

        try {
            await this._safeReport('reportSwapStarted', {
                userPublicKey,
                inputMint,
                outputMint,
                amountAtomic,
                slippageBps,
                safetyCheck,
            }, reporterContext);

            const quote = await this.fetchQuote({
                inputMint,
                outputMint,
                amountAtomic,
                slippageBps,
                ...(params.quoteOptions || {}),
            });

            await this._safeReport('reportQuoteReceived', {
                inputMint,
                outputMint,
                amountAtomic,
                slippageBps,
                outAmount: quote.outAmount || null,
                priceImpactPct: quote.priceImpactPct || null,
            }, reporterContext);

            const swapPayload = await this.fetchSwapTransaction({
                quoteResponse: quote,
                userPublicKey,
                ...(params.swapBuildOptions || {}),
            });

            const unsignedTransactionBase64 = firstString([
                swapPayload.swapTransaction,
                swapPayload.swapTransactionBase64,
            ]);
            if (!unsignedTransactionBase64) {
                const err = new Error('Built swap payload missing unsigned transaction.');
                err.code = 'JUPITER_SWAP_TX_INVALID';
                throw err;
            }

            await this._safeReport('reportTransactionBuilt', {
                lastValidBlockHeight: swapPayload.lastValidBlockHeight || null,
                dynamicSlippageReport: swapPayload.dynamicSlippageReport || null,
            }, reporterContext);

            const signingResult = await signer.signSwapTransaction({
                userId,
                provider: params.signerProvider,
                keyRef: params.keyRef,
                unsignedTransactionBase64,
                context: {
                    ...(params.signerContext || {}),
                    userPublicKey,
                    inputMint,
                    outputMint,
                    amountAtomic,
                    idempotencyKey,
                },
            });

            const signedTransactionBase64 = firstString([
                signingResult && signingResult.signedTransactionBase64,
                signingResult && signingResult.signedTransaction,
            ]);
            if (!signedTransactionBase64) {
                const err = new Error('Transaction signer returned invalid payload.');
                err.code = 'SIGNED_TRANSACTION_INVALID';
                throw err;
            }

            const broadcastResult = await this.broadcastSignedTransaction({
                signedTransactionBase64,
                sendOptions: params.sendOptions,
            });

            await this._safeReport('reportTransactionBroadcast', {
                signature: broadcastResult.signature,
                signerProvider: signingResult.provider || params.signerProvider || null,
                signerKeyRef: signingResult.keyRef || params.keyRef || null,
            }, reporterContext);

            const confirmation = await this.awaitConfirmation({
                signature: broadcastResult.signature,
                blockhash: firstString([swapPayload.lastValidBlockhash, swapPayload.blockhash]),
                lastValidBlockHeight: swapPayload.lastValidBlockHeight,
                ...(params.confirmationOptions || {}),
            });

            await this._safeReport('reportSwapConfirmed', {
                signature: broadcastResult.signature,
                confirmationStatus: confirmation.confirmationStatus,
                slot: confirmation.slot,
                latencyMs: Date.now() - startedAt,
                outAmount: quote.outAmount || null,
            }, reporterContext);

            this.logger.info('Swap execution completed', {
                userId,
                idempotencyKey,
                signature: broadcastResult.signature,
                latencyMs: Date.now() - startedAt,
            });

            return {
                ok: true,
                signature: broadcastResult.signature,
                quote,
                confirmation,
                signer: {
                    provider: signingResult.provider || null,
                    keyRef: signingResult.keyRef || null,
                    signatureCount: Number.isFinite(signingResult.signatureCount)
                        ? signingResult.signatureCount
                        : null,
                },
                safetyCheck,
                latencyMs: Date.now() - startedAt,
            };
        } catch (err) {
            const safeErr = withCode(err, err.code || 'SWAP_EXECUTION_FAILED');

            this.logger.error('Swap execution failed', {
                userId,
                idempotencyKey,
                code: safeErr.code,
                reason: safeErr.message,
            });

            await this._safeReport('reportSwapFailed', {
                code: safeErr.code,
                reason: safeErr.message,
                latencyMs: Date.now() - startedAt,
            }, {
                ...reporterContext,
                severity: 'ERROR',
            });

            throw safeErr;
        }
    }

    /**
     * Enforce Alpha safety limits before building/signing tx.
     * @param {{usdNotional: number, dailyUsedUsd: number, slippageBps: number}} params
     * @returns {{usdNotional: number, dailyUsedUsd: number, projectedDailyUsd: number, slippageBps: number, limits: typeof SAFETY_LIMITS}}
     */
    _enforceSafetyLimits(params) {
        const usdNotional = Number(params.usdNotional);
        if (!Number.isFinite(usdNotional) || usdNotional <= 0) {
            const err = new Error('usdNotional must be a positive number.');
            err.code = 'USD_NOTIONAL_REQUIRED';
            throw err;
        }

        const dailyUsedUsd = Number.isFinite(Number(params.dailyUsedUsd)) ? Number(params.dailyUsedUsd) : 0;
        const slippageBps = requireSlippageBps(params.slippageBps);

        if (usdNotional > SAFETY_LIMITS.perTxUsdCap) {
            const err = new Error(`Per-tx cap exceeded: ${usdNotional} > ${SAFETY_LIMITS.perTxUsdCap}.`);
            err.code = 'PER_TX_CAP_EXCEEDED';
            throw err;
        }

        const projectedDailyUsd = dailyUsedUsd + usdNotional;
        if (projectedDailyUsd > SAFETY_LIMITS.dailyUsdCap) {
            const err = new Error(`Daily cap exceeded: ${projectedDailyUsd} > ${SAFETY_LIMITS.dailyUsdCap}.`);
            err.code = 'DAILY_CAP_EXCEEDED';
            throw err;
        }

        if (slippageBps > SAFETY_LIMITS.maxSlippageBps) {
            const err = new Error(`Slippage cap exceeded: ${slippageBps} > ${SAFETY_LIMITS.maxSlippageBps}.`);
            err.code = 'SLIPPAGE_LIMIT_EXCEEDED';
            throw err;
        }

        return {
            usdNotional,
            dailyUsedUsd,
            projectedDailyUsd,
            slippageBps,
            limits: { ...SAFETY_LIMITS },
        };
    }

    async _safeReport(methodName, payload, context) {
        if (!this.executionReporter) return null;
        if (typeof this.executionReporter[methodName] !== 'function') return null;

        try {
            return await this.executionReporter[methodName](payload, context);
        } catch (err) {
            this.logger.warn('Execution report failed', {
                method: methodName,
                reason: err.message,
            });
            return null;
        }
    }

    async _requestWithRetry(fn, options = {}) {
        const scope = options.scope || 'http_request';
        const maxAttempts = toPositiveInteger(options.maxAttempts, 3);
        const errorCode = options.errorCode || 'UPSTREAM_REQUEST_FAILED';
        let lastErr = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                return await fn();
            } catch (err) {
                lastErr = err;
                const retryable = isRetryableHttpError(err) && attempt < maxAttempts;

                this.logger.warn('Upstream request failed', {
                    scope,
                    attempt,
                    maxAttempts,
                    retryable,
                    reason: err.message,
                    status: err && err.response ? err.response.status : null,
                });

                if (!retryable) break;
                await sleep(250 * Math.pow(2, attempt - 1));
            }
        }

        throw withCode(lastErr || new Error(`Request failed in ${scope}.`), errorCode);
    }
}

function requireString(value, fieldName, code) {
    const normalized = normalizeString(value);
    if (!normalized) {
        const err = new Error(`${fieldName} is required.`);
        err.code = code || 'VALIDATION_ERROR';
        throw err;
    }
    return normalized;
}

function requireAtomicAmount(value) {
    const str = String(value || '').trim();
    if (!/^\d+$/.test(str) || str === '0') {
        const err = new Error('amountAtomic must be a positive integer string.');
        err.code = 'INVALID_AMOUNT_ATOMIC';
        throw err;
    }
    return str;
}

function requireSlippageBps(value) {
    const slippage = Number(value);
    if (!Number.isFinite(slippage) || slippage < 0) {
        const err = new Error('slippageBps must be a non-negative number.');
        err.code = 'INVALID_SLIPPAGE_BPS';
        throw err;
    }
    if (slippage > SAFETY_LIMITS.maxSlippageBps) {
        const err = new Error(`slippageBps exceeds safety cap (${SAFETY_LIMITS.maxSlippageBps}).`);
        err.code = 'SLIPPAGE_LIMIT_EXCEEDED';
        throw err;
    }
    return slippage;
}

function isRetryableHttpError(err) {
    const status = err && err.response ? Number(err.response.status) : 0;
    if (status === 429 || status >= 500) return true;
    return Boolean(err && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED'));
}

function isRetryableConfirmationError(err) {
    const nonRetryable = new Set([
        'TRANSACTION_EXECUTION_FAILED',
        'INVALID_SIGNATURE',
    ]);
    return !nonRetryable.has(err && err.code);
}

function firstString(values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function toPositiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function withCode(err, code) {
    if (err && typeof err === 'object') {
        err.code = err.code || code;
        return err;
    }
    const wrapped = new Error(String(err || 'Unknown error'));
    wrapped.code = code;
    return wrapped;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = JupiterSwapClient;
module.exports.DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS;
module.exports.SAFETY_LIMITS = SAFETY_LIMITS;