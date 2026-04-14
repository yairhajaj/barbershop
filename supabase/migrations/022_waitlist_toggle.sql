-- Add waitlist_enabled toggle to business settings
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS waitlist_enabled boolean NOT NULL DEFAULT false;
