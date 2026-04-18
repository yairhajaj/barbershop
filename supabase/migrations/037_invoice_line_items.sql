-- invoice_items: support multi-line invoices (service + products on same invoice)
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('service','product')),
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL,
  line_total numeric(10,2) NOT NULL,
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_staff   ON invoice_items(staff_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_kind    ON invoice_items(kind);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_items_admin_all ON invoice_items;
CREATE POLICY invoice_items_admin_all ON invoice_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
