'use strict';

const DEFAULT_OPTIONS = Object.freeze({
    circuitBreakerEnabled: true,
    globalAutoResumeMs: 300_000,
    userAutoResumeMs: 300_000,
});

class InMemoryCircuitBreakerRepository {
    constructor() {
        this.globalPause = null;
        this.userPauses = new Map();
    }

    getGlobalPause() {
        return this.globalPause;
    }

    setGlobalPause(payload) {
        this.globalPause = payload ? { ...payload } : null;
    }

    clearGlobalPause() {
        this.globalPause = null;
    }

    getUserPause(userId) {
        return this.userPauses.get(String(userId)) || null;
    }

    setUserPause(userId, payload) {
        this.userPauses.set(String(userId), { ...payload });
    }

    clearUserPause(userId) {
        this.userPauses.delete(String(userId));
    }

    listUserPauses() {
        return [...this.userPauses.entries()].map(([userId, payload]) => ({
            userId,
            ...payload,
        }));
    }
}

class CircuitBreaker {
    constructor(options = {}) {
        this.repository = options.repository || new InMemoryCircuitBreakerRepository();
        this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
        this.circuitBreakerEnabled = options.circuitBreakerEnabled !== false;
        this.globalAutoResumeMs = Number.isFinite(Number(options.globalAutoResumeMs))
            ? Number(options.globalAutoResumeMs)
            : DEFAULT_OPTIONS.globalAutoResumeMs;
        this.userAutoResumeMs = Number.isFinite(Number(options.userAutoResumeMs))
            ? Number(options.userAutoResumeMs)
            : DEFAULT_OPTIONS.userAutoResumeMs;
    }

    setEnabled(enabled) {
        this.circuitBreakerEnabled = enabled !== false;
        return this.circuitBreakerEnabled;
    }

    isEnabled() {
        return this.circuitBreakerEnabled;
    }

    evaluate(userId, options = {}) {
        const nowMs = this._toMs(options.now);
        const nowIso = new Date(nowMs).toISOString();

        if (!this.circuitBreakerEnabled) {
            return {
                allowed: true,
                scope: 'disabled',
                message: 'Circuit breaker is disabled.',
                now: nowIso,
            };
        }

        this._autoRecover(nowMs);

        const globalPause = this.repository.getGlobalPause();
        if (globalPause) {
            return {
                allowed: false,
                scope: 'global',
                code: 'CIRCUIT_BREAKER_GLOBAL_PAUSED',
                message: 'Global circuit breaker is active.',
                reason: globalPause.reason || null,
                pausedAt: globalPause.pausedAt || null,
                resumeAt: globalPause.resumeAt || null,
                now: nowIso,
            };
        }

        const normalizedUserId = String(userId || '').trim();
        if (!normalizedUserId) {
            return {
                allowed: true,
                scope: 'none',
                message: 'No active circuit breaker pause.',
                now: nowIso,
            };
        }

        const userPause = this.repository.getUserPause(normalizedUserId);
        if (userPause) {
            return {
                allowed: false,
                scope: 'user',
                code: 'CIRCUIT_BREAKER_USER_PAUSED',
                message: 'User-level circuit breaker is active.',
                userId: normalizedUserId,
                reason: userPause.reason || null,
                pausedAt: userPause.pausedAt || null,
                resumeAt: userPause.resumeAt || null,
                now: nowIso,
            };
        }

        return {
            allowed: true,
            scope: 'none',
            message: 'No active circuit breaker pause.',
            now: nowIso,
        };
    }

    pauseGlobal(options = {}) {
        const nowMs = this._toMs(options.now);
        const isCritical = options.critical === true || options.p0 === true;
        // P0/Critical incidents disable auto-resume by default (ttlMs = 0 means indefinite)
        const defaultTtlMs = isCritical ? 0 : this.globalAutoResumeMs;
        const ttlMs = Number.isFinite(Number(options.ttlMs)) ? Math.max(0, Number(options.ttlMs)) : defaultTtlMs;
        const payload = {
            reason: options.reason ? String(options.reason) : 'manual_pause',
            actor: options.actor ? String(options.actor) : 'system',
            pausedAt: new Date(nowMs).toISOString(),
            resumeAt: ttlMs > 0 ? new Date(nowMs + ttlMs).toISOString() : null,
            critical: isCritical,
        };
        this.repository.setGlobalPause(payload);
        return { paused: true, scope: 'global', ...payload };
    }

    resumeGlobal(options = {}) {
        const nowMs = this._toMs(options.now);
        this.repository.clearGlobalPause();
        return {
            resumed: true,
            scope: 'global',
            resumedAt: new Date(nowMs).toISOString(),
            actor: options.actor ? String(options.actor) : 'system',
        };
    }

    pauseUser(userId, options = {}) {
        const normalizedUserId = String(userId || '').trim();
        if (!normalizedUserId) {
            const err = new Error('userId is required.');
            err.code = 'MISSING_USER_ID';
            throw err;
        }

        const nowMs = this._toMs(options.now);
        const ttlMs = Number.isFinite(Number(options.ttlMs)) ? Math.max(0, Number(options.ttlMs)) : this.userAutoResumeMs;
        const payload = {
            reason: options.reason ? String(options.reason) : 'manual_user_pause',
            actor: options.actor ? String(options.actor) : 'system',
            pausedAt: new Date(nowMs).toISOString(),
            resumeAt: ttlMs > 0 ? new Date(nowMs + ttlMs).toISOString() : null,
        };
        this.repository.setUserPause(normalizedUserId, payload);
        return { paused: true, scope: 'user', userId: normalizedUserId, ...payload };
    }

    resumeUser(userId, options = {}) {
        const normalizedUserId = String(userId || '').trim();
        if (!normalizedUserId) {
            const err = new Error('userId is required.');
            err.code = 'MISSING_USER_ID';
            throw err;
        }

        const nowMs = this._toMs(options.now);
        this.repository.clearUserPause(normalizedUserId);
        return {
            resumed: true,
            scope: 'user',
            userId: normalizedUserId,
            resumedAt: new Date(nowMs).toISOString(),
            actor: options.actor ? String(options.actor) : 'system',
        };
    }

    listPausedUsers() {
        return this.repository.listUserPauses();
    }

    getGlobalPause() {
        return this.repository.getGlobalPause();
    }

    _autoRecover(nowMs) {
        const globalPause = this.repository.getGlobalPause();
        // Skip auto-recovery for critical/P0 incidents (indefinite pause)
        if (globalPause && globalPause.critical) {
            return;
        }
        if (globalPause && globalPause.resumeAt) {
            const resumeAtMs = Date.parse(globalPause.resumeAt);
            if (Number.isFinite(resumeAtMs) && nowMs >= resumeAtMs) {
                this.repository.clearGlobalPause();
            }
        }

        const userPauses = this.repository.listUserPauses();
        for (const pause of userPauses) {
            if (!pause.resumeAt) continue;
            const resumeAtMs = Date.parse(pause.resumeAt);
            if (Number.isFinite(resumeAtMs) && nowMs >= resumeAtMs) {
                this.repository.clearUserPause(pause.userId);
            }
        }
    }

    _toMs(nowLike) {
        if (nowLike instanceof Date) return nowLike.getTime();
        if (nowLike !== undefined && nowLike !== null) {
            const ms = Date.parse(nowLike);
            if (Number.isFinite(ms)) return ms;
        }
        return this.clock().getTime();
    }
}

module.exports = CircuitBreaker;
module.exports.DEFAULT_OPTIONS = DEFAULT_OPTIONS;
module.exports.InMemoryCircuitBreakerRepository = InMemoryCircuitBreakerRepository;
