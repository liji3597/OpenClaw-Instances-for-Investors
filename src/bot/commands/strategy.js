const { findOrCreateUser, createDcaStrategy, getUserStrategies } = require('../../db/database');
const { resolveToken } = require('../../solana/jupiter');
const { formatStrategy } = require('../../portfolio/formatter');
const { pauseStrategy, resumeStrategy, scheduleStrategy } = require('../../strategies/dca');

// Store ongoing DCA setup conversations
const dcaSetup = new Map(); // chatId → { step, data }

/**
 * Register strategy-related commands
 */
function registerStrategyCommands(bot, notifyFn) {
    // /dca — Start DCA setup wizard
    bot.onText(/\/dca/, async (msg) => {
        const chatId = msg.chat.id;
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        const isZh = user.language === 'zh';

        dcaSetup.set(chatId, { step: 'target_token', data: { userId: user.id } });

        await bot.sendMessage(chatId,
            isZh
                ? '📈 *DCA 定投设置向导*\n\n步骤 1/4: 你要定投哪个代币？\n\n示例: SOL, JUP, BONK, RAY\n\n输入代币名称：'
                : '📈 *DCA Setup Wizard*\n\nStep 1/4: Which token to DCA into?\n\nExamples: SOL, JUP, BONK, RAY\n\nEnter token symbol:',
            { parse_mode: 'Markdown' }
        );
    });

    // /strategies — List strategies
    bot.onText(/\/strategies/, async (msg) => {
        const chatId = msg.chat.id;
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        const strategies = getUserStrategies(user.id);
        const isZh = user.language === 'zh';

        if (strategies.length === 0) {
            await bot.sendMessage(chatId, isZh ? '📭 还没有策略。使用 /dca 创建定投计划。' : '📭 No strategies. Use /dca to create a DCA plan.');
            return;
        }

        const lines = [isZh ? '📊 *我的策略*\n' : '📊 *My Strategies*\n'];
        for (const s of strategies) {
            lines.push(formatStrategy(s, user.language));
            lines.push('');
        }
        await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
    });

    // /pause <id> — Pause a strategy
    bot.onText(/\/pause\s+(\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const strategyId = parseInt(match[1], 10);
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        const isZh = user.language === 'zh';

        const strategies = getUserStrategies(user.id);
        const strategy = strategies.find(s => s.id === strategyId);

        if (!strategy) {
            await bot.sendMessage(chatId, isZh ? '❌ 策略不存在。' : '❌ Strategy not found.');
            return;
        }

        pauseStrategy(strategyId);
        await bot.sendMessage(chatId, isZh ? `🟡 策略 #${strategyId} 已暂停。使用 /resume ${strategyId} 恢复。` : `🟡 Strategy #${strategyId} paused. Use /resume ${strategyId} to restart.`);
    });

    // /resume <id> — Resume a strategy
    bot.onText(/\/resume\s+(\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const strategyId = parseInt(match[1], 10);
        const user = findOrCreateUser(String(chatId), msg.from?.username || '');
        const isZh = user.language === 'zh';

        const strategies = getUserStrategies(user.id);
        const strategy = strategies.find(s => s.id === strategyId);

        if (!strategy) {
            await bot.sendMessage(chatId, isZh ? '❌ 策略不存在。' : '❌ Strategy not found.');
            return;
        }

        strategy.telegram_id = String(chatId);
        resumeStrategy(strategy, notifyFn);
        await bot.sendMessage(chatId, isZh ? `🟢 策略 #${strategyId} 已恢复。` : `🟢 Strategy #${strategyId} resumed.`);
    });

    return dcaSetup; // return setup map so the main bot can handle conversation flow
}

/**
 * Handle DCA setup conversation flow (called from main bot message handler)
 * @returns {boolean} true if message was handled
 */
function handleDcaSetup(bot, msg, dcaSetup, notifyFn) {
    const chatId = msg.chat.id;
    const setup = dcaSetup.get(chatId);
    if (!setup) return false;

    const text = msg.text?.trim();
    if (!text) return false;

    const user = findOrCreateUser(String(chatId), msg.from?.username || '');
    const isZh = user.language === 'zh';

    switch (setup.step) {
        case 'target_token': {
            const mint = resolveToken(text);
            if (!mint) {
                bot.sendMessage(chatId, isZh ? '❌ 未识别的代币。请输入 SOL, JUP, BONK 等。' : '❌ Unknown token. Try SOL, JUP, BONK, etc.');
                return true;
            }
            setup.data.target_token = text.toUpperCase();
            setup.step = 'amount';
            bot.sendMessage(chatId,
                isZh
                    ? `✅ 目标代币: *${setup.data.target_token}*\n\n步骤 2/4: 每次定投多少 USDC？\n\n示例: 50, 100, 200\n\n输入金额：`
                    : `✅ Target token: *${setup.data.target_token}*\n\nStep 2/4: How much USDC per DCA?\n\nExamples: 50, 100, 200\n\nEnter amount:`,
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        case 'amount': {
            const amount = parseFloat(text);
            if (isNaN(amount) || amount <= 0) {
                bot.sendMessage(chatId, isZh ? '❌ 请输入有效的金额。' : '❌ Please enter a valid amount.');
                return true;
            }
            setup.data.amount = amount;
            setup.step = 'schedule';
            bot.sendMessage(chatId,
                isZh
                    ? `✅ 金额: *${amount} USDC*\n\n步骤 3/4: 定投频率？\n\n1️⃣ 每天\n2️⃣ 每周一\n3️⃣ 每月1日\n4️⃣ 每6小时\n\n输入数字 (1-4)：`
                    : `✅ Amount: *${amount} USDC*\n\nStep 3/4: DCA frequency?\n\n1️⃣ Daily\n2️⃣ Weekly (Monday)\n3️⃣ Monthly (1st)\n4️⃣ Every 6 hours\n\nEnter number (1-4):`,
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        case 'schedule': {
            const schedules = {
                '1': '0 9 * * *',
                '2': '0 9 * * 1',
                '3': '0 9 1 * *',
                '4': '0 */6 * * *',
            };
            const cron = schedules[text];
            if (!cron) {
                bot.sendMessage(chatId, isZh ? '❌ 请输入 1-4。' : '❌ Please enter 1-4.');
                return true;
            }
            setup.data.cron_expression = cron;
            setup.step = 'confirm';

            const scheduleNames = {
                '1': isZh ? '每天 9:00' : 'Daily 9:00 UTC',
                '2': isZh ? '每周一 9:00' : 'Weekly Mon 9:00 UTC',
                '3': isZh ? '每月1日 9:00' : 'Monthly 1st 9:00 UTC',
                '4': isZh ? '每6小时' : 'Every 6 hours',
            };

            bot.sendMessage(chatId,
                isZh
                    ? `📋 *DCA 策略确认*\n\n🎯 代币: ${setup.data.target_token}\n💰 金额: ${setup.data.amount} USDC\n📅 频率: ${scheduleNames[text]}\n\n步骤 4/4: 确认创建？\n\n输入 *yes* 确认 或 *no* 取消`
                    : `📋 *DCA Strategy Confirmation*\n\n🎯 Token: ${setup.data.target_token}\n💰 Amount: ${setup.data.amount} USDC\n📅 Schedule: ${scheduleNames[text]}\n\nStep 4/4: Confirm?\n\nType *yes* to confirm or *no* to cancel`,
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        case 'confirm': {
            if (text.toLowerCase() === 'yes' || text === '是' || text === '确认') {
                const name = `DCA ${setup.data.amount} USDC → ${setup.data.target_token}`;
                const strategyId = createDcaStrategy(setup.data.userId, {
                    name,
                    source_token: 'USDC',
                    target_token: setup.data.target_token,
                    amount: setup.data.amount,
                    cron_expression: setup.data.cron_expression,
                });

                // Schedule the strategy
                const db = require('../../db/database');
                const strategies = db.getUserStrategies(setup.data.userId);
                const newStrategy = strategies.find(s => s.id === strategyId);
                if (newStrategy) {
                    newStrategy.telegram_id = String(chatId);
                    scheduleStrategy(newStrategy, notifyFn);
                }

                dcaSetup.delete(chatId);
                bot.sendMessage(chatId,
                    isZh
                        ? `🎉 *DCA 策略已创建！*\n\n策略 ID: #${strategyId}\n名称: ${name}\n\n使用 /strategies 查看所有策略\n使用 /pause ${strategyId} 暂停`
                        : `🎉 *DCA Strategy Created!*\n\nStrategy ID: #${strategyId}\nName: ${name}\n\nUse /strategies to view all\nUse /pause ${strategyId} to pause`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                dcaSetup.delete(chatId);
                bot.sendMessage(chatId, isZh ? '❌ 已取消。' : '❌ Cancelled.');
            }
            return true;
        }

        default:
            dcaSetup.delete(chatId);
            return false;
    }
}

module.exports = { registerStrategyCommands, handleDcaSetup };
