const axios = require('axios');
const { formatUSD } = require('./formatter');
const { createLogger } = require('./logger');
const { recordMetric } = require('./metrics');

const logger = createLogger('notifier');

function getBotToken() {
    return process.env.TELEGRAM_BOT_TOKEN || '';
}

function normalizeLang(lang) {
    return lang === 'en' ? 'en' : 'zh';
}

function formatAlertMessage(alert, currentPrice, lang = 'zh') {
    const safeLang = normalizeLang(lang);
    const symbol = alert.token_symbol || 'UNKNOWN';
    const alertType = alert.alert_type || 'price';
    const thresholdPercent = Number(alert.target_price) || 0;
    const avgCostBasis = Number(alert.avg_cost_basis) || 0;
    const pnlPercent = Number(alert.pnl_percent);
    const conditionText = alert.condition === 'above'
        ? (safeLang === 'zh' ? '高于 / above' : 'above / 高于')
        : (safeLang === 'zh' ? '低于 / below' : 'below / 低于');
    const targetPriceText = formatUSD(Number(alert.target_price) || 0);
    const currentPriceText = formatUSD(Number(currentPrice) || 0);
    const timestamp = alert.triggered_at || new Date().toISOString();

    if (alertType === 'stop_loss') {
        return [
            '🛑 止损警报 / Stop-Loss Alert',
            '',
            `${symbol} ${safeLang === 'zh' ? '跌幅达到' : 'drawdown reached'} ${thresholdPercent.toFixed(2)}%`,
            `${safeLang === 'zh' ? '成本价 / Avg Cost' : 'Avg Cost / 成本价'}: ${formatUSD(avgCostBasis)}`,
            `${safeLang === 'zh' ? '当前价格 / Current' : 'Current / 当前价格'}: ${currentPriceText}`,
            `${safeLang === 'zh' ? '收益率 / PnL' : 'PnL / 收益率'}: ${Number.isFinite(pnlPercent) ? `${pnlPercent.toFixed(2)}%` : '--'}`,
            '',
            `触发时间 / Triggered: ${timestamp}`,
        ].join('\n');
    }

    if (alertType === 'take_profit') {
        return [
            '🎯 止盈警报 / Take-Profit Alert',
            '',
            `${symbol} ${safeLang === 'zh' ? '涨幅达到' : 'gain reached'} ${thresholdPercent.toFixed(2)}%`,
            `${safeLang === 'zh' ? '成本价 / Avg Cost' : 'Avg Cost / 成本价'}: ${formatUSD(avgCostBasis)}`,
            `${safeLang === 'zh' ? '当前价格 / Current' : 'Current / 当前价格'}: ${currentPriceText}`,
            `${safeLang === 'zh' ? '收益率 / PnL' : 'PnL / 收益率'}: ${Number.isFinite(pnlPercent) ? `${pnlPercent.toFixed(2)}%` : '--'}`,
            '',
            `触发时间 / Triggered: ${timestamp}`,
        ].join('\n');
    }

    return [
        '🚨 价格警报 / Price Alert',
        '',
        `${symbol} ${conditionText} ${targetPriceText}`,
        `当前价格 / Current: ${currentPriceText}`,
        '',
        `触发时间 / Triggered: ${timestamp}`,
    ].join('\n');
}

function formatDcaExecutionMessage(strategy, executionResult = {}, lang = 'zh') {
    const safeLang = normalizeLang(lang);
    const sourceToken = strategy.source_token || 'USDC';
    const targetToken = strategy.target_token || 'UNKNOWN';
    const spent = Number(executionResult.spentUsd ?? strategy.amount ?? 0);
    const received = Number(executionResult.receivedAmount ?? 0);
    const price = Number(executionResult.price ?? 0);
    const timestamp = executionResult.timestamp || new Date().toISOString();

    return safeLang === 'zh'
        ? [
            '✅ DCA 模拟执行 / DCA Simulation',
            '',
            `策略 / Strategy: #${strategy.id} ${strategy.name || ''}`.trim(),
            `交易对 / Pair: ${sourceToken} -> ${targetToken}`,
            `投入 / Spent: ${formatUSD(spent)}`,
            `获得 / Received: ${received.toFixed(6)} ${targetToken}`,
            `执行价格 / Price: ${formatUSD(price)}`,
            '',
            `执行时间 / Executed: ${timestamp}`,
        ].join('\n')
        : [
            '✅ DCA Simulation / DCA 模拟执行',
            '',
            `Strategy: #${strategy.id} ${strategy.name || ''}`.trim(),
            `Pair: ${sourceToken} -> ${targetToken}`,
            `Spent: ${formatUSD(spent)}`,
            `Received: ${received.toFixed(6)} ${targetToken}`,
            `Price: ${formatUSD(price)}`,
            '',
            `Executed: ${timestamp}`,
        ].join('\n');
}

async function sendTelegramMessage(telegramId, text) {
    recordMetric('event.total', 1, { component: 'notifier', operation: 'send_telegram_message' });
    const token = getBotToken();
    if (!token) {
        logger.info('Skip sending message: TELEGRAM_BOT_TOKEN is not configured');
        return false;
    }
    if (!telegramId) {
        logger.info('Skip sending message: telegramId is empty');
        return false;
    }

    try {
        await axios.post(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
                chat_id: String(telegramId),
                text,
                disable_web_page_preview: true,
            },
            { timeout: 10000 }
        );
        recordMetric('notifier.sent.total', 1, { component: 'notifier' });
        return true;
    } catch (err) {
        const reason = err.response?.data?.description || err.message;
        recordMetric('error.total', 1, { component: 'notifier', scope: 'telegram_send' });
        logger.error('Telegram API sendMessage failed', {
            telegramId: String(telegramId),
            reason,
        });
        return false;
    }
}

async function sendAlertNotification(telegramId, alert, currentPrice) {
    try {
        const text = formatAlertMessage(alert, currentPrice, alert.language || 'zh');
        return await sendTelegramMessage(telegramId, text);
    } catch (err) {
        recordMetric('error.total', 1, { component: 'notifier', scope: 'send_alert_notification' });
        logger.error('sendAlertNotification failed', { reason: err.message });
        return false;
    }
}

async function sendDcaExecutionNotification(telegramId, strategy, executionResult) {
    try {
        const text = formatDcaExecutionMessage(strategy, executionResult, strategy.language || 'zh');
        return await sendTelegramMessage(telegramId, text);
    } catch (err) {
        recordMetric('error.total', 1, { component: 'notifier', scope: 'send_dca_notification' });
        logger.error('sendDcaExecutionNotification failed', { reason: err.message });
        return false;
    }
}

module.exports = {
    formatAlertMessage,
    sendAlertNotification,
    sendDcaExecutionNotification,
};
