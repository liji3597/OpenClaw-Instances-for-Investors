const LEVELS = {
    DEBUG: 10,
    INFO: 20,
    WARN: 30,
    ERROR: 40,
};

const DEFAULT_LEVEL = 'INFO';

function normalizeLevel(level) {
    const upper = String(level || '').toUpperCase();
    return LEVELS[upper] ? upper : DEFAULT_LEVEL;
}

function getCurrentLevel() {
    return normalizeLevel(process.env.LOG_LEVEL || DEFAULT_LEVEL);
}

function shouldLog(level) {
    return LEVELS[normalizeLevel(level)] >= LEVELS[getCurrentLevel()];
}

function normalizeMeta(meta) {
    if (meta === undefined) return undefined;
    if (meta === null) return null;
    if (meta instanceof Error) {
        return {
            name: meta.name,
            message: meta.message,
            stack: meta.stack,
        };
    }
    if (typeof meta === 'object') return meta;
    return { value: meta };
}

function writeLog(level, component, message, meta) {
    const safeLevel = normalizeLevel(level);
    if (!shouldLog(safeLevel)) return;

    const payload = {
        timestamp: new Date().toISOString(),
        level: safeLevel,
        component: component || 'app',
        message: String(message || ''),
    };

    const safeMeta = normalizeMeta(meta);
    if (safeMeta !== undefined) {
        payload.meta = safeMeta;
    }

    process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function debug(component, message, meta) {
    writeLog('DEBUG', component, message, meta);
}

function info(component, message, meta) {
    writeLog('INFO', component, message, meta);
}

function warn(component, message, meta) {
    writeLog('WARN', component, message, meta);
}

function error(component, message, meta) {
    writeLog('ERROR', component, message, meta);
}

function createLogger(component) {
    return {
        debug: (message, meta) => debug(component, message, meta),
        info: (message, meta) => info(component, message, meta),
        warn: (message, meta) => warn(component, message, meta),
        error: (message, meta) => error(component, message, meta),
    };
}

module.exports = {
    LEVELS,
    debug,
    info,
    warn,
    error,
    createLogger,
};
