'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const JupiterSwapClient = require('../swap-client');

test('swap-client stub: enforces slippage safety cap before network calls', async () => {
    const client = new JupiterSwapClient({
        httpClient: {
            get: async () => ({ data: {} }),
            post: async () => ({ data: {} }),
        },
        connection: {
            sendRawTransaction: async () => 'mock-signature',
            confirmTransaction: async () => ({ value: { err: null } }),
            getSignatureStatuses: async () => ({ value: [{ confirmationStatus: 'confirmed', err: null }] }),
        },
        transactionSigner: {
            signSwapTransaction: async () => ({ signedTransactionBase64: 'AA==' }),
        },
    });

    await assert.rejects(
        () => client.executeSwap({
            userId: 'user-1',
            userPublicKey: 'pubkey-1',
            inputMint: 'mint-in',
            outputMint: 'mint-out',
            amountAtomic: '1000',
            usdNotional: 10,
            dailyUsedUsd: 0,
            slippageBps: 301,
            idempotencyKey: 'idem-key-001',
        }),
        (err) => err && err.code === 'SLIPPAGE_LIMIT_EXCEEDED'
    );
});

test.todo('swap-client: quote -> build -> sign -> broadcast -> confirm happy path');