-- 007: Payment claims — investor-initiated payment submissions
-- Tracks wire references, crypto tx hashes, and on-chain verification.

CREATE TABLE IF NOT EXISTS payment_claims (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id   uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  round_id      uuid NOT NULL REFERENCES saft_rounds(id) ON DELETE CASCADE,

  -- Payment details
  method        text NOT NULL CHECK (method IN ('wire', 'usdc_eth', 'usdc_sol', 'usdt_eth', 'credit_card')),
  amount_usd    numeric(18,2) NOT NULL,

  -- Wire-specific
  wire_reference text,

  -- Crypto-specific
  tx_hash       text,
  from_wallet   text,
  chain         text CHECK (chain IN ('ethereum', 'solana')),
  token         text CHECK (token IN ('usdc', 'usdt')),

  -- Verification
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'verifying', 'verified', 'rejected', 'failed')),
  verified_at   timestamptz,
  verified_by   text,                    -- 'auto' for on-chain, admin email for manual
  rejection_reason text,

  -- On-chain verification details (stored from API response)
  chain_data    jsonb DEFAULT '{}',

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_claims_investor ON payment_claims(investor_id);
CREATE INDEX IF NOT EXISTS idx_payment_claims_round    ON payment_claims(round_id);
CREATE INDEX IF NOT EXISTS idx_payment_claims_status   ON payment_claims(status);
CREATE INDEX IF NOT EXISTS idx_payment_claims_tx_hash  ON payment_claims(tx_hash) WHERE tx_hash IS NOT NULL;
