CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'execution_order_state') THEN
        CREATE TYPE execution_order_state AS ENUM (
            'CREATED',
            'RISK_CHECK',
            'REVIEW_PENDING',
            'SIGNING',
            'BROADCAST',
            'CONFIRMED',
            'FAILED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS execution_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    client_order_id TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    input_mint TEXT NOT NULL,
    output_mint TEXT NOT NULL,
    input_amount_atomic NUMERIC(78, 0) NOT NULL,
    expected_output_atomic NUMERIC(78, 0),
    quote_id TEXT,
    max_slippage_bps INTEGER NOT NULL,
    usd_notional NUMERIC(38, 18) NOT NULL,
    requires_user_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
    user_confirmed_at TIMESTAMPTZ,
    signer_provider TEXT,
    signed_payload_ref TEXT,
    tx_signature TEXT,
    state execution_order_state NOT NULL,
    state_entered_at TIMESTAMPTZ NOT NULL,
    deadline_at TIMESTAMPTZ,
    error_code TEXT,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, client_order_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_orders_user_created_at
    ON execution_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_orders_state_deadline
    ON execution_orders (state, deadline_at);
CREATE INDEX IF NOT EXISTS idx_execution_orders_tx_signature
    ON execution_orders (tx_signature);

CREATE TABLE IF NOT EXISTS execution_order_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES execution_orders(id) ON DELETE CASCADE,
    from_state execution_order_state,
    to_state execution_order_state NOT NULL,
    reason TEXT,
    idempotency_key TEXT NOT NULL,
    actor TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_execution_order_transitions_order_created_at
    ON execution_order_transitions (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_order_transitions_to_state_created_at
    ON execution_order_transitions (to_state, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_risk_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES execution_orders(id) ON DELETE SET NULL,
    user_id TEXT NOT NULL,
    rule_code TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_risk_violations_order_created_at
    ON execution_risk_violations (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_risk_violations_user_created_at
    ON execution_risk_violations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_risk_violations_rule_created_at
    ON execution_risk_violations (rule_code, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    actor TEXT,
    user_id TEXT,
    order_id UUID,
    idempotency_key TEXT,
    trace_id TEXT,
    tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    prev_hash TEXT,
    hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_audit_events_order_created_at
    ON execution_audit_events (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_audit_events_user_created_at
    ON execution_audit_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_audit_events_type_created_at
    ON execution_audit_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_manual_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES execution_orders(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('CREATED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED')),
    usd_notional NUMERIC(38, 18) NOT NULL DEFAULT 0,
    reason TEXT,
    review_reason TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    order_transition_idempotency_key TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_manual_reviews_status_created_at
    ON execution_manual_reviews (status, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_circuit_breaker_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope TEXT NOT NULL CHECK (scope IN ('global', 'user')),
    user_id TEXT,
    action TEXT NOT NULL CHECK (action IN ('pause', 'resume', 'auto_resume')),
    reason TEXT,
    actor TEXT,
    resume_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_circuit_breaker_events_scope_created_at
    ON execution_circuit_breaker_events (scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_circuit_breaker_events_user_created_at
    ON execution_circuit_breaker_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_rollback_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES execution_orders(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('CREATED', 'EXECUTED', 'FAILED')),
    reason TEXT,
    requested_by TEXT,
    target_state execution_order_state,
    executed_at TIMESTAMPTZ,
    error_code TEXT,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_rollback_cases_order_created_at
    ON execution_rollback_cases (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_rollback_cases_status_created_at
    ON execution_rollback_cases (status, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_fund_recovery_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES execution_orders(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    asset_mint TEXT,
    amount_atomic NUMERIC(78, 0),
    tx_signature TEXT,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'RECONCILED', 'UNRECOVERABLE')),
    note TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_fund_recovery_order_created_at
    ON execution_fund_recovery_traces (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_fund_recovery_status_created_at
    ON execution_fund_recovery_traces (status, created_at DESC);
