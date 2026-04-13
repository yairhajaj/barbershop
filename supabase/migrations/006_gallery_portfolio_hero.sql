-- ─── גלריית העסק ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_gallery (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url           text NOT NULL,
  caption       text,
  type          text NOT NULL DEFAULT 'image',  -- 'image' | 'video'
  display_order int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE business_gallery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gallery_read"  ON business_gallery FOR SELECT USING (true);
CREATE POLICY "gallery_admin" ON business_gallery FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ─── פורטפוליו ספרים ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_portfolio (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NOT NULL REFERENCES staff ON DELETE CASCADE,
  image_url     text NOT NULL,
  caption       text,
  display_order int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_portfolio_staff ON staff_portfolio(staff_id);

ALTER TABLE staff_portfolio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolio_read"  ON staff_portfolio FOR SELECT USING (true);
CREATE POLICY "portfolio_admin" ON staff_portfolio FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ─── הגדרות hero ─────────────────────────────────────────────────
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS hero_image_url text,
  ADD COLUMN IF NOT EXISTS hero_type      text NOT NULL DEFAULT 'gradient';
  -- 'gradient' | 'image' | 'video'
