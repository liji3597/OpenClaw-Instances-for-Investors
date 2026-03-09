DROP TABLE IF EXISTS execution_fund_recovery_traces;
DROP TABLE IF EXISTS execution_rollback_cases;
DROP TABLE IF EXISTS execution_circuit_breaker_events;
DROP TABLE IF EXISTS execution_manual_reviews;
DROP TABLE IF EXISTS execution_audit_events;
DROP TABLE IF EXISTS execution_risk_violations;
DROP TABLE IF EXISTS execution_order_transitions;
DROP TABLE IF EXISTS execution_orders;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'execution_order_state') THEN
        DROP TYPE execution_order_state;
    END IF;
END $$;
