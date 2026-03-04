-- ============================================================
-- Migration 016: Registry Audit Log
--
-- The allocations table functions as a de facto token registry
-- (transfer agent system). This table provides an immutable
-- audit trail of every ownership-affecting change.
-- ============================================================

CREATE TABLE IF NOT EXISTS registry_audit_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now() NOT NULL,

  -- What changed
  action        text NOT NULL,  -- e.g. 'allocation_created', 'payment_applied', 'status_changed', 'amount_adjusted'
  entity_type   text NOT NULL,  -- 'allocation', 'payment_claim', 'investor_document'
  entity_id     uuid NOT NULL,  -- ID of the affected record

  -- Who is affected
  investor_id   uuid REFERENCES investors(id),
  round_id      uuid REFERENCES saft_rounds(id),

  -- Who made the change
  changed_by    text NOT NULL,  -- admin email or 'system'

  -- Snapshot of change
  old_values    jsonb DEFAULT '{}'::jsonb,
  new_values    jsonb DEFAULT '{}'::jsonb,
  metadata      jsonb DEFAULT '{}'::jsonb,

  -- IP/context for admin actions
  ip_address    text,
  user_agent    text
);

-- Indices for common queries
CREATE INDEX idx_registry_audit_investor ON registry_audit_log (investor_id, created_at DESC);
CREATE INDEX idx_registry_audit_round    ON registry_audit_log (round_id, created_at DESC);
CREATE INDEX idx_registry_audit_action   ON registry_audit_log (action, created_at DESC);
CREATE INDEX idx_registry_audit_entity   ON registry_audit_log (entity_type, entity_id);

-- RLS: Only service-role and admin reads
ALTER TABLE registry_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read
CREATE POLICY "admin_read_registry_audit"
  ON registry_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.email = auth.jwt() ->> 'email'
    )
  );

-- Inserts only via service role (no direct admin inserts)
-- This ensures the audit log is append-only from application code.
