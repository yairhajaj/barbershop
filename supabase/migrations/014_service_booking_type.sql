-- Phase 1 #11: Add booking_type to services (online | by_request)
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS booking_type text DEFAULT 'online'
    CHECK (booking_type IN ('online', 'by_request'));
