# Barbershop App

Booking and management app for barbershops — customers book appointments, admins manage staff/services/invoices.

## Tech Stack

- React 19 + Vite 8
- Tailwind CSS 4 (via @tailwindcss/vite plugin)
- React Router 7 (createBrowserRouter)
- Supabase (auth + database + storage)
- Framer Motion (animations)
- @react-pdf/renderer (invoice PDF generation)
- @dnd-kit (drag and drop)
- date-fns (date formatting)
- ESLint

## Project Structure

- `src/pages/booking/` — customer booking flow (service > staff > datetime > details > confirmation)
- `src/pages/admin/` — admin panel (dashboard, appointments, staff, services, products, invoices, settings, appearance)
- `src/pages/auth/` — login/register (phone-based auth via Supabase)
- `src/pages/customer/` — customer area (my appointments)
- `src/contexts/` — AuthContext, ThemeContext, LangContext
- `src/hooks/` — data hooks (useStaff, useServices, useAppointments, useProducts, useReviews, useBusinessSettings, useBusinessGallery, useStaffPortfolio, useRecurringBreaks)
- `src/lib/` — supabase client, utils, upload helper, invoice PDF template
- `src/layouts/` — AdminLayout, BookingLayout
- `src/components/ui/` — Badge, Modal, Spinner, Toast, ImageUpload

## Deployment — כל שינוי קוד צריך להגיע ל-3 פלטפורמות

### 1. אתר (Vercel) — אוטומטי
```bash
git add <files>
git commit -m "תיאור"
git push
# Vercel מפרס אוטומטית מ-branch main — ממתין ~1-2 דקות
```

### 2. Android (Google Play) — Codemagic
1. לאחר git push → נכנס ל-https://codemagic.io
2. Apps → barbershop-app → **Start new build**
3. Branch: `main` | Workflow: **Android Release (AAB)**
4. לאחר ~10 דקות → הורד `app-release.aab` מ-Artifacts
5. Google Play Console → HAJAJ Hair Design → בדיקות → בדיקה פנימית → **יצירת גרסה חדשה** → העלה AAB
- Package: `com.hajajhairdesign.booking`
- Keystore: `android/hajaj-release.keystore` (alias: hajaj)

### 3. iOS (TestFlight / App Store) — Codemagic
1. לאחר git push → נכנס ל-https://codemagic.io
2. Apps → barbershop-app → **Start new build**
3. Branch: `main` | Workflow: **iOS Release (IPA)**
4. ה-IPA עולה אוטומטית ל-TestFlight בסיום ✅
5. לפני כל build חדש ל-iOS — יש לעדכן `CURRENT_PROJECT_VERSION` ב:
   `ios/App/App.xcodeproj/project.pbxproj` (לערך גבוה מהקודם)
- Bundle ID: `com.hajaj.app`
- App Store Connect App ID: `6762282148`

### ⚠️ חשוב
- שינויי **DB** (Supabase migrations) → מריצים ידנית ב-SQL Editor
- שינויי **Edge Functions** → פרסום ידני ב-Supabase Dashboard → Edge Functions
- שינויי **קוד בלבד** → רק git push (Vercel) + Codemagic build

---

## What Looks Ready

- Full booking flow (6 pages)
- Admin panel with 8 sections
- Auth system (phone-to-email pattern with Supabase)
- RTL/Hebrew support (invoice has `direction: 'rtl'`)
- Theme and language contexts
- PDF invoice generation
- Image upload with Supabase storage
- Drag and drop support
