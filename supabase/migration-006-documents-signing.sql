-- ============================================================
-- Migration 006: Document management, signing, and audit trail
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─── 1. DOCUMENT TEMPLATES ─────────────────────────────────

-- Stores uploaded template files (SAFT docx, PPM pdf, CIS pdf)
CREATE TABLE doc_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type    TEXT NOT NULL CHECK (doc_type IN ('saft', 'ppm', 'cis')),
  round_id    UUID REFERENCES saft_rounds(id) ON DELETE CASCADE,  -- null for CIS (global)
  file_name   TEXT NOT NULL,
  storage_path TEXT NOT NULL,                -- path in Supabase Storage
  placeholders JSONB,                        -- list of {{placeholder}} keys found in SAFT
  is_active   BOOLEAN DEFAULT true,          -- soft-delete / versioning
  uploaded_by TEXT,                           -- admin email
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Only one active template per type per round
CREATE UNIQUE INDEX idx_doc_templates_active
  ON doc_templates(doc_type, round_id)
  WHERE is_active = true;

-- CIS is global — only one active CIS (round_id IS NULL)
CREATE UNIQUE INDEX idx_doc_templates_cis_active
  ON doc_templates(doc_type)
  WHERE doc_type = 'cis' AND round_id IS NULL AND is_active = true;

ALTER TABLE doc_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doc_templates_no_client" ON doc_templates FOR SELECT USING (false);

-- ─── 2. INVESTOR DOCUMENTS (generated + signed) ────────────

-- Tracks each document generated for an investor
CREATE TABLE investor_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id     UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL CHECK (doc_type IN ('saft', 'ppm', 'cis')),
  round_id        UUID REFERENCES saft_rounds(id),
  template_id     UUID REFERENCES doc_templates(id),

  -- Generated document
  storage_path    TEXT,                       -- filled docx / linked PDF in storage
  html_content    TEXT,                       -- rendered HTML for in-portal viewing
  doc_hash        TEXT,                       -- SHA-256 of generated content

  -- Signing
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'viewed', 'signed')),
  signed_at       TIMESTAMPTZ,
  signature_name  TEXT,                       -- typed signature
  signature_ip    TEXT,                       -- signer's IP
  signature_ua    TEXT,                       -- user agent
  signed_pdf_path TEXT,                       -- final executed PDF in storage

  -- Metadata
  variables       JSONB,                      -- snapshot of variables used in generation
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_investor_docs_investor ON investor_documents(investor_id);
CREATE INDEX idx_investor_docs_status ON investor_documents(status);

ALTER TABLE investor_documents ENABLE ROW LEVEL SECURITY;

-- Investors can see their own documents
CREATE POLICY "investor_docs_own"
  ON investor_documents FOR SELECT
  USING (investor_id IN (
    SELECT id FROM investors WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email')
  ));

-- ─── 3. SIGNING AUDIT LOG ──────────────────────────────────

-- Immutable log of every signing-related event
CREATE TABLE signing_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES investor_documents(id) ON DELETE CASCADE,
  investor_id   UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN (
    'generated', 'viewed', 'signed', 'downloaded', 'voided'
  )),
  ip_address    TEXT,
  user_agent    TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_signing_events_doc ON signing_events(document_id);
ALTER TABLE signing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signing_events_no_client" ON signing_events FOR SELECT USING (false);

-- ─── 4. EXPAND EMAIL TYPES ─────────────────────────────────

ALTER TABLE email_events DROP CONSTRAINT IF EXISTS email_events_email_type_check;
ALTER TABLE email_events
  ADD CONSTRAINT email_events_email_type_check
  CHECK (email_type IN (
    'welcome', 'capital_call', 'reminder',
    'docs_package', 'pq_submitted_notification', 'pq_approved', 'pq_rejected',
    'documents_ready', 'saft_signed'
  ));

-- ─── 5. STORAGE BUCKET ─────────────────────────────────────
-- Run this manually or via Supabase dashboard:
--   Create storage bucket: "documents" (private)
--   No public access — served via signed URLs through the API
