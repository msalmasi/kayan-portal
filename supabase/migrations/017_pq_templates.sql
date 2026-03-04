-- ============================================================
-- Migration 017: Dynamic PQ Templates
--
-- Replaces the hard-coded Purchaser Questionnaire with
-- admin-editable, versioned templates. Each template stores
-- a JSON schema of sections and fields that the investor
-- PQ page renders dynamically.
-- ============================================================

CREATE TABLE IF NOT EXISTS pq_templates (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  version       integer NOT NULL DEFAULT 1,
  name          text NOT NULL DEFAULT 'Purchaser Questionnaire',
  sections      jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active     boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now() NOT NULL,
  created_by    text NOT NULL DEFAULT 'system',
  notes         text
);

-- Only one template can be active at a time
CREATE UNIQUE INDEX idx_pq_templates_active ON pq_templates (is_active) WHERE is_active = true;

-- Track which template version an investor submitted against
ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS pq_template_id uuid REFERENCES pq_templates(id);

-- RLS
ALTER TABLE pq_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_pq_templates"
  ON pq_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.email = auth.jwt() ->> 'email'
    )
  );

-- Investors can read the active template (needed for the PQ page)
CREATE POLICY "investor_read_active_template"
  ON pq_templates FOR SELECT
  USING (is_active = true);
