# רשימת משימות חוקיות — רשות המיסים

מטרה: להפוך את המערכת לחוקית לשימוש עסקי ולהכנה להשקת SaaS לעסקים בישראל.

---

## 🚨 חובה — לפני השקת SaaS (גביית תשלום מעסקים)

### 1. רישום תוכנה ברשות המיסים
- [ ] להירשם כ**ספק תוכנה** ברשות המיסים ולקבל **"מספר רישום תוכנה"**
  - 🔗 https://www.gov.il/he/service/software_registration
  - הרישום חד-פעמי — חל על כל המערכת (SaaS), לא לכל עסק בנפרד
  - את המספר יש להזין ב-`business_settings.tax_software_reg_number` (כבר קיים שדה)
  - המספר יופיע אוטומטית בתחתית כל חשבונית + בקבצי OPENFRMT/INI.TXT
- [ ] לחתום על הצהרה שהתוכנה עומדת ב-**הוראות ניהול ספרים** (הוראה 36)
  - 🔗 https://www.gov.il/he/departments/legalInfo/hor_36

### 2. אימות OPENFRMT
- [ ] להעלות קובץ לדוגמה לסימולטור הממשלתי ולוודא אפס שגיאות
  - 🔗 https://www.gov.il/he/service/download-open-format-files
- [ ] לקרוא את המפרט הרשמי והשלים שדות חסרים ב-`src/lib/openfrmt.js`
  - 🔗 https://www.gov.il/BlobFolder/generalpage/openformat/he/open_format_ver_2_0.pdf

### 3. אימות PCN874
- [ ] אימות עם הסימולטור של רשות המיסים
- [ ] לוודא חישוב מע"מ נכון עם נתונים אמיתיים של HAJAJ

---

## ⏰ 1.1.2026 — Israel-Invoices (מספר הקצאה)

חל על כל חשבונית מס ≥ **10,000 ₪** לפני מע"מ (סף יורד בשנים הבאות).

- [ ] אינטגרציה ל-API הממשלתי לקבלת "מספר הקצאה" בזמן אמת
  - 🔗 https://www.gov.il/he/service/invoices-israel
- [ ] מיגרציה חדשה: `invoices.allocation_number text`
- [ ] הוספת מספר הקצאה להדפסת חשבונית + OPENFRMT + PCN874
- [ ] טיפול בכשל ה-API (ניסיון חוזר, התראה למשתמש)

---

## 📋 לכל עסק המשתמש במערכת

- [ ] **ולידציה** של `business_tax_id` — 9 ספרות עם check-digit תקין
- [ ] חסימת חשבוניות ללא `business_tax_id` מוגדר (עבור עוסק מורשה/חברה)
- [ ] PCN874 חודשי חובה לעסקים עם `business_type = 'osek_morsheh'` מעל סף מחזור
- [ ] הצהרת פרטיות + תנאי שימוש בהסכמה של בעל העסק

---

## 🔒 חוקי בקרה פנימיים (כבר מיושמים חלקית)

- [x] **אין מחיקה סופית** של חשבוניות — רק ביטול + חשבונית זיכוי (מיגרציה 031)
- [x] **אין מחיקה סופית** של הוצאות — רק `is_cancelled=true` (מיגרציה 031)
- [x] **מספור עוקב** של חשבוניות דרך `next_invoice_number()` (מיגרציה 026)
- [ ] **Audit log** לכל שינוי/ביטול של חשבונית (שינוי סכום, סיבת ביטול, timestamp, user)
- [ ] **גיבוי אוטומטי** — להפעיל Supabase Point-in-Time Recovery
- [ ] **שמירת קבצים 7 שנים** — לוודא שקבלות/חשבוניות ב-Supabase Storage לא נמחקות

---

## 🛠 שיפורים מומלצים

- [ ] ייצוא לפורמט **חשבשבת** (CSV) — סטנדרט רואי חשבון בישראל
- [ ] חתימה דיגיטלית על חשבוניות PDF
- [ ] שליחת חשבונית אוטומטית במייל ברגע סיום שירות
- [ ] תמיכה ב-**קבלה בלבד** (doc_type=320) ו-**חשבונית עסקה** (doc_type=310)

---

## 📚 חומר עזר

- **הוראות ניהול ספרים** (הוראה 36): https://www.gov.il/he/departments/legalInfo/hor_36
- **מפרט OPENFRMT v2.0**: https://www.gov.il/BlobFolder/generalpage/openformat/he/open_format_ver_2_0.pdf
- **PCN874**: https://www.gov.il/BlobFolder/generalpage/dochot_online/he/pcn874.pdf
- **חוקת המס**: https://www.gov.il/he/departments/ministry_of_finance
- **Israel-Invoices (מספר הקצאה)**: https://www.gov.il/he/service/invoices-israel
- **רישום תוכנה**: https://www.gov.il/he/service/software_registration

---

**עדכון אחרון:** 2026-04-18
