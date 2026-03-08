'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('../logger');

const DEFAULT_AUDIT_LOG_PATH = path.join(process.cwd(), 'data', 'audit', 'execution-audit.log');

class AuditLogger {
    constructor(options = {}) {
        this.logPath = options.logPath || DEFAULT_AUDIT_LOG_PATH;
        this.siemTransport = typeof options.siemTransport === 'function' ? options.siemTransport : null;
        this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
        this.idFactory = typeof options.idFactory === 'function'
            ? options.idFactory
            : () => crypto.randomUUID();
        this.logger = createLogger(options.component || 'execution-audit');

        this._ensureLogDir();
        this.lastHash = this._loadLastHash();
    }

    append(eventType, payload = {}, context = {}) {
        if (!eventType || typeof eventType !== 'string') {
            throw new Error('Audit eventType must be a non-empty string.');
        }

        const base = {
            id: this.idFactory(),
            timestamp: this.clock().toISOString(),
            type: eventType,
            severity: String(context.severity || 'INFO').toUpperCase(),
            actor: toNullableString(context.actor),
            userId: toNullableString(context.userId),
            orderId: toNullableString(context.orderId),
            idempotencyKey: toNullableString(context.idempotencyKey),
            traceId: toNullableString(context.traceId),
            tags: Array.isArray(context.tags) ? context.tags.map((v) => String(v)) : [],
            payload: payload && typeof payload === 'object' ? payload : { value: payload },
            prevHash: this.lastHash,
        };

        const hash = this._computeEntryHash(base);
        const entry = { ...base, hash };

        fs.appendFileSync(this.logPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', flag: 'a' });
        this.lastHash = hash;

        this.logger.info('Audit entry appended', {
            entryId: entry.id,
            type: entry.type,
            severity: entry.severity,
            userId: entry.userId,
            orderId: entry.orderId,
            hash: entry.hash,
            prevHash: entry.prevHash,
        });

        this._forwardToSiem(entry);
        return entry;
    }

    appendStateTransition(payload, context = {}) {
        return this.append('ORDER_STATE_CHANGED', payload, context);
    }

    appendRiskDecision(payload, context = {}) {
        return this.append('RISK_EVALUATED', payload, context);
    }

    appendExecutionEvent(eventName, payload, context = {}) {
        return this.append(`EXEC_${String(eventName || 'UNKNOWN').toUpperCase()}`, payload, context);
    }

    verifyIntegrity(options = {}) {
        const lines = this._readLines();
        if (lines.length === 0) {
            return { ok: true, checked: 0, partial: false, lastHash: null };
        }

        const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 0;
        const start = limit > 0 ? Math.max(0, lines.length - limit) : 0;
        const partial = start > 0;
        let previousHash = start > 0 ? this._safeParseLine(lines[start - 1])?.hash || null : null;

        let checked = 0;

        for (let i = start; i < lines.length; i += 1) {
            const parsed = this._safeParseLine(lines[i]);
            if (!parsed) {
                return {
                    ok: false,
                    checked,
                    partial,
                    lastHash: previousHash,
                    reason: 'invalid_json',
                    line: i + 1,
                };
            }

            if (parsed.prevHash !== previousHash) {
                return {
                    ok: false,
                    checked,
                    partial,
                    lastHash: previousHash,
                    reason: 'prev_hash_mismatch',
                    line: i + 1,
                    entryId: parsed.id,
                };
            }

            const expectedHash = this._computeEntryHash({
                id: parsed.id,
                timestamp: parsed.timestamp,
                type: parsed.type,
                severity: parsed.severity,
                actor: parsed.actor,
                userId: parsed.userId,
                orderId: parsed.orderId,
                idempotencyKey: parsed.idempotencyKey,
                traceId: parsed.traceId,
                tags: parsed.tags,
                payload: parsed.payload,
                prevHash: parsed.prevHash,
            });

            if (parsed.hash !== expectedHash) {
                return {
                    ok: false,
                    checked,
                    partial,
                    lastHash: previousHash,
                    reason: 'hash_mismatch',
                    line: i + 1,
                    entryId: parsed.id,
                };
            }

            previousHash = parsed.hash;
            checked += 1;
        }

        return {
            ok: true,
            checked,
            partial,
            lastHash: previousHash,
        };
    }

    _ensureLogDir() {
        const dir = path.dirname(this.logPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    _loadLastHash() {
        const lines = this._readLines();
        if (lines.length === 0) return null;
        const last = this._safeParseLine(lines[lines.length - 1]);
        return last?.hash || null;
    }

    _readLines() {
        if (!fs.existsSync(this.logPath)) return [];
        const content = fs.readFileSync(this.logPath, 'utf8');
        return content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
    }

    _safeParseLine(line) {
        try {
            return JSON.parse(line);
        } catch (err) {
            return null;
        }
    }

    _computeEntryHash(entryWithoutHash) {
        return crypto
            .createHash('sha256')
            .update(stableStringify(entryWithoutHash))
            .digest('hex');
    }

    _forwardToSiem(entry) {
        if (!this.siemTransport) return;

        try {
            const maybePromise = this.siemTransport(entry);
            if (maybePromise && typeof maybePromise.then === 'function') {
                maybePromise.catch((err) => {
                    this.logger.warn('SIEM async transport failed', {
                        entryId: entry.id,
                        reason: err.message,
                    });
                });
            }
        } catch (err) {
            this.logger.warn('SIEM transport failed', {
                entryId: entry.id,
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
        const output = {};
        const keys = Object.keys(value).sort();
        for (const key of keys) {
            output[key] = normalizeForStable(value[key]);
        }
        return output;
    }

    return value;
}

function toNullableString(value) {
    if (value === undefined || value === null || value === '') return null;
    return String(value);
}

module.exports = AuditLogger;
module.exports.DEFAULT_AUDIT_LOG_PATH = DEFAULT_AUDIT_LOG_PATH;
