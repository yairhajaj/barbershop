-- 030: Guest Profiles — allow creating customer profiles without auth.users
-- Enables manual customer creation and importContacts

-- Drop the FK so profiles can exist independently of auth.users
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Add auto-generate UUID default (was missing)
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Flag to distinguish guest (manually created) vs auth (registered) profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

-- Fast phone lookup for auto-link on registration
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
