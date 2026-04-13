ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS booking_flow text NOT NULL DEFAULT 'multistep';
-- 'multistep' = שלב אחר שלב | 'all-in-one' = עמוד אחד
