-- 1. Rename round deadline → closing_date (semantic change: round offer window, not payment deadline)
ALTER TABLE saft_rounds RENAME COLUMN deadline TO closing_date;
COMMENT ON COLUMN saft_rounds.closing_date IS 'After this date: no new investors, no SAFT signing, no new capital calls. Existing capital calls remain payable.';

-- 2. Per-allocation payment deadline (set when capital call is issued)
ALTER TABLE allocations ADD COLUMN IF NOT EXISTS payment_deadline timestamptz;
COMMENT ON COLUMN allocations.payment_deadline IS 'Payment due date for this allocation. Set when capital call is issued. NULL = no deadline.';

-- 3. Admin-configurable default payment term (business days after capital call)
ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS capital_call_payment_days integer DEFAULT 10;
COMMENT ON COLUMN payment_settings.capital_call_payment_days IS 'Default business days after capital call issuance for payment deadline.';
