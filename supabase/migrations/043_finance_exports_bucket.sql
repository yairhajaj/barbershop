-- Finance exports storage bucket for Excel reports / accountant email links
-- Files are uploaded by admins, downloaded via signed URLs (expire 7 days)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'finance-exports',
  'finance-exports',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Admins can upload and manage their own exports
CREATE POLICY "Admin upload finance exports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'finance-exports'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin read finance exports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'finance-exports'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin delete finance exports"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'finance-exports'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
