const WINDOW_MS = 24 * 60 * 60 * 1000;
const metricStore = [];

function nowMs() {
    return Date.now();
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeLabels(labels) {
    if (!labels || typeof labels !== 'object') return {};
    return { ...labels };
}

function pruneOld(now = nowMs()) {
    const minTs = now - WINDOW_MS;
    while (metricStore.length > 0 && metricStore[0].timestamp < minTs) {
        metricStore.shift();
    }
}

function recordMetric(name, value = 1, labels = {}) {
    const timestamp = nowMs();
    pruneOld(timestamp);

    metricStore.push({
        name: String(name || ''),
        value: toNumber(value),
        labels: normalizeLabels(labels),
        timestamp,
    });
}

function sumByName(name) {
    return metricStore
        .filter((item) => item.name === name)
        .reduce((total, item) => total + item.value, 0);
}

function groupLatencyByProvider() {
    const grouped = new Map();

    for (const item of metricStore) {
        if (item.name !== 'api.latency.ms') continue;
        const provider = item.labels.provider || 'unknown';
        const endpoint = item.labels.endpoint || 'unknown';
        const key = `${provider}:${endpoint}`;

        if (!grouped.has(key)) {
            grouped.set(key, {
                provider,
                endpoint,
                count: 0,
                totalMs: 0,
                maxMs: 0,
            });
        }

        const bucket = grouped.get(key);
        bucket.count += 1;
        bucket.totalMs += item.value;
        bucket.maxMs = Math.max(bucket.maxMs, item.value);
    }

    return [...grouped.values()].map((bucket) => ({
        provider: bucket.provider,
        endpoint: bucket.endpoint,
        count: bucket.count,
        avgMs: bucket.count > 0 ? Number((bucket.totalMs / bucket.count).toFixed(2)) : 0,
        maxMs: Number(bucket.maxMs.toFixed(2)),
    }));
}

function getErrorRateByComponent() {
    const componentTotals = new Map();
    const componentErrors = new Map();

    for (const item of metricStore) {
        if (item.name === 'event.total') {
            const component = item.labels.component || 'unknown';
            componentTotals.set(component, (componentTotals.get(component) || 0) + item.value);
        }
        if (item.name === 'error.total') {
            const component = item.labels.component || 'unknown';
            componentErrors.set(component, (componentErrors.get(component) || 0) + item.value);
        }
    }

    const components = new Set([...componentTotals.keys(), ...componentErrors.keys()]);
    const rows = [];

    for (const component of components) {
        const total = componentTotals.get(component) || 0;
        const errors = componentErrors.get(component) || 0;
        const rate = total > 0 ? errors / total : (errors > 0 ? 1 : 0);

        rows.push({
            component,
            totalEvents: total,
            errors,
            errorRate: Number(rate.toFixed(4)),
        });
    }

    return rows.sort((a, b) => b.errorRate - a.errorRate);
}

function getMetricsSummary() {
    pruneOld(nowMs());

    const checks = sumByName('alert.check.total');
    const triggered = sumByName('alert.trigger.total');

    return {
        windowHours: 24,
        sampleCount: metricStore.length,
        alertTriggerRate: {
            checked: checks,
            triggered,
            rate: checks > 0 ? Number((triggered / checks).toFixed(4)) : 0,
        },
        dcaExecutionCount: sumByName('dca.execution.total'),
        apiCallLatency: groupLatencyByProvider(),
        errorRateByComponent: getErrorRateByComponent(),
    };
}

module.exports = {
    recordMetric,
    getMetricsSummary,
};
