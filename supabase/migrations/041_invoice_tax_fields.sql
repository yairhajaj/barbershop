-- Add tax-compliance fields to invoices table
-- customer_vat_id: C100 field 1215 (customer VAT/tax ID — required for large invoices)
-- document_type:   C100 field 1203 (explicit doc type code: 305/320/330/400 — stored at creation)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS customer_vat_id TEXT,
  ADD COLUMN IF NOT EXISTS document_type   SMALLINT;
