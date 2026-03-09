'use strict';

const DEFAULT_MAX_WHITELIST_USERS = 10;

class InMemoryWhitelistRepository {
    constructor(initialUserIds = []) {
        this.userIds = new Set();
        for (const userId of initialUserIds || []) {
            if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
                this.userIds.add(String(userId).trim());
            }
        }
    }

    hasUser(userId) {
        return this.userIds.has(String(userId));
    }

    listUsers() {
        return [...this.userIds];
    }

    countUsers() {
        return this.userIds.size;
    }

    addUser(userId) {
        this.userIds.add(String(userId));
    }

    removeUser(userId) {
        this.userIds.delete(String(userId));
    }

    clearUsers() {
        this.userIds.clear();
    }
}

class PostgresWhitelistRepository {
    constructor(options = {}) {
        this.pool = options.pool || null;
    }

    hasUser() {
        throw new Error('PostgresWhitelistRepository.hasUser is not implemented yet.');
    }

    listUsers() {
        throw new Error('PostgresWhitelistRepository.listUsers is not implemented yet.');
    }

    countUsers() {
        throw new Error('PostgresWhitelistRepository.countUsers is not implemented yet.');
    }

    addUser() {
        throw new Error('PostgresWhitelistRepository.addUser is not implemented yet.');
    }

    removeUser() {
        throw new Error('PostgresWhitelistRepository.removeUser is not implemented yet.');
    }

    clearUsers() {
        throw new Error('PostgresWhitelistRepository.clearUsers is not implemented yet.');
    }
}

class WhitelistService {
    constructor(options = {}) {
        this.whitelistEnabled = options.whitelistEnabled === true;
        this.maxUsers = Number.isInteger(options.maxUsers) && options.maxUsers > 0
            ? options.maxUsers
            : DEFAULT_MAX_WHITELIST_USERS;
        this.repository = options.repository || new InMemoryWhitelistRepository(options.initialUserIds || []);
    }

    setEnabled(enabled) {
        this.whitelistEnabled = enabled === true;
        return this.whitelistEnabled;
    }

    isEnabled() {
        return this.whitelistEnabled;
    }

    listUsers() {
        return this.repository.listUsers();
    }

    addUser(userId) {
        const normalized = this._normalizeRequiredUserId(userId);
        if (this.repository.hasUser(normalized)) {
            return {
                added: false,
                userId: normalized,
                whitelistSize: this.repository.countUsers(),
                whitelistCap: this.maxUsers,
            };
        }

        const count = this.repository.countUsers();
        if (count >= this.maxUsers) {
            const err = new Error(`Whitelist capacity exceeded: ${count}/${this.maxUsers}`);
            err.code = 'WHITELIST_CAPACITY_EXCEEDED';
            throw err;
        }

        this.repository.addUser(normalized);
        return {
            added: true,
            userId: normalized,
            whitelistSize: this.repository.countUsers(),
            whitelistCap: this.maxUsers,
        };
    }

    removeUser(userId) {
        const normalized = this._normalizeRequiredUserId(userId);
        const existed = this.repository.hasUser(normalized);
        this.repository.removeUser(normalized);
        return {
            removed: existed,
            userId: normalized,
            whitelistSize: this.repository.countUsers(),
            whitelistCap: this.maxUsers,
        };
    }

    clearUsers() {
        this.repository.clearUsers();
        return {
            cleared: true,
            whitelistSize: this.repository.countUsers(),
            whitelistCap: this.maxUsers,
        };
    }

    checkAccess(userId) {
        const normalized = this._normalizeRequiredUserId(userId);
        const whitelistSize = this.repository.countUsers();

        if (!this.whitelistEnabled) {
            return {
                allowed: true,
                code: 'WHITELIST_DISABLED',
                message: 'Whitelist check is disabled.',
                userId: normalized,
                whitelistEnabled: false,
                whitelistSize,
                whitelistCap: this.maxUsers,
            };
        }

        const allowed = this.repository.hasUser(normalized);
        return {
            allowed,
            code: allowed ? 'WHITELIST_ALLOWED' : 'USER_NOT_WHITELISTED',
            message: allowed ? 'User is whitelisted.' : 'User is not whitelisted.',
            userId: normalized,
            whitelistEnabled: true,
            whitelistSize,
            whitelistCap: this.maxUsers,
        };
    }

    _normalizeRequiredUserId(userId) {
        const normalized = String(userId || '').trim();
        if (!normalized) {
            const err = new Error('userId is required.');
            err.code = 'MISSING_USER_ID';
            throw err;
        }
        return normalized;
    }
}

module.exports = WhitelistService;
module.exports.DEFAULT_MAX_WHITELIST_USERS = DEFAULT_MAX_WHITELIST_USERS;
module.exports.InMemoryWhitelistRepository = InMemoryWhitelistRepository;
module.exports.PostgresWhitelistRepository = PostgresWhitelistRepository;
