'use strict';

const crypto = require('crypto');
const { ORDER_STATES } = require('./types');

const ROLLBACK_CASE_STATUSES = Object.freeze({
    CREATED: 'CREATED',
    EXECUTED: 'EXECUTED',
    FAILED: 'FAILED',
});

const FUND_TRACKING_STATUSES = Object.freeze({
    OPEN: 'OPEN',
    RECONCILED: 'RECONCILED',
    UNRECOVERABLE: 'UNRECOVERABLE',
});

class InMemoryRollbackRepository {
    constructor(initialCases = [], initialFundTracks = []) {
        this.rollbackCases = new Map();
        this.fundTracks = new Map();

        for (const row of initialCases || []) {
            this.rollbackCases.set(String(row.id), { ...row });
        }
        for (const row of initialFundTracks || []) {
            this.fundTracks.set(String(row.id), { ...row });
        }
    }

    createCase(row) {
        this.rollbackCases.set(String(row.id), { ...row });
        return { ...row };
    }

    getCase(caseId) {
        const row = this.rollbackCases.get(String(caseId));
        return row ? { ...row } : null;
    }

    updateCase(caseId, patch = {}) {
        const existing = this.getCase(caseId);
        if (!existing) return null;
        const merged = { ...existing, ...patch };
        this.rollbackCases.set(String(caseId), merged);
        return { ...merged };
    }

    listCasesByOrder(orderId) {
        const normalized = String(orderId);
        return [...this.rollbackCases.values()]
            .filter((row) => row.orderId === normalized)
            .map((row) => ({ ...row }));
    }

    createFundTrack(row) {
        this.fundTracks.set(String(row.id), { ...row });
        return { ...row };
    }

    listFundTracksByOrder(orderId) {
        const normalized = String(orderId);
        return [...this.fundTracks.values()]
            .filter((row) => row.orderId === normalized)
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
            .map((row) => ({ ...row }));
    }
}

class RollbackService {
    constructor(options = {}) {
        if (!options.orderStore) {
            throw new Error('RollbackService requires orderStore.');
        }
        this.orderStore = options.orderStore;
        this.orderStateMachine = options.orderStateMachine || null;
        this.auditLogger = options.auditLogger || null;
        this.repository = options.repository || new InMemoryRollbackRepository();
        this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
        this.idFactory = typeof options.idFactory === 'function'
            ? options.idFactory
            : () => crypto.randomUUID();
    }

    createRollbackCase(input = {}) {
        const orderId = this._requiredString(input.orderId, 'orderId');
        const order = this.orderStore.getOrderById(orderId);
        if (!order) {
            const err = new Error(`Order not found: ${orderId}`);
            err.code = 'ORDER_NOT_FOUND';
            throw err;
        }

        const nowIso = this._nowIso();
        const row = {
            id: this.idFactory(),
            orderId: order.id,
            userId: order.userId,
            status: ROLLBACK_CASE_STATUSES.CREATED,
            reason: input.reason ? String(input.reason) : 'manual_rollback',
            requestedBy: input.requestedBy ? String(input.requestedBy) : 'system',
            metadata: input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {},
            createdAt: nowIso,
            updatedAt: nowIso,
            executedAt: null,
            targetState: null,
            errorCode: null,
            errorMessage: null,
        };

        const created = this.repository.createCase(row);
        this._appendAudit('ROLLBACK_CASE_CREATED', created, {
            orderId: created.orderId,
            userId: created.userId,
            actor: created.requestedBy,
            severity: 'WARN',
        });
        return created;
    }

    executeRollbackCase(caseId, options = {}) {
        const rollbackCase = this._requireCase(caseId);
        const order = this.orderStore.getOrderById(rollbackCase.orderId);
        if (!order) {
            const err = new Error(`Order not found: ${rollbackCase.orderId}`);
            err.code = 'ORDER_NOT_FOUND';
            throw err;
        }

        const targetState = options.targetState || ORDER_STATES.RISK_CHECK;
        const actor = options.actor || rollbackCase.requestedBy || 'system';
        const nowIso = this._nowIso();
        const idempotencyKey = options.idempotencyKey
            || `rollback:${rollbackCase.id}:${targetState}`;

        try {
            let transitionResult = null;
            if (
                !options.force
                && this.orderStateMachine
                && typeof this.orderStateMachine.transition === 'function'
            ) {
                try {
                    transitionResult = this.orderStateMachine.transition(order.id, targetState, {
                        idempotencyKey,
                        reason: options.reason || 'rollback_execute',
                        actor,
                        metadata: {
                            rollbackCaseId: rollbackCase.id,
                            rollbackForced: false,
                        },
                        mergeMetadata: true,
                    });
                } catch (transitionErr) {
                    if (transitionErr.code !== 'INVALID_ORDER_TRANSITION') throw transitionErr;
                    // Fallback to forceSetOrderState only if force=true explicitly
                    if (options.force === true && typeof this.orderStore.forceSetOrderState === 'function') {
                        transitionResult = this.orderStore.forceSetOrderState({
                            orderId: order.id,
                            toState: targetState,
                            idempotencyKey,
                            reason: options.reason || 'rollback_force_execute',
                            actor,
                            errorCode: null,
                            errorMessage: null,
                            metadata: {
                                rollbackCaseId: rollbackCase.id,
                                rollbackForced: true,
                            },
                            mergeMetadata: true,
                        });
                    } else {
                        throw transitionErr;
                    }
                }
            } else if (options.force === true && typeof this.orderStore.forceSetOrderState === 'function') {
                transitionResult = this.orderStore.forceSetOrderState({
                    orderId: order.id,
                    toState: targetState,
                    idempotencyKey,
                    reason: options.reason || 'rollback_force_execute',
                    actor,
                    errorCode: null,
                    errorMessage: null,
                    metadata: {
                        rollbackCaseId: rollbackCase.id,
                        rollbackForced: true,
                    },
                    mergeMetadata: true,
                });
            } else {
                const err = new Error(`Rollback transition blocked: ${order.state} -> ${targetState}. Set force=true for forced rollback.`);
                err.code = 'INVALID_ROLLBACK_TRANSITION';
                throw err;
            }

            const updatedCase = this.repository.updateCase(rollbackCase.id, {
                status: ROLLBACK_CASE_STATUSES.EXECUTED,
                targetState,
                executedAt: nowIso,
                updatedAt: nowIso,
                errorCode: null,
                errorMessage: null,
                metadata: {
                    ...(rollbackCase.metadata || {}),
                    executedBy: actor,
                    transitionIdempotencyKey: idempotencyKey,
                },
            });

            this._appendAudit('ROLLBACK_EXECUTED', {
                rollbackCaseId: updatedCase.id,
                orderId: updatedCase.orderId,
                targetState,
                transitionApplied: Boolean(transitionResult?.applied),
                transitionIdempotent: Boolean(transitionResult?.idempotent),
            }, {
                orderId: updatedCase.orderId,
                userId: updatedCase.userId,
                actor,
                severity: 'WARN',
            });

            return {
                rollbackCase: updatedCase,
                transition: transitionResult,
            };
        } catch (err) {
            const failedCase = this.repository.updateCase(rollbackCase.id, {
                status: ROLLBACK_CASE_STATUSES.FAILED,
                updatedAt: nowIso,
                errorCode: err.code || 'ROLLBACK_FAILED',
                errorMessage: err.message,
            });

            this._appendAudit('ROLLBACK_FAILED', {
                rollbackCaseId: failedCase.id,
                orderId: failedCase.orderId,
                targetState,
                errorCode: err.code || 'ROLLBACK_FAILED',
                errorMessage: err.message,
            }, {
                orderId: failedCase.orderId,
                userId: failedCase.userId,
                actor,
                severity: 'ERROR',
            });
            throw err;
        }
    }

    rollbackOrder(orderId, options = {}) {
        const rollbackCase = this.createRollbackCase({
            orderId,
            reason: options.reason || 'manual_rollback',
            requestedBy: options.actor || 'system',
            metadata: options.metadata || {},
        });
        return this.executeRollbackCase(rollbackCase.id, options);
    }

    trackFunds(input = {}) {
        const orderId = this._requiredString(input.orderId, 'orderId');
        const order = this.orderStore.getOrderById(orderId);
        if (!order) {
            const err = new Error(`Order not found: ${orderId}`);
            err.code = 'ORDER_NOT_FOUND';
            throw err;
        }

        const nowIso = this._nowIso();
        const row = {
            id: this.idFactory(),
            orderId: order.id,
            userId: order.userId,
            assetMint: input.assetMint ? String(input.assetMint) : null,
            amountAtomic: input.amountAtomic !== undefined ? String(input.amountAtomic) : null,
            txSignature: input.txSignature ? String(input.txSignature) : null,
            status: Object.values(FUND_TRACKING_STATUSES).includes(String(input.status || '').toUpperCase())
                ? String(input.status || '').toUpperCase()
                : FUND_TRACKING_STATUSES.OPEN,
            note: input.note ? String(input.note) : null,
            metadata: input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {},
            createdAt: nowIso,
            updatedAt: nowIso,
        };

        const created = this.repository.createFundTrack(row);
        this._appendAudit('ROLLBACK_FUND_TRACK_ADDED', created, {
            orderId: created.orderId,
            userId: created.userId,
            severity: 'INFO',
        });
        return created;
    }

    getFundTracks(orderId) {
        return this.repository.listFundTracksByOrder(orderId);
    }

    listRollbackCases(orderId) {
        return this.repository.listCasesByOrder(orderId);
    }

    _requireCase(caseId) {
        const row = this.repository.getCase(caseId);
        if (!row) {
            const err = new Error(`Rollback case not found: ${caseId}`);
            err.code = 'ROLLBACK_CASE_NOT_FOUND';
            throw err;
        }
        return row;
    }

    _requiredString(value, field) {
        const normalized = String(value || '').trim();
        if (!normalized) {
            const err = new Error(`${field} is required.`);
            err.code = `MISSING_${String(field).toUpperCase()}`;
            throw err;
        }
        return normalized;
    }

    _appendAudit(eventType, payload, context = {}) {
        if (!this.auditLogger || typeof this.auditLogger.append !== 'function') return;
        try {
            this.auditLogger.append(eventType, payload, context);
        } catch (_) {
            // no-op
        }
    }

    _nowIso() {
        return this.clock().toISOString();
    }
}

module.exports = RollbackService;
module.exports.ROLLBACK_CASE_STATUSES = ROLLBACK_CASE_STATUSES;
module.exports.FUND_TRACKING_STATUSES = FUND_TRACKING_STATUSES;
module.exports.InMemoryRollbackRepository = InMemoryRollbackRepository;
