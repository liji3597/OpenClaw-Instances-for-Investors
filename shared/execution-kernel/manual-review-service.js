'use strict';

const crypto = require('crypto');
const { ORDER_STATES } = require('./types');

const REVIEW_STATUSES = Object.freeze({
    CREATED: 'CREATED',
    PENDING_REVIEW: 'PENDING_REVIEW',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
});

class InMemoryManualReviewRepository {
    constructor(initialRows = []) {
        this.rows = new Map();
        for (const row of initialRows || []) {
            this.rows.set(String(row.id), { ...row });
        }
    }

    create(row) {
        this.rows.set(String(row.id), { ...row });
        return { ...row };
    }

    getById(reviewId) {
        const row = this.rows.get(String(reviewId));
        return row ? { ...row } : null;
    }

    getByOrderId(orderId) {
        for (const row of this.rows.values()) {
            if (row.orderId === String(orderId)) return { ...row };
        }
        return null;
    }

    updateStatus(reviewId, toStatus, options = {}) {
        const existing = this.getById(reviewId);
        if (!existing) return null;

        const updated = {
            ...existing,
            status: toStatus,
            reviewReason: options.reviewReason !== undefined ? options.reviewReason : existing.reviewReason,
            reviewedBy: options.reviewedBy !== undefined ? options.reviewedBy : existing.reviewedBy,
            reviewedAt: options.reviewedAt !== undefined ? options.reviewedAt : existing.reviewedAt,
            orderTransitionIdempotencyKey: options.orderTransitionIdempotencyKey !== undefined
                ? options.orderTransitionIdempotencyKey
                : existing.orderTransitionIdempotencyKey,
            metadata: options.metadata !== undefined ? { ...(options.metadata || {}) } : { ...(existing.metadata || {}) },
            updatedAt: options.updatedAt || existing.updatedAt,
        };
        this.rows.set(String(reviewId), updated);
        return { ...updated };
    }

    listByStatus(status) {
        const target = String(status || '');
        return [...this.rows.values()]
            .filter((row) => row.status === target)
            .map((row) => ({ ...row }));
    }
}

class ManualReviewService {
    constructor(options = {}) {
        this.repository = options.repository || new InMemoryManualReviewRepository();
        this.orderStateMachine = options.orderStateMachine || null;
        this.auditLogger = options.auditLogger || null;
        this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
        this.idFactory = typeof options.idFactory === 'function'
            ? options.idFactory
            : () => crypto.randomUUID();
        // Default threshold aligned with Beta limits ($100/tx cap)
        // Set to $50 to ensure review workflow is tested during Beta
        this.thresholdUsd = Number.isFinite(Number(options.thresholdUsd))
            ? Number(options.thresholdUsd)
            : 50;
    }

    requiresManualReview(payload = {}) {
        const usdNotional = Number(payload.usdNotional);
        return Number.isFinite(usdNotional) && usdNotional >= this.thresholdUsd;
    }

    createReviewRequest(input = {}) {
        const orderId = this._requiredString(input.orderId, 'orderId');
        const userId = this._requiredString(input.userId, 'userId');
        const nowIso = this._nowIso();
        const existing = this.repository.getByOrderId(orderId);
        if (existing) return existing;

        const row = {
            id: this.idFactory(),
            orderId,
            userId,
            status: REVIEW_STATUSES.CREATED,
            usdNotional: Number(input.usdNotional || 0),
            reason: input.reason ? String(input.reason) : 'manual_review_required',
            reviewReason: null,
            reviewedBy: null,
            reviewedAt: null,
            orderTransitionIdempotencyKey: null,
            metadata: input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {},
            createdAt: nowIso,
            updatedAt: nowIso,
        };

        const created = this.repository.create(row);
        this._appendAudit('MANUAL_REVIEW_CREATED', created, {
            orderId: created.orderId,
            userId: created.userId,
            severity: 'WARN',
        });
        return created;
    }

    submitForReview(reviewId, options = {}) {
        const review = this._requireReview(reviewId);
        if (review.status === REVIEW_STATUSES.PENDING_REVIEW) return review;
        this._assertStatus(review, [REVIEW_STATUSES.CREATED]);

        const nowIso = this._nowIso();
        const idempotencyKey = options.idempotencyKey
            || `manual-review:pending:${review.orderId}`;

        if (this.orderStateMachine && typeof this.orderStateMachine.transition === 'function') {
            this.orderStateMachine.transition(review.orderId, ORDER_STATES.REVIEW_PENDING, {
                idempotencyKey,
                reason: options.reason || 'manual_review_pending',
                actor: options.actor || 'risk-controller',
                metadata: {
                    reviewId: review.id,
                    reviewStatus: REVIEW_STATUSES.PENDING_REVIEW,
                },
                mergeMetadata: true,
            });
        }

        const updated = this.repository.updateStatus(review.id, REVIEW_STATUSES.PENDING_REVIEW, {
            reviewReason: options.reviewReason || null,
            orderTransitionIdempotencyKey: idempotencyKey,
            updatedAt: nowIso,
            metadata: {
                ...(review.metadata || {}),
                submittedAt: nowIso,
            },
        });

        this._appendAudit('MANUAL_REVIEW_PENDING', updated, {
            orderId: updated.orderId,
            userId: updated.userId,
            severity: 'WARN',
        });
        return updated;
    }

    approveReview(reviewId, options = {}) {
        const review = this._requireReview(reviewId);
        this._assertStatus(review, [REVIEW_STATUSES.PENDING_REVIEW]);

        const nowIso = this._nowIso();
        const actor = options.actor || options.reviewedBy || 'manual-reviewer';
        const idempotencyKey = options.idempotencyKey
            || `manual-review:approved:${review.orderId}:${review.id}`;

        if (this.orderStateMachine && typeof this.orderStateMachine.transition === 'function') {
            this.orderStateMachine.transition(review.orderId, ORDER_STATES.RISK_CHECK, {
                idempotencyKey,
                reason: options.reason || 'manual_review_approved',
                actor,
                metadata: {
                    reviewId: review.id,
                    reviewedBy: actor,
                },
                mergeMetadata: true,
            });
        }

        const updated = this.repository.updateStatus(review.id, REVIEW_STATUSES.APPROVED, {
            reviewedBy: actor,
            reviewedAt: nowIso,
            reviewReason: options.reviewReason || 'approved',
            orderTransitionIdempotencyKey: idempotencyKey,
            updatedAt: nowIso,
            metadata: {
                ...(review.metadata || {}),
                approvedAt: nowIso,
            },
        });

        this._appendAudit('MANUAL_REVIEW_APPROVED', updated, {
            orderId: updated.orderId,
            userId: updated.userId,
            actor,
            severity: 'INFO',
        });
        return updated;
    }

    rejectReview(reviewId, options = {}) {
        const review = this._requireReview(reviewId);
        this._assertStatus(review, [REVIEW_STATUSES.PENDING_REVIEW]);

        const nowIso = this._nowIso();
        const actor = options.actor || options.reviewedBy || 'manual-reviewer';
        const idempotencyKey = options.idempotencyKey
            || `manual-review:rejected:${review.orderId}:${review.id}`;

        if (this.orderStateMachine && typeof this.orderStateMachine.transition === 'function') {
            try {
                this.orderStateMachine.transition(review.orderId, ORDER_STATES.FAILED, {
                    idempotencyKey,
                    reason: options.reason || 'manual_review_rejected',
                    actor,
                    errorCode: options.errorCode || 'MANUAL_REVIEW_REJECTED',
                    errorMessage: options.reviewReason || 'Manual review rejected the order.',
                    metadata: {
                        reviewId: review.id,
                        reviewedBy: actor,
                    },
                    mergeMetadata: true,
                });
            } catch (err) {
                if (err.code !== 'INVALID_ORDER_TRANSITION') throw err;
            }
        }

        const updated = this.repository.updateStatus(review.id, REVIEW_STATUSES.REJECTED, {
            reviewedBy: actor,
            reviewedAt: nowIso,
            reviewReason: options.reviewReason || 'rejected',
            orderTransitionIdempotencyKey: idempotencyKey,
            updatedAt: nowIso,
            metadata: {
                ...(review.metadata || {}),
                rejectedAt: nowIso,
            },
        });

        this._appendAudit('MANUAL_REVIEW_REJECTED', updated, {
            orderId: updated.orderId,
            userId: updated.userId,
            actor,
            severity: 'WARN',
        });
        return updated;
    }

    getReviewById(reviewId) {
        return this.repository.getById(reviewId);
    }

    getReviewByOrderId(orderId) {
        return this.repository.getByOrderId(orderId);
    }

    listPendingReviews() {
        return this.repository.listByStatus(REVIEW_STATUSES.PENDING_REVIEW);
    }

    _appendAudit(eventType, payload, context = {}) {
        if (!this.auditLogger || typeof this.auditLogger.append !== 'function') return;
        try {
            this.auditLogger.append(eventType, payload, context);
        } catch (_) {
            // no-op on audit transport failure
        }
    }

    _requireReview(reviewId) {
        const review = this.repository.getById(reviewId);
        if (!review) {
            const err = new Error(`Manual review not found: ${reviewId}`);
            err.code = 'MANUAL_REVIEW_NOT_FOUND';
            throw err;
        }
        return review;
    }

    _assertStatus(review, allowedStatuses) {
        if (!allowedStatuses.includes(review.status)) {
            const err = new Error(`Invalid manual review status transition: ${review.status}`);
            err.code = 'INVALID_MANUAL_REVIEW_STATUS';
            err.meta = { current: review.status, allowed: allowedStatuses };
            throw err;
        }
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

    _nowIso() {
        return this.clock().toISOString();
    }
}

module.exports = ManualReviewService;
module.exports.REVIEW_STATUSES = REVIEW_STATUSES;
module.exports.InMemoryManualReviewRepository = InMemoryManualReviewRepository;
