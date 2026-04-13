-- Push token per customer
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token text;

-- Message send log
CREATE TABLE IF NOT EXISTS message_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  channel         text NOT NULL CHECK (channel IN ('push', 'whatsapp', 'both')),
  message_text    text NOT NULL,
  recipient_count int  NOT NULL DEFAULT 0,
  success_count   int  NOT NULL DEFAULT 0,
  filter_type     text NOT NULL CHECK (filter_type IN ('all', 'by_date')),
  filter_date     date,
  sent_by         uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_message_logs" ON message_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
