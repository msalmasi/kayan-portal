-- Track when an investor was prompted to update their PQ (after new allocation)
ALTER TABLE investors ADD COLUMN IF NOT EXISTS pq_update_prompted_at timestamptz;
