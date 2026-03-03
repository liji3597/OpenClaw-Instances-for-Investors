const {
    initDatabase,
    findOrCreateUser: dbFindOrCreateUser,
    getUserWallets: dbGetUserWallets,
    addWallet: dbAddWallet,
    removeWallet: dbRemoveWallet,
} = require('../database');
const { ERROR_CODES } = require('../errors');

function getUserContext(telegramId) {
    if (!telegramId) {
        const err = new Error(ERROR_CODES.MISSING_TELEGRAM_ID.en);
        err.code = 'MISSING_TELEGRAM_ID';
        throw err;
    }

    initDatabase();
    const user = dbFindOrCreateUser(telegramId, '');

    return {
        id: user.id,
        telegramId: user.telegram_id,
        language: user.language || 'zh',
    };
}

function findOrCreateUser(telegramId, username = '') {
    initDatabase();
    return dbFindOrCreateUser(telegramId, username);
}

function getUserWallets(userId) {
    initDatabase();
    return dbGetUserWallets(userId);
}

function addWallet(userId, address, label) {
    initDatabase();
    return dbAddWallet(userId, address, label);
}

function removeWallet(userId, address) {
    initDatabase();
    return dbRemoveWallet(userId, address);
}

module.exports = {
    getUserContext,
    findOrCreateUser,
    getUserWallets,
    addWallet,
    removeWallet,
};
