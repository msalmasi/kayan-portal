-- 015: Add entity_config JSONB column for white-label branding
-- Stores all configurable branding: entity name, logos, colors,
-- contact info, etc. NULL = use application defaults.

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS entity_config JSONB DEFAULT NULL;

COMMENT ON COLUMN platform_settings.entity_config IS
  'White-label branding config (entity name, logos, colors, contact info). NULL = defaults.';
