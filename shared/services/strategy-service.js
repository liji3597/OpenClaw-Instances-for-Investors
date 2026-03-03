const { getUserStrategies, updateStrategyStatus } = require('../database');
const { getUserContext } = require('./user-context');

function validateStrategyOwnership(userId, strategyId) {
    const parsedId = Number.parseInt(strategyId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
        return { ok: false, code: 'INVALID_STRATEGY_ID' };
    }

    const strategy = getUserStrategies(userId).find((s) => s.id === parsedId);
    if (!strategy) {
        return { ok: false, code: 'STRATEGY_NOT_FOUND' };
    }

    return { ok: true, strategyId: parsedId, strategy };
}

function pauseStrategy(telegramId, strategyId) {
    try {
        const user = getUserContext(telegramId);
        const ownership = validateStrategyOwnership(user.id, strategyId);
        if (!ownership.ok) return ownership;
        if (ownership.strategy.status === 'paused') return { ok: false, code: 'STRATEGY_ALREADY_PAUSED' };

        const updated = updateStrategyStatus(ownership.strategyId, 'paused', user.id);
        if (!updated) return { ok: false, code: 'STRATEGY_NOT_FOUND_OR_UNAUTHORIZED' };

        return { ok: true, code: 'OK', strategyId: ownership.strategyId };
    } catch (err) {
        return { ok: false, code: err.code || 'INTERNAL_ERROR' };
    }
}

function resumeStrategy(telegramId, strategyId) {
    try {
        const user = getUserContext(telegramId);
        const ownership = validateStrategyOwnership(user.id, strategyId);
        if (!ownership.ok) return ownership;
        if (ownership.strategy.status === 'active') return { ok: false, code: 'STRATEGY_ALREADY_ACTIVE' };

        const updated = updateStrategyStatus(ownership.strategyId, 'active', user.id);
        if (!updated) return { ok: false, code: 'STRATEGY_NOT_FOUND_OR_UNAUTHORIZED' };

        return { ok: true, code: 'OK', strategyId: ownership.strategyId };
    } catch (err) {
        return { ok: false, code: err.code || 'INTERNAL_ERROR' };
    }
}

module.exports = {
    validateStrategyOwnership,
    pauseStrategy,
    resumeStrategy,
};
