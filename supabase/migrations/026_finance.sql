-- ============================================================
-- 026_finance.sql — Financial management tables
-- ============================================================

-- ── 1. Expense Categories ────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  icon          text DEFAULT '📌',
  is_default    boolean DEFAULT false,
  is_active     boolean DEFAULT true,
  display_order int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on expense_categories"
  ON expense_categories FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed default categories
INSERT INTO expense_categories (name, icon, is_default, display_order) VALUES
  ('שכירות',      '🏠', true, 1),
  ('חומרי עבודה',  '✂️', true, 2),
  ('ציוד',         '🔧', true, 3),
  ('שיווק',        '📣', true, 4),
  ('ביטוח',        '🛡', true, 5),
  ('חשמל ומים',    '💡', true, 6),
  ('ניקיון',       '🧹', true, 7),
  ('תוכנה',        '💻', true, 8),
  ('הכשרה',        '🎓', true, 9),
  ('אחר',          '📌', true, 10)
ON CONFLICT DO NOTHING;

-- ── 2. Expenses ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid REFERENCES expense_categories(id),
  vendor_name     text,
  description     text,
  amount          numeric(10,2) NOT NULL,
  vat_amount      numeric(10,2) DEFAULT 0,
  date            date NOT NULL,
  payment_method  text DEFAULT 'cash',  -- cash / credit / transfer / check
  receipt_url     text,
  receipt_urls    text[] DEFAULT '{}',
  notes           text,
  is_recurring    boolean DEFAULT false,
  ai_scanned      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on expenses"
  ON expenses FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category_id);

-- ── 3. Invoices ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number    text NOT NULL UNIQUE,
  appointment_id    uuid REFERENCES appointments(id),
  customer_name     text,
  customer_phone    text,
  service_name      text,
  staff_name        text,
  service_date      timestamptz,
  amount_before_vat numeric(10,2),
  vat_rate          numeric(5,2) DEFAULT 18,
  vat_amount        numeric(10,2),
  total_amount      numeric(10,2) NOT NULL,
  status            text DEFAULT 'draft',  -- draft / sent / paid
  pdf_url           text,
  sent_at           timestamptz,
  paid_at           timestamptz,
  notes             text,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on invoices"
  ON invoices FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX idx_invoices_created ON invoices(created_at);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);

-- ── 4. Manual Income ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manual_income (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description     text NOT NULL,
  amount          numeric(10,2) NOT NULL,
  vat_amount      numeric(10,2) DEFAULT 0,
  date            date NOT NULL,
  payment_method  text DEFAULT 'cash',
  customer_name   text,
  staff_id        uuid REFERENCES staff(id),
  service_id      uuid REFERENCES services(id),
  appointment_id  uuid REFERENCES appointments(id),
  notes           text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE manual_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on manual_income"
  ON manual_income FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX idx_manual_income_date ON manual_income(date);

-- ── 5. Staff Commissions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_commissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        uuid REFERENCES staff(id) NOT NULL,
  appointment_id  uuid REFERENCES appointments(id),
  type            text DEFAULT 'percentage',  -- percentage / fixed / salary
  percentage      numeric(5,2),
  amount          numeric(10,2) NOT NULL,
  date            date NOT NULL,
  status          text DEFAULT 'pending',     -- pending / paid
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE staff_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access on staff_commissions"
  ON staff_commissions FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX idx_staff_commissions_staff ON staff_commissions(staff_id);
CREATE INDEX idx_staff_commissions_date ON staff_commissions(date);

-- ── 6. Extend business_settings ──────────────────────────────
DO $$ BEGIN
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) DEFAULT 18;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS business_tax_id text;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS business_type text DEFAULT 'osek_morsheh';
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS invoice_prefix text DEFAULT 'INV';
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS invoice_next_number int DEFAULT 1;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS accountant_name text;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS accountant_email text;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS accountant_phone text;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS cash_tracking_enabled boolean DEFAULT true;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS commission_type text DEFAULT 'percentage';
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS commission_default_rate numeric(5,2) DEFAULT 50;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS openai_api_key text;
END $$;

-- ── 7. Extend appointments ──────────────────────────────────
DO $$ BEGIN
  ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cash_paid boolean DEFAULT false;
END $$;

-- ── 8. Atomic invoice number function ────────────────────────
CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS text AS $$
DECLARE
  prefix text;
  num    int;
BEGIN
  SELECT invoice_prefix, invoice_next_number
    INTO prefix, num
    FROM business_settings
    LIMIT 1
    FOR UPDATE;  -- lock the row to prevent race conditions

  UPDATE business_settings SET invoice_next_number = num + 1;

  RETURN prefix || '-' || LPAD(num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;
