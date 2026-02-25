/**
 * Simple keyword-based NLP for Chinese + English command parsing.
 * Maps natural language phrases to bot commands.
 */

const INTENT_PATTERNS = [
    // Portfolio
    {
        intent: 'portfolio',
        patterns: [
            /投资组合/, /我的资产/, /我的持仓/, /余额/, /资产/,
            /portfolio/i, /my holdings/i, /my balance/i, /show assets/i,
        ],
    },
    // Price query
    {
        intent: 'price',
        patterns: [
            /(.+?)(?:价格|多少钱|现在多少|当前价)/, /(?:价格|查一下)\s*(.+)/,
            /price\s+(\w+)/i, /how much (?:is|for)\s+(\w+)/i, /(\w+)\s+price/i,
        ],
        extractToken: true,
    },
    // Market overview
    {
        intent: 'market',
        patterns: [
            /市场/, /行情/, /大盘/, /今天.*怎么样/,
            /market/i, /overview/i, /trending/i,
        ],
    },
    // Add wallet
    {
        intent: 'addwallet',
        patterns: [
            /添加.*钱包\s*([1-9A-HJ-NP-Za-km-z]{32,44})/,
            /连接.*钱包\s*([1-9A-HJ-NP-Za-km-z]{32,44})/,
            /add.*wallet\s*([1-9A-HJ-NP-Za-km-z]{32,44})/i,
        ],
        extractAddress: true,
    },
    // DCA setup
    {
        intent: 'dca',
        patterns: [
            /定投/, /DCA/i, /定期.*买/, /自动.*购买/,
            /dollar cost/i, /auto.?buy/i,
        ],
    },
    // Alert
    {
        intent: 'alert',
        patterns: [
            /提醒我/, /通知我/, /警报/, /到了.*通知/,
            /alert me/i, /notify me/i, /remind me/i,
        ],
    },
    // Strategies
    {
        intent: 'strategies',
        patterns: [
            /我的策略/, /策略列表/, /查看策略/,
            /my strateg/i, /list strateg/i, /view strateg/i,
        ],
    },
    // Help
    {
        intent: 'help',
        patterns: [
            /帮助/, /怎么用/, /功能/, /命令/,
            /help/i, /commands/i, /how to/i, /what can you do/i,
        ],
    },
    // Language switch
    {
        intent: 'lang',
        patterns: [
            /切换.*(?:中文|英文|语言)/, /(?:switch|change).*(?:language|lang)/i,
        ],
    },
];

/**
 * Parse a natural language message into a command intent
 * @param {string} text - user message
 * @returns {{ intent: string, token?: string, address?: string } | null}
 */
function parseIntent(text) {
    if (!text || text.startsWith('/')) return null; // Skip if already a command

    const trimmed = text.trim();

    for (const { intent, patterns, extractToken, extractAddress } of INTENT_PATTERNS) {
        for (const pattern of patterns) {
            const match = trimmed.match(pattern);
            if (match) {
                const result = { intent };
                if (extractToken && match[1]) {
                    result.token = match[1].trim().toUpperCase();
                }
                if (extractAddress && match[1]) {
                    result.address = match[1].trim();
                }
                return result;
            }
        }
    }

    return null;
}

module.exports = { parseIntent };
