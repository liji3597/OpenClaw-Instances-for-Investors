const { createAlert, deleteAlert } = require('../database');
const { resolveToken } = require('../price-service');
const { getUserContext } = require('./user-context');

function createAlertForUser(telegramId, alertData) {
    try {
        const user = getUserContext(telegramId);
        const tokenSymbol = String(alertData.tokenSymbol || '').toUpperCase();
        const condition = alertData.condition;
        const targetPrice = Number.parseFloat(alertData.targetPrice);

        if (!tokenSymbol) return { ok: false, code: 'UNKNOWN_TOKEN' };
        if (condition !== 'above' && condition !== 'below') return { ok: false, code: 'INVALID_ALERT_CONDITION' };
        if (!Number.isFinite(targetPrice) || targetPrice <= 0) return { ok: false, code: 'INVALID_TARGET_PRICE' };

        const tokenMint = resolveToken(tokenSymbol);
        if (!tokenMint) return { ok: false, code: 'UNKNOWN_TOKEN' };

        const alertId = createAlert(user.id, tokenSymbol, tokenMint, condition, targetPrice);
        return { ok: true, code: 'ALERT_CREATED', alertId };
    } catch (err) {
        return { ok: false, code: err.code || 'INTERNAL_ERROR' };
    }
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

module.exports = {
    createAlertForUser,
    deleteAlertForUser,
};
