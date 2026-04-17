-- 028: Gap Closer — smart gap filling system
-- Adds settings + enhances reschedule_offers for token-based customer confirmation

-- Settings
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS gap_closer_mode text DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS gap_closer_threshold_minutes integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS gap_closer_advance_hours numeric DEFAULT 2;

-- Enhance reschedule_offers with token flow
ALTER TABLE reschedule_offers
  ADD COLUMN IF NOT EXISTS token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz DEFAULT (now() + interval '2 hours'),
  ADD COLUMN IF NOT EXISTS notification_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff(id);

-- Index for token lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_reschedule_offers_token ON reschedule_offers(token);

-- RLS
ALTER TABLE reschedule_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reschedule_offers_admin ON reschedule_offers;
CREATE POLICY reschedule_offers_admin ON reschedule_offers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Public read by token (for confirm page)
DROP POLICY IF EXISTS reschedule_offers_anon_read ON reschedule_offers;
CREATE POLICY reschedule_offers_anon_read ON reschedule_offers
  FOR SELECT USING (true);

-- Public update (for edge function with service role, but also allows token-based updates)
DROP POLICY IF EXISTS reschedule_offers_public_update ON reschedule_offers;
CREATE POLICY reschedule_offers_public_update ON reschedule_offers
  FOR UPDATE USING (true);
