-- ============================================================
-- Migration: Add manager role and update admin_users
-- Run this in Supabase SQL Editor
-- ============================================================

-- Update the role check constraint to include 'manager'
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('super_admin', 'admin', 'manager'));
