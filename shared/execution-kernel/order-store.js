'use strict';

const crypto = require('crypto');
const { createLogger } = require('../logger');
const {
    ORDER_STATES,
    NON_TERMINAL_ORDER_STATES,
    VALID_STATE_TRANSITIONS,
    STATE_TIMEOUTS_MS,
} = require('./types');

const DEFAULT_DAILY_NOTIONAL_STATES = Object.freeze([
    ORDER_STATES.CREATED,
    ORDER_STATES.RISK_CHECK,
    ORDER_STATES.REVIEW_PENDING,
    ORDER_STATES.SIGNING,
    ORDER_STATES.BROADCAST,
    ORDER_STATES.CONFIRMED,
]);

class OrderStore {
    constructor(options = {}) {
        const db = options.db || require('../database').getDb();
        if (!db) {
            throw new Error('OrderStore requires an initialized database instance.');
        }

        this.db = db;
        this.now = typeof options.now === 'function' ? options.now : () => new Date();
        this.idFactory = typeof options.idFactory === 'function'
            ? options.idFactory
            : () => crypto.randomUUID();
        this.stateTimeoutsMs = {
            ...STATE_TIMEOUTS_MS,
            ...(options.stateTimeoutsMs || {}),
        };
        this.logger = createLogger('execution-order-store');
    }

    initSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                client_order_id TEXT,
                idempotency_key TEXT NOT NULL UNIQUE,
                input_mint TEXT NOT NULL,
                output_mint TEXT NOT NULL,
                input_amount_atomic TEXT NOT NULL,
                expected_output_atomic TEXT,
                quote_id TEXT,
                max_slippage_bps INTEGER NOT NULL,
                usd_notional REAL NOT NULL,
                requires_user_confirmation INTEGER NOT NULL DEFAULT 0 CHECK (requires_user_confirmation IN (0, 1)),
                user_confirmed_at TEXT,
                signer_provider TEXT,
                signed_payload_ref TEXT,
                tx_signature TEXT,
                state TEXT NOT NULL CHECK (state IN ('CREATED', 'RISK_CHECK', 'REVIEW_PENDING', 'SIGNING', 'BROADCAST', 'CONFIRMED', 'FAILED')),
                state_entered_at TEXT NOT NULL,
                deadline_at TEXT,
                error_code TEXT,
                error_message TEXT,
                metadata TEXT NOT NULL DEFAULT '{}',
                version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, client_order_id)
            );

            CREATE TABLE IF NOT EXISTS order_transitions (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                from_state TEXT,
                to_state TEXT NOT NULL,
                reason TEXT,
                idempotency_key TEXT NOT NULL,
                actor TEXT,
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                UNIQUE(order_id, idempotency_key)
            );

            CREATE TABLE IF NOT EXISTS risk_violations (
                id TEXT PRIMARY KEY,
                order_id TEXT,
                user_id TEXT NOT NULL,
                rule_code TEXT NOT NULL,
                message TEXT NOT NULL,
                severity TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT '{}',
                idempotency_key TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_orders_user_created_at ON orders(user_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_orders_state_deadline ON orders(state, deadline_at);
            CREATE INDEX IF NOT EXISTS idx_order_transitions_order_created_at ON order_transitions(order_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_risk_violations_order_created_at ON risk_violations(order_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_risk_violations_user_created_at ON risk_violations(user_id, created_at);
        `);
    }

    createOrder(input) {
        this._assertRequiredString(input?.userId, 'userId');
        this._assertRequiredString(input?.idempotencyKey, 'idempotencyKey');
        this._assertRequiredString(input?.inputMint, 'inputMint');
        this._assertRequiredString(input?.outputMint, 'outputMint');
        this._assertRequiredValue(input?.inputAmountAtomic, 'inputAmountAtomic');
        this._assertFiniteNumber(input?.usdNotional, 'usdNotional');

        const nowIso = this._nowIso();
        const orderId = input.id || this.idFactory();
        const deadlineAt = input.deadlineAt === undefined
            ? this._computeStateDeadlineIso(ORDER_STATES.CREATED, nowIso)
            : this._normalizeNullableIso(input.deadlineAt);
        const maxSlippageBps = Number.isFinite(Number(input.maxSlippageBps))
            ? Number(input.maxSlippageBps)
            : 50;

        return this._runInTransaction(() => {
            const existing = this.getOrderByIdempotencyKey(input.idempotencyKey);
            if (existing) {
                return { order: existing, created: false, idempotent: true };
            }

            const row = {
                id: orderId,
                user_id: String(input.userId),
                client_order_id: this._normalizeNullableString(input.clientOrderId),
                idempotency_key: String(input.idempotencyKey),
                input_mint: String(input.inputMint),
                output_mint: String(input.outputMint),
                input_amount_atomic: String(input.inputAmountAtomic),
                expected_output_atomic: this._normalizeNullableString(input.expectedOutputAtomic),
                quote_id: this._normalizeNullableString(input.quoteId),
                max_slippage_bps: maxSlippageBps,
                usd_notional: Number(input.usdNotional),
                requires_user_confirmation: input.requiresUserConfirmation ? 1 : 0,
                user_confirmed_at: this._normalizeNullableIso(input.userConfirmedAt),
                signer_provider: this._normalizeNullableString(input.signerProvider),
                signed_payload_ref: this._normalizeNullableString(input.signedPayloadRef),
                tx_signature: this._normalizeNullableString(input.txSignature),
                state: ORDER_STATES.CREATED,
                state_entered_at: nowIso,
                deadline_at: deadlineAt,
                error_code: null,
                error_message: null,
                metadata: this._serializeJson(input.metadata || {}),
                version: 1,
                created_at: nowIso,
                updated_at: nowIso,
            };

            this.db.prepare(`
                INSERT INTO orders (
                    id, user_id, client_order_id, idempotency_key, input_mint, output_mint,
                    input_amount_atomic, expected_output_atomic, quote_id, max_slippage_bps, usd_notional,
                    requires_user_confirmation, user_confirmed_at, signer_provider, signed_payload_ref, tx_signature,
                    state, state_entered_at, deadline_at, error_code, error_message, metadata, version,
                    created_at, updated_at
                ) VALUES (
                    @id, @user_id, @client_order_id, @idempotency_key, @input_mint, @output_mint,
                    @input_amount_atomic, @expected_output_atomic, @quote_id, @max_slippage_bps, @usd_notional,
                    @requires_user_confirmation, @user_confirmed_at, @signer_provider, @signed_payload_ref, @tx_signature,
                    @state, @state_entered_at, @deadline_at, @error_code, @error_message, @metadata, @version,
                    @created_at, @updated_at
                )
            `).run(row);

            this.db.prepare(`
                INSERT INTO order_transitions (
                    id, order_id, from_state, to_state, reason, idempotency_key, actor, metadata, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                this.idFactory(),
                orderId,
                null,
                ORDER_STATES.CREATED,
                'order_created',
                `init:${input.idempotencyKey}`,
                'system',
                this._serializeJson({ source: 'createOrder' }),
                nowIso
            );

            return {
                order: this.getOrderById(orderId),
                created: true,
                idempotent: false,
            };
        });
    }

    getOrderById(orderId) {
        this._assertRequiredString(orderId, 'orderId');
        const row = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        return this._fromDbOrder(row);
    }

    getOrderByIdempotencyKey(idempotencyKey) {
        this._assertRequiredString(idempotencyKey, 'idempotencyKey');
        const row = this.db.prepare('SELECT * FROM orders WHERE idempotency_key = ?').get(idempotencyKey);
        return this._fromDbOrder(row);
    }

    listExpiredOrders(options = {}) {
        const nowIso = this._normalizeMaybeIso(options.now) || this._nowIso();
        const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 100;
        const statePlaceholders = NON_TERMINAL_ORDER_STATES.map(() => '?').join(', ');

        const rows = this.db.prepare(`
            SELECT * FROM orders
            WHERE state IN (${statePlaceholders})
              AND deadline_at IS NOT NULL
              AND deadline_at <= ?
            ORDER BY deadline_at ASC
            LIMIT ?
        `).all(...NON_TERMINAL_ORDER_STATES, nowIso, limit);

        return rows.map((row) => this._fromDbOrder(row));
    }

    getUserDailyNotionalUsd(userId, referenceDate = new Date(), states = DEFAULT_DAILY_NOTIONAL_STATES) {
        this._assertRequiredString(userId, 'userId');

        const safeStates = Array.isArray(states) && states.length > 0
            ? states
            : DEFAULT_DAILY_NOTIONAL_STATES;

        const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
        if (Number.isNaN(date.getTime())) {
            throw new Error('referenceDate must be a valid Date or ISO string');
        }

        const dayStart = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            0,
            0,
            0,
            0
        ));
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        const placeholders = safeStates.map(() => '?').join(', ');

        const row = this.db.prepare(`
            SELECT COALESCE(SUM(usd_notional), 0) AS total
            FROM orders
            WHERE user_id = ?
              AND created_at >= ?
              AND created_at < ?
              AND state IN (${placeholders})
        `).get(userId, dayStart.toISOString(), dayEnd.toISOString(), ...safeStates);

        return Number(row?.total || 0);
    }

    applyStateTransition(input) {
        this._assertRequiredString(input?.orderId, 'orderId');
        this._assertRequiredString(input?.idempotencyKey, 'idempotencyKey');

        return this._runInTransaction(() => {
            const current = this.getOrderById(input.orderId);
            if (!current) {
                const err = new Error(`Order not found: ${input.orderId}`);
                err.code = 'ORDER_NOT_FOUND';
                throw err;
            }

            const existingTransitionRow = this.db.prepare(
                'SELECT * FROM order_transitions WHERE order_id = ? AND idempotency_key = ?'
            ).get(input.orderId, input.idempotencyKey);

            if (existingTransitionRow) {
                return {
                    applied: false,
                    idempotent: true,
                    order: this.getOrderById(input.orderId),
                    transition: this._fromDbTransition(existingTransitionRow),
                };
            }

            if (current.state === input.toState) {
                return {
                    applied: false,
                    idempotent: true,
                    order: current,
                };
            }

            const allowed = VALID_STATE_TRANSITIONS[current.state] || [];
            if (!allowed.includes(input.toState)) {
                const err = new Error(`Invalid transition: ${current.state} -> ${input.toState}`);
                err.code = 'INVALID_ORDER_TRANSITION';
                err.meta = { from: current.state, to: input.toState };
                throw err;
            }

            const nowIso = this._nowIso();

            const sets = [
                'state = ?',
                'state_entered_at = ?',
                'deadline_at = ?',
                'metadata = ?',
                'updated_at = ?',
                'version = version + 1',
            ];
            const values = [
                input.toState,
                nowIso,
                input.deadlineAt === undefined ? this._computeStateDeadlineIso(input.toState, nowIso) : this._normalizeNullableIso(input.deadlineAt),
                this._serializeJson(input.metadata || {}),
                nowIso,
            ];

            if ('errorCode' in input) {
                sets.push('error_code = ?');
                values.push(this._normalizeNullableString(input.errorCode));
            }
            if ('errorMessage' in input) {
                sets.push('error_message = ?');
                values.push(this._normalizeNullableString(input.errorMessage));
            }
            if ('signerProvider' in input) {
                sets.push('signer_provider = ?');
                values.push(this._normalizeNullableString(input.signerProvider));
            }
            if ('signedPayloadRef' in input) {
                sets.push('signed_payload_ref = ?');
                values.push(this._normalizeNullableString(input.signedPayloadRef));
            }
            if ('txSignature' in input) {
                sets.push('tx_signature = ?');
                values.push(this._normalizeNullableString(input.txSignature));
            }
            if ('userConfirmedAt' in input) {
                sets.push('user_confirmed_at = ?');
                values.push(this._normalizeNullableIso(input.userConfirmedAt));
            }

            values.push(input.orderId);
            this.db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).run(...values);

            const transitionRow = {
                id: this.idFactory(),
                order_id: input.orderId,
                from_state: current.state,
                to_state: input.toState,
                reason: this._normalizeNullableString(input.reason),
                idempotency_key: input.idempotencyKey,
                actor: this._normalizeNullableString(input.actor),
                metadata: this._serializeJson(input.metadata || {}),
                created_at: nowIso,
            };

            this.db.prepare(`
                INSERT INTO order_transitions (
                    id, order_id, from_state, to_state, reason, idempotency_key, actor, metadata, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                transitionRow.id,
                transitionRow.order_id,
                transitionRow.from_state,
                transitionRow.to_state,
                transitionRow.reason,
                transitionRow.idempotency_key,
                transitionRow.actor,
                transitionRow.metadata,
                transitionRow.created_at
            );

            return {
                applied: true,
                idempotent: false,
                order: this.getOrderById(input.orderId),
                transition: this._fromDbTransition(transitionRow),
            };
        });
    }

    recordRiskViolations(input) {
        this._assertRequiredString(input?.userId, 'userId');
        if (!Array.isArray(input?.violations) || input.violations.length === 0) {
            return [];
        }

        const nowIso = this._nowIso();
        const inserted = [];

        this._runInTransaction(() => {
            for (const violation of input.violations) {
                const row = {
                    id: this.idFactory(),
                    order_id: this._normalizeNullableString(input.orderId),
                    user_id: String(input.userId),
                    rule_code: String(violation.ruleCode || 'UNKNOWN_RULE'),
                    message: String(violation.message || 'Risk rule violation'),
                    severity: String(violation.severity || 'HIGH').toUpperCase(),
                    metadata: this._serializeJson(violation.metadata || {}),
                    idempotency_key: this._normalizeNullableString(input.idempotencyKey),
                    created_at: nowIso,
                };

                this.db.prepare(`
                    INSERT INTO risk_violations (
                        id, order_id, user_id, rule_code, message, severity, metadata, idempotency_key, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    row.id,
                    row.order_id,
                    row.user_id,
                    row.rule_code,
                    row.message,
                    row.severity,
                    row.metadata,
                    row.idempotency_key,
                    row.created_at
                );

                inserted.push(this._fromDbRiskViolation(row));
            }
        });

        return inserted;
    }

    _runInTransaction(callback) {
        if (typeof this.db.transaction === 'function') {
            return this.db.transaction(callback)();
        }
        return callback();
    }

    _fromDbOrder(row) {
        if (!row) return null;
        return {
            id: row.id,
            userId: row.user_id,
            clientOrderId: row.client_order_id,
            inputMint: row.input_mint,
            outputMint: row.output_mint,
            inputAmountAtomic: row.input_amount_atomic,
            expectedOutputAtomic: row.expected_output_atomic,
            quoteId: row.quote_id,
            maxSlippageBps: Number(row.max_slippage_bps),
            usdNotional: Number(row.usd_notional),
            requiresUserConfirmation: Boolean(row.requires_user_confirmation),
            userConfirmedAt: row.user_confirmed_at,
            signerProvider: row.signer_provider,
            signedPayloadRef: row.signed_payload_ref,
            txSignature: row.tx_signature,
            state: row.state,
            stateEnteredAt: row.state_entered_at,
            deadlineAt: row.deadline_at,
            errorCode: row.error_code,
            errorMessage: row.error_message,
            metadata: this._parseJson(row.metadata),
            version: Number(row.version),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    _fromDbTransition(row) {
        if (!row) return null;
        return {
            id: row.id,
            orderId: row.order_id,
            fromState: row.from_state,
            toState: row.to_state,
            reason: row.reason,
            idempotencyKey: row.idempotency_key,
            actor: row.actor,
            metadata: this._parseJson(row.metadata),
            createdAt: row.created_at,
        };
    }

    _fromDbRiskViolation(row) {
        if (!row) return null;
        return {
            id: row.id,
            orderId: row.order_id,
            userId: row.user_id,
            ruleCode: row.rule_code,
            message: row.message,
            severity: row.severity,
            metadata: this._parseJson(row.metadata),
            idempotencyKey: row.idempotency_key || null,
            createdAt: row.created_at,
        };
    }

    listOrderTransitions(orderId, options = {}) {
        this._assertRequiredString(orderId, 'orderId');
        const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 200;
        const rows = this.db.prepare(`
            SELECT * FROM order_transitions
            WHERE order_id = ?
            ORDER BY created_at ASC, id ASC
            LIMIT ?
        `).all(orderId, limit);
        return rows.map((row) => this._fromDbTransition(row));
    }

    forceSetOrderState(input) {
        this._assertRequiredString(input?.orderId, 'orderId');
        this._assertRequiredString(input?.toState, 'toState');
        this._assertRequiredString(input?.idempotencyKey, 'idempotencyKey');

        if (!Object.values(ORDER_STATES).includes(input.toState)) {
            const err = new Error(`Invalid state: ${input.toState}`);
            err.code = 'INVALID_ORDER_STATE';
            throw err;
        }

        return this._runInTransaction(() => {
            const current = this.getOrderById(input.orderId);
            if (!current) {
                const err = new Error(`Order not found: ${input.orderId}`);
                err.code = 'ORDER_NOT_FOUND';
                throw err;
            }

            const existingTransitionRow = this.db.prepare(
                'SELECT * FROM order_transitions WHERE order_id = ? AND idempotency_key = ?'
            ).get(input.orderId, input.idempotencyKey);
            if (existingTransitionRow) {
                return {
                    applied: false,
                    idempotent: true,
                    order: this.getOrderById(input.orderId),
                    transition: this._fromDbTransition(existingTransitionRow),
                };
            }

            const nowIso = this._nowIso();

            this.db.prepare(`
                UPDATE orders SET
                    state = ?,
                    state_entered_at = ?,
                    deadline_at = ?,
                    metadata = ?,
                    updated_at = ?,
                    version = version + 1,
                    error_code = ?,
                    error_message = ?
                WHERE id = ?
            `).run(
                input.toState,
                nowIso,
                input.deadlineAt === undefined ? this._computeStateDeadlineIso(input.toState, nowIso) : this._normalizeNullableIso(input.deadlineAt),
                this._serializeJson(input.metadata || {}),
                nowIso,
                this._normalizeNullableString(input.errorCode),
                this._normalizeNullableString(input.errorMessage),
                input.orderId
            );

            const transitionRow = {
                id: this.idFactory(),
                order_id: input.orderId,
                from_state: current.state,
                to_state: input.toState,
                reason: this._normalizeNullableString(input.reason || 'rollback_force_state'),
                idempotency_key: String(input.idempotencyKey),
                actor: this._normalizeNullableString(input.actor || 'system'),
                metadata: this._serializeJson(input.transitionMetadata || {}),
                created_at: nowIso,
            };

            this.db.prepare(`
                INSERT INTO order_transitions (
                    id, order_id, from_state, to_state, reason, idempotency_key, actor, metadata, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                transitionRow.id,
                transitionRow.order_id,
                transitionRow.from_state,
                transitionRow.to_state,
                transitionRow.reason,
                transitionRow.idempotency_key,
                transitionRow.actor,
                transitionRow.metadata,
                transitionRow.created_at
            );

            return {
                applied: true,
                idempotent: false,
                order: this.getOrderById(input.orderId),
                transition: this._fromDbTransition(transitionRow),
            };
        });
    }

    _computeStateDeadlineIso(state, baseIso) {
        const timeoutMs = Number(this.stateTimeoutsMs[state] || 0);
        if (timeoutMs <= 0) return null;
        const base = baseIso ? new Date(baseIso) : this.now();
        return new Date(base.getTime() + timeoutMs).toISOString();
    }

    _nowIso() {
        const value = this.now();
        const date = value instanceof Date ? value : new Date(value);
        return date.toISOString();
    }

    _assertRequiredString(value, field) {
        if (typeof value !== 'string' || value.trim().length === 0) {
            throw new Error(`${field} is required`);
        }
    }

    _assertRequiredValue(value, field) {
        if (value === undefined || value === null || value === '') {
            throw new Error(`${field} is required`);
        }
    }

    _assertFiniteNumber(value, field) {
        if (!Number.isFinite(Number(value))) {
            throw new Error(`${field} must be a finite number`);
        }
    }

    _normalizeNullableString(value) {
        if (value === undefined || value === null || value === '') return null;
        return String(value);
    }

    _normalizeNullableIso(value) {
        if (value === undefined || value === null || value === '') return null;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new Error(`Invalid ISO timestamp: ${value}`);
        }
        return date.toISOString();
    }

    _normalizeMaybeIso(value) {
        if (value === undefined || value === null || value === '') return null;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return date.toISOString();
    }

    _serializeJson(value) {
        try {
            return JSON.stringify(value || {});
        } catch (err) {
            this.logger.warn('Failed to serialize JSON value', { reason: err.message });
            return '{}';
        }
    }

    _parseJson(value) {
        if (!value || typeof value !== 'string') return {};
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object') return parsed;
            return { value: parsed };
        } catch (err) {
            this.logger.warn('Failed to parse JSON value', { reason: err.message });
            return {};
        }
    }
}

module.exports = OrderStore;
module.exports.DEFAULT_DAILY_NOTIONAL_STATES = DEFAULT_DAILY_NOTIONAL_STATES;
