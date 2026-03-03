const { initDatabase, findOrCreateUser } = require('../database');
const { ERROR_CODES } = require('../errors');

function getUserContext(telegramId) {
    if (!telegramId) {
        const err = new Error(ERROR_CODES.MISSING_TELEGRAM_ID.en);
        err.code = 'MISSING_TELEGRAM_ID';
        throw err;
    }

    initDatabase();
    const user = findOrCreateUser(telegramId, '');

    return {
        id: user.id,
        telegramId: user.telegram_id,
        language: user.language || 'zh',
    };
}

module.exports = {
    getUserContext,
};
