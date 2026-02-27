-- ============================================================
-- Migration 007: Missing variables tracking for SAFT signing
-- Run this in Supabase SQL Editor
-- ============================================================

-- Tracks which template variables still need investor input
ALTER TABLE investor_documents
  ADD COLUMN missing_variables JSONB DEFAULT '[]';
  -- Array of { key: string, label: string } objects
