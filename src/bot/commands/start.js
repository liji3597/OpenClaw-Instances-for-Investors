const { findOrCreateUser, updateUserProfile } = require('../../db/database');
const { formatWelcome, formatHelp } = require('../../portfolio/formatter');

/**
 * Register /start and /help command handlers
 */
function registerStartCommands(bot) {
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        await bot.sendMessage(chatId, formatWelcome(user.language), { parse_mode: 'Markdown' });
    });

    bot.onText(/\/help/, async (msg) => {
        const chatId = msg.chat.id;
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        await bot.sendMessage(chatId, formatHelp(user.language), { parse_mode: 'Markdown' });
    });

    bot.onText(/\/lang\s+(\w+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const lang = match[1].toLowerCase();
        if (lang !== 'zh' && lang !== 'en') {
            await bot.sendMessage(chatId, '⚠️ Supported: zh (中文), en (English)');
            return;
        }
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        updateUserProfile(user.id, { language: lang });
        const langName = lang === 'zh' ? '中文' : 'English';
        await bot.sendMessage(chatId, `✅ Language switched to ${langName}`);
    });
}

module.exports = { registerStartCommands };
