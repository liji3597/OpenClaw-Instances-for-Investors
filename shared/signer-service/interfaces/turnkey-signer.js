'use strict';

const BaseSigner = require('./base-signer');
const { createLogger } = require('../../logger');

const PROVIDER_NAME = 'turnkey';
const KEY_REF_PREFIX = 'turnkey';

/**
 * Turnkey MPC signer implementation.
 * This signer never handles plaintext private keys and only uses key references.
 */
class TurnkeySigner extends BaseSigner {
    /**
     * @param {Object} [options]
     * @param {string} [options.organizationId] - Default Turnkey organization ID.
     * @param {string} [options.apiPublicKey] - Turnkey API public key.
     * @param {string} [options.apiPrivateKey] - Turnkey API private key.
     * @param {string} [options.apiBaseUrl] - Optional Turnkey API base URL.
     * @param {Object} [options.turnkeyClient] - Prebuilt SDK client for dependency injection.
     * @param {(params: {apiPublicKey?: string, apiPrivateKey?: string, apiBaseUrl?: string}) => Object|Promise<Object>} [options.createTurnkeyClient]
     * @param {(userId: string) => string|null} [options.resolveSubOrganizationId] - Maps user ID to sub-org ID.
     */
    constructor(options = {}) {
        super({ providerName: PROVIDER_NAME });

        this.organizationId = normalizeString(options.organizationId || process.env.TURNKEY_ORGANIZATION_ID);
        this.apiPublicKey = normalizeString(options.apiPublicKey || process.env.TURNKEY_API_PUBLIC_KEY);
        this.apiPrivateKey = normalizeString(options.apiPrivateKey || process.env.TURNKEY_API_PRIVATE_KEY);
        this.apiBaseUrl = normalizeString(options.apiBaseUrl || process.env.TURNKEY_API_BASE_URL);

        this.turnkeyClient = options.turnkeyClient || null;
        this.createTurnkeyClient = typeof options.createTurnkeyClient === 'function'
            ? options.createTurnkeyClient
            : null;
        this.resolveSubOrganizationId = typeof options.resolveSubOrganizationId === 'function'
            ? options.resolveSubOrganizationId
            : (userId) => (userId ? `suborg:${String(userId)}` : null);

        this.logger = createLogger('turnkey-signer');
    }

    /**
     * Sign a serialized Solana transaction through Turnkey MPC.
     * @param {Object} params
     * @param {string} params.unsignedTransactionBase64 - Unsigned serialized tx (base64).
     * @param {string} params.keyRef - `turnkey:<organizationId>:<privateKeyId>[:<subOrganizationId>]`.
     * @param {Object<string, any>} [params.context]
     * @returns {Promise<{provider: string, keyRef: string, signedTransactionBase64: string, metadata: Object<string, any>}>}
     */
    async signSerializedTransaction(params = {}) {
        const unsignedTransactionBase64 = requireString(
            params.unsignedTransactionBase64,
            'unsignedTransactionBase64',
            'INVALID_UNSIGNED_TRANSACTION'
        );
        const keyRef = requireString(params.keyRef, 'keyRef', 'INVALID_KEY_REFERENCE');
        const context = params.context && typeof params.context === 'object' ? params.context : {};

        const keyInfo = parseTurnkeyKeyRef(keyRef);
        const resolvedSubOrg = context.userId ? this.resolveSubOrganizationId(String(context.userId)) : null;
        if (keyInfo.subOrganizationId && resolvedSubOrg && keyInfo.subOrganizationId !== resolvedSubOrg) {
            const err = new Error('Key reference sub-organization does not match user context.');
            err.code = 'TURNKEY_SUBORG_MISMATCH';
            throw err;
        }

        const request = {
            organizationId: keyInfo.organizationId || this.organizationId,
            privateKeyId: keyInfo.privateKeyId,
            subOrganizationId: keyInfo.subOrganizationId || resolvedSubOrg || null,
            unsignedTransaction: unsignedTransactionBase64,
            encoding: 'ENCODING_BASE64',
            curve: 'CURVE_ED25519',
            type: 'ACTIVITY_TYPE_SIGN_TRANSACTION_V2',
            timestampMs: Date.now().toString(),
        };

        if (!request.organizationId) {
            const err = new Error('Missing Turnkey organizationId for signing.');
            err.code = 'TURNKEY_ORGANIZATION_ID_REQUIRED';
            throw err;
        }

        const response = await this._invokeSigning(request);
        const signedTransactionBase64 = extractSignedTransactionBase64(response);
        if (!signedTransactionBase64) {
            const err = new Error('Turnkey signing response did not include signed transaction payload.');
            err.code = 'TURNKEY_SIGNING_RESPONSE_INVALID';
            throw err;
        }

        this.logger.info('Transaction signed via Turnkey', {
            organizationId: request.organizationId,
            privateKeyId: request.privateKeyId,
            subOrganizationId: request.subOrganizationId,
            requestId: extractRequestId(response),
            activityId: extractActivityId(response),
        });

        return {
            provider: PROVIDER_NAME,
            keyRef,
            signedTransactionBase64,
            metadata: {
                organizationId: request.organizationId,
                privateKeyId: request.privateKeyId,
                subOrganizationId: request.subOrganizationId,
                requestId: extractRequestId(response),
                activityId: extractActivityId(response),
            },
        };
    }

    /**
     * Rotate an existing Turnkey key reference and return the new reference.
     * @param {Object} params
     * @param {string} params.keyRef
     * @param {string} [params.reason]
     * @returns {Promise<{provider: string, previousKeyRef: string, keyRef: string, metadata: Object<string, any>}>}
     */
    async rotateKey(params = {}) {
        const keyRef = requireString(params.keyRef, 'keyRef', 'INVALID_KEY_REFERENCE');
        const reason = normalizeString(params.reason) || 'scheduled_rotation';
        const keyInfo = parseTurnkeyKeyRef(keyRef);

        const request = {
            organizationId: keyInfo.organizationId || this.organizationId,
            privateKeyId: keyInfo.privateKeyId,
            subOrganizationId: keyInfo.subOrganizationId || null,
            reason,
        };

        if (!request.organizationId) {
            const err = new Error('Missing Turnkey organizationId for key rotation.');
            err.code = 'TURNKEY_ORGANIZATION_ID_REQUIRED';
            throw err;
        }

        const response = await this._invokeRotation(request);
        const nextPrivateKeyId = extractPrivateKeyId(response);
        if (!nextPrivateKeyId) {
            const err = new Error('Turnkey rotation response did not include next privateKeyId.');
            err.code = 'TURNKEY_ROTATION_RESPONSE_INVALID';
            throw err;
        }

        const nextKeyRef = formatTurnkeyKeyRef({
            organizationId: request.organizationId,
            privateKeyId: nextPrivateKeyId,
            subOrganizationId: request.subOrganizationId || undefined,
        });

        this.logger.info('Turnkey key rotated', {
            organizationId: request.organizationId,
            previousPrivateKeyId: request.privateKeyId,
            nextPrivateKeyId,
            reason,
            requestId: extractRequestId(response),
            activityId: extractActivityId(response),
        });

        return {
            provider: PROVIDER_NAME,
            previousKeyRef: keyRef,
            keyRef: nextKeyRef,
            metadata: {
                reason,
                organizationId: request.organizationId,
                previousPrivateKeyId: request.privateKeyId,
                nextPrivateKeyId,
                requestId: extractRequestId(response),
                activityId: extractActivityId(response),
            },
        };
    }

    async _invokeSigning(request) {
        const client = await this._getClient();

        if (typeof client.signTransaction === 'function') {
            return client.signTransaction(request);
        }
        if (typeof client.signSerializedTransaction === 'function') {
            return client.signSerializedTransaction(request);
        }
        if (typeof client.signRawPayload === 'function') {
            return client.signRawPayload(request);
        }

        const apiClient = typeof client.apiClient === 'function' ? client.apiClient() : client.apiClient;
        if (apiClient && typeof apiClient.signTransaction === 'function') {
            return apiClient.signTransaction(request);
        }
        if (apiClient && typeof apiClient.signRawPayload === 'function') {
            return apiClient.signRawPayload(request);
        }

        const err = new Error('Unsupported Turnkey client shape. Provide signTransaction/signRawPayload.');
        err.code = 'TURNKEY_CLIENT_UNSUPPORTED';
        throw err;
    }

    async _invokeRotation(request) {
        const client = await this._getClient();

        if (typeof client.rotatePrivateKey === 'function') {
            return client.rotatePrivateKey(request);
        }
        if (typeof client.rotateKey === 'function') {
            return client.rotateKey(request);
        }

        const apiClient = typeof client.apiClient === 'function' ? client.apiClient() : client.apiClient;
        if (apiClient && typeof apiClient.rotatePrivateKey === 'function') {
            return apiClient.rotatePrivateKey(request);
        }
        if (apiClient && typeof apiClient.rotateKey === 'function') {
            return apiClient.rotateKey(request);
        }

        const err = new Error('Unsupported Turnkey client shape. Provide rotatePrivateKey/rotateKey.');
        err.code = 'TURNKEY_CLIENT_UNSUPPORTED';
        throw err;
    }

    async _getClient() {
        if (this.turnkeyClient) return this.turnkeyClient;

        if (this.createTurnkeyClient) {
            this.turnkeyClient = await this.createTurnkeyClient({
                apiPublicKey: this.apiPublicKey,
                apiPrivateKey: this.apiPrivateKey,
                apiBaseUrl: this.apiBaseUrl,
            });
        } else {
            this.turnkeyClient = createDefaultTurnkeyClient({
                apiPublicKey: this.apiPublicKey,
                apiPrivateKey: this.apiPrivateKey,
                apiBaseUrl: this.apiBaseUrl,
            });
        }

        if (!this.turnkeyClient) {
            const err = new Error('Turnkey client not configured. Install @turnkey/sdk-server or inject turnkeyClient.');
            err.code = 'TURNKEY_CLIENT_NOT_CONFIGURED';
            throw err;
        }

        return this.turnkeyClient;
    }
}

/**
 * Parse `turnkey:<organizationId>:<privateKeyId>[:<subOrganizationId>]`.
 * @param {string} keyRef
 * @returns {{provider: string, organizationId: string, privateKeyId: string, subOrganizationId: string|null}}
 */
function parseTurnkeyKeyRef(keyRef) {
    const value = requireString(keyRef, 'keyRef', 'INVALID_KEY_REFERENCE');
    const parts = value.split(':');

    if (parts.length < 3 || parts[0] !== KEY_REF_PREFIX) {
        const err = new Error('Invalid keyRef format. Expected turnkey:<organizationId>:<privateKeyId>[:<subOrganizationId>].');
        err.code = 'INVALID_KEY_REFERENCE';
        throw err;
    }

    const organizationId = normalizeString(parts[1]);
    const privateKeyId = normalizeString(parts[2]);
    const subOrganizationId = normalizeString(parts[3]) || null;

    if (!organizationId || !privateKeyId) {
        const err = new Error('Invalid keyRef format. Expected turnkey:<organizationId>:<privateKeyId>[:<subOrganizationId>].');
        err.code = 'INVALID_KEY_REFERENCE';
        throw err;
    }

    return {
        provider: parts[0],
        organizationId,
        privateKeyId,
        subOrganizationId,
    };
}

/**
 * Build a Turnkey key reference.
 * @param {{organizationId: string, privateKeyId: string, subOrganizationId?: string}} params
 * @returns {string}
 */
function formatTurnkeyKeyRef(params) {
    const organizationId = requireString(params.organizationId, 'organizationId', 'INVALID_KEY_REFERENCE');
    const privateKeyId = requireString(params.privateKeyId, 'privateKeyId', 'INVALID_KEY_REFERENCE');
    const subOrganizationId = normalizeString(params.subOrganizationId);

    return subOrganizationId
        ? `${KEY_REF_PREFIX}:${organizationId}:${privateKeyId}:${subOrganizationId}`
        : `${KEY_REF_PREFIX}:${organizationId}:${privateKeyId}`;
}

function createDefaultTurnkeyClient({ apiPublicKey, apiPrivateKey, apiBaseUrl }) {
    try {
        const sdk = require('@turnkey/sdk-server');
        const Turnkey = sdk.Turnkey || (sdk.default && sdk.default.Turnkey);
        if (!Turnkey) return null;
        return new Turnkey({ apiPublicKey, apiPrivateKey, apiBaseUrl });
    } catch (err) {
        return null;
    }
}

function extractSignedTransactionBase64(response) {
    return firstString([
        response && response.signedTransactionBase64,
        response && response.signedTransaction,
        response && response.result && response.result.signedTransactionBase64,
        response && response.result && response.result.signedTransaction,
        response && response.activity && response.activity.result && response.activity.result.signedTransactionBase64,
        response && response.activity && response.activity.result && response.activity.result.signedTransaction,
    ]);
}

function extractPrivateKeyId(response) {
    return firstString([
        response && response.privateKeyId,
        response && response.nextPrivateKeyId,
        response && response.result && response.result.privateKeyId,
        response && response.result && response.result.nextPrivateKeyId,
        response && response.activity && response.activity.result && response.activity.result.privateKeyId,
        response && response.activity && response.activity.result && response.activity.result.nextPrivateKeyId,
    ]);
}

function extractRequestId(response) {
    return firstString([
        response && response.requestId,
        response && response.activity && response.activity.requestId,
        response && response.id,
    ]);
}

function extractActivityId(response) {
    return firstString([
        response && response.activityId,
        response && response.activity && response.activity.id,
    ]);
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

function requireString(value, fieldName, code) {
    const normalized = normalizeString(value);
    if (!normalized) {
        const err = new Error(`${fieldName} is required.`);
        err.code = code || 'VALIDATION_ERROR';
        throw err;
    }
    return normalized;
}

module.exports = TurnkeySigner;
module.exports.PROVIDER_NAME = PROVIDER_NAME;
module.exports.parseTurnkeyKeyRef = parseTurnkeyKeyRef;
module.exports.formatTurnkeyKeyRef = formatTurnkeyKeyRef;