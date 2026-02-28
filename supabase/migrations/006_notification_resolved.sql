-- 006: Add is_resolved to admin_notifications
-- Allows "Action Required" items to persist until the underlying
-- action is actually completed, independent of read status.

ALTER TABLE admin_notifications
  ADD COLUMN IF NOT EXISTS is_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by text;

-- Index for fast Action Required queries
CREATE INDEX IF NOT EXISTS idx_notifications_action_unresolved
  ON admin_notifications (priority, is_resolved)
  WHERE priority = 'action_required' AND is_resolved = false;
