const {
    initDatabase,
    createAlert,
    deleteAlert,
    getActiveAlerts,
    getActiveAlertsForSystem: dbGetActiveAlertsForSystem,
    markAlertTriggeredOnce: dbMarkAlertTriggeredOnce,
    getCostBasisByUserAndToken,
} = require('../database');
const { resolveToken } = require('../price-service');
const { getUserContext } = require('./user-context');

const ALERT_TYPES = new Set(['price', 'stop_loss', 'take_profit']);

function normalizeAlertType(alertType) {
    return String(alertType || 'price').trim().toLowerCase();
}

function normalizeCondition(condition) {
    const normalized = String(condition || '').trim().toLowerCase();
    return normalized === 'above' || normalized === 'below' ? normalized : null;
}

function isValidThresholdPercent(alertType, thresholdPercent) {
    if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0) return false;
    if (alertType === 'stop_loss') return thresholdPercent < 100;
    if (alertType === 'take_profit') return thresholdPercent <= 1000;
    return true;
}

function createTypedAlertForUser(telegramId, alertData) {
    try {
        const user = getUserContext(telegramId);
        const tokenSymbol = String(alertData.tokenSymbol || '').toUpperCase();
        const alertType = normalizeAlertType(alertData.alertType);
        const targetPrice = Number.parseFloat(alertData.targetPrice);

        if (!tokenSymbol) return { ok: false, code: 'UNKNOWN_TOKEN' };
        if (!ALERT_TYPES.has(alertType)) return { ok: false, code: 'INVALID_ALERT_TYPE' };
        if (!Number.isFinite(targetPrice) || targetPrice <= 0) return { ok: false, code: 'INVALID_TARGET_PRICE' };

        let condition = normalizeCondition(alertData.condition);
        if (alertType === 'stop_loss') {
            if (!isValidThresholdPercent(alertType, targetPrice)) {
                return { ok: false, code: 'INVALID_ALERT_PERCENTAGE' };
            }
            condition = 'below';
        } else if (alertType === 'take_profit') {
            if (!isValidThresholdPercent(alertType, targetPrice)) {
                return { ok: false, code: 'INVALID_ALERT_PERCENTAGE' };
            }
            condition = 'above';
        }

        if (!condition) return { ok: false, code: 'INVALID_ALERT_CONDITION' };

        const tokenMint = resolveToken(tokenSymbol);
        if (!tokenMint) return { ok: false, code: 'UNKNOWN_TOKEN' };

        if (alertType !== 'price') {
            const costBasisRow = getCostBasisByUserAndToken(user.id, tokenSymbol);
            const avgCostBasis = Number(costBasisRow?.avg_cost_basis || 0);
            if (!costBasisRow || avgCostBasis <= 0) {
                return { ok: false, code: 'COST_BASIS_NOT_FOUND' };
            }
        }

        // Check alert limit (max 20)
        if (getActiveAlerts(user.id).length >= 20) {
            return { ok: false, code: 'ALERT_LIMIT_REACHED' };
        }

        const alertId = createAlert(user.id, tokenSymbol, tokenMint, condition, targetPrice, alertType);
        return { ok: true, code: 'ALERT_CREATED', alertId, alertType };
    } catch (err) {
        return { ok: false, code: err.code || 'INTERNAL_ERROR' };
    }
}

function createAlertForUser(telegramId, alertData) {
    return createTypedAlertForUser(telegramId, {
        ...alertData,
        alertType: alertData.alertType || 'price',
    });
}

function createStopLossAlertForUser(telegramId, alertData) {
    return createTypedAlertForUser(telegramId, {
        tokenSymbol: alertData.tokenSymbol,
        targetPrice: alertData.lossPercent,
        alertType: 'stop_loss',
    });
}

function createTakeProfitAlertForUser(telegramId, alertData) {
    return createTypedAlertForUser(telegramId, {
        tokenSymbol: alertData.tokenSymbol,
        targetPrice: alertData.profitPercent,
        alertType: 'take_profit',
    });
}

function deleteAlertForUser(telegramId, alertId) {
    try {
        const user = getUserContext(telegramId);
        const parsedAlertId = Number.parseInt(alertId, 10);
        if (!Number.isInteger(parsedAlertId) || parsedAlertId <= 0) {
            return { ok: false, code: 'INVALID_ALERT_ID' };
        }

        const deleted = deleteAlert(parsedAlertId, user.id);
        if (!deleted) return { ok: false, code: 'ALERT_NOT_FOUND' };

        return { ok: true, code: 'ALERT_DELETED', alertId: parsedAlertId };
    } catch (err) {
        return { ok: false, code: err.code || 'INTERNAL_ERROR' };
    }
}

function listAlerts(telegramId) {
    try {
        const user = getUserContext(telegramId);
        const alerts = getActiveAlerts(user.id);
        return { ok: true, code: 'OK', alerts };
    } catch (err) {
        return { ok: false, code: err.code || 'INTERNAL_ERROR' };
    }
}

function getActiveAlertsForSystem() {
    initDatabase();
    return dbGetActiveAlertsForSystem();
}

function markAlertTriggeredOnce(alertId) {
    initDatabase();
    return dbMarkAlertTriggeredOnce(alertId);
}

module.exports = {
    createAlertForUser,
    createStopLossAlertForUser,
    createTakeProfitAlertForUser,
    deleteAlertForUser,
    listAlerts,
    getActiveAlertsForSystem,
    markAlertTriggeredOnce,
};
