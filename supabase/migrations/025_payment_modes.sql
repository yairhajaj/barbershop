-- Migration 025: Granular payment mode control

-- Global payment mode in business_settings
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'required';
  -- 'required'   → לקוח חייב לשלם כדי לסיים הזמנה
  -- 'optional'   → לקוח יכול לשלם עכשיו או בעסק
  -- 'per_service'→ כל שירות קובע את מצב התשלום שלו

-- Per-service payment mode override
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'inherit';
  -- 'inherit'  → לפי הגדרות ראשיות
  -- 'required' → חובה לשלם
  -- 'optional' → אופציונלי
  -- 'disabled' → ללא תשלום לשירות זה

-- Per-branch payment mode override
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'inherit';
  -- 'inherit'  → לפי הגדרות ראשיות
  -- 'required' → חובה לשלם
  -- 'optional' → אופציונלי
  -- 'disabled' → ללא תשלום לסניף זה
