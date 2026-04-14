-- ── Branches table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  address    text,
  phone      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Branch hours (per-branch schedule, replaces global business_hours per branch) ──
CREATE TABLE IF NOT EXISTS branch_hours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  day_of_week int  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   time NOT NULL DEFAULT '09:00',
  close_time  time NOT NULL DEFAULT '19:00',
  is_closed   boolean NOT NULL DEFAULT false,
  UNIQUE (branch_id, day_of_week)
);

-- ── Add branch_id to staff & appointments ─────────────────────────────────
ALTER TABLE staff        ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE branches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_hours ENABLE ROW LEVEL SECURITY;

-- Admins can do everything; anon can read active branches
CREATE POLICY "admin_all_branches" ON branches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "public_read_branches" ON branches FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "admin_all_branch_hours" ON branch_hours FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "public_read_branch_hours" ON branch_hours FOR SELECT TO anon
  USING (true);

-- ── Seed: create first branch from existing data ──────────────────────────
INSERT INTO branches (name, address, phone)
  VALUES ('HAJAJ Hair Design', 'דולב 46, תל מונד', '054-946-0556')
  ON CONFLICT DO NOTHING;

-- Link all existing staff to the first branch
UPDATE staff
  SET branch_id = (SELECT id FROM branches ORDER BY created_at LIMIT 1)
  WHERE branch_id IS NULL;

-- Link all existing appointments to the first branch
UPDATE appointments
  SET branch_id = (SELECT id FROM branches ORDER BY created_at LIMIT 1)
  WHERE branch_id IS NULL;

-- Copy global business_hours into branch_hours for the first branch
INSERT INTO branch_hours (branch_id, day_of_week, open_time, close_time, is_closed)
  SELECT
    (SELECT id FROM branches ORDER BY created_at LIMIT 1),
    day_of_week,
    open_time,
    close_time,
    is_closed
  FROM business_hours
  ON CONFLICT (branch_id, day_of_week) DO NOTHING;
