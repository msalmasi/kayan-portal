-- 018b_transfers_fix.sql
-- Run this if 018_transfers.sql partially failed due to auth_user_id error

-- Drop the broken policy if it exists
DROP POLICY IF EXISTS investor_own ON transfers;

-- Re-create with correct email-based auth
CREATE POLICY investor_own ON transfers FOR SELECT
  USING (
    from_investor_id IN (SELECT id FROM investors WHERE lower(email) = lower(auth.jwt() ->> 'email'))
    OR to_investor_id IN (SELECT id FROM investors WHERE lower(email) = lower(auth.jwt() ->> 'email'))
  );

-- Ensure initiated_by column exists (may have been added after the error)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transfers' AND column_name = 'initiated_by'
  ) THEN
    ALTER TABLE transfers ADD COLUMN initiated_by text NOT NULL DEFAULT 'admin'
      CHECK (initiated_by IN ('investor', 'admin'));
  END IF;
END $$;

-- Ensure transferred_from column exists on allocations
ALTER TABLE allocations ADD COLUMN IF NOT EXISTS transferred_from uuid REFERENCES transfers(id);
