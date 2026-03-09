'use strict';

const { createLogger } = require('../logger');

const DEFAULT_TTL_MS = 20_000;

/**
 * In-memory route/quote cache with TTL.
 */
class RouteCache {
    /**
     * @param {Object} [options]
     * @param {number} [options.ttlMs] - Default TTL (milliseconds), default 20s.
     * @param {() => number} [options.now] - Clock for tests.
     */
    constructor(options = {}) {
        this.ttlMs = Number.isInteger(Number(options.ttlMs)) && Number(options.ttlMs) > 0
            ? Number(options.ttlMs)
            : DEFAULT_TTL_MS;
        this.now = typeof options.now === 'function' ? options.now : () => Date.now();
        this.items = new Map();
        this.logger = createLogger('jupiter-route-cache');
    }

    /**
     * Build deterministic cache key for Jupiter quote params.
     * @param {Object} params
     * @returns {string}
     */
    buildQuoteKey(params = {}) {
        return [
            String(params.inputMint || ''),
            String(params.outputMint || ''),
            String(params.amountAtomic || ''),
            String(params.slippageBps || ''),
            String(params.swapMode || 'ExactIn'),
            String(Boolean(params.onlyDirectRoutes)),
            String(params.restrictIntermediateTokens !== false),
        ].join('|');
    }

    /**
     * Read value if not expired.
     * @param {string} key
     * @returns {any|null}
     */
    get(key) {
        const item = this.items.get(key);
        if (!item) return null;

        if (item.expiresAt <= this.now()) {
            this.items.delete(key);
            return null;
        }

        return item.value;
    }

    /**
     * Upsert cache value.
     * @param {string} key
     * @param {any} value
     * @param {number} [ttlMs]
     * @returns {void}
     */
    set(key, value, ttlMs) {
        const effectiveTtl = Number.isInteger(Number(ttlMs)) && Number(ttlMs) > 0
            ? Number(ttlMs)
            : this.ttlMs;
        const expiresAt = this.now() + effectiveTtl;
        this.items.set(key, { value, expiresAt });

        this.logger.debug('Route cache set', { key, ttlMs: effectiveTtl });
    }

    /**
     * Delete one key.
     * @param {string} key
     * @returns {boolean}
     */
    delete(key) {
        return this.items.delete(key);
    }

    /**
     * Remove all keys.
     * @returns {void}
     */
    clear() {
        this.items.clear();
    }

    /**
     * Remove expired entries.
     * @returns {number} Number of deleted entries.
     */
    sweepExpired() {
        const now = this.now();
        let removed = 0;

        for (const [key, item] of this.items.entries()) {
            if (item.expiresAt <= now) {
                this.items.delete(key);
                removed += 1;
            }
        }

        if (removed > 0) {
            this.logger.debug('Route cache sweep completed', { removed });
        }

        return removed;
    }
}

module.exports = RouteCache;
module.exports.DEFAULT_TTL_MS = DEFAULT_TTL_MS;