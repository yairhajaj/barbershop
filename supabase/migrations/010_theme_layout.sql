ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS theme  text NOT NULL DEFAULT 'orange',
  ADD COLUMN IF NOT EXISTS layout text NOT NULL DEFAULT 'modern';
