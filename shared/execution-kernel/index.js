'use strict';

const types = require('./types');
const OrderStore = require('./order-store');
const RiskController = require('./risk-controller');
const AuditLogger = require('./audit-logger');
const OrderStateMachine = require('./order-state-machine');
const WhitelistService = require('./whitelist-service');
const CircuitBreaker = require('./circuit-breaker');
const ComplianceService = require('./compliance-service');
const ManualReviewService = require('./manual-review-service');
const RollbackService = require('./rollback-service');

module.exports = {
    ...types,
    OrderStore,
    RiskController,
    AuditLogger,
    OrderStateMachine,
    WhitelistService,
    InMemoryWhitelistRepository: WhitelistService.InMemoryWhitelistRepository,
    PostgresWhitelistRepository: WhitelistService.PostgresWhitelistRepository,
    CircuitBreaker,
    InMemoryCircuitBreakerRepository: CircuitBreaker.InMemoryCircuitBreakerRepository,
    ComplianceService,
    InMemoryKycProvider: ComplianceService.InMemoryKycProvider,
    InMemoryGeoProvider: ComplianceService.InMemoryGeoProvider,
    ManualReviewService,
    InMemoryManualReviewRepository: ManualReviewService.InMemoryManualReviewRepository,
    REVIEW_STATUSES: ManualReviewService.REVIEW_STATUSES,
    RollbackService,
    InMemoryRollbackRepository: RollbackService.InMemoryRollbackRepository,
    ROLLBACK_CASE_STATUSES: RollbackService.ROLLBACK_CASE_STATUSES,
    FUND_TRACKING_STATUSES: RollbackService.FUND_TRACKING_STATUSES,
};
