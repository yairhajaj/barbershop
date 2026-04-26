-- 031_appointment_approval.sql
-- Manual approval mode for appointments

-- 1. הרחבת status constraint להכיל pending_approval
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS status_check;
ALTER TABLE appointments ADD CONSTRAINT status_check CHECK (
  status IN ('confirmed', 'cancelled', 'completed', 'pending_reschedule', 'pending_approval')
);

-- 2. מתג גלובלי ב-business_settings
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS approval_required boolean DEFAULT false;

-- 3. אינדקס לשליפת ממתינים מהירה
CREATE INDEX IF NOT EXISTS appointments_pending_approval_idx
  ON appointments (start_at) WHERE status = 'pending_approval';
