-- ============================================================
-- Migration 013: Platform Pause + SAFT Re-issuance Workflow
--
-- Two features:
--   1. Global platform pause — blocks investor-facing actions
--   2. SAFT re-issuance — novation flow for entity changes
-- ============================================================

-- ─── 1. PLATFORM SETTINGS (single-row, DB-driven) ──────────

CREATE TABLE platform_settings (
  id              BOOLEAN PRIMARY KEY DEFAULT true
    CHECK (id = true),                             -- enforces single row
  is_paused       BOOLEAN DEFAULT false,
  pause_reason    TEXT,                            -- shown to investors
  paused_at       TIMESTAMPTZ,
  paused_by       TEXT,                            -- admin email who toggled
  resumed_at      TIMESTAMPTZ,
  resumed_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed the single row
INSERT INTO platform_settings (id) VALUES (true);

-- RLS: no client-side access (read via service role only)
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_settings_no_client" ON platform_settings
  FOR SELECT USING (false);


-- ─── 2. REISSUANCE BATCHES ─────────────────────────────────
-- One batch per entity-change event. Tracks old/new entity info.

CREATE TABLE reissuance_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_entity_name TEXT NOT NULL,
  new_entity_name TEXT NOT NULL,
  new_entity_jurisdiction TEXT,
  reason          TEXT NOT NULL,                   -- admin-provided reason
  status          TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  initiated_by    TEXT NOT NULL,                   -- admin email
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE reissuance_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reissuance_batches_no_client" ON reissuance_batches
  FOR SELECT USING (false);


-- ─── 3. REISSUANCE ITEMS (per-investor, per-round) ─────────
-- Tracks each investor's novation → new SAFT progression.

CREATE TABLE reissuance_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        UUID NOT NULL REFERENCES reissuance_batches(id) ON DELETE CASCADE,
  investor_id     UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  round_id        UUID NOT NULL REFERENCES saft_rounds(id) ON DELETE CASCADE,
  old_saft_id     UUID REFERENCES investor_documents(id),
  novation_doc_id UUID REFERENCES investor_documents(id),
  new_saft_id     UUID REFERENCES investor_documents(id),
  status          TEXT DEFAULT 'pending_novation'
    CHECK (status IN (
      'pending_novation',     -- novation doc generated, awaiting investor signature
      'novation_signed',      -- investor signed novation, new SAFT being generated
      'pending_new_saft',     -- new SAFT generated, awaiting investor signature
      'complete',             -- new SAFT signed, fully done
      'cancelled'             -- admin cancelled this item
    )),
  created_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ,

  -- One reissuance per investor+round per batch
  UNIQUE (batch_id, investor_id, round_id)
);

CREATE INDEX idx_reissuance_items_batch ON reissuance_items(batch_id);
CREATE INDEX idx_reissuance_items_investor ON reissuance_items(investor_id);

ALTER TABLE reissuance_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reissuance_items_no_client" ON reissuance_items
  FOR SELECT USING (false);


-- ─── 4. EXPAND DOCUMENT TYPES ──────────────────────────────
-- Add 'novation' as a valid doc_type for investor_documents.
-- Add 'superseded' and 'terminated' as valid statuses.
--
-- Note: If your doc_type/status are enforced by CHECK constraints,
-- you'll need to drop + recreate them. If they're app-level only
-- (no CHECK), these ALTERs are informational.

-- Drop existing CHECK on doc_type if present, then recreate with novation
DO $$
BEGIN
  -- Try to drop the constraint — silently skip if it doesn't exist
  BEGIN
    ALTER TABLE investor_documents DROP CONSTRAINT IF EXISTS investor_documents_doc_type_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE investor_documents DROP CONSTRAINT IF EXISTS investor_documents_status_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END
$$;

-- Re-add with expanded values
ALTER TABLE investor_documents
  ADD CONSTRAINT investor_documents_doc_type_check
  CHECK (doc_type IN ('saft', 'ppm', 'cis', 'novation'));

ALTER TABLE investor_documents
  ADD CONSTRAINT investor_documents_status_check
  CHECK (status IN ('pending', 'viewed', 'signed', 'superseded', 'terminated'));

-- ─── 5. LINK FIELD: tie documents to reissuance ────────────
-- Optional FK back to the reissuance item that created this doc.

ALTER TABLE investor_documents
  ADD COLUMN IF NOT EXISTS reissuance_item_id UUID REFERENCES reissuance_items(id);
