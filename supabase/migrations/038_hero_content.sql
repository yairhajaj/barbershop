-- 038: Homepage hero content — editable title and tagline
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS hero_title   text,
  ADD COLUMN IF NOT EXISTS hero_tagline text;
