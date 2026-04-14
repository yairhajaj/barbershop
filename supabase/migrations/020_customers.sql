-- Add is_blocked and email columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email text;
