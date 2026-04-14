-- Many-to-many: staff ↔ branches
CREATE TABLE IF NOT EXISTS staff_branches (
  staff_id  uuid NOT NULL REFERENCES staff(id)    ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, branch_id)
);

ALTER TABLE staff_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_staff_branches" ON staff_branches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "public_read_staff_branches" ON staff_branches FOR SELECT TO anon
  USING (true);

-- Migrate existing single branch_id → staff_branches
INSERT INTO staff_branches (staff_id, branch_id)
  SELECT id, branch_id FROM staff WHERE branch_id IS NOT NULL
  ON CONFLICT DO NOTHING;
