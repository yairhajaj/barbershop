-- ============================================================
-- 033_tax_registration.sql — Israeli Tax Authority software registration
-- OPENFRMT 1.31 + Professional Instruction 24/2004 compliance
--
-- Adds all fields required for:
--   1. A000 opening record (INI.TXT) — 466 chars
--   2. Proper software/manufacturer identification
--   3. Customer consent tracking (Inst. 24/2004 §18ב(ג)(1))
--   4. Quarterly backup tracking (Inst. 24/2004 §25(ו))
-- ============================================================

DO $$ BEGIN
  -- Business identification (fills A000 fields 1018-1022)
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS business_name            text    DEFAULT '';
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS business_address_street  text    DEFAULT '';
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS business_address_number  text    DEFAULT '';
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS business_address_city    text    DEFAULT '';
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS business_address_postal  text    DEFAULT '';

  -- Software identification (A000 fields 1007-1010)
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS software_name            text    DEFAULT 'Barbershop Booking';
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS software_version         text    DEFAULT '1.0';
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS manufacturer_vat_id      text    DEFAULT '';
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS manufacturer_name        text    DEFAULT '';

  -- Software type (A000 field 1011: 1=חד-שנתי, 2=רב-שנתי)
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS software_type            smallint DEFAULT 2;

  -- Bookkeeping type (A000 field 1013: 0=none, 1=single-entry, 2=double-entry)
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS bookkeeping_type         smallint DEFAULT 1;

  -- Legal entity identifiers (A000 fields 1015-1016)
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS company_registration_number text DEFAULT '';  -- ח.פ.
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS deduction_file_number       text DEFAULT '';  -- תיק ניכויים

  -- System defaults (A000 fields 1032, 1034)
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS leading_currency         text    DEFAULT 'ILS';
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS has_branches             boolean DEFAULT false;

  -- Customer consent flag (Instruction 24/2004)
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS customer_consent_required boolean DEFAULT true;

  -- Backup + export tracking (Instruction 24/2004 §25(ו))
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS last_quarterly_backup_at  timestamptz;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS last_openfrmt_export_at   timestamptz;

  -- Tax office notification flag (Instruction 24/2004 §18ב(ב))
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS tax_office_notified       boolean     DEFAULT false;
  ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS tax_office_notified_at    timestamptz;
END $$;

-- ============================================================
-- Customer consents — Instruction 24/2004 §18ב(ג)(1)
-- Each customer must consent in writing to receive computerized
-- documents (invoices, receipts) before we're allowed to send them.
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone  text NOT NULL,
  customer_name   text,
  consent_text    text NOT NULL,
  consented_at    timestamptz NOT NULL DEFAULT now(),
  ip_address      text,
  user_agent      text,
  revoked_at      timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_consents_phone ON customer_consents(customer_phone);

ALTER TABLE customer_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on customer_consents" ON customer_consents;
CREATE POLICY "Admin full access on customer_consents"
  ON customer_consents FOR ALL
  USING      (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Allow customers themselves to insert their own consent row
DROP POLICY IF EXISTS "Customers can insert own consent" ON customer_consents;
CREATE POLICY "Customers can insert own consent"
  ON customer_consents FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- Continuity check for invoice numbering (required by הוראת ניהול ספרים)
-- Returns missing + duplicate invoice numbers.
-- ============================================================
CREATE OR REPLACE FUNCTION check_invoice_continuity()
RETURNS TABLE(issue text, details text) AS $$
DECLARE
  min_num int;
  max_num int;
  expected_count int;
  actual_count int;
BEGIN
  -- Extract numeric part from invoice_number (format: PREFIX-NNNN)
  SELECT
    MIN((regexp_match(invoice_number, '(\d+)$'))[1]::int),
    MAX((regexp_match(invoice_number, '(\d+)$'))[1]::int),
    COUNT(DISTINCT invoice_number)
  INTO min_num, max_num, actual_count
  FROM invoices
  WHERE invoice_number ~ '\d+$';

  IF min_num IS NULL THEN
    RETURN;
  END IF;

  expected_count := max_num - min_num + 1;

  IF actual_count < expected_count THEN
    RETURN QUERY
    SELECT 'missing'::text,
           'Expected ' || expected_count || ' invoices from ' || min_num
             || ' to ' || max_num || ', found ' || actual_count;
  END IF;

  -- Find duplicate numbers
  RETURN QUERY
  SELECT 'duplicate'::text, invoice_number
  FROM invoices
  GROUP BY invoice_number
  HAVING COUNT(*) > 1;
END;
$$ LANGUAGE plpgsql;
