-- 018_transfers.sql
-- Secondary transfer tracking (post-issuance)

CREATE TABLE transfers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_investor_id uuid NOT NULL REFERENCES investors(id),
  to_investor_id uuid REFERENCES investors(id),
  allocation_id uuid NOT NULL REFERENCES allocations(id),
  round_id uuid NOT NULL REFERENCES saft_rounds(id),
  token_amount numeric NOT NULL CHECK (token_amount > 0),
  price_per_token numeric,
  total_consideration numeric,
  transfer_type text NOT NULL DEFAULT 'sale'
    CHECK (transfer_type IN ('sale', 'gift', 'estate', 'corporate_restructure')),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested', 'under_review', 'approved',
      'completed', 'rejected', 'cancelled', 'recorded'
    )),
  direction text NOT NULL DEFAULT 'pre_approved'
    CHECK (direction IN ('pre_approved', 'recorded')),
  initiated_by text NOT NULL DEFAULT 'admin'
    CHECK (initiated_by IN ('investor', 'admin')),
  tx_hash text,
  from_wallet text,
  to_wallet text,
  reason text,
  admin_notes text,
  compliance_checks jsonb DEFAULT '{}',
  rejection_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_transfers_status ON transfers(status);
CREATE INDEX idx_transfers_from ON transfers(from_investor_id);
CREATE INDEX idx_transfers_to ON transfers(to_investor_id);

-- Link received allocations back to source transfer
ALTER TABLE allocations ADD COLUMN IF NOT EXISTS transferred_from uuid REFERENCES transfers(id);

-- RLS
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all ON transfers FOR ALL
  USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));

CREATE POLICY investor_own ON transfers FOR SELECT
  USING (
    from_investor_id IN (SELECT id FROM investors WHERE lower(email) = lower(auth.jwt() ->> 'email'))
    OR to_investor_id IN (SELECT id FROM investors WHERE lower(email) = lower(auth.jwt() ->> 'email'))
  );
