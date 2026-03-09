'use strict';

const { createLogger } = require('../../logger');

/**
 * Abstract signer interface.
 */
class BaseSigner {
    /**
     * @param {Object} [options]
     * @param {string} [options.providerName]
     */
    constructor(options = {}) {
        if (new.target === BaseSigner) {
            throw new Error('BaseSigner is abstract and cannot be instantiated directly.');
        }

        this.providerName = String(options.providerName || 'unknown');
        this.logger = createLogger(`signer-${this.providerName}`);
    }

    /**
     * Sign a serialized transaction payload.
     * @param {Object} params
     * @param {string} params.unsignedTransactionBase64
     * @param {string} params.keyRef
     * @param {Object<string, any>} [params.context]
     * @returns {Promise<{provider: string, keyRef: string, signedTransactionBase64: string, metadata?: Object<string, any>}>}
     */
    async signSerializedTransaction(params) {
        void params;
        const err = new Error(`${this.providerName}.signSerializedTransaction() not implemented.`);
        err.code = 'NOT_IMPLEMENTED';
        throw err;
    }

    /**
     * Rotate key material reference.
     * @param {Object} params
     * @param {string} params.keyRef
     * @param {string} [params.reason]
     * @returns {Promise<{provider: string, previousKeyRef: string, keyRef: string, metadata?: Object<string, any>}>}
     */
    async rotateKey(params) {
        void params;
        const err = new Error(`${this.providerName}.rotateKey() not implemented.`);
        err.code = 'NOT_IMPLEMENTED';
        throw err;
    }
}

module.exports = BaseSigner;