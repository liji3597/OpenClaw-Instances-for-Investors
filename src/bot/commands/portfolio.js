const { findOrCreateUser, addWallet, getUserWallets, removeWallet } = require('../../db/database');
const { isValidAddress } = require('../../solana/wallet');
const { getPortfolio } = require('../../portfolio/tracker');
const { formatPortfolioSummary } = require('../../portfolio/formatter');

/**
 * Register portfolio-related commands
 */
function registerPortfolioCommands(bot) {
    // /portfolio — View portfolio summary
    bot.onText(/\/portfolio/, async (msg) => {
        const chatId = msg.chat.id;
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');

        await bot.sendMessage(chatId, user.language === 'zh' ? '⏳ 正在获取投资组合数据...' : '⏳ Loading portfolio data...');

        try {
            const portfolio = await getPortfolio(user.id);
            const formatted = formatPortfolioSummary(portfolio, user.language);
            await bot.sendMessage(chatId, formatted, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('Portfolio error:', err);
            await bot.sendMessage(chatId, `❌ ${user.language === 'zh' ? '获取组合数据失败' : 'Failed to load portfolio'}: ${err.message}`);
        }
    });

    // /addwallet <address> — Add a wallet
    bot.onText(/\/addwallet\s+(.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const address = match[1].trim();
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        const isZh = user.language === 'zh';

        if (!isValidAddress(address)) {
            await bot.sendMessage(chatId, isZh ? '❌ 无效的 Solana 地址，请检查后重试。' : '❌ Invalid Solana address. Please check and try again.');
            return;
        }

        const wallets = getUserWallets(user.id);
        if (wallets.length >= 5) {
            await bot.sendMessage(chatId, isZh ? '❌ 最多支持 5 个钱包。使用 /removewallet 移除旧钱包。' : '❌ Max 5 wallets. Use /removewallet to remove an old one.');
            return;
        }

        const added = addWallet(user.id, address);
        if (added) {
            await bot.sendMessage(chatId,
                isZh
                    ? `✅ 钱包已添加！\n\n地址: \`${address.slice(0, 6)}...${address.slice(-4)}\`\n\n使用 /portfolio 查看你的投资组合。`
                    : `✅ Wallet added!\n\nAddress: \`${address.slice(0, 6)}...${address.slice(-4)}\`\n\nUse /portfolio to view your holdings.`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await bot.sendMessage(chatId, isZh ? '⚠️ 该钱包已添加过。' : '⚠️ Wallet already added.');
        }
    });

    // /wallets — List all wallets
    bot.onText(/\/wallets/, async (msg) => {
        const chatId = msg.chat.id;
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        const wallets = getUserWallets(user.id);
        const isZh = user.language === 'zh';

        if (wallets.length === 0) {
            await bot.sendMessage(chatId, isZh ? '📭 还没有连接钱包。\n使用 /addwallet <地址> 添加。' : '📭 No wallets connected.\nUse /addwallet <address> to add one.');
            return;
        }

        const lines = [isZh ? '💼 *已连接的钱包*\n' : '💼 *Connected Wallets*\n'];
        wallets.forEach((w, i) => {
            lines.push(`${i + 1}. \`${w.address.slice(0, 6)}...${w.address.slice(-4)}\`${w.label ? ` (${w.label})` : ''}`);
        });
        lines.push(`\n${isZh ? '共' : 'Total'} ${wallets.length} ${isZh ? '个钱包' : 'wallets'}`);

        await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
    });

    // /removewallet <address> — Remove a wallet
    bot.onText(/\/removewallet\s+(.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const address = match[1].trim();
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        const isZh = user.language === 'zh';

        const removed = removeWallet(user.id, address);
        if (removed) {
            await bot.sendMessage(chatId, isZh ? '✅ 钱包已移除。' : '✅ Wallet removed.');
        } else {
            await bot.sendMessage(chatId, isZh ? '⚠️ 未找到该钱包。' : '⚠️ Wallet not found.');
        }
    });
}

module.exports = { registerPortfolioCommands };
