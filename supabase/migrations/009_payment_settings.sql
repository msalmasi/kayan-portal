-- 009: Payment settings — admin-configurable payment methods, wallets, wire instructions
-- Single-row table. All payment config lives here instead of .env.

CREATE TABLE IF NOT EXISTS payment_settings (
  id                text PRIMARY KEY DEFAULT 'global',

  -- Per-method toggle + display config
  -- { "wire": { "enabled": true, "label": "Wire Transfer (USD)", "sublabel": "Manual verification" }, ... }
  methods           jsonb NOT NULL DEFAULT '{}',

  -- Receiving wallet addresses
  -- { "ethereum": "0x...", "solana": "..." }
  wallets           jsonb NOT NULL DEFAULT '{}',

  -- Wire transfer bank details
  -- { "bank_name": "...", "account_name": "...", "account_number": "...", ... }
  wire_instructions jsonb NOT NULL DEFAULT '{}',

  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        text
);

-- Seed with defaults
INSERT INTO payment_settings (id, methods, wallets, wire_instructions) VALUES (
  'global',
  '{
    "wire":        { "enabled": false, "label": "Wire Transfer (USD)", "sublabel": "Manual verification", "icon": "🏦" },
    "usdc_eth":    { "enabled": true,  "label": "USDC on Ethereum",   "sublabel": "ERC-20 · auto-verified", "icon": "Ξ" },
    "usdc_sol":    { "enabled": true,  "label": "USDC on Solana",     "sublabel": "SPL token · auto-verified", "icon": "◎" },
    "usdt_eth":    { "enabled": true,  "label": "USDT on Ethereum",   "sublabel": "ERC-20 · auto-verified", "icon": "Ξ" },
    "credit_card": { "enabled": false, "label": "Credit Card",        "sublabel": "Coming soon", "icon": "💳" }
  }'::jsonb,
  '{ "ethereum": "", "solana": "" }'::jsonb,
  '{ "bank_name": "", "account_name": "", "account_number": "", "routing_number": "", "swift_code": "", "reference_note": "Include your full name and Kayan Token as reference" }'::jsonb
) ON CONFLICT (id) DO NOTHING;
