-- ============================================================
-- v23 Migration: Admin email alerts + allocation approval workflow
-- ============================================================

-- ─── 1. Admin alert email subscriptions ─────────────────────
-- Each admin can subscribe to specific event types for email delivery.
-- One row per admin — event_types is a text[] of subscribed events.

CREATE TABLE IF NOT EXISTS admin_alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  event_types TEXT[] NOT NULL DEFAULT '{}',
  -- Supported event types:
  --   kyc_verified, kyc_rejected, pq_submitted, saft_signed,
  --   payment_received, allocation_proposed, allocation_approved, allocation_rejected
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(admin_id)
);

-- ─── 2. Allocation approval workflow ────────────────────────
-- Staff can propose allocations; manager+ must approve them.
-- Existing allocations default to 'approved' (backwards compatible).

ALTER TABLE allocations
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS proposed_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Index for quick filtering of pending allocations
CREATE INDEX IF NOT EXISTS idx_allocations_approval_status
  ON allocations(approval_status) WHERE approval_status = 'pending';
