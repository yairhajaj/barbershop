# 🏛 Tax Authority Registration — Complete Handoff to Claude Code

> **For Claude Code:** You are being handed a partially-completed task. Read this entire document before starting any work. Everything you need is here or in the files it references.

---

## 🎯 THE GOAL

Get the **Barbershop Booking** app legally approved by the Israeli Tax Authority (רשות המיסים) so it can be used for real business in Israel. This means:

1. App must be compliant with **OPENFRMT 1.31** spec (file format for tax reporting).
2. App must comply with **Hora'at Miktzoa 24/2004** (backup, customer consent, audit trail).
3. App must comply with **Hora'at Nehol Sfarim 36** (invoice numbering, no deletions).
4. Submit formal application + get **8-digit registration number** from the Authority.
5. User enters that number → app is fully legal.

---

## 📦 PROJECT CONTEXT

- **Project:** `C:\Users\yairh\barbershop-app` (Windows, PowerShell)
- **Owner:** Yair (yairbusiness12@gmail.com) — running HAJAJ Hair Design barbershop in Tel Mond, Israel
- **Tech stack:** React 19 + Vite 8 + Tailwind 4 + Supabase (Postgres) + Capacitor 8 (iOS+Android)
- **Deployment:** Vercel (web, auto on git push), Codemagic (iOS+Android)
- **Languages:** Hebrew UI (RTL) + English fallback
- **Read `CLAUDE.md` in project root** for full project overview before making any code changes.

---

## ✅ WORK ALREADY COMPLETED (DO NOT REDO)

### 1. Database migration — DONE & APPLIED

**File:** `supabase/migrations/033_tax_registration.sql`

**Status:** ✅ Already ran successfully on the production Supabase DB. User confirmed "הצליח".

**What it added:**
- ~20 new columns to `business_settings`: `tax_software_reg_number`, `business_name`, `business_address_*`, `software_name`, `software_version`, `manufacturer_vat_id`, `manufacturer_name`, `software_type` (smallint DEFAULT 2), `bookkeeping_type` (smallint DEFAULT 1), `company_registration_number`, `deduction_file_number`, `leading_currency` (DEFAULT 'ILS'), `has_branches`, `customer_consent_required`, `last_quarterly_backup_at`, `last_openfrmt_export_at`, `tax_office_notified`, `tax_office_notified_at`.
- New table `customer_consents` with RLS policies (admin full access, customer can insert own).
- Postgres function `check_invoice_continuity()` for audit.

**Do not re-run this migration.** It's idempotent (uses `ADD COLUMN IF NOT EXISTS`) but still — don't touch.

### 2. Frontend code changes — DONE (NOT YET COMMITTED TO GIT)

These files were edited but not yet committed:

| File | Purpose |
|------|---------|
| `src/hooks/useBusinessSettings.js` | Added all new DEFAULT_SETTINGS keys matching migration 033 columns |
| `src/lib/openfrmt.js` | **Complete rewrite** per OPENFRMT 1.31 spec — see full details below |
| `src/pages/admin/finance/SettingsTab.jsx` | Added Section 8 "🏛 רישום תוכנה ברשות המיסים" with all tax registration fields |
| `src/pages/admin/finance/AccountantTab.jsx` | Added validation warnings + post-download dialog with Section 2.6 report |
| `supabase/migrations/033_tax_registration.sql` | (Already ran on DB, but file must be in git for future deploys) |
| `tax-authority-submission/` | New folder with 4 HTML forms + README for physical submission |

**Build verification:** `npm run build` was run manually and passed cleanly (only a non-blocking chunk-size warning on `Finance-*.js`, which is informational).

### 3. Submission documents — DONE

**Folder:** `tax-authority-submission/`

Contains 4 printable HTML files + README.md:
- `01-application.html` — Software registration application form
- `02-cover-letter.html` — Official cover letter to submit with application
- `03-compliance-declaration.html` — Declaration covering 24+ compliance items
- `04-software-use-notification.html` — Use AFTER receiving registration number (for §18ב(ב) notification)
- `README.md` — Submission instructions in Hebrew

Each HTML has a print button that opens browser's print dialog → user prints/saves as PDF, fills in signature fields by hand.

---

## 📋 OPENFRMT.JS DETAILS (key file you may need to debug)

**Path:** `src/lib/openfrmt.js`

**Exports:**
- `randomPrimaryId15()` — generates random 15-digit primary ID (first digit 1-9)
- `DOC_TYPES` — constant with Annex 1 document codes (27 codes)
- `PAYMENT_CODE` — map of payment method strings to codes 1-5/9
- `buildSection26Report({ settings, from, to, counts, primaryId })` — returns report object
- `printSection26(report)` — opens print-ready HTML in new window
- `validateOpenFormatSettings(settings)` — returns `{ valid, errors, warnings }` before generation
- `generateOpenFormatZip({ from, to, settings })` — async, returns `{ blob, report, counts, primaryId, dirPrefix }`
- `downloadOpenFormat({ from, to, settings })` — async, downloads ZIP, returns `{ report, primaryId }`

**Record lengths (CRITICAL — spec-defined, do not change):**
| Record | Length |
|--------|--------|
| A000 (INI opening) | 466 |
| A100 (BKMVDATA opening) | 95 |
| C100 (document header) | 444 |
| D110 (document line) | 339 |
| D120 (payment) | 222 |
| M100 (item master) | 298 |
| Z900 (closing) | 110 |

**System constants:**
- `OF_VERSION = '&OF1.31&'` — placed in A000 field, A100 field, C100 field, D110/D120/M100/Z900 fields (positions vary by record).
- Line terminator: `\r\n` (CRLF)
- Target encoding: Windows-1255 / ISO-8859-8-i (but file is currently generated as UTF-8 JS string — encoding conversion happens at ZIP level via JSZip)

**Output structure (ZIP):**
```
OPENFRMT/
  <9-digit-VAT>.<YY>/
    <MMDDhhmm>/
      INI.TXT                     (A000 + A100 + Z900)
      BKMVDATA.zip                (inner ZIP containing BKMVDATA.TXT)
      SECTION_2_6_REPORT.json     (audit report)
README.txt
```

**Common spec errors you might see from the government simulator:**
- "record length mismatch on line X" → check padding/truncation in the specific record builder
- "missing &OF1.31& constant" → check `padText(OF_VERSION, 8)` calls
- "primary ID mismatch between records" → ensure same `primaryId` passed to every record
- "invalid document type code" → check against `DOC_TYPES` / Annex 1 list

---

## 🚀 REMAINING WORK — WHAT YOU (CLAUDE CODE) SHOULD DO

### PHASE A — Commit + push to Vercel (do this NOW)

User's PowerShell has execution policy set to `RemoteSigned -Scope CurrentUser -Force` (already configured).

**Commands to run, in order, in the project root `C:\Users\yairh\barbershop-app`:**

```powershell
git status
```

Expected: shows 4+ modified/untracked files:
- modified: `src/hooks/useBusinessSettings.js`
- modified: `src/lib/openfrmt.js`
- modified: `src/pages/admin/finance/AccountantTab.jsx`
- untracked: `supabase/migrations/033_tax_registration.sql`
- untracked: `tax-authority-submission/`
- possibly: `src/pages/admin/finance/SettingsTab.jsx` (if git detects changes)
- **DO NOT commit:** `.claude/settings.local.json` (local user config)

```powershell
git add src/hooks/useBusinessSettings.js src/lib/openfrmt.js src/pages/admin/finance/AccountantTab.jsx src/pages/admin/finance/SettingsTab.jsx supabase/migrations/033_tax_registration.sql tax-authority-submission/ CLAUDE_CODE_HANDOFF.md
```

```powershell
git commit -m "feat: OPENFRMT 1.31 compliance + tax authority registration UI

- Rewrite src/lib/openfrmt.js per spec 1.31 (May 2009)
- Add migration 033 with all Tax Authority fields
- Add Settings Tab section for software registration
- Add validation + Section 2.6 report dialog in Accountant Tab
- Add 4 printable submission documents in Hebrew"
```

```powershell
git push
```

**Verify:** Output should show something like `main -> main`. If it fails:
- Authentication issue → tell user to run `git config --global credential.helper manager`
- Merge conflict → run `git pull --rebase` first, then push again
- Push protection → check GitHub web UI for branch protection rules

**After push:** Vercel deploys automatically in ~2 minutes. You can verify by asking user to check Vercel dashboard, or if Vercel CLI is installed: `vercel ls`.

### PHASE B — Support user's manual verification (on standby)

The user will now do these steps **manually in their browser** (you cannot help directly):

1. Open the deployed app: `/admin/finance` → "הגדרות" tab.
2. Scroll to Section 8: "🏛 רישום תוכנה ברשות המיסים".
3. Fill in ALL fields except the 8-digit registration number (keep blank for now).
4. Save.
5. Switch to "רואה חשבון" tab → "דוחות רשות המיסים" → click "OPENFRMT".
6. A ZIP downloads. A dialog shows Primary ID and counts. Save both.
7. Upload the ZIP to: **https://www.gov.il/he/service/download-open-format-files**
8. The simulator will either pass or return errors.

**YOUR JOB during Phase B:** Wait for user to return with simulator output. Two scenarios:

#### Scenario B1 — Simulator passes ✅
User says "הסימולטור עבר" or "passed". Nothing to fix. Phase B is done.

#### Scenario B2 — Simulator returns errors ❌
User pastes errors. You need to:
1. Read `src/lib/openfrmt.js`.
2. Identify which record type has the issue (A000/A100/C100/D110/D120/M100/Z900).
3. Fix the record builder function (`recordA000`, `recordC100`, etc.).
4. Verify field positions and lengths against the OPENFRMT 1.31 spec.
5. Commit & push again.
6. User re-generates and re-uploads to simulator.
7. Loop until it passes.

**Common fixes:**
- Length mismatch → count characters per field, ensure total matches constant (466/95/444/339/222/298/110).
- Field alignment → text = right-pad with spaces, numeric = left-pad with zeros, future fields = fill with `!`.
- Date format = `YYYYMMDD`, time format = `HHMM`, both as numeric strings.
- Numeric fields = fixed-point without decimal point (e.g., 12.34 with 2 decimals = "1234").

### PHASE C — Physical document submission (user only, no code involvement)

User prints the 4 HTML files in `tax-authority-submission/`, signs them, gathers:
- Printed/signed PDFs
- Sample OPENFRMT ZIP
- 3-4 screenshots of the app
- Business tax ID + personal ID

Then calls `*4954` (Israeli Tax Authority customer service) for current mailing address, and sends the package.

**Wait time:** 4-8 weeks.

### PHASE D — After user gets 8-digit registration number back

User will:
1. Enter it in the app settings (Section 8 → "מספר רישום תוכנה").
2. Open `tax-authority-submission/04-software-use-notification.html`, fill it, sign, send to their local tax office.
3. Check "הודעה נשלחה" in settings.

Then the app is legally operational.

**YOUR JOB:** nothing automated here. Be available for any last-minute questions.

---

## 🛑 WHAT YOU CANNOT DO

- **Access Supabase dashboard** (no credentials, no MCP integration). User runs SQL manually.
- **Open the deployed web app** or interact with its UI. User does this.
- **Upload files to the Israeli Tax Authority simulator.** User uploads.
- **Submit physical documents.** User submits via mail or in person.
- **Access Gmail or any email account to send letters to the Authority.** User does this.

---

## 🔍 VERIFICATION — HOW TO KNOW IT'S DONE

The final state is achieved when:
- [x] Migration 033 ran on production DB (✅ already done).
- [ ] Git commits pushed, Vercel deployed successfully.
- [ ] User filled in all settings fields in the app.
- [ ] OPENFRMT ZIP generated from real data.
- [ ] ZIP passed validation on gov.il simulator.
- [ ] Physical application submitted to Tax Authority.
- [ ] 8-digit registration number received back.
- [ ] Number entered in app settings.
- [ ] §18ב(ב) notification sent to local tax office.
- [ ] "Tax office notified" flag set to true in settings.

---

## 📚 REFERENCE LINKS

- **Official simulator:** https://www.gov.il/he/service/download-open-format-files
- **Hora'at Nehol 36:** https://www.gov.il/he/departments/policies/hora36
- **Customer service:** *4954 (from inside Israel)
- **Tax Authority HQ:** דרך בר-יהודה 5, ירושלים 9103701

---

## 🔧 KEY FILE REFERENCES

Read these if you need context while debugging:

```
C:\Users\yairh\barbershop-app\
├── CLAUDE.md                                                    ← project overview (read first!)
├── CLAUDE_CODE_HANDOFF.md                                       ← THIS FILE
├── src/
│   ├── hooks/useBusinessSettings.js                             ← DEFAULT_SETTINGS with all tax fields
│   ├── lib/
│   │   ├── openfrmt.js                                          ← OPENFRMT 1.31 implementation (MAIN FILE)
│   │   ├── pcn874.js                                            ← separate PCN874 VAT report (unchanged)
│   │   └── invoice.jsx                                          ← invoice PDF generator (unchanged)
│   └── pages/admin/finance/
│       ├── SettingsTab.jsx                                      ← Section 8 tax registration form
│       ├── AccountantTab.jsx                                    ← OPENFRMT download + Section 2.6 dialog
│       └── TaxReportTab.jsx                                     ← (unchanged)
├── supabase/migrations/
│   └── 033_tax_registration.sql                                 ← DB migration (already applied)
└── tax-authority-submission/
    ├── README.md                                                ← submission instructions
    ├── 01-application.html                                      ← main application form
    ├── 02-cover-letter.html                                     ← cover letter
    ├── 03-compliance-declaration.html                           ← compliance checklist
    └── 04-software-use-notification.html                        ← post-approval notification
```

---

## 🎬 YOUR FIRST ACTION

Start by running:

```powershell
cd C:\Users\yairh\barbershop-app
git status
```

Then proceed with Phase A as described above. Report back to the user when `git push` completes successfully and Vercel has finished deploying. Then go on standby for Phase B.

If anything is unclear or any command fails unexpectedly — stop, explain the situation to the user in Hebrew (they prefer Hebrew), and wait for instructions.

---

## 🗣 LANGUAGE

User prefers **Hebrew** for conversation. Reply in Hebrew.
Code comments, commit messages, and technical output can stay in English.

---

*Handoff prepared by Claude in Cowork mode. Yair will return to Cowork after the automated work is done for a final legal compliance review.*
