-- Soft-delete for expenses and manual_income (Israeli tax law: records cannot be hard-deleted)
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS is_cancelled    boolean    DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at    timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE manual_income
  ADD COLUMN IF NOT EXISTS is_cancelled    boolean    DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at    timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE INDEX IF NOT EXISTS idx_expenses_is_cancelled      ON expenses(is_cancelled);
CREATE INDEX IF NOT EXISTS idx_manual_income_is_cancelled ON manual_income(is_cancelled);
