-- Phase 1 #10: Shabbat mode settings
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS shabbat_mode boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS shabbat_lat numeric DEFAULT 31.7683,
  ADD COLUMN IF NOT EXISTS shabbat_lng numeric DEFAULT 35.2137,
  ADD COLUMN IF NOT EXISTS shabbat_offset_minutes int DEFAULT 18;
