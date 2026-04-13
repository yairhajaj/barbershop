-- ═══════════════════════════════════════════════════════════════
--  Row Level Security Policies
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE services           ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff              ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_services     ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_hours        ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_times      ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours     ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reschedule_offers  ENABLE ROW LEVEL SECURITY;

-- Helper: האם המשתמש המחובר הוא admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ─── profiles ───────────────────────────────────────────────────
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id OR is_admin());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Admin can manage all profiles"
  ON profiles FOR ALL USING (is_admin());

-- ─── services ───────────────────────────────────────────────────
CREATE POLICY "Anyone can view active services"
  ON services FOR SELECT USING (is_active = true OR is_admin());

CREATE POLICY "Admin manages services"
  ON services FOR ALL USING (is_admin());

-- ─── staff ──────────────────────────────────────────────────────
CREATE POLICY "Anyone can view active staff"
  ON staff FOR SELECT USING (is_active = true OR is_admin());

CREATE POLICY "Admin manages staff"
  ON staff FOR ALL USING (is_admin());

-- ─── staff_services, staff_hours, blocked_times ─────────────────
CREATE POLICY "Public read staff_services"
  ON staff_services FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manages staff_services"
  ON staff_services FOR ALL USING (is_admin());

CREATE POLICY "Public read staff_hours"
  ON staff_hours FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manages staff_hours"
  ON staff_hours FOR ALL USING (is_admin());

CREATE POLICY "Public read blocked_times"
  ON blocked_times FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manages blocked_times"
  ON blocked_times FOR ALL USING (is_admin());

-- ─── business_hours, business_settings ──────────────────────────
CREATE POLICY "Anyone can read business_hours"
  ON business_hours FOR SELECT USING (true);

CREATE POLICY "Admin manages business_hours"
  ON business_hours FOR ALL USING (is_admin());

CREATE POLICY "Anyone can read business_settings"
  ON business_settings FOR SELECT USING (true);

CREATE POLICY "Admin manages business_settings"
  ON business_settings FOR ALL USING (is_admin());

-- ─── appointments ────────────────────────────────────────────────
CREATE POLICY "Customers view own appointments"
  ON appointments FOR SELECT
  USING (customer_id = auth.uid() OR is_admin());

CREATE POLICY "Customers create appointments"
  ON appointments FOR INSERT
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Customers cancel own appointments"
  ON appointments FOR UPDATE
  USING (customer_id = auth.uid())
  WITH CHECK (status = 'cancelled');

CREATE POLICY "Admin manages all appointments"
  ON appointments FOR ALL USING (is_admin());

-- ─── reschedule_offers ───────────────────────────────────────────
CREATE POLICY "Customer views own reschedule offers"
  ON reschedule_offers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = appointment_id AND a.customer_id = auth.uid()
    ) OR is_admin()
  );

CREATE POLICY "Customer responds to reschedule offer"
  ON reschedule_offers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = appointment_id AND a.customer_id = auth.uid()
    )
  )
  WITH CHECK (status IN ('accepted', 'declined'));

CREATE POLICY "Admin manages reschedule offers"
  ON reschedule_offers FOR ALL USING (is_admin());
