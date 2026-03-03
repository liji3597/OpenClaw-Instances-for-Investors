#!/usr/bin/env node
/**
 * Check all active alerts against current prices
 * Usage: node check-prices.js [--system] [--lang zh|en]
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { getActiveAlertsForSystem, markAlertTriggeredOnce } = require(path.join(sharedDir, 'services'));
const { formatError } = require(path.join(sharedDir, 'errors'));
const { getTokenPrice } = require(path.join(sharedDir, 'price-service'));
const { formatUSD } = require(path.join(sharedDir, 'formatter'));

const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'zh';

async function main() {
    // Security: verify this is a system-authorized call
    if (process.env.OPENCLAW_SYSTEM !== 'true' && !process.argv.includes('--system')) {
        console.log(`❌ ${formatError('INTERNAL_ERROR', lang)}: ${lang === 'zh' ? '未授权的系统调用' : 'Unauthorized system call'}`);
        process.exit(1);
    }

    if (typeof getActiveAlertsForSystem !== 'function' || typeof markAlertTriggeredOnce !== 'function') {
        console.log(`❌ ${formatError('INTERNAL_ERROR', lang)}`);
        process.exit(1);
    }

    const alerts = getActiveAlertsForSystem();
    if (!alerts || alerts.length === 0) {
        console.log('📭 暂无活跃警报 / No active alerts');
        process.exit(0);
    }

    for (const alert of alerts) {
        const price = await getTokenPrice(alert.token_mint || alert.token_symbol);
        if (!Number.isFinite(price) || price <= 0) continue;

        const triggered = alert.condition === 'above'
            ? price >= alert.target_price
            : price <= alert.target_price;

        if (!triggered) continue;

        const marked = markAlertTriggeredOnce(alert.id);
        if (!marked) continue;

        const condStr = alert.condition === 'above' ? '高于 / above' : '低于 / below';
        console.log(`🚨 TRIGGERED: ${alert.token_symbol} ${condStr} ${formatUSD(alert.target_price)} (current: ${formatUSD(price)})`);
    }
}

main().catch((err) => {
    console.log(`❌ ${formatError(err.code || 'INTERNAL_ERROR', lang)}`);
    process.exit(1);
});
