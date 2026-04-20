-- Add plain-text password storage for admin visibility
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_plain text;
