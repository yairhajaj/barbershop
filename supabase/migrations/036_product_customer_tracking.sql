-- manual_income: track which product was sold and which registered customer bought it
ALTER TABLE manual_income ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE manual_income ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- staff: per-member product commission settings
ALTER TABLE staff ADD COLUMN IF NOT EXISTS product_commission_type text DEFAULT 'none';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS product_commission_rate numeric(5,2) DEFAULT 0;
