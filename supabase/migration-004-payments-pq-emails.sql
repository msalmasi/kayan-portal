-- ============================================================
-- Migration 004: Payment tracking, PQ review, email events
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─── 1. PAYMENT TRACKING (per-allocation) ───────────────────

-- Add payment fields to allocations table
ALTER TABLE allocations
  ADD COLUMN payment_status TEXT DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'invoiced', 'partial', 'paid')),
  ADD COLUMN payment_method TEXT
    CHECK (payment_method IN ('wire', 'usdt', 'usdc', 'credit_card') OR payment_method IS NULL),
  ADD COLUMN amount_usd NUMERIC,             -- expected USD amount (token_amount * token_price)
  ADD COLUMN amount_received_usd NUMERIC,    -- actual USD received so far
  ADD COLUMN payment_date TIMESTAMPTZ,       -- date payment was confirmed
  ADD COLUMN tx_reference TEXT;              -- wire ref, tx hash, or card charge ID

-- ─── 2. PQ REVIEW (per-investor) ───────────────────────────

-- Add PQ review fields to investors table
ALTER TABLE investors
  ADD COLUMN pq_status TEXT DEFAULT 'not_sent'
    CHECK (pq_status IN ('not_sent', 'sent', 'submitted', 'approved', 'rejected')),
  ADD COLUMN pq_reviewed_by TEXT,            -- email of reviewer
  ADD COLUMN pq_reviewed_at TIMESTAMPTZ,     -- when review was completed
  ADD COLUMN pq_notes TEXT;                  -- reviewer notes or rejection reason

-- ─── 3. EMAIL EVENTS (audit trail) ─────────────────────────

-- Tracks every email sent through the portal
CREATE TABLE email_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID REFERENCES investors(id) ON DELETE CASCADE,
  email_type  TEXT NOT NULL
    CHECK (email_type IN ('welcome', 'capital_call', 'reminder')),
  sent_by     TEXT,                          -- admin email who triggered it (null = auto)
  sent_at     TIMESTAMPTZ DEFAULT now(),
  metadata    JSONB                          -- flexible payload (template vars, etc.)
);

-- RLS: email_events only accessible via service role (admin API)
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_events_no_client_access"
  ON email_events FOR SELECT
  USING (false);

CREATE INDEX idx_email_events_investor ON email_events(investor_id);
CREATE INDEX idx_allocations_payment ON allocations(payment_status);
CREATE INDEX idx_investors_pq ON investors(pq_status);
