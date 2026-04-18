-- Add branch_id to finance tables for multi-branch correctness.
-- Critical for tax reports: previously all branches aggregated into one view.
--
-- Tables: payments, invoices, manual_income, expenses, staff_commissions
-- (customer_debts intentionally excluded — customers are not branch-scoped)

-- ── payments ─────────────────────────────────────────────────────────
ALTER TABLE payments        ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_branch ON payments(branch_id);

-- Backfill from related appointment
UPDATE payments p
SET branch_id = a.branch_id
FROM appointments a
WHERE p.appointment_id = a.id AND p.branch_id IS NULL AND a.branch_id IS NOT NULL;

-- ── invoices ─────────────────────────────────────────────────────────
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices(branch_id);

-- Backfill from related appointment (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'appointment_id') THEN
    UPDATE invoices i
    SET branch_id = a.branch_id
    FROM appointments a
    WHERE i.appointment_id = a.id AND i.branch_id IS NULL AND a.branch_id IS NOT NULL;
  END IF;
END $$;

-- ── manual_income ────────────────────────────────────────────────────
ALTER TABLE manual_income   ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_manual_income_branch ON manual_income(branch_id);

-- ── expenses ─────────────────────────────────────────────────────────
ALTER TABLE expenses        ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id);

-- ── staff_commissions ────────────────────────────────────────────────
ALTER TABLE staff_commissions ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_staff_commissions_branch ON staff_commissions(branch_id);

-- Backfill from related appointment (if FK exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_commissions' AND column_name = 'appointment_id') THEN
    UPDATE staff_commissions sc
    SET branch_id = a.branch_id
    FROM appointments a
    WHERE sc.appointment_id = a.id AND sc.branch_id IS NULL AND a.branch_id IS NOT NULL;
  END IF;
END $$;

-- Note: rows without branch_id are treated as "legacy/global" and will appear
-- in queries that use .or('branch_id.eq.X,branch_id.is.null') pattern.
