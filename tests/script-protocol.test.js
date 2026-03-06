const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');

const scriptsToCheck = [
    { name: 'create-dca', relPath: 'skills/solana-dca/scripts/create-dca.js' },
    { name: 'pause-strategy', relPath: 'skills/solana-dca/scripts/pause-strategy.js' },
    { name: 'resume-strategy', relPath: 'skills/solana-dca/scripts/resume-strategy.js' },
    { name: 'create-alert', relPath: 'skills/solana-alerts/scripts/create-alert.js' },
    { name: 'create-stop-loss', relPath: 'skills/solana-alerts/scripts/create-stop-loss.js' },
    { name: 'create-take-profit', relPath: 'skills/solana-alerts/scripts/create-take-profit.js' },
    { name: 'delete-alert', relPath: 'skills/solana-alerts/scripts/delete-alert.js' },
    { name: 'get-price', relPath: 'skills/solana-market/scripts/get-price.js' },
    { name: 'track-whale', relPath: 'skills/solana-market/scripts/track-whale.js' },
    { name: 'add-wallet', relPath: 'skills/solana-portfolio/scripts/add-wallet.js' },
    { name: 'remove-wallet', relPath: 'skills/solana-portfolio/scripts/remove-wallet.js' },
    { name: 'get-rebalance-suggestion', relPath: 'skills/solana-portfolio/scripts/get-rebalance-suggestion.js' },
];

for (const script of scriptsToCheck) {
    test(`script protocol: ${script.name} returns MISSING_PARAMS and exits 0`, () => {
        const scriptPath = path.join(projectRoot, script.relPath);
        let stdout = '';

        assert.doesNotThrow(() => {
            stdout = execSync(`node "${scriptPath}"`, {
                cwd: projectRoot,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    DATABASE_PATH: ':memory:',
                },
            });
        });

        const output = JSON.parse(stdout);
        assert.equal(output.code, 'MISSING_PARAMS');
        assert.ok(Array.isArray(output.missing));
        assert.ok(output.missing.length > 0);
        assert.equal(typeof output.message, 'string');
        assert.ok(output.message.length > 0);
    });
}
