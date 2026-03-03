#!/usr/bin/env node
/**
 * Check all active alerts against current prices
 * Usage: node check-prices.js
 * Outputs any triggered alerts.
 */
const path = require('path');
const sharedDir = path.resolve(__dirname, '..', '..', '..', 'shared');

const { initDatabase, getActiveAlertsForSystem, markAlertTriggeredOnce } = require(path.join(sharedDir, 'database'));
const { getTokenPrice } = require(path.join(sharedDir, 'price-service'));
const { formatUSD } = require(path.join(sharedDir, 'formatter'));

async function main() {
    initDatabase();

    // Security: verify this is a system-authorized call
    if (process.env.OPENCLAW_SYSTEM !== 'true' && !process.argv.includes('--system')) {
        console.error('❌ 未授权的系统调用 / Unauthorized system call');
        console.error('This script requires --system flag or OPENCLAW_SYSTEM=true');
        process.exit(1);
    }

    const alerts = getActiveAlertsForSystem();

    if (alerts.length === 0) {
        console.log('No active alerts to check.');
        return;
    }

    console.log(`Checking ${alerts.length} alerts...\n`);

    for (const alert of alerts) {
        const price = await getTokenPrice(alert.token_symbol);
        if (price === 0) continue;

        let triggered = false;
        if (alert.condition === 'above' && price >= alert.target_price) triggered = true;
        if (alert.condition === 'below' && price <= alert.target_price) triggered = true;

        if (triggered) {
            const marked = markAlertTriggeredOnce(alert.id);
            if (!marked) {
                continue;
            }

            const condStr = alert.condition === 'above' ? '高于/above' : '低于/below';
            console.log(`🚨 TRIGGERED: ${alert.token_symbol} (${formatUSD(price)}) ${condStr} ${formatUSD(alert.target_price)}`);
        }
    }

    console.log('\nDone.');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
