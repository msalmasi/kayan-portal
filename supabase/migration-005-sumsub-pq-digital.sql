-- ============================================================
-- Migration 005: Sumsub webhook, digital PQ, review checklist
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─── 1. SUMSUB INTEGRATION ─────────────────────────────────

-- Link investors to their Sumsub applicant
ALTER TABLE investors
  ADD COLUMN sumsub_applicant_id TEXT,       -- Sumsub's applicant ID
  ADD COLUMN kyc_verified_at TIMESTAMPTZ;    -- when KYC was confirmed

CREATE INDEX idx_investors_sumsub ON investors(sumsub_applicant_id);

-- ─── 2. DIGITAL PQ SUBMISSION ──────────────────────────────

-- Stores the investor's completed PQ form data
ALTER TABLE investors
  ADD COLUMN pq_data JSONB,                  -- full PQ form submission
  ADD COLUMN pq_submitted_at TIMESTAMPTZ;    -- when investor submitted

-- ─── 3. PQ REVIEW CHECKLIST ────────────────────────────────

-- Structured review data (replaces free-text pq_notes for checklist)
ALTER TABLE investors
  ADD COLUMN pq_review JSONB;               -- admin review checklist results

-- ─── 4. SUBSCRIPTION DOCS TRACKING ─────────────────────────

ALTER TABLE investors
  ADD COLUMN docs_sent_at TIMESTAMPTZ;       -- when SAFT+PQ+PPM+CIS package was sent

-- ─── 5. EXPAND EMAIL TYPES ─────────────────────────────────

-- Add new email types for docs and PQ notifications
ALTER TABLE email_events DROP CONSTRAINT IF EXISTS email_events_email_type_check;
ALTER TABLE email_events
  ADD CONSTRAINT email_events_email_type_check
  CHECK (email_type IN (
    'welcome', 'capital_call', 'reminder',
    'docs_package', 'pq_submitted_notification', 'pq_approved', 'pq_rejected'
  ));
