-- ============================================================
-- Kayan Token Investor Portal — Database Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL)
-- ============================================================

-- ─── 1. TABLES ──────────────────────────────────────────────

-- Core investor record, one per person
CREATE TABLE investors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,          -- matches auth.users email
  full_name       TEXT NOT NULL,
  kyc_status      TEXT DEFAULT 'unverified'      -- 'unverified' | 'pending' | 'verified'
    CHECK (kyc_status IN ('unverified', 'pending', 'verified')),
  wallet_address  TEXT,                          -- ETH address, nullable until connected
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Each funding round and its vesting terms
CREATE TABLE saft_rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,                 -- e.g., 'Seed', 'Private', 'Strategic'
  token_price     NUMERIC,                       -- price per token in USD
  tge_unlock_pct  NUMERIC DEFAULT 0,             -- % unlocked at TGE (10 = 10%)
  cliff_months    INTEGER DEFAULT 0,             -- months before linear vesting starts
  vesting_months  INTEGER NOT NULL,              -- total linear vesting duration after cliff
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Links an investor to a round with their token amount
CREATE TABLE allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id     UUID REFERENCES investors(id) ON DELETE CASCADE,
  round_id        UUID REFERENCES saft_rounds(id) ON DELETE CASCADE,
  token_amount    NUMERIC NOT NULL,
  notes           TEXT,                          -- optional admin notes
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Admin access control (2-3 team members)
CREATE TABLE admin_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  role            TEXT DEFAULT 'admin'            -- 'admin' | 'super_admin'
    CHECK (role IN ('admin', 'super_admin')),
  created_at      TIMESTAMPTZ DEFAULT now()
);


-- ─── 2. INDEXES ─────────────────────────────────────────────

-- Speed up investor lookups by email (used on every auth check)
CREATE INDEX idx_investors_email ON investors(email);

-- Speed up allocation queries for a given investor
CREATE INDEX idx_allocations_investor ON allocations(investor_id);

-- Speed up admin checks
CREATE INDEX idx_admin_email ON admin_users(email);


-- ─── 3. ROW-LEVEL SECURITY ─────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE saft_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Investors can only read their own record
CREATE POLICY "investors_read_own"
  ON investors FOR SELECT
  USING (email = auth.jwt() ->> 'email');

-- SAFT rounds are readable by any authenticated user
CREATE POLICY "rounds_read_all"
  ON saft_rounds FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allocations visible only to the investor they belong to
CREATE POLICY "allocations_read_own"
  ON allocations FOR SELECT
  USING (
    investor_id IN (
      SELECT id FROM investors WHERE email = auth.jwt() ->> 'email'
    )
  );

-- Admin table: no client-side reads (checked server-side with service role key)
-- This keeps admin emails private
CREATE POLICY "admin_no_client_access"
  ON admin_users FOR SELECT
  USING (false);


-- ─── 4. SEED DATA (optional — remove or modify) ────────────

-- Example rounds — adjust to match your actual SAFT terms
INSERT INTO saft_rounds (name, token_price, tge_unlock_pct, cliff_months, vesting_months) VALUES
  ('Seed',      0.01, 10, 6, 24),
  ('Private',   0.03, 15, 3, 18),
  ('Strategic', 0.05, 20, 0, 12);

-- Example admin — replace with your actual admin email
-- INSERT INTO admin_users (email, role) VALUES
--   ('admin@kayanforest.com', 'super_admin');

-- Example investor — for testing only, remove in production
-- INSERT INTO investors (email, full_name) VALUES
--   ('investor@example.com', 'Test Investor');
-- Then add an allocation linking them to a round.
