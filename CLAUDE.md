# HAJAJ — Barbershop App

## הנחיות סשן
- **תשובות קצרות וממוקדות** — חסוך טוקנים
- קוד: שנה רק מה שצריך, אל תחזור על קוד שלא השתנה
- לפני שינוי DB — בדוק אם הטבלה/עמודה כבר קיימת
- כל שינוי קוד: `git add → git commit → git push` (Vercel אוטומטי ~2 דק')
- שינויי DB: Supabase SQL Editor בלבד
- שינויי Edge Functions: Supabase Dashboard → Edge Functions → Deploy

---

## הפרויקט

**עסק:** HAJAJ Hair Design — מספרה בתל מונד (דולב 46) | טל: 054-946-0556 | WhatsApp: 972549460556

**מטרה:**
- שלב א (עכשיו): לפתח ולגמור עם HAJAJ כמקרה בוחן — **אין עדיין לקוחות אמיתיים**, בפיתוח פעיל
- **שלב ב — המטרה הסופית והחשובה ביותר:** בניית מערכת SaaS לפיתוח אפליקציות קביעת תורים לעסקים
  - כל עסק מקבל את אותה האפליקציה — מותאמת אישית (שם, צבעים, לוגו, שירותים)
  - "העתק, הגדר, הפץ" — Clone של הקוד + Supabase נפרד + build ב-Codemagic → אפליקציה בנייד לעסק
  - המטרה: פלטפורמה שמאפשרת להוציא אפליקציית תורים מלאה (iOS + Android + Web) לכל עסק בזמן קצר

**ארכיטקטורה:** Single-tenant כרגע (Supabase אחד = עסק אחד). כשמרחיבים ל-SaaS → כל עסק מקבל Supabase project משלו, או להוסיף `business_id` לכל הטבלאות.

---

## Tech Stack

| טכנולוגיה | גרסה | שימוש |
|-----------|------|-------|
| React | 19 | UI |
| Vite | 8 | Build |
| Tailwind CSS | 4 (via @tailwindcss/vite) | Styling |
| React Router | 7 | Routing |
| Supabase | 2 | Auth + DB + Storage + Edge Functions |
| Framer Motion | 12 | אנימציות |
| @react-pdf/renderer | 4 | חשבוניות PDF (RTL) |
| @dnd-kit | 6/10 | Drag & drop |
| date-fns | 4 | תאריכים |
| suncalc | 1.9 | Shabbat mode |
| Capacitor | 8 | iOS + Android |
| @capacitor/push-notifications | 8 | Push |
| @capacitor/camera | 8 | מצלמה |

---

## מבנה הפרויקט

```
src/
  pages/
    booking/        זרימת הזמנה ללקוח:
                    HomePage, SelectBranch, SelectService, SelectStaff,
                    SelectDateTime, CustomerDetails, Payment, Confirmation,
                    BookAll (all-in-one), WaitlistConfirm
    admin/          פאנל ניהול:
                    Dashboard, Appointments, Staff, Services, Products,
                    Branches, Customers, Payments, Invoices, Waitlist,
                    Messages, Appearance, Settings
    auth/           Login, Register (מבוסס טלפון → Supabase)
    customer/       MyAppointments
  layouts/
    BookingLayout   נווט + footer + bottom bar מובייל (z-50)
    AdminLayout     Sidebar + bottom toolbar מובייל (calendar מרכזי מוגבה)
  contexts/         AuthContext, ThemeContext, LangContext, BranchContext
  hooks/            useAppointments, useStaff, useServices, useProducts,
                    useBusinessSettings, useWaitlist, useReviews, useCustomers,
                    useRecurringBreaks, usePushNotifications,
                    useBusinessGallery, useStaffPortfolio
  components/ui/    Modal (z-[60]!), Toast, Spinner, Badge, ImageUpload
  lib/              supabase.js, utils.js, upload.js, invoice.jsx
  config/           business.js — שם עסק, צבעים, איש קשר

supabase/
  migrations/       25 קבצים (001_schema → 025_*)
  functions/        6 edge functions

android/            Capacitor Android — **בגיט! לא gitignored**
ios/                Capacitor iOS
```

---

## מסד הנתונים

| טבלה | תפקיד | הערות |
|------|--------|-------|
| `profiles` | משתמשים | role: admin/customer, push_token, is_blocked |
| `services` | שירותים | booking_type, payment_mode (inherit/required/optional/disabled) |
| `staff` | ספרים | photo_url, bio, branch_id |
| `staff_services` | ספר↔שירות | M2M |
| `staff_hours` | שעות שבועיות | day_of_week 0-6 |
| `staff_portfolio` | פורטפוליו | display_order |
| `recurring_breaks` | הפסקות קבועות | ארוחת צהריים וכו' |
| `blocked_times` | היעדרויות | חופשה, מחלה |
| `appointments` | הזמנות | status: confirmed/cancelled/completed/pending_reschedule, is_recurring, payment_status, invoice_sent |
| `reschedule_offers` | הצעות gap analysis | status: pending/accepted/declined |
| `reviews` | ביקורות | rating 1-5, is_visible |
| `waitlist` | רשימת המתנה | ⚠️ שני FK לstaff! status: pending/notified/booked/declined/expired/removed |
| `products` | מוצרים למכירה | is_featured |
| `business_gallery` | גלריה | type: image/video |
| `payments` | תשלומים | grow_transaction_code, status: pending/paid/failed/refunded |
| `message_logs` | לוג הודעות | channel: push/whatsapp/both |
| `branches` | סניפים | payment_mode override |
| `branch_hours` | שעות לפי סניף | |
| `business_hours` | שעות גלובליות | |
| `business_settings` | singleton הגדרות | ערכת נושא, Grow API keys, Shabbat, payment_mode, booking_flow, logo, hero |

---

## Edge Functions

| פונקציה | תפקיד |
|---------|--------|
| `create-payment` | יוצר דף תשלום Grow/Meshulam |
| `verify-payment` | מאמת תשלום + refund |
| `send-reminders` | תזכורות תור (push/WhatsApp) |
| `send-whatsapp` | שליחת WhatsApp |
| `send-push` | push notifications |
| `notify-waitlist` | התראה לרשימת המתנה כשמתפנה תור |

---

## Deployment — 3 פלטפורמות

### Web (Vercel) — אוטומטי
```bash
git add <files> && git commit -m "..." && git push
# Vercel מפרס אוטומטית ~2 דקות
```

### Android (Codemagic) — ~10 דקות
1. git push → codemagic.io → barbershop-app → **Start new build**
2. Branch: `main` | Workflow: **Android Release (AAB)**
3. הורד `app-release.aab` מ-Artifacts
4. Google Play Console → Internal Testing → גרסה חדשה → העלה AAB

- **Package:** `com.hajajhairdesign.booking`
- **Keystore:** `android/hajaj-release.keystore` (alias: `hajaj`)

### iOS (Codemagic) — ~90 דקות
1. git push → codemagic.io → **iOS Release (IPA)**
2. עולה אוטומטית ל-TestFlight ✅
3. ⚠️ **לפני כל build**: להגדיל `CURRENT_PROJECT_VERSION` ב-`ios/App/App.xcodeproj/project.pbxproj`

- **Bundle ID:** `com.hajaj.app`
- **App Store Connect ID:** `6762282148`

---

## פיצ'רים מוכנים ✅

- הזמנת תור (6 שלבים + all-in-one)
- ניהול יומן (day/week, drag & drop, gap analysis)
- ניהול ספרים + פורטפוליו + שעות + הפסקות
- ניהול שירותים + מוצרים
- ניהול סניפים (multi-branch)
- מאגר לקוחות + ביקורות
- חשבוניות PDF (RTL עברי)
- תשלומים Grow/Meshulam (per-service, per-branch modes)
- רשימת המתנה + התראות אוטומטיות
- Push notifications + WhatsApp
- Shabbat mode (suncalc — חישוב שקיעה לפי GPS)
- ערכות נושא + layouts שונים + גלריה + hero image/video
- תורים קבועים (recurring)
- Bottom toolbar מובייל — admin (יומן מרכזי מוגבה) + booking
- RTL מלא + עברית/אנגלית (LangContext)

---

## ⚠️ נקודות קריטיות — לא לשבור!

### waitlist — dual FK לstaff
```js
// ❌ שגוי — ambiguity error (שני FK: staff_id + offered_staff_id)
.select('*, staff(id, name)')

// ✅ נכון — FK hint מפורש
.select('*, staff!waitlist_staff_id_fkey(id, name)')
```

### Package Names — iOS ≠ Android
```
Android: com.hajajhairdesign.booking  (capacitor.config.ts + build.gradle)
iOS:     com.hajaj.app                (שונה! Bundle ID ב-Xcode)
```

### android/ בגיט
`android/` **אינה** ב-.gitignore — Codemagic צריך אותה. אל תוסיף אותה לgitignore.

### Modal z-index
```
BookingLayout bottom bar: z-50
AdminLayout bottom bar:   z-40
Modal:                    z-[60]  ← חייב להיות מעל הכל
```

### Body scroll lock ב-iOS Safari
```js
// ❌ לא עובד ב-iOS
document.body.style.overflow = 'hidden'

// ✅ עובד — ב-Modal.jsx
document.body.style.position = 'fixed'
document.body.style.top = `-${scrollY}px`
```

### business_settings — הוספת עמודה חדשה
חייבים **גם**:
1. Migration SQL (ALTER TABLE business_settings ADD COLUMN ...)
2. הוספה ל-`DEFAULT_SETTINGS` ב-`src/hooks/useBusinessSettings.js`

### CSS Variables — ערכות נושא
כל צבע דרך CSS variables: `var(--color-card)`, `var(--color-text)`, `var(--color-gold)`, `var(--color-muted)`, `var(--color-border)`, `var(--color-surface)`, `var(--shadow-card)`.
אל תשתמש בצבעים hardcoded (חוץ מצבעי brand ספציפיים).

### RLS
לכל טבלה חדשה חייבים להפעיל RLS ולהגדיר policies (admin: full access, customer: own data).
