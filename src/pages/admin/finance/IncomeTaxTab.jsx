import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { useToast } from '../../../components/ui/Toast'
import { Spinner } from '../../../components/ui/Spinner'
import {
  downloadOpenFormat,
  validateOpenFormatSettings,
  printSection26,
  buildSection26Report,
} from '../../../lib/openfrmt'
import { generateFinancialReport, downloadWorkbook } from '../../../lib/xlsx-report'
import { OPERATOR } from '../../../config/operator'
import { ComplianceGuideModal } from './ComplianceGuideModal'

function defaultRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const prevY = m === 0 ? y - 1 : y
  const prevM = m === 0 ? 12 : m
  const lastDay = new Date(prevY, prevM, 0).getDate()
  return {
    from: `${prevY}-${String(prevM).padStart(2, '0')}-01`,
    to:   `${prevY}-${String(prevM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

// Section 2.6 document type labels (as in spec)
const DOC_TYPE_ROWS = [
  { code: '100', label: 'הזמנה' },
  { code: '300', label: 'חשבונית מס' },
  { code: '305', label: 'חשבונית מס זיכוי' },
  { code: '320', label: 'חשבונית מס/קבלה' },
  { code: '330', label: 'חשבונית מס/קבלה זיכוי' },
  { code: '400', label: 'קבלה' },
  { code: '405', label: 'קבלה זיכוי' },
]

export function IncomeTaxTab() {
  const toast = useToast()
  const { settings, saveSettings } = useBusinessSettings()
  const [range, setRange] = useState(defaultRange)
  const [busy, setBusy] = useState(null)
  const [exportResult, setExportResult] = useState(null)
  const [taxSettings, setTaxSettings] = useState({})
  const [taxSaving, setTaxSaving] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  const currentYear = new Date().getFullYear()
  const currentQ    = Math.ceil((new Date().getMonth() + 1) / 3)
  const [backupYear, setBackupYear] = useState(currentYear)
  const [backupQ,    setBackupQ]    = useState(currentQ > 1 ? currentQ - 1 : 4)

  function quarterRange(year, q) {
    const starts = [null, `${year}-01-01`, `${year}-04-01`, `${year}-07-01`, `${year}-10-01`]
    const ends   = [null, `${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`]
    return { from: starts[q], to: ends[q] }
  }

  const ofValidation = settings ? validateOpenFormatSettings(settings) : { valid: false, errors: [], warnings: [] }

  useEffect(() => {
    if (settings) {
      setTaxSettings({
        business_name:               settings.business_name || '',
        business_address_street:     settings.business_address_street || '',
        business_address_number:     settings.business_address_number || '',
        business_address_city:       settings.business_address_city || '',
        business_address_postal:     settings.business_address_postal || '',
        business_tax_id:             settings.business_tax_id || '',
        company_registration_number: settings.company_registration_number || '',
        deduction_file_number:       settings.deduction_file_number || '',
        tax_office_notified:         settings.tax_office_notified || false,
        vat_rate:                    settings.vat_rate ?? 18,
      })
    }
  }, [settings])

  // ── Section A: Export ──────────────────────────────────────────
  async function handleExport() {
    if (!ofValidation.valid) {
      toast({ message: 'חסרות הגדרות חובה: ' + ofValidation.errors[0], type: 'error' })
      return
    }
    setBusy('export')
    try {
      const result = await downloadOpenFormat({ from: range.from, to: range.to, settings })
      setExportResult({ ...result, range: { ...range } })
      toast({ message: 'הקובץ הורד ✓', type: 'success' })
    } catch (err) {
      toast({ message: 'שגיאה: ' + (err.message || err), type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // ── Section B: Quarterly backup ───────────────────────────────
  async function handleQuarterlyBackup() {
    setBusy('backup')
    try {
      const { from, to } = quarterRange(backupYear, backupQ)
      const { arrayBuffer, filename } = await generateFinancialReport({ from, to, settings })
      const backupFilename = `גיבוי_רבעוני_Q${backupQ}_${backupYear}.xlsx`
      downloadWorkbook(arrayBuffer, backupFilename)
      // Record timestamp
      await supabase.functions.invoke('quarterly-backup')
      toast({ message: `גיבוי Q${backupQ}/${backupYear} הורד ✓`, type: 'success' })
    } catch (err) {
      toast({ message: 'שגיאה: ' + (err.message || err), type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // ── Section D: Tax settings ────────────────────────────────────
  async function saveTaxSettings() {
    setTaxSaving(true)
    try {
      await saveSettings(taxSettings)
      toast({ message: 'הגדרות נשמרו ✓', type: 'success' })
    } catch (err) {
      toast({ message: 'שגיאה: ' + (err.message || err), type: 'error' })
    } finally {
      setTaxSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6" dir="rtl">

      {/* ── Compliance guide button ── */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowGuide(true)}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-gold)', color: 'var(--color-gold)' }}>
          📋 מדריך ציות לרשות המיסים
        </button>
      </div>

      {/* ── Section A: Export ── */}
      <SectionCard title="📁 ייצוא לרשות המיסים" border="gold">
        <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
          הפקת קבצי הנהלת חשבונות לצורך ביקורת או דרישת רשות המיסים.
        </p>

        {/* Date range */}
        <div className="flex gap-3 flex-wrap mb-3">
          <div className="flex-1 min-w-[130px]">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>מתאריך</label>
            <input type="date" value={range.from}
              onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          </div>
          <div className="flex-1 min-w-[130px]">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>עד תאריך</label>
            <input type="date" value={range.to}
              onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          </div>
        </div>

        {/* Validation errors */}
        {!ofValidation.valid && (
          <div className="p-3 rounded-xl text-xs space-y-1 mb-3"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
            <p className="font-semibold">⚠️ חסרות הגדרות חובה:</p>
            <ul className="list-disc pr-4 space-y-0.5">
              {ofValidation.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
            <p>יש להשלים את ההגדרות בסעיף ד׳ למטה.</p>
          </div>
        )}
        {ofValidation.valid && ofValidation.warnings.length > 0 && (
          <div className="p-3 rounded-xl text-xs mb-3"
            style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
            {ofValidation.warnings.map((w, i) => <p key={i}>⚠️ {w}</p>)}
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={busy === 'export' || !ofValidation.valid}
          className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          style={{ background: 'var(--color-gold)', color: '#fff' }}
        >
          {busy === 'export' ? <Spinner size="sm" /> : '📁 הפק קבצים במבנה אחיד'}
        </button>
      </SectionCard>

      {/* ── Section B: Quarterly backup ── */}
      <SectionCard title="📦 גיבוי רבעוני">
        <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          לפי הוראות ניהול ספרים, יש לגבות את כל רשומות הנהלת החשבונות אחת לרבעון
          ולשמור את הקובץ במקום מאובטח (דיסק חיצוני, ענן). הגיבוי כולל את כל
          החשבוניות, ההוצאות, ועמלות הרבעון הנבחר.
        </p>
        <div className="flex gap-2 flex-wrap items-end mb-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>שנה</label>
            <select value={backupYear} onChange={e => setBackupYear(Number(e.target.value))}
              className="rounded-xl px-3 py-2 text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              {[currentYear - 1, currentYear].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>רבעון</label>
            <select value={backupQ} onChange={e => setBackupQ(Number(e.target.value))}
              className="rounded-xl px-3 py-2 text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              <option value={1}>Q1 — ינואר–מרץ</option>
              <option value={2}>Q2 — אפריל–יוני</option>
              <option value={3}>Q3 — יולי–ספטמבר</option>
              <option value={4}>Q4 — אוקטובר–דצמבר</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={handleQuarterlyBackup}
            disabled={busy === 'backup'}
            className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
            {busy === 'backup' ? <Spinner size="sm" /> : `📦 הורד גיבוי Q${backupQ}/${backupYear}`}
          </button>
          {settings?.last_quarterly_backup_at && (
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              גיבוי אחרון: {new Date(settings.last_quarterly_backup_at).toLocaleString('he-IL')}
            </p>
          )}
        </div>
      </SectionCard>

      {/* ── Section D: Tax settings ── */}
      <SectionCard title="⚙️ הגדרות מס">

        {/* Read-only operator info */}
        <div className="p-3 rounded-xl mb-4 text-xs space-y-1"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>פרטי יצרן התוכנה (BOOKX)</p>
          <p style={{ color: 'var(--color-muted)' }}>שם יצרן: {OPERATOR.manufacturer_name} ({OPERATOR.manufacturer_name_ascii})</p>
          <p style={{ color: 'var(--color-muted)' }}>מ.ע. יצרן: {OPERATOR.manufacturer_vat_id}</p>
          <p style={{ color: 'var(--color-muted)' }}>שם תוכנה: {OPERATOR.software_name} {OPERATOR.software_version}</p>
          <p style={{ color: OPERATOR.tax_software_reg_number ? 'var(--color-text)' : '#dc2626', fontWeight: OPERATOR.tax_software_reg_number ? 'normal' : 'bold' }}>
            מספר רישום תוכנה: {OPERATOR.tax_software_reg_number || '⚠️ טרם הוגדר — יש לרשום ברשות המיסים'}
          </p>
        </div>

        {/* Editable business fields */}
        <div className="space-y-3">
          <p className="text-xs font-semibold pt-1" style={{ color: 'var(--color-muted)' }}>פרטי העסק</p>
          <Field label="שם העסק"
            value={taxSettings.business_name || ''}
            onChange={v => setTaxSettings(s => ({ ...s, business_name: v }))} />
          <div className="flex gap-2">
            <div className="flex-1">
              <Field label="רחוב"
                value={taxSettings.business_address_street || ''}
                onChange={v => setTaxSettings(s => ({ ...s, business_address_street: v }))} />
            </div>
            <div className="w-20">
              <Field label='מס׳'
                value={taxSettings.business_address_number || ''}
                onChange={v => setTaxSettings(s => ({ ...s, business_address_number: v }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Field label="עיר"
                value={taxSettings.business_address_city || ''}
                onChange={v => setTaxSettings(s => ({ ...s, business_address_city: v }))} />
            </div>
            <div className="w-28">
              <Field label="מיקוד"
                value={taxSettings.business_address_postal || ''}
                onChange={v => setTaxSettings(s => ({ ...s, business_address_postal: v }))} />
            </div>
          </div>

          <p className="text-xs font-semibold pt-2" style={{ color: 'var(--color-muted)' }}>מספרי זיהוי</p>
          <Field label="מספר עוסק מורשה / ח.פ."
            value={taxSettings.business_tax_id || ''}
            onChange={v => setTaxSettings(s => ({ ...s, business_tax_id: v }))} />
          <Field label="מספר ח.פ. (חברה בע״מ)"
            value={taxSettings.company_registration_number || ''}
            onChange={v => setTaxSettings(s => ({ ...s, company_registration_number: v }))} />
          <Field label="מספר תיק ניכויים"
            value={taxSettings.deduction_file_number || ''}
            onChange={v => setTaxSettings(s => ({ ...s, deduction_file_number: v }))} />
          <Field label="שיעור מע״מ (%)"
            type="number"
            value={taxSettings.vat_rate ?? 18}
            onChange={v => setTaxSettings(s => ({ ...s, vat_rate: Number(v) }))} />

{settings?.last_openfrmt_export_at && (
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              ייצוא אחרון: {new Date(settings.last_openfrmt_export_at).toLocaleString('he-IL')}
            </p>
          )}
        </div>

        <button
          onClick={saveTaxSettings}
          disabled={taxSaving}
          className="mt-4 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          style={{ background: 'var(--color-gold)', color: '#fff' }}>
          {taxSaving ? <Spinner size="sm" /> : 'שמור הגדרות'}
        </button>
      </SectionCard>

      {/* ── Compliance Guide Modal ── */}
      {showGuide && <ComplianceGuideModal onClose={() => setShowGuide(false)} />}

      {/* ── Section 5.4 Success Modal ── */}
      {exportResult && (
        <ExportSuccessModal
          result={exportResult}
          settings={settings}
          onClose={() => setExportResult(null)}
        />
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function SectionCard({ title, border, children }) {
  return (
    <div className="card p-5"
      style={{ border: border === 'gold' ? '1px solid var(--color-gold)' : '1px solid var(--color-border)' }}>
      <h3 className="font-bold text-base mb-3"
        style={{ color: border === 'gold' ? 'var(--color-gold)' : 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs mb-1 font-semibold" style={{ color: 'var(--color-muted)' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl px-3 py-2 text-sm"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
      />
    </div>
  )
}

function Report26Table({ report }) {
  let totalCount = 0, totalAmount = 0
  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--color-surface)' }}>
            <th className="text-right px-3 py-2 text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>קוד מסמך</th>
            <th className="text-right px-3 py-2 text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>סוג</th>
            <th className="text-right px-3 py-2 text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>כמות</th>
            <th className="text-right px-3 py-2 text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>סה״כ (₪)</th>
          </tr>
        </thead>
        <tbody>
          {DOC_TYPE_ROWS.map(({ code, label }) => {
            const s = report.docTypeSummary[code] || { count: 0, total: 0 }
            totalCount += s.count
            totalAmount += s.total
            return (
              <tr key={code} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--color-text)' }}>{code}</td>
                <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-text)' }}>{label}</td>
                <td className="px-3 py-2 text-xs" style={{ color: s.count > 0 ? 'var(--color-text)' : 'var(--color-muted)' }}>{s.count}</td>
                <td className="px-3 py-2 text-xs" style={{ color: s.total > 0 ? 'var(--color-text)' : 'var(--color-muted)' }}>
                  {s.total > 0 ? s.total.toLocaleString('he-IL', { minimumFractionDigits: 2 }) : '—'}
                </td>
              </tr>
            )
          })}
          <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <td className="px-3 py-2 text-xs font-bold" colSpan={2} style={{ color: 'var(--color-text)' }}>סה״כ</td>
            <td className="px-3 py-2 text-xs font-bold" style={{ color: 'var(--color-text)' }}>{totalCount}</td>
            <td className="px-3 py-2 text-xs font-bold" style={{ color: 'var(--color-text)' }}>
              {totalAmount.toLocaleString('he-IL', { minimumFractionDigits: 2 })}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// Spec 5.4 compliant post-export success modal
function ExportSuccessModal({ result, settings, onClose }) {
  const { report, primaryId, counts, dirPrefix, range } = result
  const now = new Date()
  const dateStr = now.toLocaleDateString('he-IL')
  const timeStr = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  const pathStr = (dirPrefix || '').replace(/\//g, '\\')
  const totalAll = 1 + (counts?.B110 || 1) + (counts?.C100 || 0) + (counts?.D110 || 0) + (counts?.D120 || 0) + (counts?.M100 || 0) + 1
  const swName = `${OPERATOR.software_name} ${OPERATOR.software_version}`
  const swReg  = OPERATOR.tax_software_reg_number || '—'

  const RECORD_ROWS = [
    { type: 'A100', desc: 'רשומת פתיחה', count: 1 },
    { type: 'B110', desc: 'חשבון בהנהלת חשבונות', count: counts?.B110 || 1 },
    { type: 'C100', desc: 'כותרת מסמך', count: counts?.C100 || 0 },
    { type: 'D110', desc: 'פרטי מסמך', count: counts?.D110 || 0 },
    { type: 'D120', desc: 'פרטי קבלה', count: counts?.D120 || 0 },
    { type: 'M100', desc: 'פריטים במלאי', count: counts?.M100 || 0 },
    { type: 'Z900', desc: 'רשומת סיום', count: 1 },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <div className="card modal-bg p-6 max-w-lg w-full space-y-4 overflow-y-auto max-h-[90vh]"
        style={{ background: 'var(--color-modal-panel)', border: '2px solid var(--color-gold)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="text-center">
          <div className="text-4xl mb-2">✅</div>
          <h3 className="font-bold text-lg" style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}>
            ביצוע ממשק פתוח הסתיים בהצלחה
          </h3>
        </div>

        {/* Business info */}
        <div className="p-3 rounded-xl text-sm space-y-1"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p><span className="font-semibold" style={{ color: 'var(--color-muted)' }}>מספר עוסק מורשה: </span>
            <span style={{ color: 'var(--color-text)' }}>{settings?.business_tax_id || '—'}</span></p>
          <p><span className="font-semibold" style={{ color: 'var(--color-muted)' }}>שם בית העסק: </span>
            <span style={{ color: 'var(--color-text)' }}>{settings?.business_name || '—'}</span></p>
          <p><span className="font-semibold" style={{ color: 'var(--color-muted)' }}>נתיב שמירה: </span>
            <span className="font-mono text-xs" style={{ color: 'var(--color-text)' }}>{pathStr}</span></p>
          <p><span className="font-semibold" style={{ color: 'var(--color-muted)' }}>טווח תאריכים: </span>
            <span style={{ color: 'var(--color-text)' }}>{range.from} — {range.to}</span></p>
          <p><span className="font-semibold" style={{ color: 'var(--color-muted)' }}>מזהה ייצוא: </span>
            <span className="font-mono text-xs" style={{ color: 'var(--color-text)' }}>{primaryId}</span></p>
        </div>

        {/* Record type table */}
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>סוגי רשומות שיוצאו:</p>
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--color-surface)' }}>
                  <th className="text-right px-3 py-1.5 font-semibold" style={{ color: 'var(--color-muted)' }}>סוג רשומה</th>
                  <th className="text-right px-3 py-1.5 font-semibold" style={{ color: 'var(--color-muted)' }}>תיאור</th>
                  <th className="text-right px-3 py-1.5 font-semibold" style={{ color: 'var(--color-muted)' }}>כמות</th>
                </tr>
              </thead>
              <tbody>
                {RECORD_ROWS.map(row => (
                  <tr key={row.type} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td className="px-3 py-1.5 font-mono font-bold" style={{ color: 'var(--color-gold)' }}>{row.type}</td>
                    <td className="px-3 py-1.5" style={{ color: 'var(--color-text)' }}>{row.desc}</td>
                    <td className="px-3 py-1.5 font-mono" style={{ color: 'var(--color-text)' }}>{row.count}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-surface)' }}>
                  <td className="px-3 py-1.5 font-bold" colSpan={2} style={{ color: 'var(--color-text)' }}>סה״כ</td>
                  <td className="px-3 py-1.5 font-bold font-mono" style={{ color: 'var(--color-text)' }}>{totalAll}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Software info */}
        <div className="p-3 rounded-xl text-xs space-y-1"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p style={{ color: 'var(--color-muted)' }}>תוכנה: <strong style={{ color: 'var(--color-text)' }}>{swName}</strong></p>
          <p style={{ color: 'var(--color-muted)' }}>מספר רישום תוכנה: <strong style={{ color: 'var(--color-text)' }}>{swReg}</strong></p>
          <p style={{ color: 'var(--color-muted)' }}>תאריך: <strong style={{ color: 'var(--color-text)' }}>{dateStr}</strong> &nbsp; שעה: <strong style={{ color: 'var(--color-text)' }}>{timeStr}</strong></p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => printSection26(report)}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--color-gold)', color: '#fff' }}>
            🖨 הדפס דוח 2.6
          </button>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
            סגור
          </button>
        </div>

        <p className="text-xs text-center" style={{ color: 'var(--color-muted)' }}>
          יש לשמור את מזהה הייצוא ואת דוח הסיכום לתיעוד.
        </p>
      </div>
    </div>
  )
}
