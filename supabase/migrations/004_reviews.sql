-- ─── ביקורות לקוחות ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments ON DELETE CASCADE,
  customer_id    uuid REFERENCES profiles ON DELETE CASCADE,
  staff_id       uuid REFERENCES staff ON DELETE CASCADE,
  rating         int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text,
  is_visible     boolean DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (appointment_id)  -- one review per appointment
);

CREATE INDEX idx_reviews_staff    ON reviews(staff_id);
CREATE INDEX idx_reviews_customer ON reviews(customer_id);

-- RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read visible reviews
CREATE POLICY "reviews_read" ON reviews
  FOR SELECT USING (is_visible = true);

-- Authenticated customers can insert their own review
CREATE POLICY "reviews_insert" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- Customers can update their own review
CREATE POLICY "reviews_update" ON reviews
  FOR UPDATE USING (auth.uid() = customer_id);

-- Admin can do anything
CREATE POLICY "reviews_admin" ON reviews
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
