const { findOrCreateUser, createAlert, getActiveAlerts, deleteAlert } = require('../../db/database');
const { resolveToken } = require('../../solana/jupiter');
const { formatAlert, formatUSD } = require('../../portfolio/formatter');

/**
 * Register alert-related commands
 */
function registerAlertCommands(bot) {
    // /alert <token> <above|below> <price> — Create a price alert
    bot.onText(/\/alert\s+(\w+)\s+(above|below|高于|低于)\s+([\d.]+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const tokenSymbol = match[1].toUpperCase();
        const rawCondition = match[2].toLowerCase();
        const targetPrice = parseFloat(match[3]);
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        const isZh = user.language === 'zh';

        const condition = (rawCondition === '高于' || rawCondition === 'above') ? 'above' : 'below';
        const mint = resolveToken(tokenSymbol);

        if (!mint) {
            await bot.sendMessage(chatId, isZh ? `❌ 未识别的代币: ${tokenSymbol}` : `❌ Unknown token: ${tokenSymbol}`);
            return;
        }

        if (isNaN(targetPrice) || targetPrice <= 0) {
            await bot.sendMessage(chatId, isZh ? '❌ 请输入有效的价格。' : '❌ Please enter a valid price.');
            return;
        }

        // Check alert limit
        const existing = getActiveAlerts(user.id);
        if (existing.length >= 20) {
            await bot.sendMessage(chatId, isZh ? '❌ 最多设置 20 个警报。使用 /deletealert 删除旧警报。' : '❌ Max 20 alerts. Use /deletealert to remove old ones.');
            return;
        }

        const alertId = createAlert(user.id, tokenSymbol, mint, condition, targetPrice);
        const condStr = condition === 'above' ? (isZh ? '高于' : 'above') : (isZh ? '低于' : 'below');

        await bot.sendMessage(chatId,
            isZh
                ? `🔔 *警报已设置！*\n\nID: #${alertId}\n代币: ${tokenSymbol}\n条件: ${condStr} ${formatUSD(targetPrice)}\n\n当条件满足时将自动通知你。`
                : `🔔 *Alert Created!*\n\nID: #${alertId}\nToken: ${tokenSymbol}\nCondition: ${condStr} ${formatUSD(targetPrice)}\n\nYou'll be notified when triggered.`,
            { parse_mode: 'Markdown' }
        );
    });

    // /alerts — List active alerts
    bot.onText(/\/alerts$/, async (msg) => {
        const chatId = msg.chat.id;
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        const alerts = getActiveAlerts(user.id);
        const isZh = user.language === 'zh';

        if (alerts.length === 0) {
            await bot.sendMessage(chatId,
                isZh
                    ? '📭 没有活跃的警报。\n\n使用 /alert <代币> <above|below> <价格> 创建。\n示例: /alert SOL above 200'
                    : '📭 No active alerts.\n\nUse /alert <token> <above|below> <price> to create.\nExample: /alert SOL above 200'
            );
            return;
        }

        const lines = [isZh ? '🔔 *活跃警报*\n' : '🔔 *Active Alerts*\n'];
        for (const a of alerts) {
            lines.push(formatAlert(a, user.language));
        }
        lines.push(`\n${isZh ? '使用' : 'Use'} /deletealert <ID> ${isZh ? '删除' : 'to delete'}`);
        await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
    });

    // /deletealert <id> — Delete an alert
    bot.onText(/\/deletealert\s+(\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const alertId = parseInt(match[1], 10);
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        const isZh = user.language === 'zh';

        const deleted = deleteAlert(alertId, user.id);
        if (deleted) {
            await bot.sendMessage(chatId, isZh ? `✅ 警报 #${alertId} 已删除。` : `✅ Alert #${alertId} deleted.`);
        } else {
            await bot.sendMessage(chatId, isZh ? '❌ 警报不存在。' : '❌ Alert not found.');
        }
    });
}

module.exports = { registerAlertCommands };
