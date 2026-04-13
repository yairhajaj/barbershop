-- Phase 1 #4: Add no_show column to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show boolean DEFAULT false;
