-- Migration 024: Payment support (PayPlus integration)

-- Add PayPlus settings to business_settings
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS payment_enabled      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payplus_api_key      text,
  ADD COLUMN IF NOT EXISTS payplus_secret_key   text;

-- Add payment status to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';
  -- values: 'unpaid' | 'pending' | 'paid' | 'refunded'

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id          uuid REFERENCES appointments(id) ON DELETE SET NULL,
  amount                  numeric(10,2) NOT NULL,
  currency                text NOT NULL DEFAULT 'ILS',
  payplus_page_request_uid text,
  payplus_transaction_id  text,
  status                  text NOT NULL DEFAULT 'pending',
  -- values: 'pending' | 'paid' | 'failed' | 'refunded'
  created_at              timestamptz DEFAULT now()
);

-- Index for fast lookup by appointment
CREATE INDEX IF NOT EXISTS idx_payments_appointment_id
  ON payments (appointment_id);

-- RLS: admins can read all, customers can read their own (via appointment)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can manage payments"
  ON payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "customers can view own payments"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = payments.appointment_id
      AND appointments.customer_id = auth.uid()
    )
  );
