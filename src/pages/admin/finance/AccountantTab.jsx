import { useState } from 'react'
import JSZip from 'jszip'
import { supabase } from '../../../lib/supabase'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { useToast } from '../../../components/ui/Toast'
import { Spinner } from '../../../components/ui/Spinner'
import { sendEmail, blobToBase64 } from '../../../lib/email'
import { generateFinancialReport, downloadWorkbook } from '../../../lib/xlsx-report'
import { downloadOpenFormat, validateOpenFormatSettings, printSection26 } from '../../../lib/openfrmt'
import { downloadPcn874 } from '../../../lib/pcn874'

function defaultRange() {
  const now = new Date()
  // Default: previous month
  const y = now.getFullYear()
  const m = now.getMonth() // 0-11; previous month = m-1 (or Dec of y-1)
  const prevY = m === 0 ? y - 1 : y
  const prevM = m === 0 ? 12 : m
  const lastDay = new Date(prevY, prevM, 0).getDate()
  return {
    from: `${prevY}-${String(prevM).padStart(2, '0')}-01`,
    to:   `${prevY}-${String(prevM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function AccountantTab() {
  const toast = useToast()
  const { settings } = useBusinessSettings()
  const [range, setRange] = useState(defaultRange)
  const [busy, setBusy] = useState(null) // 'receipts' | 'receipts-dl' | 'invoices' | 'report' | 'openfrmt' | 'pcn874'
  const [taxPanelOpen, setTaxPanelOpen] = useState(false)
  const [openfrmtDialog, setOpenfrmtDialog] = useState(null) // { report, primaryId } | null

  // Live validation of OPENFRMT settings
  const ofValidation = settings ? validateOpenFormatSettings(settings) : { valid: false, errors: [], warnings: [] }

  const accountantEmail = settings?.accountant_email
  const accountantName  = settings?.accountant_name

  function setFrom(v) { setRange(r => ({ ...r, from: v })) }
  function setTo(v)   { setRange(r => ({ ...r, to: v })) }

  function requireEmail() {
    if (!accountantEmail) {
      toast({ message: 'הגדר את מייל רואה החשבון בהגדרות', type: 'error' })
      return false
    }
    return true
  }

  // ─── Shared: build a receipts ZIP from expenses ───
  async function buildReceiptsZip(expenses) {
    const items = []
    expenses.forEach(e => {
      const urls = [e.receipt_url, ...(e.receipt_urls || [])].filter(Boolean)
      urls.forEach((url, idx) => {
        const ext   = (url.split('.').pop() || 'jpg').split('?')[0].slice(0, 4)
        const fname = `${e.date}_${(e.vendor_name || 'unknown').replace(/[^\w\u0590-\u05FF]/g, '_')}_${Math.round(Number(e.amount || 0))}${urls.length > 1 ? `_${idx + 1}` : ''}.${ext}`
        items.push({ url, fname })
      })
    })
    if (!items.length) return { zipBlob: null, success: 0 }

    const zip = new JSZip()
    let success = 0
    for (const it of items) {
      try {
        const res = await fetch(it.url)
        if (!res.ok) continue
        zip.file(it.fname, await res.blob())
        success++
      } catch { /* skip */ }
    }
    const zipBlob = success ? await zip.generateAsync({ type: 'blob' }) : null
    return { zipBlob, success }
  }

  // ─── Action 1a: Download expense receipts ZIP locally ───
  async function downloadReceiptsZip() {
    setBusy('receipts-dl')
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('*, expense_categories(name, icon)')
        .gte('date', range.from).lte('date', range.to)
        .eq('is_cancelled', false)
        .order('date', { ascending: true })
      if (error) throw error
      if (!expenses?.length) { toast({ message: 'אין הוצאות בטווח זה', type: 'error' }); return }

      const { zipBlob, success } = await buildReceiptsZip(expenses)
      if (!zipBlob) { toast({ message: 'אין צילומי קבלות בטווח זה', type: 'error' }); return }

      const url = URL.createObjectURL(zipBlob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `receipts_${range.from}_${range.to}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast({ message: `הורדו ${success} קבלות ✓`, type: 'success' })
    } catch (err) {
      toast({ message: 'שגיאה: ' + (err.message || err), type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // ─── Action 1b: Send expense receipts ZIP to accountant ───
  async function sendReceipts() {
    if (!requireEmail()) return
    setBusy('receipts')
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('*, expense_categories(name, icon)')
        .gte('date', range.from).lte('date', range.to)
        .eq('is_cancelled', false)
        .order('date', { ascending: true })
      if (error) throw error

      if (!expenses?.length) {
        toast({ message: 'אין הוצאות בטווח זה', type: 'error' })
        setBusy(null); return
      }

      const { zipBlob, success } = await buildReceiptsZip(expenses)
      if (!zipBlob) {
        toast({ message: 'אין צילומי קבלות בהוצאות בטווח זה', type: 'error' })
        setBusy(null); return
      }
      const zipB64  = await blobToBase64(zipBlob)

      // HTML body
      const rows = expenses.map(e => `
        <tr>
          <td style="padding:6px 12px;border:1px solid #ddd;">${e.date || ''}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;">${e.vendor_name || ''}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;">${e.description || ''}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;">${e.expense_categories?.name || ''}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;text-align:left;">₪${Number(e.amount || 0).toLocaleString('he-IL')}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;text-align:left;">₪${Number(e.vat_amount || 0).toLocaleString('he-IL')}</td>
        </tr>`).join('')

      const totalAmt = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
      const totalVat = expenses.reduce((s, e) => s + Number(e.vat_amount || 0), 0)
      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:720px;">
          <h2 style="color:#c9a96e;">קבלות הוצאות</h2>
          <p><b>עסק:</b> ${settings?.business_name || ''}<br/>
             <b>תקופה:</b> ${range.from} עד ${range.to}<br/>
             <b>מספר קבלות מצורפות:</b> ${success}</p>
          <table style="border-collapse:collapse;width:100%;font-size:14px;">
            <thead style="background:#f5f5f5;">
              <tr>
                <th style="padding:8px;border:1px solid #ddd;">תאריך</th>
                <th style="padding:8px;border:1px solid #ddd;">ספק</th>
                <th style="padding:8px;border:1px solid #ddd;">תיאור</th>
                <th style="padding:8px;border:1px solid #ddd;">קטגוריה</th>
                <th style="padding:8px;border:1px solid #ddd;">סכום</th>
                <th style="padding:8px;border:1px solid #ddd;">מע״מ</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot style="background:#fafafa;font-weight:bold;">
              <tr>
                <td colspan="4" style="padding:8px;border:1px solid #ddd;">סה״כ</td>
                <td style="padding:8px;border:1px solid #ddd;text-align:left;">₪${totalAmt.toLocaleString('he-IL')}</td>
                <td style="padding:8px;border:1px solid #ddd;text-align:left;">₪${totalVat.toLocaleString('he-IL')}</td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#666;font-size:12px;margin-top:20px;">הצילומים מצורפים בקובץ ZIP.</p>
        </div>`

      await sendEmail({
        to: accountantEmail,
        subject: `קבלות הוצאות - ${settings?.business_name || ''} - ${range.from} עד ${range.to}`,
        html,
        attachments: [{
          filename: `receipts_${range.from}_${range.to}.zip`,
          content: zipB64,
          contentType: 'application/zip',
        }],
      })

      toast({ message: `נשלחו ${success} קבלות לרואה החשבון ✓`, type: 'success' })
    } catch (err) {
      toast({ message: 'שגיאה: ' + (err.message || err), type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // ─── Action 2: Send invoices + Excel report to accountant ───
  async function sendInvoicesReport() {
    if (!requireEmail()) return
    setBusy('invoices')
    try {
      const { arrayBuffer, filename, data } = await generateFinancialReport({
        from: range.from, to: range.to, settings,
      })
      const b64 = await blobToBase64(new Blob([arrayBuffer]))

      const totalInc = data.invoices.filter(i => !i.is_cancelled).reduce((s, i) => s + Number(i.total_amount || 0), 0)
      const totalExp = data.expenses.filter(e => !e.is_cancelled).reduce((s, e) => s + Number(e.amount || 0), 0)

      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:720px;">
          <h2 style="color:#c9a96e;">דוח חשבוניות והכנסות</h2>
          <p><b>עסק:</b> ${settings?.business_name || ''}<br/>
             <b>מס׳ עוסק:</b> ${settings?.business_tax_id || ''}<br/>
             <b>תקופה:</b> ${range.from} עד ${range.to}</p>
          <table style="border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 12px;">חשבוניות פעילות:</td><td style="padding:6px 12px;"><b>${data.invoices.filter(i => !i.is_cancelled).length}</b></td></tr>
            <tr><td style="padding:6px 12px;">סה״כ הכנסות:</td><td style="padding:6px 12px;"><b>₪${totalInc.toLocaleString('he-IL')}</b></td></tr>
            <tr><td style="padding:6px 12px;">סה״כ הוצאות:</td><td style="padding:6px 12px;"><b>₪${totalExp.toLocaleString('he-IL')}</b></td></tr>
            <tr><td style="padding:6px 12px;">הכנסות ידניות:</td><td style="padding:6px 12px;"><b>${data.manualIncome.length}</b></td></tr>
          </table>
          <p>הקובץ המצורף כולל את כל הנתונים המפורטים ב-6 גיליונות.</p>
        </div>`

      await sendEmail({
        to: accountantEmail,
        subject: `דוח חשבוניות - ${settings?.business_name || ''} - ${range.from} עד ${range.to}`,
        html,
        attachments: [{
          filename,
          content: b64,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }],
      })

      toast({ message: 'הדוח נשלח לרואה החשבון ✓', type: 'success' })
    } catch (err) {
      toast({ message: 'שגיאה: ' + (err.message || err), type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // ─── Action 3: Download Excel financial report ───
  async function downloadReport() {
    setBusy('report')
    try {
      const { arrayBuffer, filename } = await generateFinancialReport({
        from: range.from, to: range.to, settings,
      })
      downloadWorkbook(arrayBuffer, filename)
      toast({ message: 'הקובץ הורד ✓', type: 'success' })
    } catch (err) {
      toast({ message: 'שגיאה: ' + (err.message || err), type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // ─── Action 4a: OPENFRMT ───
  async function downloadOpenfrmt() {
    if (!ofValidation.valid) {
      toast({ message: 'חסרות הגדרות חובה: ' + ofValidation.errors[0], type: 'error' })
      return
    }
    setBusy('openfrmt')
    try {
      const result = await downloadOpenFormat({ from: range.from, to: range.to, settings })
      setOpenfrmtDialog(result)
      toast({ message: 'הקובץ הורד ✓', type: 'success' })
    } catch (err) {
      toast({ message: 'שגיאה: ' + (err.message || err), type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // ─── Action 4b: PCN874 ───
  async function downloadPcn() {
    setBusy('pcn874')
    try {
      await downloadPcn874({ from: range.from, to: range.to, settings })
      toast({ message: 'דוח PCN874 הורד', type: 'success' })
    } catch (err) {
      toast({ message: 'שגיאה: ' + (err.message || err), type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="card p-4">
        <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          👨‍💼 רואה חשבון
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          שלח דוחות מלאים ומסמכים ישירות לרואה החשבון שלך.
        </p>

        {/* Accountant info */}
        <div className="mt-3 p-3 rounded-xl flex items-center justify-between flex-wrap gap-2"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          {accountantEmail ? (
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {accountantName || 'רואה חשבון'}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{accountantEmail}</p>
            </div>
          ) : (
            <p className="text-sm" style={{ color: '#dc2626' }}>
              ⚠️ מייל רואה חשבון לא מוגדר. עבור ל"הגדרות".
            </p>
          )}
        </div>
      </div>

      {/* Date range */}
      <div className="card p-4">
        <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--color-muted)' }}>טווח תאריכים</label>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>מתאריך</label>
            <input type="date" value={range.from} onChange={e => setFrom(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>עד תאריך</label>
            <input type="date" value={range.to} onChange={e => setTo(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ActionCard
          icon="📥"
          title="הורד קבלות ZIP"
          description="כל צילומי הקבלות בקובץ ZIP מקומי, ללא שליחת מייל"
          busy={busy === 'receipts-dl'}
          onClick={downloadReceiptsZip}
        />
        <ActionCard
          icon="📸"
          title="שלח קבלות לרואה חשבון"
          description="ZIP עם כל צילומי הקבלות + טבלה מסכמת למייל"
          busy={busy === 'receipts'}
          onClick={sendReceipts}
        />
        <ActionCard
          icon="📊"
          title="הורד דוח פיננסי Excel"
          description="6 גיליונות — סיכום, הכנסות, הוצאות, עמלות, חובות, הכנסות ידניות"
          busy={busy === 'report'}
          onClick={downloadReport}
        />
        <ActionCard
          icon="🧾"
          title="שלח דוח Excel לרואה חשבון"
          description="קובץ Excel מעוצב עם כל החשבוניות והכנסות בתקופה"
          busy={busy === 'invoices'}
          onClick={sendInvoicesReport}
        />
        <ActionCard
          icon="🏛"
          title="דוחות רשות המיסים"
          description="OPENFRMT (קובץ אחיד) + PCN874 (מע״מ חודשי)"
          busy={false}
          onClick={() => setTaxPanelOpen(o => !o)}
          variant="tax"
        />
      </div>

      {/* Tax authority collapsible panel */}
      {taxPanelOpen && (
        <div className="card p-4 space-y-3" style={{ border: '1px solid var(--color-gold)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-gold)' }}>
            🏛 דוחות לרשות המיסים
          </p>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            הקבצים מופקים לפי מבנה אחיד 1.31 והוראת מקצוע 24/2004. יש לאמת בסימולטור הממשלתי לפני הגשה.
          </p>

          {/* Validation warnings */}
          {!ofValidation.valid && (
            <div className="p-3 rounded-xl text-xs space-y-1"
              style={{ background: 'var(--color-danger-tint)', border: '1px solid var(--color-danger-ring)', color: '#dc2626' }}>
              <p className="font-semibold">⚠️ חסרות הגדרות חובה להפקת OPENFRMT:</p>
              <ul className="list-disc pr-4 space-y-0.5">
                {ofValidation.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
              <p className="mt-2">יש להשלים את ההגדרות ב"הגדרות → רישום תוכנה ברשות המיסים".</p>
            </div>
          )}
          {ofValidation.valid && ofValidation.warnings.length > 0 && (
            <div className="p-3 rounded-xl text-xs space-y-1"
              style={{ background: 'var(--color-warning-tint)', border: '1px solid var(--color-warning-ring)', color: '#a16207' }}>
              {ofValidation.warnings.map((w, i) => <p key={i}>⚠️ {w}</p>)}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button onClick={downloadOpenfrmt} disabled={busy === 'openfrmt' || !ofValidation.valid}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: 'var(--color-gold)', color: '#fff' }}>
              {busy === 'openfrmt' ? <Spinner size="sm" /> : '📁 OPENFRMT (קובץ אחיד)'}
            </button>
            <button onClick={downloadPcn} disabled={busy === 'pcn874'}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              {busy === 'pcn874' ? <Spinner size="sm" /> : '📄 PCN874 (דוח מע״מ)'}
            </button>
          </div>
          <a href="https://www.gov.il/he/service/download-open-format-files"
            target="_blank" rel="noreferrer"
            className="text-xs underline inline-block" style={{ color: 'var(--color-gold)' }}>
            סימולטור אימות OPENFRMT ←
          </a>
        </div>
      )}

      {/* OPENFRMT summary dialog (Instruction 24/2004 §5.4) */}
      {openfrmtDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'var(--color-overlay-lg)' }}
          onClick={() => setOpenfrmtDialog(null)}>
          <div className="card p-6 max-w-md w-full space-y-4"
            style={{ background: 'var(--color-card)', border: '1px solid var(--color-gold)' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg" style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}>
              ✓ קובץ אחיד הופק בהצלחה
            </h3>
            <div className="text-sm space-y-1" style={{ color: 'var(--color-text)' }}>
              <p><b>Primary ID:</b> <span className="font-mono text-xs">{openfrmtDialog.primaryId}</span></p>
              <p><b>תקופה:</b> {range.from} עד {range.to}</p>
              <p><b>ספירות:</b></p>
              <ul className="list-disc pr-6 text-xs" style={{ color: 'var(--color-muted)' }}>
                <li>C100 (כותרות מסמכים): {openfrmtDialog.report.totals.C100}</li>
                <li>D110 (שורות מסמך): {openfrmtDialog.report.totals.D110}</li>
                <li>D120 (תקבולים): {openfrmtDialog.report.totals.D120}</li>
                <li>M100 (פריטים): {openfrmtDialog.report.totals.M100}</li>
              </ul>
            </div>
            <div className="text-xs p-3 rounded-xl"
              style={{ background: 'var(--color-blue-tint)', color: 'var(--color-muted)' }}>
              ℹ️ לפי סעיף 5.4 להוראת מקצוע 24/2004 — יש לשמור את ה-Primary ID ואת דוח ההפקה (סעיף 2.6) לתיעוד.
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => printSection26(openfrmtDialog.report)}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--color-gold)', color: '#fff' }}>
                🖨 הדפס דוח הפקה (2.6)
              </button>
              <button onClick={() => setOpenfrmtDialog(null)}
                className="px-4 py-2 rounded-xl text-sm"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                סגור
              </button>
            </div>
            <a href="https://www.gov.il/he/service/download-open-format-files"
              target="_blank" rel="noreferrer"
              className="text-xs underline inline-block" style={{ color: 'var(--color-gold)' }}>
              אמת בסימולטור הממשלתי ←
            </a>
          </div>
        </div>
      )}

      {/* Legal notice */}
      <div className="card p-3" style={{ background: 'var(--color-blue-tint)', border: '1px solid var(--color-blue-ring)' }}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          ℹ️ <b>לתשומת לבך:</b> הדוחות ל-רשות המיסים (OPENFRMT, PCN874) מופקים לפי המפרט הרשמי, אך באחריותך לאמת אותם בסימולטור הממשלתי לפני הגשה.
          לצורך SaaS מסחרי — יש לרשום את התוכנה ברשות המיסים ולקבל "מספר רישום תוכנה".
        </p>
      </div>
    </div>
  )
}

function ActionCard({ icon, title, description, busy, onClick, variant }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="card p-4 text-right transition-all hover:scale-[1.01] disabled:opacity-60 disabled:cursor-wait"
      style={{
        background: variant === 'tax' ? 'var(--color-gold-tint)' : 'var(--color-card)',
        border: `1px solid ${variant === 'tax' ? 'var(--color-gold-ring)' : 'var(--color-border)'}`,
        cursor: busy ? 'wait' : 'pointer',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="text-3xl leading-none">{busy ? <Spinner size="sm" /> : icon}</div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {title}
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            {description}
          </p>
        </div>
      </div>
    </button>
  )
}
