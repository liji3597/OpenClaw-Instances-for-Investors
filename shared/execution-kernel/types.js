'use strict';

/**
 * @typedef {'CREATED'|'RISK_CHECK'|'SIGNING'|'BROADCAST'|'CONFIRMED'|'FAILED'} OrderState
 */

/**
 * @typedef {Object} OrderRecord
 * @property {string} id
 * @property {string} userId
 * @property {string|null} clientOrderId
 * @property {string} inputMint
 * @property {string} outputMint
 * @property {string} inputAmountAtomic
 * @property {string|null} expectedOutputAtomic
 * @property {string|null} quoteId
 * @property {number} maxSlippageBps
 * @property {number} usdNotional
 * @property {boolean} requiresUserConfirmation
 * @property {string|null} userConfirmedAt
 * @property {string|null} signerProvider
 * @property {string|null} signedPayloadRef
 * @property {string|null} txSignature
 * @property {OrderState} state
 * @property {string} stateEnteredAt
 * @property {string|null} deadlineAt
 * @property {string|null} errorCode
 * @property {string|null} errorMessage
 * @property {Object<string, any>} metadata
 * @property {number} version
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} RiskViolation
 * @property {string} ruleCode
 * @property {string} message
 * @property {string} severity
 * @property {Object<string, any>} metadata
 */

/**
 * @typedef {Object} StateTransitionResult
 * @property {boolean} applied
 * @property {boolean} idempotent
 * @property {OrderRecord|null} order
 */

const ORDER_STATES = Object.freeze({
    CREATED: 'CREATED',
    RISK_CHECK: 'RISK_CHECK',
    SIGNING: 'SIGNING',
    BROADCAST: 'BROADCAST',
    CONFIRMED: 'CONFIRMED',
    FAILED: 'FAILED',
});

const ORDER_STATE_FLOW = Object.freeze([
    ORDER_STATES.CREATED,
    ORDER_STATES.RISK_CHECK,
    ORDER_STATES.SIGNING,
    ORDER_STATES.BROADCAST,
    ORDER_STATES.CONFIRMED,
]);

const TERMINAL_ORDER_STATES = Object.freeze([
    ORDER_STATES.CONFIRMED,
    ORDER_STATES.FAILED,
]);

const NON_TERMINAL_ORDER_STATES = Object.freeze([
    ORDER_STATES.CREATED,
    ORDER_STATES.RISK_CHECK,
    ORDER_STATES.SIGNING,
    ORDER_STATES.BROADCAST,
]);

const VALID_STATE_TRANSITIONS = Object.freeze({
    [ORDER_STATES.CREATED]: [ORDER_STATES.RISK_CHECK, ORDER_STATES.FAILED],
    [ORDER_STATES.RISK_CHECK]: [ORDER_STATES.SIGNING, ORDER_STATES.FAILED],
    [ORDER_STATES.SIGNING]: [ORDER_STATES.BROADCAST, ORDER_STATES.FAILED],
    [ORDER_STATES.BROADCAST]: [ORDER_STATES.CONFIRMED, ORDER_STATES.FAILED],
    [ORDER_STATES.CONFIRMED]: [],
    [ORDER_STATES.FAILED]: [],
});

const STATE_TIMEOUTS_MS = Object.freeze({
    [ORDER_STATES.CREATED]: 60_000,
    [ORDER_STATES.RISK_CHECK]: 30_000,
    [ORDER_STATES.SIGNING]: 60_000,
    [ORDER_STATES.BROADCAST]: 120_000,
    [ORDER_STATES.CONFIRMED]: 0,
    [ORDER_STATES.FAILED]: 0,
});

module.exports = {
    ORDER_STATES,
    ORDER_STATE_FLOW,
    TERMINAL_ORDER_STATES,
    NON_TERMINAL_ORDER_STATES,
    VALID_STATE_TRANSITIONS,
    STATE_TIMEOUTS_MS,
};
