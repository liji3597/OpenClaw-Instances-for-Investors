'use strict';

const crypto = require('crypto');
const { EventEmitter } = require('events');
const { createLogger } = require('../logger');
const {
    ORDER_STATES,
    TERMINAL_ORDER_STATES,
    VALID_STATE_TRANSITIONS,
    STATE_TIMEOUTS_MS,
} = require('./types');

const EVENTS = Object.freeze({
    STATE_CHANGED: 'order.state_changed',
    TRANSITION_IDEMPOTENT: 'order.transition_idempotent',
    TRANSITION_REJECTED: 'order.transition_rejected',
    ORDER_TIMED_OUT: 'order.timed_out',
});

/**
 * @typedef {import('./types').OrderState} OrderState
 */

/**
 * Order state machine with idempotent transitions, timeout handling, and event emission.
 */
class OrderStateMachine extends EventEmitter {
    /**
     * @param {Object} options Constructor options.
     * @param {import('./order-store')} options.orderStore Order persistence adapter.
     * @param {import('./audit-logger')} [options.auditLogger] Optional immutable audit logger.
     * @param {Object<string, number>} [options.timeoutsMs] Optional state timeout overrides.
     * @param {() => Date} [options.clock] Clock factory for deterministic tests.
     * @param {() => string} [options.idFactory] Id generator.
     */
    constructor(options = {}) {
        super();

        if (!options.orderStore) {
            throw new Error('OrderStateMachine requires orderStore.');
        }

        this.orderStore = options.orderStore;
        this.auditLogger = options.auditLogger || null;
        this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
        this.idFactory = typeof options.idFactory === 'function'
            ? options.idFactory
            : () => crypto.randomUUID();
        this.timeoutsMs = {
            ...STATE_TIMEOUTS_MS,
            ...(options.timeoutsMs || {}),
        };
        this.logger = createLogger('execution-order-state-machine');
    }

    /**
     * Executes a state transition.
     * Transition requests are idempotent by `idempotencyKey`.
     *
     * @param {string} orderId Order id.
     * @param {OrderState} toState Target state.
     * @param {Object} [options] Transition options.
     * @param {string} [options.idempotencyKey] Transition idempotency key. Auto-generated when omitted.
     * @param {string} [options.reason] Transition reason.
     * @param {Object<string, any>} [options.metadata] Transition metadata.
     * @param {boolean} [options.mergeMetadata=true] Merge metadata into order metadata.
     * @param {string} [options.actor='system'] Actor identifier.
     * @param {string|Date|null} [options.deadlineAt] Explicit deadline for target state.
     * @param {string|null} [options.errorCode] Error code when transitioning to FAILED.
     * @param {string|null} [options.errorMessage] Error message.
     * @param {string|null} [options.signerProvider] Signer provider.
     * @param {string|null} [options.signedPayloadRef] Signed payload reference.
     * @param {string|null} [options.txSignature] Chain signature.
     * @param {string|null} [options.userConfirmedAt] User confirmation timestamp.
     * @returns {import('./types').StateTransitionResult & {transition?: Object<string, any>}}
     */
    transition(orderId, toState, options = {}) {
        const current = this.orderStore.getOrderById(orderId);
        if (!current) {
            const err = new Error(`Order not found: ${orderId}`);
            err.code = 'ORDER_NOT_FOUND';
            throw err;
        }

        if (!Object.values(ORDER_STATES).includes(toState)) {
            const err = new Error(`Invalid state: ${toState}`);
            err.code = 'INVALID_ORDER_STATE';
            throw err;
        }

        const idempotencyKey = options.idempotencyKey || this._defaultTransitionIdempotencyKey({
            orderId,
            fromState: current.state,
            toState,
        });

        const transitionInput = {
            orderId,
            toState,
            idempotencyKey,
            reason: options.reason || 'state_transition',
            metadata: options.metadata || {},
            mergeMetadata: options.mergeMetadata !== false,
            actor: options.actor || 'system',
            deadlineAt: options.deadlineAt === undefined
                ? this._computeStateDeadline(toState)
                : this._normalizeNullableIso(options.deadlineAt),
        };

        if ('errorCode' in options) transitionInput.errorCode = options.errorCode;
        if ('errorMessage' in options) transitionInput.errorMessage = options.errorMessage;
        if ('signerProvider' in options) transitionInput.signerProvider = options.signerProvider;
        if ('signedPayloadRef' in options) transitionInput.signedPayloadRef = options.signedPayloadRef;
        if ('txSignature' in options) transitionInput.txSignature = options.txSignature;
        if ('userConfirmedAt' in options) transitionInput.userConfirmedAt = options.userConfirmedAt;

        try {
            const result = this.orderStore.applyStateTransition(transitionInput);

            if (result.applied) {
                const payload = {
                    eventId: this.idFactory(),
                    orderId,
                    fromState: current.state,
                    toState,
                    at: this._nowIso(),
                    reason: transitionInput.reason,
                    idempotencyKey,
                    actor: transitionInput.actor,
                    deadlineAt: transitionInput.deadlineAt,
                };

                this.emit(EVENTS.STATE_CHANGED, payload);
                this.emit(`order.state.${toState}`, payload);

                this._appendAudit('ORDER_STATE_CHANGED', {
                    ...payload,
                    orderVersion: result.order?.version,
                }, {
                    orderId,
                    userId: result.order?.userId,
                    idempotencyKey,
                    severity: 'INFO',
                });
            } else if (result.idempotent) {
                this.emit(EVENTS.TRANSITION_IDEMPOTENT, {
                    orderId,
                    toState,
                    idempotencyKey,
                    at: this._nowIso(),
                });
            }

            return result;
        } catch (err) {
            this.logger.warn('Transition rejected', {
                orderId,
                fromState: current.state,
                toState,
                idempotencyKey,
                reason: err.message,
                code: err.code,
            });

            this.emit(EVENTS.TRANSITION_REJECTED, {
                orderId,
                fromState: current.state,
                toState,
                idempotencyKey,
                at: this._nowIso(),
                errorCode: err.code || 'TRANSITION_REJECTED',
                errorMessage: err.message,
            });

            this._appendAudit('ORDER_TRANSITION_REJECTED', {
                orderId,
                fromState: current.state,
                toState,
                idempotencyKey,
                errorCode: err.code || 'TRANSITION_REJECTED',
                errorMessage: err.message,
            }, {
                orderId,
                userId: current.userId,
                idempotencyKey,
                severity: 'WARN',
            });

            throw err;
        }
    }

    /**
     * Convenience helper to move an order to FAILED.
     *
     * @param {string} orderId Order id.
     * @param {Error|Object|string} failure Failure details.
     * @param {Object} [options] Optional transition options.
     * @returns {import('./types').StateTransitionResult & {transition?: Object<string, any>}}
     */
    failOrder(orderId, failure, options = {}) {
        const errorCode = typeof failure === 'object' && failure?.code
            ? String(failure.code)
            : 'ORDER_FAILED';
        const errorMessage = typeof failure === 'string'
            ? failure
            : (failure?.message || 'Order failed');

        return this.transition(orderId, ORDER_STATES.FAILED, {
            ...options,
            reason: options.reason || 'order_failed',
            errorCode,
            errorMessage,
        });
    }

    /**
     * Scans for expired orders and fails them idempotently.
     *
     * @param {Object} [options] Sweep options.
     * @param {number} [options.limit=100] Max timed-out orders to process.
     * @param {string|Date} [options.now] Override current time.
     * @returns {{processed: number, failed: number, errors: Array<{orderId: string, reason: string}>}}
     */
    sweepTimeouts(options = {}) {
        const nowIso = this._normalizeMaybeIso(options.now) || this._nowIso();
        const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 100;
        const expired = this.orderStore.listExpiredOrders({ now: nowIso, limit });

        let failed = 0;
        const errors = [];

        for (const order of expired) {
            const timeoutKey = `timeout:${order.id}:${order.state}:${order.version}`;

            try {
                const result = this.transition(order.id, ORDER_STATES.FAILED, {
                    idempotencyKey: timeoutKey,
                    reason: 'state_timeout',
                    errorCode: 'STATE_TIMEOUT',
                    errorMessage: `Order timed out while in ${order.state}`,
                    metadata: {
                        timedOutState: order.state,
                        timeoutDeadlineAt: order.deadlineAt,
                        timeoutProcessedAt: nowIso,
                    },
                });

                if (result.applied) {
                    failed += 1;
                    this.emit(EVENTS.ORDER_TIMED_OUT, {
                        orderId: order.id,
                        previousState: order.state,
                        deadlineAt: order.deadlineAt,
                        processedAt: nowIso,
                    });
                }
            } catch (err) {
                errors.push({ orderId: order.id, reason: err.message });
            }
        }

        return {
            processed: expired.length,
            failed,
            errors,
        };
    }

    /**
     * Returns whether `fromState -> toState` is valid.
     *
     * @param {OrderState} fromState Source state.
     * @param {OrderState} toState Destination state.
     * @returns {boolean}
     */
    canTransition(fromState, toState) {
        const candidates = VALID_STATE_TRANSITIONS[fromState] || [];
        return candidates.includes(toState);
    }

    /**
     * Returns all valid next states from a state.
     *
     * @param {OrderState} fromState Source state.
     * @returns {OrderState[]}
     */
    getNextStates(fromState) {
        return [...(VALID_STATE_TRANSITIONS[fromState] || [])];
    }

    /**
     * Returns whether a state is terminal.
     *
     * @param {OrderState} state Candidate state.
     * @returns {boolean}
     */
    isTerminalState(state) {
        return TERMINAL_ORDER_STATES.includes(state);
    }

    /**
     * @param {OrderState} state State.
     * @returns {string|null}
     */
    _computeStateDeadline(state) {
        const timeoutMs = Number(this.timeoutsMs[state] || 0);
        if (timeoutMs <= 0) return null;
        const now = this.clock();
        return new Date(now.getTime() + timeoutMs).toISOString();
    }

    /**
     * @param {Object} payload Payload.
     * @param {string} payload.orderId Order id.
     * @param {OrderState} payload.fromState Source state.
     * @param {OrderState} payload.toState Target state.
     * @returns {string}
     */
    _defaultTransitionIdempotencyKey(payload) {
        const raw = `${payload.orderId}:${payload.fromState}->${payload.toState}`;
        const digest = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
        return `sm:${digest}`;
    }

    /**
     * @param {string|Date|null|undefined} value Date-like value.
     * @returns {string|null}
     */
    _normalizeNullableIso(value) {
        if (value === undefined || value === null || value === '') return null;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new Error(`Invalid ISO timestamp: ${value}`);
        }
        return date.toISOString();
    }

    /**
     * @param {string|Date|null|undefined} value Date-like value.
     * @returns {string|null}
     */
    _normalizeMaybeIso(value) {
        if (value === undefined || value === null || value === '') return null;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return date.toISOString();
    }

    /**
     * @returns {string}
     */
    _nowIso() {
        return this.clock().toISOString();
    }

    /**
     * @param {string} eventType Audit event type.
     * @param {Object<string, any>} payload Event payload.
     * @param {Object<string, any>} context Context metadata.
     * @returns {void}
     */
    _appendAudit(eventType, payload, context) {
        if (!this.auditLogger || typeof this.auditLogger.append !== 'function') {
            return;
        }

        try {
            this.auditLogger.append(eventType, payload, context);
        } catch (err) {
            this.logger.warn('Failed to append state-machine audit event', {
                eventType,
                reason: err.message,
            });
        }
    }
}

module.exports = OrderStateMachine;
module.exports.EVENTS = EVENTS;
