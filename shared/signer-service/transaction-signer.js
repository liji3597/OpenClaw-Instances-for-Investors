'use strict';

const crypto = require('crypto');
const { VersionedTransaction, Transaction } = require('@solana/web3.js');
const { createLogger } = require('../logger');

/**
 * Transaction signing orchestrator with provider routing and signature validation.
 */
class TransactionSigner {
    /**
     * @param {Object} options
     * @param {Object} options.keyManager
     * @param {Map<string, Object>|Object<string, Object>} [options.providers]
     */
    constructor(options = {}) {
        if (!options.keyManager) {
            throw new Error('TransactionSigner requires keyManager.');
        }

        this.keyManager = options.keyManager;
        this.providers = new Map();
        this.logger = createLogger('transaction-signer');

        if (options.providers instanceof Map) {
            for (const [name, signer] of options.providers.entries()) {
                this.registerProvider(name, signer);
            }
        } else if (options.providers && typeof options.providers === 'object') {
            for (const [name, signer] of Object.entries(options.providers)) {
                this.registerProvider(name, signer);
            }
        }
    }

    /**
     * Register a signer provider.
     * @param {string} providerName
     * @param {Object} signer
     */
    registerProvider(providerName, signer) {
        const name = requireString(providerName, 'providerName', 'INVALID_PROVIDER');
        if (!signer || typeof signer.signSerializedTransaction !== 'function') {
            const err = new Error(`Provider "${name}" must implement signSerializedTransaction().`);
            err.code = 'INVALID_PROVIDER';
            throw err;
        }

        this.providers.set(name, signer);
        this.logger.info('Signer provider registered', { provider: name });
    }

    /**
     * Sign a Jupiter swap transaction via routed signer provider.
     * @param {Object} params
     * @param {string} params.userId
     * @param {string} [params.provider]
     * @param {string} [params.keyRef]
     * @param {string} params.unsignedTransactionBase64
     * @param {Object<string, any>} [params.context]
     * @returns {Promise<{provider: string, keyRef: string, signedTransactionBase64: string, signatureCount: number, txDigestSha256: string, metadata: Object<string, any>}>}
     */
    async signSwapTransaction(params = {}) {
        const userId = requireString(params.userId, 'userId', 'INVALID_USER_ID');
        const unsignedTransactionBase64 = requireString(
            params.unsignedTransactionBase64,
            'unsignedTransactionBase64',
            'INVALID_UNSIGNED_TRANSACTION'
        );
        const context = params.context && typeof params.context === 'object' ? params.context : {};

        const requestedProvider = normalizeString(params.provider);
        const activeRef = params.keyRef
            ? null
            : this.keyManager.getActiveKeyReference({
                userId,
                provider: requestedProvider || undefined,
            });

        const provider = requestedProvider || (activeRef && activeRef.provider) || 'turnkey';
        const keyRef = normalizeString(params.keyRef) || (activeRef && activeRef.keyRef) || '';

        if (!keyRef) {
            const err = new Error(`No key reference found for user "${userId}" and provider "${provider}".`);
            err.code = 'KEY_REFERENCE_NOT_FOUND';
            throw err;
        }

        const signer = this.providers.get(provider);
        if (!signer) {
            const err = new Error(`Signer provider "${provider}" is not registered.`);
            err.code = 'SIGNER_PROVIDER_NOT_FOUND';
            throw err;
        }

        const signResult = await signer.signSerializedTransaction({
            unsignedTransactionBase64,
            keyRef,
            context,
        });

        const signedTransactionBase64 = firstString([
            signResult && signResult.signedTransactionBase64,
            signResult && signResult.signedTransaction,
        ]);
        if (!signedTransactionBase64) {
            const err = new Error('Signer response missing signed transaction payload.');
            err.code = 'SIGNED_TRANSACTION_INVALID';
            throw err;
        }

        const validation = this.validateSignedTransaction({
            unsignedTransactionBase64,
            signedTransactionBase64,
        });

        this.logger.info('Swap transaction signed', {
            userId,
            provider,
            keyRef: signResult.keyRef || keyRef,
            signatureCount: validation.signatureCount,
            txDigestSha256: validation.txDigestSha256,
        });

        return {
            provider,
            keyRef: signResult.keyRef || keyRef,
            signedTransactionBase64,
            signatureCount: validation.signatureCount,
            txDigestSha256: validation.txDigestSha256,
            metadata: {
                transactionKind: validation.transactionKind,
                signerMetadata: signResult.metadata && typeof signResult.metadata === 'object'
                    ? signResult.metadata
                    : {},
            },
        };
    }

    /**
     * Validate signed transaction against unsigned payload.
     * @param {Object} params
     * @param {string} params.unsignedTransactionBase64
     * @param {string} params.signedTransactionBase64
     * @returns {{signatureCount: number, transactionKind: 'versioned'|'legacy', txDigestSha256: string}}
     */
    validateSignedTransaction(params = {}) {
        const unsignedTransactionBase64 = requireString(
            params.unsignedTransactionBase64,
            'unsignedTransactionBase64',
            'INVALID_UNSIGNED_TRANSACTION'
        );
        const signedTransactionBase64 = requireString(
            params.signedTransactionBase64,
            'signedTransactionBase64',
            'INVALID_SIGNED_TRANSACTION'
        );

        const unsignedBytes = Buffer.from(unsignedTransactionBase64, 'base64');
        const signedBytes = Buffer.from(signedTransactionBase64, 'base64');
        if (!unsignedBytes.length || !signedBytes.length) {
            const err = new Error('Transaction payloads must be valid base64.');
            err.code = 'INVALID_TRANSACTION_PAYLOAD';
            throw err;
        }

        const unsignedParsed = deserializeAnyTransaction(unsignedBytes);
        const signedParsed = deserializeAnyTransaction(signedBytes);

        const unsignedMessage = getMessageBytes(unsignedParsed);
        const signedMessage = getMessageBytes(signedParsed);

        if (Buffer.compare(unsignedMessage, signedMessage) !== 0) {
            const err = new Error('Signed transaction message differs from unsigned payload.');
            err.code = 'SIGNED_MESSAGE_MISMATCH';
            throw err;
        }

        const signatureCount = countNonZeroSignatures(signedParsed);
        if (signatureCount <= 0) {
            const err = new Error('Signed transaction contains no valid signatures.');
            err.code = 'MISSING_SIGNATURES';
            throw err;
        }

        const txDigestSha256 = crypto.createHash('sha256').update(signedBytes).digest('hex');

        return {
            signatureCount,
            transactionKind: signedParsed.kind,
            txDigestSha256,
        };
    }
}

function deserializeAnyTransaction(rawBytes) {
    try {
        const tx = VersionedTransaction.deserialize(rawBytes);
        return { kind: 'versioned', tx };
    } catch (versionedErr) {
        try {
            const tx = Transaction.from(rawBytes);
            return { kind: 'legacy', tx };
        } catch (legacyErr) {
            const err = new Error('Failed to deserialize transaction as versioned or legacy.');
            err.code = 'TRANSACTION_DESERIALIZE_FAILED';
            throw err;
        }
    }
}

function getMessageBytes(parsed) {
    if (parsed.kind === 'versioned') {
        return Buffer.from(parsed.tx.message.serialize());
    }
    return Buffer.from(parsed.tx.serializeMessage());
}

function countNonZeroSignatures(parsed) {
    if (parsed.kind === 'versioned') {
        let count = 0;
        for (const sig of parsed.tx.signatures || []) {
            if (sig && !isAllZero(sig)) count += 1;
        }
        return count;
    }

    let count = 0;
    for (const pair of parsed.tx.signatures || []) {
        if (pair && pair.signature && !isAllZero(pair.signature)) count += 1;
    }
    return count;
}

function isAllZero(signatureBytes) {
    for (const b of signatureBytes) {
        if (b !== 0) return false;
    }
    return true;
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

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function firstString(values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
}

module.exports = TransactionSigner;