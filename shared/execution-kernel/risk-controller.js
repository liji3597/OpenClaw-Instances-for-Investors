'use strict';

const crypto = require('crypto');
const { createLogger } = require('../logger');
const { ORDER_STATES } = require('./types');

const DEFAULT_LIMITS = Object.freeze({
    perTxUsdCap: 100,
    dailyUsdCap: 500,
    maxSlippageBps: 300,
});

const RULE_CODES = Object.freeze({
    IDEMPOTENCY_KEY_MISSING: 'IDEMPOTENCY_KEY_MISSING',
    IDEMPOTENCY_KEY_INVALID: 'IDEMPOTENCY_KEY_INVALID',
    IDEMPOTENCY_KEY_CONFLICT: 'IDEMPOTENCY_KEY_CONFLICT',
    PER_TX_CAP_EXCEEDED: 'PER_TX_CAP_EXCEEDED',
    DAILY_LIMIT_EXCEEDED: 'DAILY_LIMIT_EXCEEDED',
    SLIPPAGE_CIRCUIT_BREAKER: 'SLIPPAGE_CIRCUIT_BREAKER',
});

const DAILY_NOTIONAL_STATES = Object.freeze([
    ORDER_STATES.CREATED,
    ORDER_STATES.RISK_CHECK,
    ORDER_STATES.SIGNING,
    ORDER_STATES.BROADCAST,
    ORDER_STATES.CONFIRMED,
]);

class RiskController {
    constructor(options = {}) {
        if (!options.orderStore) {
            throw new Error('RiskController requires orderStore.');
        }

        this.orderStore = options.orderStore;
        this.auditLogger = options.auditLogger || null;
        this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
        this.limits = {
            ...DEFAULT_LIMITS,
            ...(options.limits || {}),
        };
        this.logger = createLogger('execution-risk-controller');
    }

    evaluateOrder(intent, options = {}) {
        const persistViolations = options.persistViolations !== false;
        const normalized = this._normalizeIntent(intent);
        const violations = [];

        const idemCheck = this.validateIdempotency(normalized);
        if (idemCheck.violation) {
            violations.push(idemCheck.violation);
        }

        if (idemCheck.replay && !idemCheck.violation) {
            return {
                allowed: true,
                idempotentReplay: true,
                violations: [],
                dailyUsedUsd: this.orderStore.getUserDailyNotionalUsd(
                    normalized.userId,
                    normalized.referenceDate,
                    DAILY_NOTIONAL_STATES
                ),
                projectedDailyUsd: this.orderStore.getUserDailyNotionalUsd(
                    normalized.userId,
                    normalized.referenceDate,
                    DAILY_NOTIONAL_STATES
                ),
                limits: { ...this.limits },
                idempotencyFingerprint: normalized.idempotencyFingerprint,
                existingOrder: idemCheck.existingOrder || null,
            };
        }

        if (normalized.usdNotional > this.limits.perTxUsdCap) {
            violations.push(this._violation(
                RULE_CODES.PER_TX_CAP_EXCEEDED,
                `Per-transaction cap exceeded: ${normalized.usdNotional} > ${this.limits.perTxUsdCap}`,
                'HIGH',
                {
                    capUsd: this.limits.perTxUsdCap,
                    requestedUsd: normalized.usdNotional,
                }
            ));
        }

        const dailyUsedUsd = this.orderStore.getUserDailyNotionalUsd(
            normalized.userId,
            normalized.referenceDate,
            DAILY_NOTIONAL_STATES
        );
        const projectedDailyUsd = dailyUsedUsd + normalized.usdNotional;

        if (projectedDailyUsd > this.limits.dailyUsdCap) {
            violations.push(this._violation(
                RULE_CODES.DAILY_LIMIT_EXCEEDED,
                `Daily cap exceeded: ${projectedDailyUsd} > ${this.limits.dailyUsdCap}`,
                'HIGH',
                {
                    capUsd: this.limits.dailyUsdCap,
                    alreadyUsedUsd: dailyUsedUsd,
                    requestedUsd: normalized.usdNotional,
                    projectedUsd: projectedDailyUsd,
                }
            ));
        }

        if (normalized.maxSlippageBps > this.limits.maxSlippageBps) {
            violations.push(this._violation(
                RULE_CODES.SLIPPAGE_CIRCUIT_BREAKER,
                `Slippage breaker triggered: ${normalized.maxSlippageBps} bps > ${this.limits.maxSlippageBps} bps`,
                'HIGH',
                {
                    capBps: this.limits.maxSlippageBps,
                    requestedBps: normalized.maxSlippageBps,
                }
            ));
        }

        if (violations.length > 0 && persistViolations) {
            this._persistViolations({
                orderId: normalized.orderId || idemCheck.existingOrder?.id || null,
                userId: normalized.userId,
                idempotencyKey: normalized.idempotencyKey,
                violations,
            });
        }

        const result = {
            allowed: violations.length === 0,
            idempotentReplay: false,
            violations,
            dailyUsedUsd,
            projectedDailyUsd,
            limits: { ...this.limits },
            idempotencyFingerprint: normalized.idempotencyFingerprint,
            existingOrder: idemCheck.existingOrder || null,
        };

        this._appendAudit('RISK_EVALUATED', result, {
            userId: normalized.userId,
            orderId: normalized.orderId || idemCheck.existingOrder?.id || null,
            idempotencyKey: normalized.idempotencyKey,
            severity: result.allowed ? 'INFO' : 'WARN',
        });

        return result;
    }

    assertOrderAllowed(intent, options = {}) {
        const result = this.evaluateOrder(intent, options);
        if (!result.allowed) {
            const err = new Error('Order blocked by risk policy.');
            err.code = 'RISK_LIMIT_BLOCKED';
            err.violations = result.violations;
            throw err;
        }
        return result;
    }

    validateIdempotency(intent) {
        if (!intent.idempotencyKey) {
            return {
                replay: false,
                existingOrder: null,
                violation: this._violation(
                    RULE_CODES.IDEMPOTENCY_KEY_MISSING,
                    'Idempotency key is required for live execution.',
                    'HIGH',
                    {}
                ),
            };
        }

        if (!/^[A-Za-z0-9:_\-]{8,128}$/.test(intent.idempotencyKey)) {
            return {
                replay: false,
                existingOrder: null,
                violation: this._violation(
                    RULE_CODES.IDEMPOTENCY_KEY_INVALID,
                    'Idempotency key format is invalid. Use 8-128 chars [A-Za-z0-9:_-].',
                    'HIGH',
                    { idempotencyKey: intent.idempotencyKey }
                ),
            };
        }

        const existing = this.orderStore.getOrderByIdempotencyKey(intent.idempotencyKey);
        if (!existing) {
            return { replay: false, existingOrder: null, violation: null };
        }

        if (existing.userId !== intent.userId) {
            return {
                replay: false,
                existingOrder: existing,
                violation: this._violation(
                    RULE_CODES.IDEMPOTENCY_KEY_CONFLICT,
                    'Idempotency key already used by another user.',
                    'HIGH',
                    {
                        existingOrderId: existing.id,
                        existingUserId: existing.userId,
                    }
                ),
            };
        }

        const existingFingerprint = existing.metadata?.idempotencyFingerprint
            || this._fingerprint(this._intentShapeFromOrder(existing));

        if (existingFingerprint !== intent.idempotencyFingerprint) {
            return {
                replay: false,
                existingOrder: existing,
                violation: this._violation(
                    RULE_CODES.IDEMPOTENCY_KEY_CONFLICT,
                    'Idempotency key already used by a different order payload.',
                    'HIGH',
                    {
                        existingOrderId: existing.id,
                        existingFingerprint,
                        incomingFingerprint: intent.idempotencyFingerprint,
                    }
                ),
            };
        }

        return {
            replay: true,
            existingOrder: existing,
            violation: null,
        };
    }

    _normalizeIntent(intent) {
        if (!intent || typeof intent !== 'object') {
            throw new Error('RiskController expects an intent object.');
        }

        const userId = String(intent.userId || '').trim();
        if (!userId) throw new Error('intent.userId is required');

        const usdNotional = Number(intent.usdNotional);
        if (!Number.isFinite(usdNotional) || usdNotional <= 0) {
            throw new Error('intent.usdNotional must be a positive number');
        }

        const maxSlippageBps = Number(intent.maxSlippageBps);
        if (!Number.isFinite(maxSlippageBps) || maxSlippageBps < 0) {
            throw new Error('intent.maxSlippageBps must be a non-negative number');
        }

        const referenceDate = intent.referenceDate instanceof Date
            ? intent.referenceDate
            : new Date(intent.referenceDate || this.clock());
        if (Number.isNaN(referenceDate.getTime())) {
            throw new Error('intent.referenceDate must be a valid date when provided');
        }

        const normalized = {
            userId,
            orderId: intent.orderId ? String(intent.orderId) : null,
            idempotencyKey: intent.idempotencyKey ? String(intent.idempotencyKey) : '',
            inputMint: String(intent.inputMint || ''),
            outputMint: String(intent.outputMint || ''),
            inputAmountAtomic: String(intent.inputAmountAtomic || ''),
            usdNotional,
            maxSlippageBps,
            clientOrderId: intent.clientOrderId ? String(intent.clientOrderId) : null,
            referenceDate,
            metadata: intent.metadata && typeof intent.metadata === 'object' ? intent.metadata : {},
        };

        normalized.idempotencyFingerprint = this._fingerprint({
            userId: normalized.userId,
            clientOrderId: normalized.clientOrderId,
            inputMint: normalized.inputMint,
            outputMint: normalized.outputMint,
            inputAmountAtomic: normalized.inputAmountAtomic,
            usdNotional: normalized.usdNotional,
            maxSlippageBps: normalized.maxSlippageBps,
        });

        return normalized;
    }

    _intentShapeFromOrder(order) {
        return {
            userId: order.userId,
            clientOrderId: order.clientOrderId || null,
            inputMint: order.inputMint,
            outputMint: order.outputMint,
            inputAmountAtomic: String(order.inputAmountAtomic),
            usdNotional: Number(order.usdNotional),
            maxSlippageBps: Number(order.maxSlippageBps),
        };
    }

    _fingerprint(shape) {
        return crypto
            .createHash('sha256')
            .update(stableStringify(shape))
            .digest('hex');
    }

    _violation(ruleCode, message, severity, metadata) {
        return {
            ruleCode,
            message,
            severity,
            metadata: metadata || {},
        };
    }

    _persistViolations(payload) {
        try {
            this.orderStore.recordRiskViolations({
                orderId: payload.orderId,
                userId: payload.userId,
                idempotencyKey: payload.idempotencyKey,
                violations: payload.violations,
            });
        } catch (err) {
            this.logger.error('Failed to persist risk violations', {
                reason: err.message,
                orderId: payload.orderId,
                userId: payload.userId,
            });
        }
    }

    _appendAudit(eventType, payload, context) {
        if (!this.auditLogger || typeof this.auditLogger.append !== 'function') return;
        try {
            this.auditLogger.append(eventType, payload, context);
        } catch (err) {
            this.logger.warn('Failed to append risk audit event', {
                eventType,
                reason: err.message,
            });
        }
    }
}

function stableStringify(value) {
    return JSON.stringify(normalizeForStable(value));
}

function normalizeForStable(value) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeForStable(item));
    }
    if (value && typeof value === 'object') {
        const out = {};
        const keys = Object.keys(value).sort();
        for (const key of keys) {
            out[key] = normalizeForStable(value[key]);
        }
        return out;
    }
    return value;
}

module.exports = RiskController;
module.exports.DEFAULT_LIMITS = DEFAULT_LIMITS;
module.exports.RULE_CODES = RULE_CODES;
