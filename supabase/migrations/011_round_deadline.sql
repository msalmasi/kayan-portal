-- Optional payment deadline per round. NULL means no deadline.
-- After this date, unconfirmed allocations can no longer be paid for.
ALTER TABLE saft_rounds ADD COLUMN IF NOT EXISTS deadline timestamptz;
