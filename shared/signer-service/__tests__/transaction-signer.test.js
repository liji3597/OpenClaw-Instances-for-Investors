'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const KeyManager = require('../key-manager');
const TransactionSigner = require('../transaction-signer');

test('transaction-signer stub: rejects missing unsigned payload', async () => {
    const keyManager = new KeyManager();
    const signer = new TransactionSigner({ keyManager });

    await assert.rejects(
        () => signer.signSwapTransaction({ userId: 'user-1' }),
        (err) => err && err.code === 'INVALID_UNSIGNED_TRANSACTION'
    );
});

test.todo('transaction-signer: provider routing + signature validation with real serialized tx fixtures');