-- Reminder opt-in per appointment
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_opted_in boolean DEFAULT false;

-- Reminder settings in business_settings
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS reminder_enabled   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_channel   text    DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS reminder_1_hours   int     DEFAULT 24,
  ADD COLUMN IF NOT EXISTS reminder_2_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_2_hours   int     DEFAULT 2,
  ADD COLUMN IF NOT EXISTS reminder_3_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_3_hours   int     DEFAULT 1;

-- Reminder send log (prevents duplicates)
CREATE TABLE IF NOT EXISTS reminder_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_num   int  NOT NULL,
  channel        text NOT NULL,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  success        boolean NOT NULL DEFAULT true,
  UNIQUE (appointment_id, reminder_num)
);

ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_reminder_logs" ON reminder_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
