const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');

let db = null;

/**
 * Initialize SQLite database and create tables
 */
function initDatabase() {
    const dbDir = path.dirname(config.databasePath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(config.databasePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Create tables
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      language TEXT DEFAULT 'zh',
      risk_profile TEXT DEFAULT 'moderate',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      address TEXT NOT NULL,
      label TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, address)
    );

    CREATE TABLE IF NOT EXISTS price_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_symbol TEXT NOT NULL,
      token_mint TEXT NOT NULL,
      condition TEXT NOT NULL CHECK(condition IN ('above', 'below')),
      target_price REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      triggered_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dca_strategies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT,
      source_token TEXT NOT NULL DEFAULT 'USDC',
      target_token TEXT NOT NULL,
      amount REAL NOT NULL,
      cron_expression TEXT NOT NULL,
      slippage_bps INTEGER DEFAULT 50,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'failed')),
      last_executed_at DATETIME,
      total_executed INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      total_received REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      strategy_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('dca', 'rebalance', 'swap', 'alert_trigger')),
      from_token TEXT,
      to_token TEXT,
      from_amount REAL,
      to_amount REAL,
      price_at_execution REAL,
      tx_signature TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed')),
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (strategy_id) REFERENCES dca_strategies(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_dca_status ON dca_strategies(status);
    CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
  `);

    console.log('✅ Database initialized');
    return db;
}

/**
 * Get database instance
 */
function getDb() {
    if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
    return db;
}

// ===== User Operations =====

function findOrCreateUser(telegramId, username) {
    const existing = getDb().prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
    if (existing) return existing;

    const result = getDb().prepare(
        'INSERT INTO users (telegram_id, username) VALUES (?, ?)'
    ).run(telegramId, username);

    return getDb().prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

function updateUserProfile(userId, { language, risk_profile }) {
    const updates = [];
    const values = [];
    if (language) { updates.push('language = ?'); values.push(language); }
    if (risk_profile) { updates.push('risk_profile = ?'); values.push(risk_profile); }
    if (updates.length === 0) return;
    values.push(userId);
    getDb().prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
}

// ===== Wallet Operations =====

function addWallet(userId, address, label) {
    try {
        getDb().prepare('INSERT INTO wallets (user_id, address, label) VALUES (?, ?, ?)').run(userId, address, label);
        return true;
    } catch (err) {
        if (err.message.includes('UNIQUE')) return false; // already exists
        throw err;
    }
}

function getUserWallets(userId) {
    return getDb().prepare('SELECT * FROM wallets WHERE user_id = ?').all(userId);
}

function removeWallet(userId, address) {
    const result = getDb().prepare('DELETE FROM wallets WHERE user_id = ? AND address = ?').run(userId, address);
    return result.changes > 0;
}

// ===== Price Alert Operations =====

function createAlert(userId, tokenSymbol, tokenMint, condition, targetPrice) {
    const result = getDb().prepare(
        'INSERT INTO price_alerts (user_id, token_symbol, token_mint, condition, target_price) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, tokenSymbol, tokenMint, condition, targetPrice);
    return result.lastInsertRowid;
}

function getActiveAlerts(userId) {
    if (userId) {
        return getDb().prepare('SELECT * FROM price_alerts WHERE user_id = ? AND is_active = 1').all(userId);
    }
    return getDb().prepare('SELECT * FROM price_alerts WHERE is_active = 1').all();
}

function triggerAlert(alertId) {
    getDb().prepare('UPDATE price_alerts SET is_active = 0, triggered_at = CURRENT_TIMESTAMP WHERE id = ?').run(alertId);
}

function deleteAlert(alertId, userId) {
    const result = getDb().prepare('DELETE FROM price_alerts WHERE id = ? AND user_id = ?').run(alertId, userId);
    return result.changes > 0;
}

// ===== DCA Strategy Operations =====

function createDcaStrategy(userId, { name, source_token, target_token, amount, cron_expression, slippage_bps }) {
    const result = getDb().prepare(
        `INSERT INTO dca_strategies (user_id, name, source_token, target_token, amount, cron_expression, slippage_bps)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, name, source_token || 'USDC', target_token, amount, cron_expression, slippage_bps || 50);
    return result.lastInsertRowid;
}

function getUserStrategies(userId) {
    return getDb().prepare('SELECT * FROM dca_strategies WHERE user_id = ?').all(userId);
}

function getActiveStrategies() {
    return getDb().prepare('SELECT ds.*, u.telegram_id FROM dca_strategies ds JOIN users u ON ds.user_id = u.id WHERE ds.status = ?').all('active');
}

function updateStrategyStatus(strategyId, status) {
    getDb().prepare('UPDATE dca_strategies SET status = ? WHERE id = ?').run(status, strategyId);
}

function recordStrategyExecution(strategyId, spent, received) {
    getDb().prepare(
        `UPDATE dca_strategies SET
       last_executed_at = CURRENT_TIMESTAMP,
       total_executed = total_executed + 1,
       total_spent = total_spent + ?,
       total_received = total_received + ?
     WHERE id = ?`
    ).run(spent, received, strategyId);
}

// ===== Transaction Operations =====

function recordTransaction(userId, { strategy_id, type, from_token, to_token, from_amount, to_amount, price_at_execution, tx_signature, status, error_message }) {
    const result = getDb().prepare(
        `INSERT INTO transactions (user_id, strategy_id, type, from_token, to_token, from_amount, to_amount, price_at_execution, tx_signature, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, strategy_id || null, type, from_token, to_token, from_amount, to_amount, price_at_execution, tx_signature, status || 'pending', error_message || null);
    return result.lastInsertRowid;
}

function getUserTransactions(userId, limit = 20) {
    return getDb().prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
}

function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        console.log('Database closed');
    }
}

module.exports = {
    initDatabase,
    getDb,
    closeDatabase,
    // Users
    findOrCreateUser,
    updateUserProfile,
    // Wallets
    addWallet,
    getUserWallets,
    removeWallet,
    // Alerts
    createAlert,
    getActiveAlerts,
    triggerAlert,
    deleteAlert,
    // DCA
    createDcaStrategy,
    getUserStrategies,
    getActiveStrategies,
    updateStrategyStatus,
    recordStrategyExecution,
    // Transactions
    recordTransaction,
    getUserTransactions,
    // Lifecycle
    closeDatabase,
};
