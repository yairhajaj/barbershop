-- Phase 0: Create recurring_breaks table (was missing, causing schema cache error)
CREATE TABLE IF NOT EXISTS recurring_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  label text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recurring_breaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage recurring_breaks" ON recurring_breaks
  FOR ALL USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Public read recurring_breaks" ON recurring_breaks
  FOR SELECT USING (true);
