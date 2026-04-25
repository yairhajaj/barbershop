import { useState } from 'react'
import JSZip from 'jszip'
import { supabase } from '../../../lib/supabase'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { useToast } from '../../../components/ui/Toast'
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

  // ─── Action 1b: Send receipts — download ZIP then open mailto ───
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
      if (!expenses?.length) { toast({ message: 'אין הוצאות בטווח זה', type: 'error' }); return }

      const { zipBlob, success } = await buildReceiptsZip(expenses)
      if (zipBlob) {
        const url = URL.createObjectURL(zipBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = `receipts_${range.from}_${range.to}.zip`
        a.click()
        URL.revokeObjectURL(url)
      }

      const totalAmt = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
      const subject  = encodeURIComponent(`קבלות הוצאות — ${settings?.business_name || ''} — ${range.from} עד ${range.to}`)
      const body     = encodeURIComponent(
        `שלום ${accountantName || 'רואה חשבון'},\n\n` +
        `מצורף קובץ ZIP עם קבלות ההוצאות לתקופה ${range.from} עד ${range.to}.\n\n` +
        `פירוט:\n` +
        `• מספר הוצאות: ${expenses.length}\n` +
        `• סה״כ: ₪${totalAmt.toLocaleString('he-IL')}\n\n` +
        `בברכה,\n${settings?.business_name || ''}`
      )
      window.location.href = `mailto:${accountantEmail}?subject=${subject}&body=${body}`
      toast({ message: zipBlob ? `קובץ ZIP הורד (${success} קבלות) — אפליקציית המייל נפתחת` : 'אפליקציית המייל נפתחת', type: 'success' })
    } catch (err) {
      toast({ message: 'שגיאה: ' + (err.message || String(err)), type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // ─── Action 2: Send Excel report — download then open mailto ───
  async function sendInvoicesReport() {
    if (!requireEmail()) return
    setBusy('invoices')
    try {
      const { arrayBuffer, filename, data } = await generateFinancialReport({
        from: range.from, to: range.to, settings,
      })
      downloadWorkbook(arrayBuffer, filename)

      const totalInc = data.invoices.filter(i => !i.is_cancelled).reduce((s, i) => s + Number(i.total_amount || 0), 0)
      const totalExp = data.expenses.filter(e => !e.is_cancelled).reduce((s, e) => s + Number(e.amount || 0), 0)
      const subject  = encodeURIComponent(`דוח פיננסי — ${settings?.business_name || ''} — ${range.from} עד ${range.to}`)
      const body     = encodeURIComponent(
        `שלום ${accountantName || 'רואה חשבון'},\n\n` +
        `מצורף דוח פיננסי Excel לתקופה ${range.from} עד ${range.to}.\n\n` +
        `סיכום:\n` +
        `• חשבוניות פעילות: ${data.invoices.filter(i => !i.is_cancelled).length}\n` +
        `• סה״כ הכנסות: ₪${totalInc.toLocaleString('he-IL')}\n` +
        `• סה״כ הוצאות: ₪${totalExp.toLocaleString('he-IL')}\n` +
        `• רווח גולמי: ₪${(totalInc - totalExp).toLocaleString('he-IL')}\n\n` +
        `בברכה,\n${settings?.business_name || ''}`
      )
      window.location.href = `mailto:${accountantEmail}?subject=${subject}&body=${body}`
      toast({ message: 'הקובץ הורד — אפליקציית המייל נפתחת לצירוף ושליחה', type: 'success' })
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

      {/* Section cards — grouped download + send */}
      <div className="space-y-3">

        {/* קבלות הוצאות */}
        <div className="card p-4">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-2xl leading-none">🧾</span>
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>קבלות הוצאות</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                צילומי קבלות ההוצאות לתקופה הנבחרת — להורדה מקומית או שליחה לרו״ח
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <SectionBtn busy={busy === 'receipts-dl'} onClick={downloadReceiptsZip} label="📥 הורד ZIP" />
            <SectionBtn busy={busy === 'receipts'}    onClick={sendReceipts}        label="📤 שלח לרו״ח" primary />
          </div>
        </div>

        {/* דוח פיננסי Excel */}
        <div className="card p-4">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-2xl leading-none">📊</span>
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>דוח פיננסי Excel</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                6 גיליונות: סיכום, הכנסות, הוצאות, עמלות, חובות, הכנסות ידניות
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <SectionBtn busy={busy === 'report'}   onClick={downloadReport}      label="📥 הורד" />
            <SectionBtn busy={busy === 'invoices'} onClick={sendInvoicesReport}  label="📤 שלח לרו״ח" primary />
          </div>
        </div>

        {/* יומן עבודה */}
        <div className="card p-4">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-2xl leading-none">📋</span>
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>יומן עבודה</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                כל התורים כולל מבוטלים, ממוין לפי תאריך — לצורך ביקורת מס (הוראות ניהול ספרים)
              </p>
            </div>
          </div>
          <SectionBtn busy={busy === 'worklog'} onClick={downloadWorkLogReport} label="📥 הורד Excel" />
        </div>

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

function SectionBtn({ busy, onClick, label, primary }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-wait"
      style={primary
        ? { background: 'var(--color-gold)', color: '#fff', border: '1px solid var(--color-gold)' }
        : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }
      }
    >
      {busy ? '⏳' : label}
    </button>
  )
}
