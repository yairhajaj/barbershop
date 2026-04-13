-- ─── לוגו ────────────────────────────────────────────────────────
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS logo_url text;

-- ─── מוצרים ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  price         numeric(10,2) NOT NULL,
  image_url     text,
  is_active     boolean DEFAULT true,
  is_featured   boolean DEFAULT false,
  display_order int DEFAULT 0,
  stock         int,          -- null = ללא הגבלה
  created_at    timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_read_all" ON products FOR SELECT USING (true);
CREATE POLICY "products_admin"    ON products FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
