const axios = require('axios');
const { createLogger } = require('./logger');
const { recordMetric } = require('./metrics');

const logger = createLogger('risk-service');
const RUGCHECK_BASE_URL = 'https://api.rugcheck.xyz/v1';
const CACHE_TTL_MS = 60 * 60 * 1000;
const riskCache = new Map();

function isValidMint(mint) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(mint || ''));
}

function formatRiskLabel(score) {
    const value = Number(score) || 0;
    if (value >= 500) return '🔴 High Risk';
    if (value >= 200) return '🟡 Medium Risk';
    return '🟢 Safe';
}

function normalizeWarnings(rawWarnings) {
    if (!Array.isArray(rawWarnings)) return [];

    return rawWarnings.map((warning) => {
        if (typeof warning === 'string') {
            return {
                level: 'unknown',
                message: warning,
                isCritical: /critical|high risk|scam|danger/i.test(warning),
            };
        }

        const level = String(warning.level || warning.severity || warning.risk || 'unknown').toLowerCase();
        const message = String(warning.message || warning.name || warning.title || 'Unknown warning');
        const isCritical = ['critical', 'high', 'danger', 'severe'].includes(level)
            || /critical|high risk|scam|danger/i.test(message);

        return { level, message, isCritical };
    });
}

function normalizeTopHolders(rawHolders) {
    if (!Array.isArray(rawHolders)) return [];

    return rawHolders.slice(0, 10).map((holder) => {
        if (typeof holder === 'string') {
            return { address: holder, percentage: null };
        }

        const address = holder.address || holder.wallet || holder.owner || 'unknown';
        const percentageRaw = holder.percentage ?? holder.pct ?? holder.share ?? holder.percent;
        const percentage = Number.isFinite(Number(percentageRaw)) ? Number(percentageRaw) : null;

        return { address, percentage };
    });
}

function normalizeReport(mint, data) {
    const score = Number(data?.score ?? data?.riskScore ?? data?.risk_score ?? 0) || 0;
    const warnings = normalizeWarnings(data?.warnings || data?.risks || data?.riskWarnings || []);
    const topHolders = normalizeTopHolders(data?.topHolders || data?.top_holders || data?.holders || []);

    return {
        mint,
        score,
        label: formatRiskLabel(score),
        warnings,
        topHolders,
        source: 'rugcheck',
        fetchedAt: new Date().toISOString(),
    };
}

function isHighRisk(report) {
    if (!report) return false;
    if ((Number(report.score) || 0) > 500) return true;
    return Array.isArray(report.warnings) && report.warnings.some((warning) => warning.isCritical);
}

async function fetchRiskReport(mint) {
    const startedAt = Date.now();

    try {
        const response = await axios.get(`${RUGCHECK_BASE_URL}/tokens/${mint}/report`, {
            timeout: 15000,
        });
        const latency = Date.now() - startedAt;
        recordMetric('api.latency.ms', latency, {
            provider: 'rugcheck',
            endpoint: '/tokens/{mint}/report',
        });

        return normalizeReport(mint, response.data || {});
    } catch (err) {
        const latency = Date.now() - startedAt;
        recordMetric('api.latency.ms', latency, {
            provider: 'rugcheck',
            endpoint: '/tokens/{mint}/report',
            status: 'error',
        });
        recordMetric('error.total', 1, { component: 'risk-service', scope: 'fetch' });

        logger.warn('Failed to fetch RugCheck report', {
            mint,
            reason: err.response?.data?.message || err.message,
        });

        return null;
    }
}

async function getTokenRiskReport(mint) {
    if (!isValidMint(mint)) {
        return null;
    }

    const now = Date.now();
    const cached = riskCache.get(mint);
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
        recordMetric('event.total', 1, { component: 'risk-service', operation: 'cache_hit' });
        return cached.report;
    }

    recordMetric('event.total', 1, { component: 'risk-service', operation: 'api_fetch' });
    const report = await fetchRiskReport(mint);
    if (!report) return null;

    riskCache.set(mint, {
        report,
        timestamp: now,
    });

    return report;
}

module.exports = {
    getTokenRiskReport,
    formatRiskLabel,
    isHighRisk,
};
