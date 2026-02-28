-- 008: Add amount_verified_usd to payment_claims
-- Tracks the actual verified amount (on-chain or admin-approved)
-- separately from the claimed/expected amount.

ALTER TABLE payment_claims
  ADD COLUMN IF NOT EXISTS amount_verified_usd numeric(18,2);
