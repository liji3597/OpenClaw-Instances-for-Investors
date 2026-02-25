const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const { parseIntent } = require('./nlp');
const { registerStartCommands } = require('./commands/start');
const { registerPortfolioCommands } = require('./commands/portfolio');
const { registerStrategyCommands, handleDcaSetup } = require('./commands/strategy');
const { registerAlertCommands } = require('./commands/alerts');
const { registerMarketCommands } = require('./commands/market');
const { findOrCreateUser } = require('../db/database');
const { getPortfolio } = require('../portfolio/tracker');
const { formatPortfolioSummary, formatPrice } = require('../portfolio/formatter');
const { getTokenPrice, resolveToken } = require('../solana/jupiter');

/**
 * Create and configure the Telegram bot
 * @returns {{ bot: TelegramBot, notifyFn: Function }}
 */
function createBot() {
    const bot = new TelegramBot(config.telegramToken, { polling: true });

    // Notification function for strategies/alerts to send messages
    const notifyFn = async (telegramId, message) => {
        try {
            await bot.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error(`Failed to notify ${telegramId}:`, err.message);
        }
    };

    // Register all command handlers
    registerStartCommands(bot);
    registerPortfolioCommands(bot);
    const dcaSetup = registerStrategyCommands(bot, notifyFn);
    registerAlertCommands(bot);
    registerMarketCommands(bot);

    // Handle natural language messages (non-command text)
    bot.on('message', async (msg) => {
        // Skip commands (already handled by onText)
        if (!msg.text || msg.text.startsWith('/')) return;

        const chatId = msg.chat.id;

        // Check if DCA setup wizard is active for this user
        if (dcaSetup.has(chatId)) {
            const handled = handleDcaSetup(bot, msg, dcaSetup, notifyFn);
            if (handled) return;
        }

        // Try NLP parsing
        const intent = parseIntent(msg.text);
        if (!intent) return; // No recognized intent, ignore

        const user = findOrCreateUser(String(chatId), msg.from?.username || '');

        try {
            switch (intent.intent) {
                case 'portfolio': {
                    await bot.sendMessage(chatId, user.language === 'zh' ? '⏳ 正在获取投资组合数据...' : '⏳ Loading portfolio data...');
                    const portfolio = await getPortfolio(user.id);
                    await bot.sendMessage(chatId, formatPortfolioSummary(portfolio, user.language), { parse_mode: 'Markdown' });
                    break;
                }

                case 'price': {
                    if (intent.token) {
                        const price = await getTokenPrice(intent.token);
                        if (price > 0) {
                            await bot.sendMessage(chatId, formatPrice(intent.token, price, user.language), { parse_mode: 'Markdown' });
                        } else {
                            await bot.sendMessage(chatId, `⚠️ ${user.language === 'zh' ? '未能获取价格' : 'Could not get price'}: ${intent.token}`);
                        }
                    }
                    break;
                }

                case 'market':
                    bot.emit('text', msg);
                    break;

                case 'addwallet':
                    if (intent.address) {
                        msg.text = `/addwallet ${intent.address}`;
                        bot.emit('text', msg);
                    }
                    break;

                case 'dca':
                    msg.text = '/dca';
                    bot.emit('text', msg);
                    break;

                case 'strategies':
                    msg.text = '/strategies';
                    bot.emit('text', msg);
                    break;

                case 'alert':
                    await bot.sendMessage(chatId,
                        user.language === 'zh'
                            ? '🔔 设置价格警报格式:\n/alert <代币> <above|below> <价格>\n\n示例: /alert SOL above 200'
                            : '🔔 Alert format:\n/alert <token> <above|below> <price>\n\nExample: /alert SOL above 200'
                    );
                    break;

                case 'help':
                    msg.text = '/help';
                    bot.emit('text', msg);
                    break;

                default:
                    break;
            }
        } catch (err) {
            console.error('NLP handler error:', err);
        }
    });

    // Error handling
    bot.on('polling_error', (err) => {
        console.error('Telegram polling error:', err.message);
    });

    console.log('🤖 Telegram bot started');
    return { bot, notifyFn };
}

module.exports = { createBot };
