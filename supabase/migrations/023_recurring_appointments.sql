-- Add recurring appointment support to appointments table
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS is_recurring         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_group_id   uuid,
  ADD COLUMN IF NOT EXISTS reminder_opted_in    boolean NOT NULL DEFAULT true;

-- Index for querying all appointments in a recurring group
CREATE INDEX IF NOT EXISTS idx_appointments_recurring_group
  ON appointments (recurring_group_id)
  WHERE recurring_group_id IS NOT NULL;
