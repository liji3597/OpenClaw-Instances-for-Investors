/**
 * Format portfolio data into readable Telegram messages
 */

/**
 * Format a number as USD currency
 */
function formatUSD(value) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    if (value >= 1) return `$${value.toFixed(2)}`;
    return `$${value.toFixed(4)}`;
}

/**
 * Format a number with appropriate precision
 */
function formatAmount(amount) {
    if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(2) + 'M';
    if (amount >= 1_000) return (amount / 1_000).toFixed(2) + 'K';
    if (amount >= 1) return amount.toFixed(4);
    return amount.toFixed(6);
}

/**
 * Get a percentage bar visualization
 */
function percentBar(pct) {
    const filled = Math.round(pct / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

/**
 * Format portfolio summary for Telegram
 * @param {object} portfolio - from tracker.getPortfolio()
 * @param {string} lang - 'zh' or 'en'
 * @returns {string} formatted message
 */
function formatPortfolioSummary(portfolio, lang = 'zh') {
    if (portfolio.isEmpty) {
        return lang === 'zh'
            ? '📭 还没有连接钱包。\n\n使用 /addwallet <地址> 添加你的 Solana 钱包。'
            : '📭 No wallets connected.\n\nUse /addwallet <address> to add your Solana wallet.';
    }

    const isZh = lang === 'zh';
    const lines = [];

    lines.push(isZh ? '💰 *投资组合概览*' : '💰 *Portfolio Overview*');
    lines.push('');
    lines.push(`${isZh ? '总资产' : 'Total Value'}: *${formatUSD(portfolio.totalValue)}*`);
    lines.push(`${isZh ? '钱包数量' : 'Wallets'}: ${portfolio.walletCount}`);
    lines.push(`${isZh ? '代币种类' : 'Tokens'}: ${portfolio.holdings.length}`);
    lines.push('');
    lines.push(isZh ? '📊 *资产分布*' : '📊 *Asset Distribution*');
    lines.push('');

    // Show top 10 holdings
    const top = portfolio.holdings.slice(0, 10);
    for (const h of top) {
        const pctStr = h.percentage.toFixed(1) + '%';
        lines.push(
            `*${h.symbol}*  ${formatAmount(h.amount)}\n` +
            `  ${percentBar(h.percentage)} ${pctStr}  (${formatUSD(h.value)})`
        );
    }

    if (portfolio.holdings.length > 10) {
        const rest = portfolio.holdings.slice(10);
        const restValue = rest.reduce((s, h) => s + h.value, 0);
        lines.push(`\n...${isZh ? '其他' : 'Others'} ${rest.length} ${isZh ? '个代币' : 'tokens'} (${formatUSD(restValue)})`);
    }

    return lines.join('\n');
}

/**
 * Format token detail for Telegram
 */
function formatTokenDetail(holding, lang = 'zh') {
    const isZh = lang === 'zh';
    const lines = [];
    lines.push(`🪙 *${holding.symbol}*`);
    lines.push('');
    lines.push(`${isZh ? '数量' : 'Amount'}: ${formatAmount(holding.amount)}`);
    lines.push(`${isZh ? '价格' : 'Price'}: ${formatUSD(holding.price)}`);
    lines.push(`${isZh ? '价值' : 'Value'}: ${formatUSD(holding.value)}`);
    lines.push(`${isZh ? '占比' : 'Share'}: ${holding.percentage.toFixed(1)}%`);
    return lines.join('\n');
}

/**
 * Format price information
 */
function formatPrice(symbol, price, lang = 'zh') {
    const isZh = lang === 'zh';
    return `💲 *${symbol}* ${isZh ? '当前价格' : 'Current Price'}: ${formatUSD(price)}`;
}

/**
 * Format DCA strategy info
 */
function formatStrategy(strategy, lang = 'zh') {
    const isZh = lang === 'zh';
    const statusEmoji = strategy.status === 'active' ? '🟢' : strategy.status === 'paused' ? '🟡' : '🔴';
    const lines = [];
    lines.push(`${statusEmoji} *${strategy.name || `DCA #${strategy.id}`}*`);
    lines.push(`  ${isZh ? '每次买入' : 'Amount'}: ${strategy.amount} ${strategy.source_token} → ${strategy.target_token}`);
    lines.push(`  ${isZh ? '频率' : 'Schedule'}: ${describeCron(strategy.cron_expression, lang)}`);
    lines.push(`  ${isZh ? '状态' : 'Status'}: ${strategy.status}`);
    if (strategy.total_executed > 0) {
        lines.push(`  ${isZh ? '已执行' : 'Executed'}: ${strategy.total_executed} ${isZh ? '次' : 'times'}`);
        lines.push(`  ${isZh ? '总花费' : 'Total Spent'}: ${formatUSD(strategy.total_spent)}`);
    }
    return lines.join('\n');
}

/**
 * Format alert info
 */
function formatAlert(alert, lang = 'zh') {
    const isZh = lang === 'zh';
    const condStr = alert.condition === 'above'
        ? (isZh ? '高于' : 'above')
        : (isZh ? '低于' : 'below');
    return `🔔 #${alert.id}  *${alert.token_symbol}* ${condStr} ${formatUSD(alert.target_price)}`;
}

/**
 * Describe cron expression in human-readable format
 */
function describeCron(cron, lang = 'zh') {
    const isZh = lang === 'zh';
    const common = {
        '0 9 * * 1': isZh ? '每周一 9:00' : 'Every Monday 9:00',
        '0 9 * * *': isZh ? '每天 9:00' : 'Daily 9:00',
        '0 9 1 * *': isZh ? '每月1日 9:00' : 'Monthly 1st 9:00',
        '0 */6 * * *': isZh ? '每6小时' : 'Every 6 hours',
        '0 */12 * * *': isZh ? '每12小时' : 'Every 12 hours',
    };
    return common[cron] || cron;
}

/**
 * Format welcome / onboarding message
 */
function formatWelcome(lang = 'zh') {
    if (lang === 'zh') {
        return `🤖 *欢迎使用 OpenClaw Investor Suite！*

我是你的 AI 投资助手，可以帮你：
✅ 追踪投资组合
✅ 自动化定投 (DCA)
✅ 监控价格警报
✅ 查看市场动态

🚀 *快速开始*

1️⃣ 添加钱包：/addwallet <你的Solana地址>
2️⃣ 查看组合：/portfolio
3️⃣ 查看价格：/price SOL
4️⃣ 设置警报：/alert SOL above 200

输入 /help 查看所有可用命令。`;
    }

    return `🤖 *Welcome to OpenClaw Investor Suite!*

I'm your AI investment assistant. I can help you:
✅ Track your portfolio
✅ Automate DCA strategies
✅ Monitor price alerts
✅ View market trends

🚀 *Quick Start*

1️⃣ Add wallet: /addwallet <your Solana address>
2️⃣ View portfolio: /portfolio
3️⃣ Check price: /price SOL
4️⃣ Set alert: /alert SOL above 200

Type /help for all available commands.`;
}

/**
 * Format help message
 */
function formatHelp(lang = 'zh') {
    if (lang === 'zh') {
        return `📖 *命令列表*

💼 *投资组合*
/portfolio — 查看投资组合
/addwallet <地址> — 添加钱包
/removewallet <地址> — 移除钱包
/wallets — 查看所有钱包

💲 *市场*
/price <代币> — 查看价格
/market — 市场概览

📈 *策略*
/dca — 设置 DCA 定投
/strategies — 查看策略
/pause <ID> — 暂停策略
/resume <ID> — 恢复策略

🔔 *警报*
/alert <代币> <above|below> <价格> — 设置警报
/alerts — 查看警报
/deletealert <ID> — 删除警报

⚙️ *设置*
/lang <zh|en> — 切换语言
/help — 显示此帮助`;
    }

    return `📖 *Commands*

💼 *Portfolio*
/portfolio — View portfolio
/addwallet <address> — Add wallet
/removewallet <address> — Remove wallet
/wallets — List wallets

💲 *Market*
/price <token> — Check price
/market — Market overview

📈 *Strategies*
/dca — Set up DCA
/strategies — View strategies
/pause <ID> — Pause strategy
/resume <ID> — Resume strategy

🔔 *Alerts*
/alert <token> <above|below> <price> — Set alert
/alerts — View alerts
/deletealert <ID> — Delete alert

⚙️ *Settings*
/lang <zh|en> — Switch language
/help — Show this help`;
}

module.exports = {
    formatPortfolioSummary,
    formatTokenDetail,
    formatPrice,
    formatStrategy,
    formatAlert,
    formatWelcome,
    formatHelp,
    formatUSD,
    formatAmount,
};
