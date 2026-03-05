const cron = require('node-cron');
const {
    initDatabase,
    getActiveAlertsForSystem,
    markAlertTriggeredOnce,
    getActiveStrategies,
    recordStrategyExecution,
    recordTransaction,
} = require('./database');
const { getTokenPrice } = require('./price-service');
const { sendAlertNotification, sendDcaExecutionNotification } = require('./notifier');
const { updateCostBasis } = require('./services/pnl-service');
const { createLogger } = require('./logger');
const { recordMetric } = require('./metrics');

let alertJob = null;
let dcaJob = null;
const logger = createLogger('scheduler');

function normalizeDow(value) {
    return value === 7 ? 0 : value;
}

function parseIntSafe(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
}

function matchesCronPart(value, part, min, max, isDow = false) {
    const segment = part.trim();
    if (!segment) return false;

    const [base, stepRaw] = segment.split('/');
    const step = stepRaw ? parseIntSafe(stepRaw) : 1;
    if (!step || step <= 0) return false;

    let rangeStart = min;
    let rangeEnd = max;

    if (base && base !== '*') {
        if (base.includes('-')) {
            const [startRaw, endRaw] = base.split('-');
            let start = parseIntSafe(startRaw);
            let end = parseIntSafe(endRaw);
            if (start === null || end === null) return false;
            if (isDow) {
                start = normalizeDow(start);
                end = normalizeDow(end);
            }
            rangeStart = start;
            rangeEnd = end;
        } else {
            let exact = parseIntSafe(base);
            if (exact === null) return false;
            if (isDow) exact = normalizeDow(exact);
            rangeStart = exact;
            rangeEnd = exact;
        }
    }

    if (rangeStart < min || rangeEnd > max || value < rangeStart || value > rangeEnd) {
        return false;
    }

    return ((value - rangeStart) % step) === 0;
}

function matchesCronField(value, field, min, max, isDow = false) {
    return field.split(',').some((part) => matchesCronPart(value, part, min, max, isDow));
}

function matchesCronExpression(cronExpression, date) {
    const fields = String(cronExpression || '').trim().split(/\s+/);
    if (fields.length !== 5) return false;
    if (!cron.validate(cronExpression)) return false;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
    const utcMinute = date.getUTCMinutes();
    const utcHour = date.getUTCHours();
    const utcDay = date.getUTCDate();
    const utcMonth = date.getUTCMonth() + 1;
    const utcDow = date.getUTCDay();

    return (
        matchesCronField(utcMinute, minute, 0, 59) &&
        matchesCronField(utcHour, hour, 0, 23) &&
        matchesCronField(utcDay, dayOfMonth, 1, 31) &&
        matchesCronField(utcMonth, month, 1, 12) &&
        matchesCronField(utcDow, dayOfWeek, 0, 7, true)
    );
}

function inferIntervalMs(cronExpression) {
    const fields = String(cronExpression || '').trim().split(/\s+/);
    if (fields.length !== 5) return 60_000;

    const [minute, hour, dayOfMonth, , dayOfWeek] = fields;
    const minuteStep = minute.match(/^\*\/(\d+)$/);
    if (minuteStep) return Number.parseInt(minuteStep[1], 10) * 60_000;

    const hourStep = hour.match(/^\*\/(\d+)$/);
    if (hourStep) return Number.parseInt(hourStep[1], 10) * 3_600_000;

    if (dayOfWeek !== '*') return 7 * 24 * 3_600_000;
    if (dayOfMonth !== '*') return 30 * 24 * 3_600_000;
    if (hour !== '*') return 24 * 3_600_000;

    return 60_000;
}

function isExecutionIntervalPassed(strategy, now) {
    if (!strategy.last_executed_at) return true;
    const last = new Date(strategy.last_executed_at);
    if (!Number.isFinite(last.getTime())) return true;
    const intervalMs = inferIntervalMs(strategy.cron_expression);
    return (now.getTime() - last.getTime()) >= intervalMs;
}

async function runAlertCheck() {
    recordMetric('event.total', 1, { component: 'scheduler', operation: 'run_alert_check' });
    initDatabase();
    const alerts = getActiveAlertsForSystem();
    const summary = {
        checked: alerts.length,
        triggered: 0,
        notified: 0,
        errors: 0,
        triggeredAlerts: [],
    };

    logger.info('Running alert check', { activeAlerts: alerts.length });

    for (const alert of alerts) {
        try {
            const price = await getTokenPrice(alert.token_mint || alert.token_symbol);
            if (!Number.isFinite(price) || price <= 0) continue;

            recordMetric('alert.check.total', 1, { component: 'scheduler' });
            const triggered = alert.condition === 'above'
                ? price >= alert.target_price
                : price <= alert.target_price;
            if (!triggered) continue;

            const marked = markAlertTriggeredOnce(alert.id);
            if (!marked) continue;

            summary.triggered += 1;
            summary.triggeredAlerts.push({
                id: alert.id,
                symbol: alert.token_symbol,
                condition: alert.condition,
                targetPrice: alert.target_price,
                currentPrice: price,
            });
            recordMetric('alert.trigger.total', 1, {
                component: 'scheduler',
                token: alert.token_symbol || 'UNKNOWN',
            });

            logger.info('Alert triggered', {
                alertId: alert.id,
                symbol: alert.token_symbol,
                condition: alert.condition,
                targetPrice: alert.target_price,
                currentPrice: price,
            });

            const notified = await sendAlertNotification(
                alert.telegram_id,
                { ...alert, triggered_at: new Date().toISOString() },
                price
            );
            if (notified) {
                summary.notified += 1;
                recordMetric('alert.notify.total', 1, { component: 'scheduler' });
            }
        } catch (err) {
            summary.errors += 1;
            recordMetric('error.total', 1, { component: 'scheduler', scope: 'alert_check' });
            logger.error('Alert check failed', {
                alertId: alert.id,
                reason: err.message,
            });
        }
    }

    return summary;
}

async function runDcaSimulation() {
    recordMetric('event.total', 1, { component: 'scheduler', operation: 'run_dca_simulation' });
    initDatabase();
    const now = new Date();
    const strategies = getActiveStrategies();
    const summary = {
        checked: strategies.length,
        matched: 0,
        executed: 0,
        notified: 0,
        failed: 0,
    };

    logger.info('Running DCA simulation', { activeStrategies: strategies.length });

    for (const strategy of strategies) {
        try {
            if (!cron.validate(strategy.cron_expression)) {
                recordMetric('error.total', 1, { component: 'scheduler', scope: 'dca_invalid_cron' });
                logger.warn('Invalid cron expression on strategy', {
                    strategyId: strategy.id,
                    cronExpression: strategy.cron_expression,
                });
                continue;
            }
            if (!matchesCronExpression(strategy.cron_expression, now)) continue;
            if (!isExecutionIntervalPassed(strategy, now)) continue;

            summary.matched += 1;

            const spentUsd = Number(strategy.amount);
            const price = await getTokenPrice(strategy.target_token);
            if (!Number.isFinite(spentUsd) || spentUsd <= 0) {
                throw new Error(`Invalid strategy amount: ${strategy.amount}`);
            }
            if (!Number.isFinite(price) || price <= 0) {
                throw new Error(`Invalid token price for ${strategy.target_token}`);
            }

            const receivedAmount = spentUsd / price;
            const executionTimestamp = new Date().toISOString();
            const txSignature = `SIM-${strategy.id}-${Date.now()}`;

            recordStrategyExecution(strategy.id, spentUsd, receivedAmount);
            recordTransaction(strategy.user_id, {
                strategy_id: strategy.id,
                type: 'dca',
                from_token: strategy.source_token,
                to_token: strategy.target_token,
                from_amount: spentUsd,
                to_amount: receivedAmount,
                price_at_execution: price,
                tx_signature: txSignature,
                status: 'success',
            });
            updateCostBasis(strategy.user_id, strategy.target_token, receivedAmount, spentUsd);

            summary.executed += 1;
            recordMetric('dca.execution.total', 1, { component: 'scheduler' });
            logger.info('DCA simulation executed', {
                strategyId: strategy.id,
                spentUsd,
                sourceToken: strategy.source_token,
                receivedAmount,
                targetToken: strategy.target_token,
                price,
            });

            const notified = await sendDcaExecutionNotification(strategy.telegram_id, strategy, {
                spentUsd,
                receivedAmount,
                price,
                timestamp: executionTimestamp,
                txSignature,
            });
            if (notified) {
                summary.notified += 1;
                recordMetric('dca.notify.total', 1, { component: 'scheduler' });
            }
        } catch (err) {
            summary.failed += 1;
            recordMetric('error.total', 1, { component: 'scheduler', scope: 'dca_execution' });
            logger.error('DCA simulation failed', {
                strategyId: strategy.id,
                reason: err.message,
            });
            try {
                recordTransaction(strategy.user_id, {
                    strategy_id: strategy.id,
                    type: 'dca',
                    from_token: strategy.source_token,
                    to_token: strategy.target_token,
                    from_amount: strategy.amount,
                    status: 'failed',
                    error_message: err.message,
                });
            } catch (txErr) {
                recordMetric('error.total', 1, { component: 'scheduler', scope: 'dca_record_failed_tx' });
                logger.error('Failed to record failed DCA transaction', {
                    strategyId: strategy.id,
                    reason: txErr.message,
                });
            }
        }
    }

    return summary;
}

function startScheduler() {
    if (alertJob || dcaJob) {
        logger.info('Scheduler is already running');
        return;
    }

    initDatabase();
    alertJob = cron.schedule('* * * * *', () => {
        runAlertCheck().catch((err) => {
            recordMetric('error.total', 1, { component: 'scheduler', scope: 'alert_job' });
            logger.error('runAlertCheck job failed', { reason: err.message });
        });
    }, { timezone: 'UTC' });
    dcaJob = cron.schedule('* * * * *', () => {
        runDcaSimulation().catch((err) => {
            recordMetric('error.total', 1, { component: 'scheduler', scope: 'dca_job' });
            logger.error('runDcaSimulation job failed', { reason: err.message });
        });
    }, { timezone: 'UTC' });

    logger.info('Scheduler started', {
        timezone: 'UTC',
        alertCron: '* * * * *',
        dcaCron: '* * * * *',
    });
}

function stopScheduler() {
    if (alertJob) {
        alertJob.stop();
        alertJob.destroy();
        alertJob = null;
    }
    if (dcaJob) {
        dcaJob.stop();
        dcaJob.destroy();
        dcaJob = null;
    }
    logger.info('Scheduler stopped');
}

module.exports = {
    startScheduler,
    stopScheduler,
    runAlertCheck,
    runDcaSimulation,
};
