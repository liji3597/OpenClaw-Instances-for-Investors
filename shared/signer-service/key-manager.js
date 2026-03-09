'use strict';

const crypto = require('crypto');
const { createLogger } = require('../logger');

/**
 * In-memory key reference manager.
 * Stores only key references and metadata, never plaintext private key material.
 */
class KeyManager {
    /**
     * @param {Object} [options]
     * @param {() => Date} [options.clock]
     * @param {(provider: string) => Object|null} [options.resolveSigner]
     */
    constructor(options = {}) {
        this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
        this.resolveSigner = typeof options.resolveSigner === 'function' ? options.resolveSigner : null;
        this.registry = new Map();
        this.logger = createLogger('signer-key-manager');
    }

    /**
     * Register a key reference.
     * @param {Object} params
     * @param {string} params.userId
     * @param {string} [params.provider]
     * @param {string} params.keyRef
     * @param {boolean} [params.isActive]
     * @param {Object<string, any>} [params.metadata]
     * @returns {Object}
     */
    registerKeyReference(params = {}) {
        const userId = requireString(params.userId, 'userId', 'INVALID_USER_ID');
        const provider = normalizeProvider(params.provider);
        const keyRef = requireString(params.keyRef, 'keyRef', 'INVALID_KEY_REFERENCE');
        assertNoSecretMaterial(keyRef);

        const bucketKey = toBucketKey(userId, provider);
        const bucket = this.registry.get(bucketKey) || [];

        if (params.isActive !== false) {
            for (const item of bucket) {
                if (item.isActive) {
                    item.isActive = false;
                    item.status = 'rotated';
                    item.rotatedAt = this.clock().toISOString();
                }
            }
        }

        const nowIso = this.clock().toISOString();
        const entry = {
            id: crypto.randomUUID(),
            userId,
            provider,
            keyRef,
            isActive: params.isActive !== false,
            status: params.isActive === false ? 'inactive' : 'active',
            createdAt: nowIso,
            rotatedAt: null,
            metadata: params.metadata && typeof params.metadata === 'object' ? params.metadata : {},
        };

        bucket.push(entry);
        this.registry.set(bucketKey, bucket);

        this.logger.info('Key reference registered', {
            userId,
            provider,
            keyRef,
            isActive: entry.isActive,
        });

        return { ...entry };
    }

    /**
     * Get active key reference for user/provider.
     * @param {Object} params
     * @param {string} params.userId
     * @param {string} [params.provider]
     * @returns {Object|null}
     */
    getActiveKeyReference(params = {}) {
        const userId = requireString(params.userId, 'userId', 'INVALID_USER_ID');
        const provider = normalizeProvider(params.provider);
        const bucketKey = toBucketKey(userId, provider);
        const bucket = this.registry.get(bucketKey) || [];

        for (let i = bucket.length - 1; i >= 0; i -= 1) {
            if (bucket[i].isActive) {
                return { ...bucket[i] };
            }
        }

        return null;
    }

    /**
     * Rotate the active key reference by invoking signer.rotateKey().
     * @param {Object} params
     * @param {string} params.userId
     * @param {string} [params.provider]
     * @param {string} [params.reason]
     * @param {Object} [params.signer]
     * @param {Object<string, any>} [params.context]
     * @returns {Promise<{previous: Object, current: Object}>}
     */
    async rotateKey(params = {}) {
        const userId = requireString(params.userId, 'userId', 'INVALID_USER_ID');
        const provider = normalizeProvider(params.provider);
        const reason = normalizeString(params.reason) || 'scheduled_rotation';
        const signer = params.signer || (this.resolveSigner ? this.resolveSigner(provider) : null);

        if (!signer || typeof signer.rotateKey !== 'function') {
            const err = new Error(`No signer available for provider "${provider}".`);
            err.code = 'SIGNER_NOT_AVAILABLE';
            throw err;
        }

        const active = this.getActiveKeyReference({ userId, provider });
        if (!active) {
            const err = new Error(`No active key reference for user "${userId}" and provider "${provider}".`);
            err.code = 'KEY_REFERENCE_NOT_FOUND';
            throw err;
        }

        const rotationResult = await signer.rotateKey({
            keyRef: active.keyRef,
            reason,
            context: {
                ...(params.context || {}),
                userId,
                provider,
            },
        });

        const nextKeyRef = requireString(
            rotationResult && rotationResult.keyRef,
            'rotationResult.keyRef',
            'ROTATION_RESULT_INVALID'
        );

        const bucketKey = toBucketKey(userId, provider);
        const bucket = this.registry.get(bucketKey) || [];
        const nowIso = this.clock().toISOString();

        for (const item of bucket) {
            if (item.id === active.id) {
                item.isActive = false;
                item.status = 'rotated';
                item.rotatedAt = nowIso;
            }
        }

        const current = this.registerKeyReference({
            userId,
            provider,
            keyRef: nextKeyRef,
            isActive: true,
            metadata: {
                previousKeyRef: active.keyRef,
                reason,
                rotationMetadata: rotationResult && rotationResult.metadata ? rotationResult.metadata : {},
            },
        });

        this.logger.info('Key reference rotated', {
            userId,
            provider,
            previousKeyRef: active.keyRef,
            nextKeyRef,
            reason,
        });

        return {
            previous: active,
            current,
        };
    }
}

function toBucketKey(userId, provider) {
    return `${userId}::${provider}`;
}

function normalizeProvider(provider) {
    return normalizeString(provider) || 'turnkey';
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

function assertNoSecretMaterial(keyRef) {
    const blockedPatterns = [
        /-----BEGIN/i,
        /PRIVATE KEY/i,
        /\bmnemonic\b/i,
        /\bseed phrase\b/i,
    ];

    for (const pattern of blockedPatterns) {
        if (pattern.test(keyRef)) {
            const err = new Error('Detected potential private key material. Store key references only.');
            err.code = 'PRIVATE_KEY_STORAGE_FORBIDDEN';
            throw err;
        }
    }
}

module.exports = KeyManager;