'use strict';

const { createLogger } = require('../logger');

/**
 * Post-execution reporter for Jupiter swap lifecycle.
 */
class ExecutionReporter {
    /**
     * @param {Object} [options]
     * @param {Object} [options.auditLogger] - execution-kernel audit logger instance.
     */
    constructor(options = {}) {
        this.auditLogger = options.auditLogger || null;
        this.logger = createLogger('jupiter-execution-reporter');
    }

    /**
     * Report swap start.
     * @param {Object} payload
     * @param {Object} [context]
     * @returns {Object|null}
     */
    reportSwapStarted(payload, context = {}) {
        return this._append('SWAP_STARTED', payload, context);
    }

    /**
     * Report quote fetched.
     * @param {Object} payload
     * @param {Object} [context]
     * @returns {Object|null}
     */
    reportQuoteReceived(payload, context = {}) {
        return this._append('QUOTE_RECEIVED', payload, context);
    }

    /**
     * Report unsigned transaction built.
     * @param {Object} payload
     * @param {Object} [context]
     * @returns {Object|null}
     */
    reportTransactionBuilt(payload, context = {}) {
        return this._append('TRANSACTION_BUILT', payload, context);
    }

    /**
     * Report transaction broadcast.
     * @param {Object} payload
     * @param {Object} [context]
     * @returns {Object|null}
     */
    reportTransactionBroadcast(payload, context = {}) {
        return this._append('TRANSACTION_BROADCAST', payload, context);
    }

    /**
     * Report transaction confirmation.
     * @param {Object} payload
     * @param {Object} [context]
     * @returns {Object|null}
     */
    reportSwapConfirmed(payload, context = {}) {
        return this._append('SWAP_CONFIRMED', payload, context);
    }

    /**
     * Report failure.
     * @param {Object} payload
     * @param {Object} [context]
     * @returns {Object|null}
     */
    reportSwapFailed(payload, context = {}) {
        return this._append('SWAP_FAILED', payload, {
            ...context,
            severity: context.severity || 'ERROR',
        });
    }

    _append(eventName, payload, context = {}) {
        if (!this.auditLogger) return null;

        const safePayload = payload && typeof payload === 'object' ? payload : { value: payload };
        const safeContext = {
            ...context,
            severity: String(context.severity || 'INFO').toUpperCase(),
        };

        try {
            if (typeof this.auditLogger.appendExecutionEvent === 'function') {
                return this.auditLogger.appendExecutionEvent(eventName, safePayload, safeContext);
            }

            if (typeof this.auditLogger.append === 'function') {
                return this.auditLogger.append(`EXEC_${String(eventName).toUpperCase()}`, safePayload, safeContext);
            }

            this.logger.warn('Audit logger does not expose appendExecutionEvent/append');
            return null;
        } catch (err) {
            this.logger.warn('Execution report append failed', {
                eventName,
                reason: err.message,
            });
            return null;
        }
    }
}

module.exports = ExecutionReporter;