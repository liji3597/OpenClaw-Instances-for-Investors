const test = require('node:test');
const assert = require('node:assert/strict');

const { ERROR_CODES, formatError } = require('../shared/errors');

test('formatError returns correct zh/en strings for known codes', () => {
    for (const [code, message] of Object.entries(ERROR_CODES)) {
        assert.equal(formatError(code, 'zh'), message.zh);
        assert.equal(formatError(code, 'en'), message.en);
    }
});

test('formatError handles unknown codes gracefully', () => {
    const unknownCode = 'THIS_CODE_DOES_NOT_EXIST';
    const en = formatError(unknownCode, 'en');
    const zh = formatError(unknownCode, 'zh');

    assert.equal(en, `Unknown error code: ${unknownCode}`);
    assert.match(zh, new RegExp(unknownCode));
    assert.notEqual(zh, en);
});
