ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS invoicing_enabled boolean DEFAULT true;
