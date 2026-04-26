-- Add gap_closer_max_shift_minutes to business_settings
-- Controls the maximum minutes a customer can be asked to shift their appointment (earlier or later).
-- Default: 90 minutes.
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS gap_closer_max_shift_minutes integer DEFAULT 90;
