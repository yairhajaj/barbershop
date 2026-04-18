-- ============================================================
-- 031_invoice_integrity.sql — Soft-delete + credit notes
-- Required by Israeli Tax Authority (הוראות ניהול ספרים):
-- Invoices must never be hard-deleted. Use cancellation + credit notes.
-- ============================================================

-- Invoices: add cancellation + credit-note fields
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS credit_note_for uuid REFERENCES invoices(id);

-- Expenses: same soft-delete pattern
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Business-level software registration number (רישום תוכנה ברשות המיסים)
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS tax_software_reg_number text;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_invoices_cancelled ON invoices(is_cancelled);
CREATE INDEX IF NOT EXISTS idx_invoices_credit_note_for ON invoices(credit_note_for);
CREATE INDEX IF NOT EXISTS idx_expenses_cancelled ON expenses(is_cancelled);
