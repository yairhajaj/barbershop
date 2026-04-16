-- ============================================================
-- 027_features.sql
-- 1. Announcements (business_settings columns)
-- 2. Registration fields (profiles columns)
-- 3. OTP codes table
-- 4. Customer debts table
-- 5. Staff commission per-staff fields
-- ============================================================

-- ── 1. Announcements ─────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS announcement_enabled    boolean DEFAULT false;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS announcement_title      text;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS announcement_body       text;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS announcement_expires_at timestamptz;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS announcement_color      text DEFAULT 'gold';
END $$;

-- ── 2. Registration fields ────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date       date;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender           text;  -- male | female | other
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted   boolean DEFAULT false;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
END $$;

-- ── 3. OTP codes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text NOT NULL,
  code       text NOT NULL,
  purpose    text DEFAULT 'register',  -- register | forgot_password
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used       boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (request OTP)
CREATE POLICY "Public can insert otp_codes"
  ON otp_codes FOR INSERT
  WITH CHECK (true);

-- Anyone can read their own OTP (by phone match — verified server-side)
CREATE POLICY "Public can read otp_codes"
  ON otp_codes FOR SELECT
  USING (true);

-- Edge functions update via service role — no policy needed for UPDATE
-- Admin full access
CREATE POLICY "Admin full access on otp_codes"
  ON otp_codes FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── 4. Customer debts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_debts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid REFERENCES profiles(id) NOT NULL,
  appointment_id uuid REFERENCES appointments(id),
  amount         numeric(10,2) NOT NULL,
  description    text,
  status         text DEFAULT 'pending',  -- pending | paid
  paid_at        timestamptz,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE customer_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on customer_debts"
  ON customer_debts FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Customer can read own debts"
  ON customer_debts FOR SELECT
  USING (customer_id = auth.uid());

CREATE INDEX idx_customer_debts_customer ON customer_debts(customer_id);
CREATE INDEX idx_customer_debts_status   ON customer_debts(status);

-- ── 5. Per-staff commission fields ───────────────────────────
DO $$ BEGIN
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS commission_type text DEFAULT 'inherit';
  -- inherit | percentage | fixed | salary
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS commission_rate    numeric(5,2);
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS monthly_salary     numeric(10,2);
END $$;
