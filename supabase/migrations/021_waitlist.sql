-- Waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id          uuid REFERENCES services(id) ON DELETE SET NULL,
  branch_id           uuid REFERENCES branches(id) ON DELETE SET NULL,
  staff_id            uuid REFERENCES staff(id) ON DELETE SET NULL,
  preferred_date      date NOT NULL,
  time_from           time NOT NULL DEFAULT '08:00',
  time_to             time NOT NULL DEFAULT '20:00',
  notes               text,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','notified','booked','declined','expired','removed')),
  -- Slot offered to the customer (filled when notified)
  offered_slot_start  timestamptz,
  offered_slot_end    timestamptz,
  offered_staff_id    uuid REFERENCES staff(id) ON DELETE SET NULL,
  -- One-time token for accept/decline link
  token               text UNIQUE,
  token_expires_at    timestamptz,
  notified_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "admin_all_waitlist" ON waitlist FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Customer: own entries only
CREATE POLICY "customer_own_waitlist" ON waitlist FOR ALL TO authenticated
  USING (customer_id = auth.uid());

-- Anon: read by token (for confirm page)
CREATE POLICY "anon_read_by_token" ON waitlist FOR SELECT TO anon
  USING (token IS NOT NULL);
