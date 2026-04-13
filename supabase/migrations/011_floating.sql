ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS floating boolean NOT NULL DEFAULT false;
