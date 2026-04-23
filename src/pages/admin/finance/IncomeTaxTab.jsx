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
  buildSection26Html,
  DOC_TYPES,
} from '../../../lib/openfrmt'
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
  const [exportResult, setExportResult] = useState(null) // 5.4 modal data
  const [report26, setReport26] = useState(null)         // section 2.6 data
  const [report26Loading, setReport26Loading] = useState(false)
  const [invoices, setInvoices] = useState([])
  const [creditNotes, setCreditNotes] = useState([])
  const [invLoading, setInvLoading] = useState(false)
  const [creatingCreditFor, setCreatingCreditFor] = useState(null)
  const [taxSettings, setTaxSettings] = useState({})
  const [taxSaving, setTaxSaving] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [seqResult, setSeqResult] = useState(null) // null | { ok, gaps }

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

  // ── Section B: Report 2.6 ─────────────────────────────────────
  async function loadReport26() {
    setReport26Loading(true)
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .gte('issue_date', range.from)
        .lte('issue_date', range.to)
        .eq('is_cancelled', false)
        .order('issue_date', { ascending: true })
      if (error) throw error
      const invoiceData = data || []

      // Build docTypeSummary from invoices
      const docTypeSummary = {}
      invoiceData.forEach(inv => {
        const docType = inv.document_type
          ? String(inv.document_type)
          : inv.is_credit_note
          ? '330'
          : inv.payment_status === 'paid'
          ? '320'
          : '305'
        const total = Number(inv.total_amount || 0)
        if (!docTypeSummary[docType]) docTypeSummary[docType] = { count: 0, total: 0 }
        docTypeSummary[docType].count++
        docTypeSummary[docType].total += total
      })

      const r = buildSection26Report({
        settings,
        from: range.from,
        to: range.to,
        counts: { C100: invoiceData.length, D110: 0, D120: 0, M100: 0 },
        docTypeSummary,
        primaryId: '',
      })
      setReport26(r)
    } catch (err) {
      toast({ message: 'שגיאה בטעינת הדוח: ' + (err.message || err), type: 'error' })
    } finally {
      setReport26Loading(false)
    }
  }

  function printReport26() {
    if (!report26) return
    printSection26(report26)
  }

  // ── Section C: Credit notes ────────────────────────────────────
  async function loadInvoices() {
    setInvLoading(true)
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, customer_name, total_amount, is_credit_note, credit_note_for, is_cancelled')
        .gte('issue_date', range.from)
        .lte('issue_date', range.to)
        .order('issue_date', { ascending: false })
      if (error) throw error
      const all = data || []
      setInvoices(all.filter(i => !i.is_credit_note && !i.is_cancelled))
      setCreditNotes(all.filter(i => i.is_credit_note))
    } catch (err) {
      toast({ message: 'שגיאה: ' + (err.message || err), type: 'error' })
    } finally {
      setInvLoading(false)
    }
  }

  async function createCreditNote(inv) {
    setCreatingCreditFor(inv.id)
    try {
      // Fetch full invoice with line items
      const { data: full, error: e1 } = await supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .eq('id', inv.id)
        .single()
      if (e1) throw e1

      // Get next invoice number
      const { data: biz } = await supabase.from('business_settings').select('invoice_next_number, invoice_prefix').single()
      const prefix = biz?.invoice_prefix || 'INV'
      const nextNum = biz?.invoice_next_number || 1
      const newNumber = `${prefix}-${String(nextNum).padStart(4, '0')}`

      const { data: credit, error: e2 } = await supabase
        .from('invoices')
        .insert({
          invoice_number:    newNumber,
          issue_date:        new Date().toISOString().slice(0, 10),
          customer_name:     full.customer_name,
          customer_phone:    full.customer_phone,
          customer_email:    full.customer_email,
          customer_vat_id:   full.customer_vat_id || null,
          total_amount:      full.total_amount,
          vat_amount:        full.vat_amount,
          notes:             `זיכוי לחשבונית ${full.invoice_number}`,
          is_credit_note:    true,
          credit_note_for:   full.id,
          document_type:     330,
          payment_status:    'credit',
        })
        .select()
        .single()
      if (e2) throw e2

      // Copy line items
      if (full.invoice_items?.length) {
        const lineItems = full.invoice_items.map(li => ({
          invoice_id:   credit.id,
          description:  li.description,
          quantity:     li.quantity,
          unit_price:   li.unit_price,
          line_total:   li.line_total,
          vat_rate:     li.vat_rate,
        }))
        await supabase.from('invoice_items').insert(lineItems)
      }

      // Increment next number
      await supabase.from('business_settings').update({ invoice_next_number: nextNum + 1 }).eq('id', biz?.id || settings?.id)

      toast({ message: `חשבונית זיכוי ${newNumber} נוצרה ✓`, type: 'success' })
      loadInvoices()
    } catch (err) {
      toast({ message: 'שגיאה ביצירת זיכוי: ' + (err.message || err), type: 'error' })
    } finally {
      setCreatingCreditFor(null)
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

  // ── Section B: Sequence check ──────────────────────────────────
  async function handleCheckSequence() {
    setBusy('seq')
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number')
        .gte('issue_date', range.from)
        .lte('issue_date', range.to)
        .eq('is_cancelled', false)
        .eq('is_credit_note', false)
        .order('invoice_number', { ascending: true })
      if (error) throw error
      const nums = (data || [])
        .map(i => parseInt(i.invoice_number?.replace(/\D/g, '') || '0', 10))
        .filter(n => n > 0)
        .sort((a, b) => a - b)
      const gaps = []
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] - nums[i - 1] > 1) {
          gaps.push({ from: nums[i - 1] + 1, to: nums[i] - 1 })
        }
      }
      setSeqResult({ ok: gaps.length === 0, gaps })
    } catch (err) {
      toast({ message: 'שגיאה בבדיקת רצף: ' + err.message, type: 'error' })
    } finally {
      setBusy(null)
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

      {/* ── Section B: Report 2.6 ── */}
      <SectionCard title="📊 דוח 2.6 — פלטים לאימות נתונים">
        <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
          סיכום כל המסמכים (חשבוניות, קבלות, זיכויים) בטווח התאריכים הנבחר.
        </p>
        <button
          onClick={loadReport26}
          disabled={report26Loading}
          className="px-4 py-2 rounded-xl text-sm font-semibold mb-3 transition-all"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        >
          {report26Loading ? <Spinner size="sm" /> : '🔄 הצג דוח'}
        </button>

        {report26 && (
          <div>
            <Report26Table report={report26} />
            <div className="mt-3 flex gap-2">
              <button onClick={printReport26}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--color-gold)', color: '#fff' }}>
                🖨 הדפס
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
            בדיקה שאין פערים ברצף מספרי החשבוניות (נדרש ע"פ הוראות ניהול פנקסים):
          </p>
          <button
            onClick={handleCheckSequence}
            disabled={busy === 'seq'}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
            {busy === 'seq' ? <Spinner size="sm" /> : '🔍 בדיקת רצף מספרי חשבוניות'}
          </button>

          {seqResult && (
            <div className="mt-2 p-3 rounded-xl text-xs"
              style={{
                background: seqResult.ok ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${seqResult.ok ? '#bbf7d0' : '#fecaca'}`,
                color: seqResult.ok ? '#16a34a' : '#dc2626',
              }}>
              {seqResult.ok ? (
                <p>✅ הרצף תקין — אין פערים בטווח הנבחר.</p>
              ) : (
                <div>
                  <p className="font-semibold mb-1">⚠️ נמצאו פערים ברצף:</p>
                  <ul className="list-disc pr-4 space-y-0.5">
                    {seqResult.gaps.map((g, i) => (
                      <li key={i}>מספרים {g.from}–{g.to} חסרים</li>
                    ))}
                  </ul>
                  <p className="mt-1">יש לבדוק אם מדובר בחשבוניות שבוטלו או בפגם בנתונים.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Section C: Credit notes ── */}
      <SectionCard title="💳 ניהול זיכויים (חשבוניות 330)">
        <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
          הפקת חשבוניות זיכוי (מסמך 330) לביטול חשבוניות קיימות.
        </p>
        <button
          onClick={loadInvoices}
          disabled={invLoading}
          className="px-4 py-2 rounded-xl text-sm font-semibold mb-3 transition-all"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        >
          {invLoading ? <Spinner size="sm" /> : '🔄 טען חשבוניות'}
        </button>

        {invoices.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>
              חשבוניות ניתנות לזיכוי ({invoices.length})
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {invoices.map(inv => {
                const alreadyCredited = creditNotes.some(cn => cn.credit_note_for === inv.id)
                return (
                  <div key={inv.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl text-sm"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold" style={{ color: 'var(--color-text)' }}>{inv.invoice_number}</p>
                      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                        {inv.customer_name} · {inv.issue_date} · ₪{Number(inv.total_amount || 0).toLocaleString('he-IL')}
                      </p>
                    </div>
                    {alreadyCredited ? (
                      <span className="text-xs px-2 py-1 rounded-lg"
                        style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                        זוכה ✓
                      </span>
                    ) : (
                      <button
                        onClick={() => createCreditNote(inv)}
                        disabled={creatingCreditFor === inv.id}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                        style={{ background: '#dc2626', color: '#fff' }}>
                        {creatingCreditFor === inv.id ? <Spinner size="sm" /> : 'צור זיכוי'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {creditNotes.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>
              חשבוניות זיכוי קיימות ({creditNotes.length})
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {creditNotes.map(cn => (
                <div key={cn.id}
                  className="flex items-center gap-3 p-3 rounded-xl text-sm"
                  style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold" style={{ color: '#dc2626' }}>{cn.invoice_number}</p>
                    <p className="text-xs" style={{ color: '#991b1b' }}>
                      {cn.customer_name} · {cn.issue_date} · ₪{Number(cn.total_amount || 0).toLocaleString('he-IL')}
                    </p>
                  </div>
                  <span className="text-xs font-bold" style={{ color: '#dc2626' }}>זיכוי</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {invoices.length === 0 && creditNotes.length === 0 && !invLoading && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--color-muted)' }}>לחץ "טען חשבוניות" להצגת הנתונים</p>
        )}
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
      <div className="card p-6 max-w-lg w-full space-y-4 overflow-y-auto max-h-[90vh]"
        style={{ background: 'var(--color-card)', border: '2px solid var(--color-gold)' }}
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
