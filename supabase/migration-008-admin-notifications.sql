-- ============================================================
-- Migration 008: Admin notifications
-- Run this in Supabase SQL Editor
-- ============================================================

-- Lightweight notification feed for admin/manager actions.
-- Created automatically at key workflow events.
-- Designed for thousands of investors without spam —
-- only events that need visibility or action are created.

CREATE TABLE admin_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What happened
  event_type  TEXT NOT NULL,
  -- 'kyc_verified'    — KYC approved (info)
  -- 'kyc_rejected'    — KYC failed (info)
  -- 'pq_submitted'    — PQ needs review (action_required)
  -- 'saft_signed'     — SAFT executed (info)
  -- 'payment_received'— Payment confirmed (info)
  -- 'docs_generated'  — Doc set auto-created (info)
  
  -- Priority level
  priority    TEXT NOT NULL DEFAULT 'info',
  -- 'action_required' — someone needs to do something
  -- 'info'            — good to know, no action needed

  -- Who / what
  investor_id UUID REFERENCES investors(id) ON DELETE CASCADE,
  investor_name TEXT NOT NULL DEFAULT '',
  investor_email TEXT NOT NULL DEFAULT '',

  -- Human-readable summary (single line)
  title       TEXT NOT NULL,
  -- Optional detail
  detail      TEXT,

  -- Read tracking
  is_read     BOOLEAN NOT NULL DEFAULT false,
  read_by     TEXT,      -- email of admin who read it
  read_at     TIMESTAMPTZ,

  -- Metadata (round name, amounts, etc.)
  metadata    JSONB DEFAULT '{}',
  
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast querying
CREATE INDEX idx_admin_notif_unread ON admin_notifications(is_read, created_at DESC)
  WHERE is_read = false;
CREATE INDEX idx_admin_notif_created ON admin_notifications(created_at DESC);
CREATE INDEX idx_admin_notif_investor ON admin_notifications(investor_id);
CREATE INDEX idx_admin_notif_priority ON admin_notifications(priority, created_at DESC);
