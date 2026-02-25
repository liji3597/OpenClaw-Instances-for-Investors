const { findOrCreateUser } = require('../../db/database');
const { getTokenPrice, getTokenPrices, getKnownTokens, resolveToken } = require('../../solana/jupiter');
const { formatPrice, formatUSD } = require('../../portfolio/formatter');
const config = require('../../config');

/**
 * Register market-related commands
 */
function registerMarketCommands(bot) {
    // /price <token> — Get current price
    bot.onText(/\/price\s+(\w+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const symbol = match[1].toUpperCase();
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        const isZh = user.language === 'zh';

        const mint = resolveToken(symbol);
        if (!mint) {
            await bot.sendMessage(chatId, isZh ? `❌ 未识别的代币: ${symbol}` : `❌ Unknown token: ${symbol}`);
            return;
        }

        try {
            const price = await getTokenPrice(symbol);
            if (price === 0) {
                await bot.sendMessage(chatId, isZh ? `⚠️ 未能获取 ${symbol} 价格数据。` : `⚠️ Unable to fetch ${symbol} price.`);
                return;
            }
            await bot.sendMessage(chatId, formatPrice(symbol, price, user.language), { parse_mode: 'Markdown' });
        } catch (err) {
            await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
        }
    });

    // /market — Market overview of Solana tokens
    bot.onText(/\/market/, async (msg) => {
        const chatId = msg.chat.id;
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        const isZh = user.language === 'zh';

        await bot.sendMessage(chatId, isZh ? '⏳ 正在获取市场数据...' : '⏳ Loading market data...');

        try {
            const tokens = getKnownTokens();
            const mints = tokens.map(t => t.mint);
            const prices = await getTokenPrices(mints);

            const lines = [isZh ? '📊 *Solana 生态市场概览*\n' : '📊 *Solana Ecosystem Overview*\n'];

            for (const token of tokens) {
                const price = prices.get(token.mint) || 0;
                if (price > 0) {
                    lines.push(`*${token.symbol}*: ${formatUSD(price)}`);
                }
            }

            lines.push('');
            lines.push(isZh ? `_数据来源: Jupiter | 更新时间: ${new Date().toLocaleTimeString()}_` : `_Source: Jupiter | Updated: ${new Date().toLocaleTimeString()}_`);

            await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
        } catch (err) {
            await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
        }
    });
}

module.exports = { registerMarketCommands };
