# PROJECT CONTEXT — HAJAJ Barbershop App

> **לקלוד:** קרא קובץ זה בתחילת כל שיחה חדשה כדי להבין את הפרויקט ולהמשיך בדיוק מאותה נקודה.

---

## החזון

### מטרה ראשית
**SaaS Platform לקביעת תורים** — מערכת שמאפשרת לפתוח אפליקציות קביעת תורים לעסקים שונים בכמה לחיצות כפתור, עם לוח ניהול מרכזי שמנהל את כל האפליקציות.

### מטרה משנית (שלב נוכחי)
לסיים את אפליקציית **HAJAJ** (מספרת חג'אג) ברמה גבוהה — היא תשמש כ-template ראשון וכאב-טיפוס למערכת העתידית.

---

## פרטי הפרויקט

| פרט | ערך |
|-----|-----|
| מיקום | `C:\Users\yairh\barbershop-app` |
| GitHub | `https://github.com/yairhajaj/barbershop.git` (branch: main) |
| Production | `https://barbershop-nine-iota.vercel.app` |
| בעלים | יאיר — Windows בלבד, אין Mac |
| Deploy | Vercel — מתעדכן אוטומטית עם `git push` |

---

## Stack

- **Frontend:** React 19 + Vite 8 + Tailwind CSS 4 (via `@tailwindcss/vite`)
- **Backend:** Supabase (auth + PostgreSQL + storage)
- **ניווט:** React Router 7 (`createBrowserRouter`)
- **אנימציות:** Framer Motion
- **גרירה:** @dnd-kit
- **תאריכים:** date-fns
- **PDF:** @react-pdf/renderer
- **Native:** Capacitor (Android ✅, iOS בהמתנה)

---

## מבנה הפרויקט

```
src/
├── pages/
│   ├── booking/        ← זרימת הזמנת תור ללקוח (6 שלבים)
│   ├── admin/          ← פאנל ניהול (dashboard, staff, services, branches, settings, appearance...)
│   ├── auth/           ← login/register (phone-based)
│   └── customer/       ← "התורים שלי"
├── hooks/              ← useAppointments, useStaff, useServices, useBusinessSettings...
├── layouts/            ← BookingLayout, AdminLayout
├── contexts/           ← AuthContext, ThemeContext, LangContext
├── components/ui/      ← Badge, Modal, Spinner, Toast, ImageUpload
├── lib/                ← supabase client, utils, upload helper, invoice PDF
└── config/
    └── business.js     ← כל פרמטר שמשתנה בין עסקים (חשוב ל-SaaS!)
```

---

## מה בוצע ✅

### Android & Native
- Capacitor מותקן ומוגדר (`capacitor.config.ts`, `android/`)
- **Keystore:** `android/hajaj-release.keystore` (alias: `hajaj`, סיסמה: `XKyn43ZBeVJtK5zD`)
- `android/keystore.properties` + `android/app/build.gradle` — signing מוגדר
- Video autoplay פועל ב-MainActivity
- **AAB נבנה:** `android/app/release/app-release.aab` — מוכן ל-Google Play

### iOS
- `codemagic.yaml` נוצר לבניית iOS ב-cloud (ללא Mac)
- ממתין לאישור חשבון Apple Developer

### חנויות
- `store-listing.md` — תיאורים, מילות מפתח, רשימת screenshots
- Google Play account קיים (ממתין לאימות)
- Apple Developer account קיים (ממתין לאישור עסקי)

### Privacy Policy
- עמוד `/privacy` — `src/pages/PrivacyPolicy.jsx` — עברית, 11 סעיפים
- קישור בתחתית BookingLayout + בדף Register

### אייקונים
- `generate-icon.mjs` — יוצר אייקוני HAJAJ עם sharp + SVG
- `public/icons/` — icon-1024, icon-512, icon-192, icon-only.png

### Features שנוספו
- **דף הבית:** כשיש תור עתידי — מציג "התור הקרוב שלך" במקום "השירותים שלנו"
- **Story Viewer:** חלונית זכוכית צפה עם אנימציית spring, scroll lock, zIndex 9999
- **Grid Modal + Lightbox:** גם הם Portal-based
- **Scroll to top:** בכל ניווט — שני הלייאוטים
- **Toggle switches:** תוקנו לכל הקבצים לתמוך RTL
- **Admin Appearance:** סדר לוגי של סקציות, הוסר בנאר storage ירוק
- **Admin Settings:** הוסרה "חשבוניות" (שייכת לעמוד Invoices)
- **תורים קבועים:** פועל — migration בוצע, הגדרה בהגדרות

---

## נקודות טכניות קריטיות

### RTL — Toggle Switches
```jsx
// ✅ נכון — right-based (עובד ב-RTL)
style={{ right: checked ? '2px' : 'calc(100% - 22px)' }}

// ❌ שגוי — translateX הולך לכיוון הלא נכון ב-RTL
style={{ transform: `translateX(${checked ? 20 : 0}px)` }}
```

### Modals מעל transform ancestors
```jsx
// חובה כש-ancestor מכיל framer-motion transform
import { createPortal } from 'react-dom'
return createPortal(<Modal />, document.body)
// + zIndex: 9999 (inline style, לא Tailwind class)
```

### Supabase — שמות Relations
```js
// ✅ נכון
.select('*, services ( id, name ), staff ( id, name )')
// ❌ שגוי
.select('*, service:service_id( id ), staff_member( id )')
```

### Scroll to top בניווט
```js
// בתוך Layout component:
useEffect(() => {
  window.scrollTo({ top: 0, behavior: 'instant' })
}, [location.pathname])
```

### Next appointment — pattern נכון
```js
// שלוש מצבים: undefined = loading, null = אין תור, object = יש תור
const [nextAppointment, setNextAppointment] = useState(undefined)
// שימוש ב-useEffect ישיר עם supabase (לא hook) כי hook לא מגיב בזמן
```

---

## פקודות עבודה

```bash
# פיתוח מקומי (חובה להיות בתיקיית הפרויקט!)
cd C:\Users\yairh\barbershop-app
npm run dev          # → http://localhost:5173

# Deploy
git add -A && git commit -m "תיאור" && git push

# Android — sync לאחר שינויי קוד
npm run build && npx cap sync android

# Android — build לחנות (AAB)
# Android Studio → Build → Generate Signed Bundle/APK → Android App Bundle
```

---

## מה ממתין

| נושא | סטטוס |
|------|--------|
| Google Play — העלאת AAB | ממתין לאימות חשבון |
| iOS — Codemagic build | ממתין לאישור Apple Developer |
| Screenshots לחנויות | צריך לצלם (ראה store-listing.md) |
| Privacy Policy URL | לעדכן לאחר domain קבוע |
