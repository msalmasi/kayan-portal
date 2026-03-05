-- 019_token_pools.sql
-- ESOP / team token pool tracking

CREATE TABLE token_pools (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  token_budget numeric NOT NULL DEFAULT 0 CHECK (token_budget >= 0),
  color text NOT NULL DEFAULT '8b5cf6',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE pool_grants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id uuid NOT NULL REFERENCES token_pools(id) ON DELETE RESTRICT,
  recipient_name text NOT NULL,
  recipient_email text,
  recipient_role text,
  recipient_type text NOT NULL DEFAULT 'employee'
    CHECK (recipient_type IN ('employee', 'advisor', 'contractor', 'other')),
  token_amount numeric NOT NULL CHECK (token_amount > 0),
  grant_date date NOT NULL DEFAULT CURRENT_DATE,
  exercise_price numeric,
  tge_unlock_pct numeric NOT NULL DEFAULT 0,
  cliff_months integer NOT NULL DEFAULT 12,
  vesting_months integer NOT NULL DEFAULT 36,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'fully_vested', 'terminated', 'cancelled')),
  termination_date date,
  termination_handling text
    CHECK (termination_handling IN ('cliff_forfeit', 'vest_to_date', 'accelerated')),
  wallet_address text,
  notes text,
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_pool_grants_pool ON pool_grants(pool_id);
CREATE INDEX idx_pool_grants_status ON pool_grants(status);

-- RLS: admin-only
ALTER TABLE token_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_pools ON token_pools FOR ALL
  USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));

CREATE POLICY admin_grants ON pool_grants FOR ALL
  USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));
