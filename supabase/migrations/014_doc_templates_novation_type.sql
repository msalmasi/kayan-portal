-- 014: Allow 'novation' in doc_templates.doc_type
-- The reissuance system now uses uploaded .docx templates for novation
-- agreements instead of hardcoded HTML. This adds 'novation' to the
-- doc_templates CHECK constraint (investor_documents was already
-- updated in migration 013).

ALTER TABLE doc_templates DROP CONSTRAINT IF EXISTS doc_templates_doc_type_check;

ALTER TABLE doc_templates
  ADD CONSTRAINT doc_templates_doc_type_check
  CHECK (doc_type IN ('saft', 'ppm', 'cis', 'novation'));
