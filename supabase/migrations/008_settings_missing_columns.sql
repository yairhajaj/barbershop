-- עמודות שחסרות ב-business_settings (מוסיפים בבטחה עם IF NOT EXISTS)

ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS cancellation_fee_type       text    NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS smart_adjacent              boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS smart_start_of_day         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS smart_end_of_day           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recurring_appointments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recurring_weeks_ahead       int     NOT NULL DEFAULT 12;

-- אפשר למחוק ספר גם אם יש לו תורים (תור יישאר ללא ספר מקושר)
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_staff_id_fkey;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES staff ON DELETE SET NULL;
