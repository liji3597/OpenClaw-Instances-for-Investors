const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function loadFreshServices(databasePath = ':memory:') {
    process.env.DATABASE_PATH = databasePath;

    for (const id of Object.keys(require.cache)) {
        if (id.includes(`${path.sep}shared${path.sep}`)) {
            delete require.cache[id];
        }
    }

    const services = require(path.join(projectRoot, 'shared', 'services'));
    const database = require(path.join(projectRoot, 'shared', 'database'));
    return { services, database };
}

test('user-context: getUserContext with valid and invalid telegramId', () => {
    const { services, database } = loadFreshServices();

    try {
        assert.throws(
            () => services.getUserContext(),
            (err) => err && err.code === 'MISSING_TELEGRAM_ID'
        );

        const user1 = services.getUserContext('tg-user-1');
        assert.equal(user1.telegramId, 'tg-user-1');
        assert.equal(user1.language, 'zh');
        assert.ok(Number.isInteger(user1.id));

        const user1Again = services.getUserContext('tg-user-1');
        assert.equal(user1Again.id, user1.id);
    } finally {
        database.closeDatabase();
    }
});

test('strategy-service: create, list, pause, resume and ownership checks', () => {
    const { services, database } = loadFreshServices();

    try {
        const createResult = services.createStrategy('owner-1', {
            name: 'DCA test',
            source_token: 'USDC',
            target_token: 'SOL',
            amount: 100,
            cron_expression: '0 9 * * *',
            slippage_bps: 50,
        });

        assert.equal(createResult.ok, true);
        assert.equal(createResult.code, 'OK');
        assert.ok(Number.isInteger(createResult.strategyId));

        const ownerList = services.listStrategies('owner-1');
        assert.equal(ownerList.ok, true);
        assert.equal(ownerList.strategies.length, 1);
        assert.equal(ownerList.strategies[0].id, createResult.strategyId);
        assert.equal(ownerList.strategies[0].status, 'active');

        const otherList = services.listStrategies('other-user');
        assert.equal(otherList.ok, true);
        assert.equal(otherList.strategies.length, 0);

        const invalidPause = services.pauseStrategy('owner-1', 'abc');
        assert.equal(invalidPause.ok, false);
        assert.equal(invalidPause.code, 'INVALID_STRATEGY_ID');

        const unauthorizedPause = services.pauseStrategy('other-user', createResult.strategyId);
        assert.equal(unauthorizedPause.ok, false);
        assert.equal(unauthorizedPause.code, 'STRATEGY_NOT_FOUND');

        const pauseResult = services.pauseStrategy('owner-1', createResult.strategyId);
        assert.equal(pauseResult.ok, true);
        assert.equal(pauseResult.code, 'OK');

        const pauseAgain = services.pauseStrategy('owner-1', createResult.strategyId);
        assert.equal(pauseAgain.ok, false);
        assert.equal(pauseAgain.code, 'STRATEGY_ALREADY_PAUSED');

        const resumeResult = services.resumeStrategy('owner-1', createResult.strategyId);
        assert.equal(resumeResult.ok, true);
        assert.equal(resumeResult.code, 'OK');

        const resumeAgain = services.resumeStrategy('owner-1', createResult.strategyId);
        assert.equal(resumeAgain.ok, false);
        assert.equal(resumeAgain.code, 'STRATEGY_ALREADY_ACTIVE');
    } finally {
        database.closeDatabase();
    }
});

test('alert-service: create validation, limit check, list and delete', () => {
    const { services, database } = loadFreshServices();

    try {
        const invalidCondition = services.createAlertForUser('alert-user', {
            tokenSymbol: 'SOL',
            condition: 'invalid',
            targetPrice: 10,
        });
        assert.equal(invalidCondition.ok, false);
        assert.equal(invalidCondition.code, 'INVALID_ALERT_CONDITION');

        const invalidTarget = services.createAlertForUser('alert-user', {
            tokenSymbol: 'SOL',
            condition: 'above',
            targetPrice: 0,
        });
        assert.equal(invalidTarget.ok, false);
        assert.equal(invalidTarget.code, 'INVALID_TARGET_PRICE');

        const unknownToken = services.createAlertForUser('alert-user', {
            tokenSymbol: 'NOT_A_TOKEN',
            condition: 'above',
            targetPrice: 10,
        });
        assert.equal(unknownToken.ok, false);
        assert.equal(unknownToken.code, 'UNKNOWN_TOKEN');

        const createdIds = [];
        for (let i = 0; i < 20; i += 1) {
            const created = services.createAlertForUser('alert-user', {
                tokenSymbol: 'SOL',
                condition: 'above',
                targetPrice: i + 1,
            });
            assert.equal(created.ok, true);
            assert.equal(created.code, 'ALERT_CREATED');
            createdIds.push(created.alertId);
        }

        const overLimit = services.createAlertForUser('alert-user', {
            tokenSymbol: 'SOL',
            condition: 'above',
            targetPrice: 999,
        });
        assert.equal(overLimit.ok, false);
        assert.equal(overLimit.code, 'ALERT_LIMIT_REACHED');

        const listResult = services.listAlerts('alert-user');
        assert.equal(listResult.ok, true);
        assert.equal(listResult.alerts.length, 20);

        const invalidDelete = services.deleteAlertForUser('alert-user', 'abc');
        assert.equal(invalidDelete.ok, false);
        assert.equal(invalidDelete.code, 'INVALID_ALERT_ID');

        const unauthorizedDelete = services.deleteAlertForUser('other-alert-user', createdIds[0]);
        assert.equal(unauthorizedDelete.ok, false);
        assert.equal(unauthorizedDelete.code, 'ALERT_NOT_FOUND');

        const deleteResult = services.deleteAlertForUser('alert-user', createdIds[0]);
        assert.equal(deleteResult.ok, true);
        assert.equal(deleteResult.code, 'ALERT_DELETED');

        const deleteAgain = services.deleteAlertForUser('alert-user', createdIds[0]);
        assert.equal(deleteAgain.ok, false);
        assert.equal(deleteAgain.code, 'ALERT_NOT_FOUND');

        const listAfterDelete = services.listAlerts('alert-user');
        assert.equal(listAfterDelete.ok, true);
        assert.equal(listAfterDelete.alerts.length, 19);
    } finally {
        database.closeDatabase();
    }
});

test('alert-service: stop-loss/take-profit require cost basis and persist alert type', () => {
    const { services, database } = loadFreshServices();

    try {
        const noCostBasis = services.createStopLossAlertForUser('risk-user', {
            tokenSymbol: 'SOL',
            lossPercent: 10,
        });
        assert.equal(noCostBasis.ok, false);
        assert.equal(noCostBasis.code, 'COST_BASIS_NOT_FOUND');

        const user = services.getUserContext('risk-user');
        services.updateCostBasis(user.id, 'SOL', 2, 200);

        const stopLoss = services.createStopLossAlertForUser('risk-user', {
            tokenSymbol: 'SOL',
            lossPercent: 12,
        });
        assert.equal(stopLoss.ok, true);
        assert.equal(stopLoss.code, 'ALERT_CREATED');

        const takeProfit = services.createTakeProfitAlertForUser('risk-user', {
            tokenSymbol: 'SOL',
            profitPercent: 30,
        });
        assert.equal(takeProfit.ok, true);
        assert.equal(takeProfit.code, 'ALERT_CREATED');

        const listed = services.listAlerts('risk-user');
        assert.equal(listed.ok, true);
        assert.equal(listed.alerts.length, 2);
        assert.deepEqual(
            listed.alerts.map((item) => item.alert_type).sort(),
            ['stop_loss', 'take_profit']
        );
    } finally {
        database.closeDatabase();
    }
});
