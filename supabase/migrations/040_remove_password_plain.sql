-- Remove plaintext password column — no longer needed with Firebase Phone Auth
ALTER TABLE profiles DROP COLUMN IF EXISTS password_plain;
