const { getActiveAlerts, triggerAlert } = require('../db/database');
const { getTokenPrices } = require('../solana/jupiter');
const config = require('../config');

let monitoringInterval = null;

/**
 * Start the price alert monitoring loop
 * @param {Function} notifyFn - async (telegramId, message) => void
 */
function startAlertMonitor(notifyFn) {
    console.log(`🔔 Alert monitor started (checking every ${config.priceCheckInterval / 1000}s)`);

    monitoringInterval = setInterval(async () => {
        await checkAlerts(notifyFn);
    }, config.priceCheckInterval);

    // Also check immediately
    checkAlerts(notifyFn).catch(console.error);
}

/**
 * Check all active alerts against current prices
 * @param {Function} notifyFn
 */
async function checkAlerts(notifyFn) {
    const alerts = getActiveAlerts();
    if (alerts.length === 0) return;

    // Collect unique mints
    const mints = [...new Set(alerts.map(a => a.token_mint))];
    const prices = await getTokenPrices(mints);

    for (const alert of alerts) {
        const price = prices.get(alert.token_mint);
        if (price === undefined || price === 0) continue;

        let triggered = false;

        if (alert.condition === 'above' && price >= alert.target_price) {
            triggered = true;
        } else if (alert.condition === 'below' && price <= alert.target_price) {
            triggered = true;
        }

        if (triggered) {
            triggerAlert(alert.id);

            const condStr = alert.condition === 'above' ? '📈 突破' : '📉 跌破';
            const message =
                `🔔 *价格警报触发！*\n\n` +
                `${condStr} ${alert.token_symbol}\n` +
                `目标价: $${alert.target_price}\n` +
                `当前价: $${price.toFixed(4)}\n\n` +
                `此警报已自动关闭。`;

            // Need to get user's telegram ID
            const db = require('../db/database');
            const user = db.getDb().prepare('SELECT telegram_id FROM users WHERE id = ?').get(alert.user_id);
            if (user) {
                await notifyFn(user.telegram_id, message).catch(err => {
                    console.error(`Failed to send alert to ${user.telegram_id}:`, err.message);
                });
            }
        }
    }
}

/**
 * Stop the alert monitoring loop
 */
function stopAlertMonitor() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
        console.log('Alert monitor stopped');
    }
}

module.exports = {
    startAlertMonitor,
    stopAlertMonitor,
};
