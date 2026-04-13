-- ═══════════════════════════════════════════════════════════════
--  Barbershop App — Initial Schema
-- ═══════════════════════════════════════════════════════════════

-- ─── פרופילי משתמשים ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name       text NOT NULL,
  phone      text,
  role       text NOT NULL DEFAULT 'customer',  -- 'customer' | 'admin'
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_check CHECK (role IN ('customer', 'admin'))
);

-- ─── שירותים ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text,
  duration_minutes int  NOT NULL CHECK (duration_minutes > 0),
  price            numeric(10,2) CHECK (price >= 0),
  is_active        boolean NOT NULL DEFAULT true,
  display_order    int     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── ספרים ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  photo_url   text,
  bio         text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- שירותים שכל ספר מבצע
CREATE TABLE IF NOT EXISTS staff_services (
  staff_id    uuid NOT NULL REFERENCES staff    ON DELETE CASCADE,
  service_id  uuid NOT NULL REFERENCES services ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

-- שעות עבודה של כל ספר לכל יום בשבוע
CREATE TABLE IF NOT EXISTS staff_hours (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     uuid NOT NULL REFERENCES staff ON DELETE CASCADE,
  day_of_week  int  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   time,
  end_time     time,
  is_working   boolean NOT NULL DEFAULT true
);

-- חסימות: הפסקות, חופשות, ימי מחלה
CREATE TABLE IF NOT EXISTS blocked_times (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   uuid NOT NULL REFERENCES staff ON DELETE CASCADE,
  start_at   timestamptz NOT NULL,
  end_at     timestamptz NOT NULL,
  reason     text,
  CHECK (end_at > start_at)
);

-- ─── שעות פעילות העסק ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_hours (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week  int  NOT NULL UNIQUE CHECK (day_of_week BETWEEN 0 AND 6),
  open_time    time,
  close_time   time,
  is_closed    boolean NOT NULL DEFAULT false
);

-- ─── הגדרות עסק ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cancellation_hours       int     NOT NULL DEFAULT 24,
  cancellation_fee         numeric(10,2),
  smart_scheduling_enabled boolean NOT NULL DEFAULT false,
  free_slots_count         int     NOT NULL DEFAULT 1,
  invoice_footer_text      text,
  calendar_default_view    text    NOT NULL DEFAULT 'week',
  calendar_columns         int     NOT NULL DEFAULT 1,
  CONSTRAINT one_row CHECK (id IS NOT NULL)
);

-- ─── תורים ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid REFERENCES profiles ON DELETE SET NULL,
  service_id          uuid REFERENCES services,
  staff_id            uuid REFERENCES staff,
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'confirmed',
  cancellation_reason text,
  cancelled_by        text,
  notes               text,
  invoice_sent        boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  CONSTRAINT status_check CHECK (
    status IN ('confirmed', 'cancelled', 'completed', 'pending_reschedule')
  )
);

-- אינדקסים לביצועים
CREATE INDEX IF NOT EXISTS idx_appointments_staff_time
  ON appointments (staff_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_appointments_date
  ON appointments (start_at);

CREATE INDEX IF NOT EXISTS idx_appointments_customer
  ON appointments (customer_id);

CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON appointments (status);

-- ─── הצעות העברת תור — Gap Closer ──────────────────────────────
CREATE TABLE IF NOT EXISTS reschedule_offers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   uuid NOT NULL REFERENCES appointments ON DELETE CASCADE,
  offered_start_at timestamptz NOT NULL,
  offered_end_at   timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  sent_at          timestamptz NOT NULL DEFAULT now(),
  responded_at     timestamptz,
  CONSTRAINT offer_status_check CHECK (status IN ('pending', 'accepted', 'declined'))
);

-- ─── נתוני ברירת מחדל ───────────────────────────────────────────

-- הגדרות עסק ראשוניות
INSERT INTO business_settings (
  cancellation_hours, smart_scheduling_enabled, free_slots_count,
  calendar_default_view, calendar_columns
)
SELECT 24, false, 1, 'week', 1
WHERE NOT EXISTS (SELECT 1 FROM business_settings);

-- שעות פעילות ברירת מחדל (ראשון–שישי 09:00–19:00, שבת סגור)
INSERT INTO business_hours (day_of_week, open_time, close_time, is_closed)
SELECT v.day, '09:00'::time, '19:00'::time, v.closed
FROM (VALUES
  (0, false), -- ראשון
  (1, false), -- שני
  (2, false), -- שלישי
  (3, false), -- רביעי
  (4, false), -- חמישי
  (5, false), -- שישי
  (6, true)   -- שבת
) AS v(day, closed)
WHERE NOT EXISTS (SELECT 1 FROM business_hours);
