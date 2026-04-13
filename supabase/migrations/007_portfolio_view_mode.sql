-- תצוגת פורטפוליו: 'grid' | 'story'
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS portfolio_view_mode text NOT NULL DEFAULT 'grid';
