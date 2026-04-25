-- 029: Gap Closer — admin approval flow
-- Add pending_owner_approval to reschedule_offers status constraint

ALTER TABLE reschedule_offers
  DROP CONSTRAINT IF EXISTS offer_status_check;

ALTER TABLE reschedule_offers
  ADD CONSTRAINT offer_status_check
  CHECK (status IN ('pending', 'pending_owner_approval', 'accepted', 'declined', 'expired'));
