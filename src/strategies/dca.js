const cron = require('node-cron');
const { getActiveStrategies, recordStrategyExecution, updateStrategyStatus, recordTransaction } = require('../db/database');
const { getSwapQuote, resolveToken } = require('../solana/jupiter');

// Store active cron jobs: strategyId → cronJob
const activeJobs = new Map();

/**
 * Initialize all active DCA strategies from the database
 * @param {Function} notifyFn - async (telegramId, message) => void
 */
function initDcaScheduler(notifyFn) {
    const strategies = getActiveStrategies();
    console.log(`📅 Initializing ${strategies.length} active DCA strategies`);

    for (const strategy of strategies) {
        scheduleStrategy(strategy, notifyFn);
    }
}

/**
 * Schedule a single DCA strategy
 * @param {object} strategy - strategy record from DB (with telegram_id)
 * @param {Function} notifyFn
 */
function scheduleStrategy(strategy, notifyFn) {
    if (activeJobs.has(strategy.id)) {
        activeJobs.get(strategy.id).stop();
    }

    if (!cron.validate(strategy.cron_expression)) {
        console.error(`Invalid cron expression for strategy #${strategy.id}: ${strategy.cron_expression}`);
        return;
    }

    const job = cron.schedule(strategy.cron_expression, async () => {
        await executeDca(strategy, notifyFn);
    });

    activeJobs.set(strategy.id, job);
    console.log(`  ✅ DCA #${strategy.id} scheduled: ${strategy.amount} ${strategy.source_token} → ${strategy.target_token} (${strategy.cron_expression})`);
}

/**
 * Execute a single DCA purchase
 * @param {object} strategy
 * @param {Function} notifyFn
 */
async function executeDca(strategy, notifyFn) {
    const inputMint = resolveToken(strategy.source_token);
    const outputMint = resolveToken(strategy.target_token);

    if (!inputMint || !outputMint) {
        console.error(`DCA #${strategy.id}: unable to resolve tokens`);
        return;
    }

    try {
        // Get swap quote (amount is in smallest unit)
        const decimals = strategy.source_token === 'USDC' || strategy.source_token === 'USDT' ? 6 : 9;
        const amountInSmallestUnit = strategy.amount * Math.pow(10, decimals);

        const quote = await getSwapQuote({
            inputMint,
            outputMint,
            amount: amountInSmallestUnit,
            slippageBps: strategy.slippage_bps,
        });

        // In MVP, we log the quote rather than executing the actual swap
        // (actual swap execution requires user's private key, which we don't store)
        const outAmount = parseFloat(quote.outAmount || 0);
        const outDecimals = quote.outputMint === resolveToken('SOL') ? 9 : 6;
        const receivedAmount = outAmount / Math.pow(10, outDecimals);

        // Record the execution
        recordStrategyExecution(strategy.id, strategy.amount, receivedAmount);
        recordTransaction(strategy.user_id, {
            strategy_id: strategy.id,
            type: 'dca',
            from_token: strategy.source_token,
            to_token: strategy.target_token,
            from_amount: strategy.amount,
            to_amount: receivedAmount,
            price_at_execution: strategy.amount / (receivedAmount || 1),
            tx_signature: `sim_${Date.now()}`, // simulated in MVP
            status: 'success',
        });

        // Notify user
        const message = `✅ *DCA 执行成功*\n\n` +
            `策略: ${strategy.name || `#${strategy.id}`}\n` +
            `花费: ${strategy.amount} ${strategy.source_token}\n` +
            `获得: ${receivedAmount.toFixed(6)} ${strategy.target_token}\n` +
            `累计执行: ${strategy.total_executed + 1} 次`;

        await notifyFn(strategy.telegram_id, message);

    } catch (err) {
        console.error(`DCA #${strategy.id} execution failed:`, err.message);

        recordTransaction(strategy.user_id, {
            strategy_id: strategy.id,
            type: 'dca',
            from_token: strategy.source_token,
            to_token: strategy.target_token,
            from_amount: strategy.amount,
            status: 'failed',
            error_message: err.message,
        });

        await notifyFn(
            strategy.telegram_id,
            `❌ *DCA 执行失败*\n策略: ${strategy.name || `#${strategy.id}`}\n原因: ${err.message}`
        );
    }
}

/**
 * Pause a DCA strategy
 */
function pauseStrategy(strategyId) {
    if (activeJobs.has(strategyId)) {
        activeJobs.get(strategyId).stop();
        activeJobs.delete(strategyId);
    }
    updateStrategyStatus(strategyId, 'paused');
}

/**
 * Resume a DCA strategy
 * @param {object} strategy - full strategy record with telegram_id
 * @param {Function} notifyFn
 */
function resumeStrategy(strategy, notifyFn) {
    updateStrategyStatus(strategy.id, 'active');
    scheduleStrategy(strategy, notifyFn);
}

/**
 * Stop all active jobs (for graceful shutdown)
 */
function stopAllJobs() {
    for (const [id, job] of activeJobs) {
        job.stop();
    }
    activeJobs.clear();
    console.log('All DCA jobs stopped');
}

module.exports = {
    initDcaScheduler,
    scheduleStrategy,
    pauseStrategy,
    resumeStrategy,
    stopAllJobs,
};
