-- 020_labuan_enhancements.sql
-- Labuan entity support: certification tracking + material events

-- Track certification freshness
ALTER TABLE investors ADD COLUMN IF NOT EXISTS pq_last_certified_at timestamptz;

-- Backfill from existing PQ review dates
UPDATE investors SET pq_last_certified_at = pq_reviewed_at
  WHERE pq_status = 'approved' AND pq_reviewed_at IS NOT NULL AND pq_last_certified_at IS NULL;

-- Material events table (Labuan FSA 14-day notification tracking)
CREATE TABLE material_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  fsa_deadline date NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'notified', 'closed')),
  notified_at timestamptz,
  notified_by text,
  notes text,
  created_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE material_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_only ON material_events FOR ALL
  USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));
