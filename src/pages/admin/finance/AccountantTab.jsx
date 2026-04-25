import { useState } from 'react'
import JSZip from 'jszip'
import { supabase } from '../../../lib/supabase'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { useToast } from '../../../components/ui/Toast'
import { Spinner } from '../../../components/ui/Spinner'
import { sendEmail } from '../../../lib/email'
import { generateFinancialReport, downloadWorkbook, generateWorkLog } from '../../../lib/xlsx-report'

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
  const [busy, setBusy] = useState(null)

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

  // ─── Action 1b: Send expense receipts email to accountant (links, no attachment) ───
  // Note: ZIP attachment was removed — Supabase Edge Function has a 6MB request limit.
  // Instead we embed clickable receipt image links in the email body.
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

      const totalAmt = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
      const totalVat = expenses.reduce((s, e) => s + Number(e.vat_amount || 0), 0)
      let receiptCount = 0

      const rows = expenses.map(e => {
        const urls = [e.receipt_url, ...(e.receipt_urls || [])].filter(Boolean)
        receiptCount += urls.length
        const receiptLinks = urls.length
          ? urls.map((u, i) => `<a href="${u}" target="_blank" style="color:#c9a96e;margin-left:6px;">קבלה ${urls.length > 1 ? i + 1 : ''}</a>`).join(' ')
          : '<span style="color:#aaa;">—</span>'
        return `
        <tr>
          <td style="padding:6px 10px;border:1px solid #eee;">${e.date || ''}</td>
          <td style="padding:6px 10px;border:1px solid #eee;">${e.vendor_name || ''}</td>
          <td style="padding:6px 10px;border:1px solid #eee;">${e.description || ''}</td>
          <td style="padding:6px 10px;border:1px solid #eee;">${e.expense_categories?.name || ''}</td>
          <td style="padding:6px 10px;border:1px solid #eee;text-align:left;">₪${Number(e.amount || 0).toLocaleString('he-IL')}</td>
          <td style="padding:6px 10px;border:1px solid #eee;text-align:left;">₪${Number(e.vat_amount || 0).toLocaleString('he-IL')}</td>
          <td style="padding:6px 10px;border:1px solid #eee;">${receiptLinks}</td>
        </tr>`
      }).join('')

      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:800px;">
          <h2 style="color:#c9a96e;margin-bottom:4px;">קבלות הוצאות</h2>
          <p style="margin:0 0 16px;font-size:14px;color:#555;">
            <b>עסק:</b> ${settings?.business_name || ''} &nbsp;|&nbsp;
            <b>ת.ז./עוסק:</b> ${settings?.business_tax_id || '—'} &nbsp;|&nbsp;
            <b>תקופה:</b> ${range.from} עד ${range.to}<br/>
            <b>הוצאות:</b> ${expenses.length} &nbsp;|&nbsp;
            <b>קבלות מקושרות:</b> ${receiptCount}
          </p>
          <table style="border-collapse:collapse;width:100%;font-size:13px;">
            <thead>
              <tr style="background:#f5f5f5;">
                <th style="padding:8px 10px;border:1px solid #ddd;text-align:right;">תאריך</th>
                <th style="padding:8px 10px;border:1px solid #ddd;text-align:right;">ספק</th>
                <th style="padding:8px 10px;border:1px solid #ddd;text-align:right;">תיאור</th>
                <th style="padding:8px 10px;border:1px solid #ddd;text-align:right;">קטגוריה</th>
                <th style="padding:8px 10px;border:1px solid #ddd;text-align:right;">סכום</th>
                <th style="padding:8px 10px;border:1px solid #ddd;text-align:right;">מע״מ</th>
                <th style="padding:8px 10px;border:1px solid #ddd;text-align:right;">קבלה</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="background:#fafafa;font-weight:bold;">
                <td colspan="4" style="padding:8px 10px;border:1px solid #ddd;">סה״כ</td>
                <td style="padding:8px 10px;border:1px solid #ddd;text-align:left;">₪${totalAmt.toLocaleString('he-IL')}</td>
                <td style="padding:8px 10px;border:1px solid #ddd;text-align:left;">₪${totalVat.toLocaleString('he-IL')}</td>
                <td style="border:1px solid #ddd;"></td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#999;font-size:11px;margin-top:16px;">
            ⬆️ לחיצה על "קבלה" פותחת את הצילום המקורי. לקובץ ZIP של כל הקבלות — בקש מבעל העסק.
          </p>
        </div>`

      await sendEmail({
        to: accountantEmail,
        subject: `קבלות הוצאות — ${settings?.business_name || ''} — ${range.from} עד ${range.to}`,
        html,
      })

      toast({ message: `הדוח נשלח לרואה החשבון ✓ (${expenses.length} הוצאות, ${receiptCount} קישורי קבלה)`, type: 'success' })
    } catch (err) {
      toast({ message: 'שגיאה בשליחת מייל: ' + (err.message || String(err)), type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // ─── Action 2: Send invoices + Excel report to accountant ───
  // Upload Excel to Supabase Storage (temp), email a signed download link.
  // This avoids the 6MB Supabase Edge Function request body limit.
  async function sendInvoicesReport() {
    if (!requireEmail()) return
    setBusy('invoices')
    try {
      const { arrayBuffer, filename, data } = await generateFinancialReport({
        from: range.from, to: range.to, settings,
      })

      // Upload to temp storage bucket
      const blob     = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const path     = `accountant-reports/${Date.now()}_${filename}`
      const { error: upErr } = await supabase.storage.from('finance-exports').upload(path, blob, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      })
      if (upErr) throw new Error('שגיאה בהעלאת קובץ: ' + upErr.message)

      // Signed URL valid 7 days
      const { data: signed, error: signErr } = await supabase.storage.from('finance-exports').createSignedUrl(path, 60 * 60 * 24 * 7)
      if (signErr) throw new Error('שגיאה ביצירת לינק: ' + signErr.message)

      const totalInc = data.invoices.filter(i => !i.is_cancelled).reduce((s, i) => s + Number(i.total_amount || 0), 0)
      const totalExp = data.expenses.filter(e => !e.is_cancelled).reduce((s, e) => s + Number(e.amount || 0), 0)

      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:720px;">
          <h2 style="color:#c9a96e;margin-bottom:4px;">דוח חשבוניות והכנסות</h2>
          <p style="margin:0 0 16px;font-size:14px;color:#555;">
            <b>עסק:</b> ${settings?.business_name || ''} &nbsp;|&nbsp;
            <b>מס׳ עוסק:</b> ${settings?.business_tax_id || '—'} &nbsp;|&nbsp;
            <b>תקופה:</b> ${range.from} עד ${range.to}
          </p>
          <table style="border-collapse:collapse;font-size:14px;width:100%;">
            <tr style="background:#f5f5f5;"><td style="padding:8px 12px;border:1px solid #eee;"><b>חשבוניות פעילות</b></td><td style="padding:8px 12px;border:1px solid #eee;">${data.invoices.filter(i => !i.is_cancelled).length}</td></tr>
            <tr><td style="padding:8px 12px;border:1px solid #eee;"><b>סה״כ הכנסות</b></td><td style="padding:8px 12px;border:1px solid #eee;">₪${totalInc.toLocaleString('he-IL')}</td></tr>
            <tr style="background:#f5f5f5;"><td style="padding:8px 12px;border:1px solid #eee;"><b>סה״כ הוצאות</b></td><td style="padding:8px 12px;border:1px solid #eee;">₪${totalExp.toLocaleString('he-IL')}</td></tr>
            <tr><td style="padding:8px 12px;border:1px solid #eee;"><b>רווח גולמי</b></td><td style="padding:8px 12px;border:1px solid #eee;">₪${(totalInc - totalExp).toLocaleString('he-IL')}</td></tr>
            <tr style="background:#f5f5f5;"><td style="padding:8px 12px;border:1px solid #eee;"><b>הכנסות ידניות</b></td><td style="padding:8px 12px;border:1px solid #eee;">${data.manualIncome.length} רשומות</td></tr>
          </table>
          <p style="margin-top:20px;">
            <a href="${signed.signedUrl}"
               style="display:inline-block;background:#c9a96e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
              ⬇️ הורד קובץ Excel (6 גיליונות)
            </a>
          </p>
          <p style="color:#999;font-size:11px;margin-top:8px;">הקישור בתוקף ל-7 ימים.</p>
        </div>`

      await sendEmail({
        to: accountantEmail,
        subject: `דוח פיננסי — ${settings?.business_name || ''} — ${range.from} עד ${range.to}`,
        html,
      })

      toast({ message: 'הדוח נשלח לרואה החשבון ✓', type: 'success' })
    } catch (err) {
      toast({ message: 'שגיאה: ' + (err.message || String(err)), type: 'error' })
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

  // ─── Action 3b: Work log ───
  async function downloadWorkLogReport() {
    setBusy('worklog')
    try {
      const { arrayBuffer, filename } = await generateWorkLog({ from: range.from, to: range.to, settings })
      downloadWorkbook(arrayBuffer, filename)
      toast({ message: 'יומן עבודה הורד ✓', type: 'success' })
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
          description="צילומי כל קבלות ההוצאות בטווח — קובץ ZIP להורדה מקומית"
          busy={busy === 'receipts-dl'}
          onClick={downloadReceiptsZip}
        />
        <ActionCard
          icon="📸"
          title="שלח קבלות לרואה חשבון"
          description="מייל לרו״ח עם קישורים לכל צילומי הקבלות + טבלת סיכום הוצאות"
          busy={busy === 'receipts'}
          onClick={sendReceipts}
        />
        <ActionCard
          icon="📊"
          title="הורד דוח פיננסי Excel"
          description="6 גיליונות: סיכום, הכנסות, הוצאות, עמלות, חובות, הכנסות ידניות"
          busy={busy === 'report'}
          onClick={downloadReport}
        />
        <ActionCard
          icon="🧾"
          title="שלח דוח Excel לרואה חשבון"
          description="מייל לרו״ח עם קישור הורדה לקובץ Excel (קישור תקף 7 ימים)"
          busy={busy === 'invoices'}
          onClick={sendInvoicesReport}
        />
        <ActionCard
          icon="📋"
          title="יומן עבודה"
          description="כל התורים כולל מבוטלים, ממוין לפי תאריך — לצורך ביקורת מס (הוראות ניהול ספרים)"
          busy={busy === 'worklog'}
          onClick={downloadWorkLogReport}
        />
      </div>

      {/* Legal notice */}
      <div className="card p-3" style={{ background: 'var(--color-blue-tint)', border: '1px solid var(--color-blue-ring)' }}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          ℹ️ לייצוא קבצים לרשות המיסים (OPENFRMT / קובץ אחיד) — עבור ללשונית <b>מס הכנסה</b>.
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
