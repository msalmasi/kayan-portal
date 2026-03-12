-- 021_rls_hardening.sql
-- Enable RLS on tables flagged by Supabase Security Advisor.
-- All four are admin-only tables accessed via service-role,
-- but RLS ensures they're locked down at the DB level too.

-- payment_settings
ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_only ON payment_settings FOR ALL
  USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));

-- admin_notifications
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_only ON admin_notifications FOR ALL
  USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));

-- payment_claims (contains sensitive financial data)
ALTER TABLE payment_claims ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY admin_all ON payment_claims FOR ALL
  USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));

-- Investors: can see their own claims only
CREATE POLICY investor_own ON payment_claims FOR SELECT
  USING (
    investor_id IN (
      SELECT id FROM investors
      WHERE lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- Investors: can insert their own claims
CREATE POLICY investor_insert ON payment_claims FOR INSERT
  WITH CHECK (
    investor_id IN (
      SELECT id FROM investors
      WHERE lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- admin_alert_subscriptions
ALTER TABLE admin_alert_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_only ON admin_alert_subscriptions FOR ALL
  USING (auth.jwt() ->> 'email' IN (SELECT email FROM admin_users));
