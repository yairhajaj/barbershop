import { useState, useEffect, useRef } from 'react'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useRecurringBreaks } from '../../hooks/useRecurringBreaks'
import { useToast } from '../../components/ui/Toast'
import { Spinner } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { GapCloserHelpBody } from '../../components/admin/GapCloserHelpBody'

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

export function Settings() {
  const { settings, loading, saveSettings } = useBusinessSettings()
  const { breaks, loading: breaksLoading, addBreak, deleteBreak } = useRecurringBreaks()
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const [showGapHelp, setShowGapHelp] = useState(false)
  const lastSavedRef = useRef(null)
  const saveTimerRef = useRef(null)
  const savedFlashRef = useRef(null)

  // Recurring breaks form state
  const [breakForm, setBreakForm] = useState({
    label: '',
    day_of_week: '',
    start_time: '13:00',
    end_time: '14:00',
  })
  const [addingBreak, setAddingBreak] = useState(false)

  useEffect(() => {
    if (settings) {
      setForm({ ...settings })
      lastSavedRef.current = JSON.stringify(settings)
    }
  }, [settings])

  // Auto-save on any form change (debounced 600ms) — sends ONLY changed fields
  useEffect(() => {
    if (!form) return
    const lastSaved = lastSavedRef.current ? JSON.parse(lastSavedRef.current) : null
    if (!lastSaved) return

    // Compute diff
    const diff = {}
    for (const k of Object.keys(form)) {
      if (JSON.stringify(form[k]) !== JSON.stringify(lastSaved[k])) {
        diff[k] = form[k]
      }
    }
    if (Object.keys(diff).length === 0) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await saveSettings(diff)
        lastSavedRef.current = JSON.stringify(form)
        setSaveStatus('saved')
        if (savedFlashRef.current) clearTimeout(savedFlashRef.current)
        savedFlashRef.current = setTimeout(() => setSaveStatus('idle'), 1800)
      } catch (err) {
        setSaveStatus('error')
        toast({ message: err.message, type: 'error' })
      }
    }, 600)

    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [form]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddBreak(e) {
    e.preventDefault()
    if (!breakForm.label || !breakForm.start_time || !breakForm.end_time) return
    setAddingBreak(true)
    try {
      await addBreak({
        label: breakForm.label,
        day_of_week: breakForm.day_of_week === '' ? null : Number(breakForm.day_of_week),
        start_time: breakForm.start_time,
        end_time: breakForm.end_time,
      })
      setBreakForm({ label: '', day_of_week: '', start_time: '13:00', end_time: '14:00' })
      toast({ message: 'הפסקה נוספה', type: 'success' })
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setAddingBreak(false)
    }
  }

  if (loading || !form) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>הגדרות</h1>
        {saveStatus === 'saving' && (
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--color-surface)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
            ⏳ שומר...
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.3)' }}>
            ✓ נשמר
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)' }}>
            ⚠ שגיאה
          </span>
        )}
      </div>

      <form onSubmit={e => e.preventDefault()} className="space-y-8">

        {/* Cancellation Policy */}
        <section className="card p-6">
          <h2 className="font-semibold text-lg mb-4">מדיניות ביטולים</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">שעות מינימום לביטול</label>
              <input
                className="input"
                type="number"
                min="0"
                value={form.cancellation_hours}
                onChange={e => setForm(f => ({ ...f, cancellation_hours: Number(e.target.value) }))}
              />
              <p className="text-xs text-muted mt-1">לקוח לא יוכל לבטל לבד אחרי פרק זמן זה</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">חיוב על אי הגעה</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: 'none', label: 'ללא חיוב' },
                  { value: 'full', label: 'מחיר מלא' },
                  { value: 'percentage', label: 'אחוז מהמחיר' },
                  { value: 'fixed', label: 'סכום קבוע' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, cancellation_fee_type: opt.value }))}
                    className="py-2 px-3 rounded-xl text-sm font-medium border-2 transition-all"
                    style={{
                      borderColor: form.cancellation_fee_type === opt.value ? 'var(--color-gold)' : 'var(--color-border)',
                      background: form.cancellation_fee_type === opt.value ? 'var(--color-gold-tint)' : 'transparent',
                      color: form.cancellation_fee_type === opt.value ? 'var(--color-gold)' : 'var(--color-muted)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {(form.cancellation_fee_type === 'percentage' || form.cancellation_fee_type === 'fixed') && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  {form.cancellation_fee_type === 'percentage' ? 'אחוז (%)' : 'סכום (₪)'}
                </label>
                <input
                  className="input w-32"
                  type="number"
                  min="0"
                  max={form.cancellation_fee_type === 'percentage' ? 100 : undefined}
                  placeholder={form.cancellation_fee_type === 'percentage' ? '50' : '30'}
                  value={form.cancellation_fee || ''}
                  onChange={e => setForm(f => ({ ...f, cancellation_fee: e.target.value ? Number(e.target.value) : null }))}
                />
              </div>
            )}

            {/* Preview */}
            <div className="rounded-xl p-3 text-sm"
              style={{ background: 'var(--color-gold-tint)', border: '1px solid var(--color-gold-ring)' }}>
              <p className="font-medium mb-1" style={{ color: 'var(--color-gold)' }}>תצוגה מוקדמת — כך יראה ללקוח:</p>
              <p style={{ color: 'var(--color-muted)' }}>
                {`ניתן לבטל עד ${form.cancellation_hours} שעות לפני התור. `}
                {form.cancellation_fee_type === 'none' && 'אי הגעה ללא ביטול לא תחויב.'}
                {form.cancellation_fee_type === 'full' && 'אי הגעה ללא ביטול תחויב במחיר מלא של השירות.'}
                {form.cancellation_fee_type === 'percentage' && form.cancellation_fee && `אי הגעה ללא ביטול תחויב ב-${form.cancellation_fee}% ממחיר השירות.`}
                {form.cancellation_fee_type === 'fixed' && form.cancellation_fee && `אי הגעה ללא ביטול תחויב ב-₪${form.cancellation_fee}.`}
              </p>
            </div>
          </div>
        </section>

        {/* Invoicing & Payments System */}
        <section className="card p-6" style={{ border: '2px solid var(--color-gold-ring)' }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-semibold text-lg">ניהול חשבוניות ותשלומים</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
                הפעל או כבה את כל מערכת הקבלות, המע"מ ומעקב התשלומים
              </p>
            </div>
            <Toggle
              checked={form.invoicing_enabled ?? true}
              onChange={v => setForm(f => ({ ...f, invoicing_enabled: v }))}
            />
          </div>

          {!(form.invoicing_enabled ?? true) && (
            <div className="mt-4 rounded-xl p-4 text-sm"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.35)' }}>
              <p className="font-black mb-1" style={{ color: '#dc2626' }}>⚠️ שים לב — חובה חוקית</p>
              <p style={{ color: 'var(--color-text)', lineHeight: 1.6 }}>
                כיבוי המערכת <strong>אינו פוטר אותך מהוצאת קבלות.</strong> על פי חוק מס הכנסה,
                עסק חייב להנפיק קבלה ידנית לכל עסקה, גם אם אינו משתמש בתוכנה לניהול חשבונות.
                <br /><strong>המשך לנהל פנקס קבלות פיזי עד שתחזור להפעיל את המערכת.</strong>
              </p>
            </div>
          )}

          {(form.invoicing_enabled ?? true) && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-muted)' }}>
              פעיל — חשבוניות, קבלות, מע"מ ומעקב תשלומים מופעלים
            </p>
          )}
        </section>

        {/* Smart Scheduling */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-lg">צמצום חורים ביומן</h2>
              <p className="text-sm text-muted mt-1">הגבל לקוחות לקביעה בשעות מסוימות בלבד</p>
            </div>
            <Toggle
              checked={form.smart_scheduling_enabled}
              onChange={v => setForm(f => ({ ...f, smart_scheduling_enabled: v }))}
            />
          </div>

          {form.smart_scheduling_enabled && (
            <div className="border-t pt-4 mt-2 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">כמה לקוחות ראשונים חופשיים?</label>
                <input
                  className="input w-24"
                  type="number"
                  min="0"
                  max="10"
                  value={form.free_slots_count}
                  onChange={e => setForm(f => ({ ...f, free_slots_count: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted mt-1">0 = כולם מוגבלים מהרגע הראשון</p>
              </div>

              <p className="text-sm font-medium">אפשר ללקוח לקבוע:</p>

              <div className="space-y-3">
                <ToggleRow
                  label="צמוד לתורים קיימים"
                  desc="מיד לפני או אחרי תור שכבר קיים"
                  checked={form.smart_adjacent ?? true}
                  onChange={v => setForm(f => ({ ...f, smart_adjacent: v }))}
                />
                <ToggleRow
                  label="תחילת היום"
                  desc="החריץ הראשון הפנוי של היום"
                  checked={form.smart_start_of_day ?? true}
                  onChange={v => setForm(f => ({ ...f, smart_start_of_day: v }))}
                />
                <ToggleRow
                  label="סוף היום"
                  desc="החריץ האחרון הפנוי של היום"
                  checked={form.smart_end_of_day ?? true}
                  onChange={v => setForm(f => ({ ...f, smart_end_of_day: v }))}
                />
              </div>
            </div>
          )}
        </section>

        {/* Recurring Appointments */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-lg">תורים קבועים שבועיים</h2>
              <p className="text-sm text-muted mt-1">אפשר ללקוחות לקבוע אותו תור כל שבוע</p>
            </div>
            <Toggle
              checked={form.recurring_appointments_enabled ?? true}
              onChange={v => setForm(f => ({ ...f, recurring_appointments_enabled: v }))}
            />
          </div>
          {(form.recurring_appointments_enabled ?? true) && (
            <div className="border-t pt-4 mt-2">
              <label className="block text-sm font-medium mb-1">כמה שבועות קדימה?</label>
              <input
                className="input w-24"
                type="number"
                min="1"
                max="52"
                value={form.recurring_weeks_ahead ?? 12}
                onChange={e => setForm(f => ({ ...f, recurring_weeks_ahead: Number(e.target.value) }))}
              />
              <p className="text-xs text-muted mt-1">מספר שבועות שייקבעו כשלקוח בוחר תור קבוע</p>
            </div>
          )}
        </section>

        {/* Manual Approval */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-semibold text-lg">אישור ידני לכל תור ✋</h2>
              <p className="text-sm text-muted mt-1">כל תור שלקוח קובע ימתין לאישור שלך לפני שיהפוך לסופי</p>
            </div>
            <Toggle
              checked={form.approval_required ?? false}
              onChange={v => setForm(f => ({ ...f, approval_required: v }))}
            />
          </div>
          {(form.approval_required ?? false) && (
            <div className="border-t pt-4 mt-2 text-xs text-muted space-y-1">
              <p>• כשהמתג פעיל — תור חדש נכנס למצב "ממתין לאישור" וחוסם את המשבצת.</p>
              <p>• בלוח הבקרה יופיע ווידג'ט "תורים ממתינים לאישור" עם דף ייעודי לאישור/דחייה/הצעת זמן חלופי.</p>
              <p>• הלקוח יקבל התראה ברגע שתאשר את התור.</p>
            </div>
          )}
        </section>

        {/* Shabbat Mode */}
        <section className="card p-6">
          <h2 className="font-semibold text-lg mb-1">מצב שבת 🕍</h2>
          <p className="text-sm text-muted mb-4">חסום הזמנות אוטומטית בשעות שבת לפי שקיעת חמה</p>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-medium text-sm">הפעל מצב שבת</p>
              <p className="text-xs text-muted mt-0.5">
                שבת מתחילה {form.shabbat_offset_minutes ?? 18} דקות לפני שקיעה בשישי, ומסתיימת 42 דקות אחרי שקיעה בשבת
              </p>
            </div>
            <Toggle
              checked={form.shabbat_mode ?? false}
              onChange={v => setForm(f => ({ ...f, shabbat_mode: v }))}
            />
          </div>
          {form.shabbat_mode && (
            <div className="border-t pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">קו רוחב (Lat)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.0001"
                    value={form.shabbat_lat ?? 31.7683}
                    onChange={e => setForm(f => ({ ...f, shabbat_lat: parseFloat(e.target.value) }))}
                    placeholder="31.7683"
                  />
                  <p className="text-xs text-muted mt-1">ירושלים = 31.7683</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">קו אורך (Lng)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.0001"
                    value={form.shabbat_lng ?? 35.2137}
                    onChange={e => setForm(f => ({ ...f, shabbat_lng: parseFloat(e.target.value) }))}
                    placeholder="35.2137"
                  />
                  <p className="text-xs text-muted mt-1">תל אביב = 32.0853, 34.7818</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  דקות לפני שקיעה לכניסת שבת
                </label>
                <input
                  className="input w-24"
                  type="number"
                  min="0"
                  max="60"
                  value={form.shabbat_offset_minutes ?? 18}
                  onChange={e => setForm(f => ({ ...f, shabbat_offset_minutes: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted mt-1">ברירת מחדל: 18 דקות (מנהג ירושלים)</p>
              </div>
            </div>
          )}
        </section>

        {/* ── Automatic Reminders ── */}
        <section className="card p-6">
          <h2 className="font-semibold text-lg mb-1">🔔 תזכורות אוטומטיות</h2>
          <p className="text-sm text-muted mb-5">שלח ללקוחות תזכורת לפני התור — רק למי שאישר לקבל</p>

          <div className="space-y-5">
            {/* Enable toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-medium">הפעל תזכורות אוטומטיות</span>
              <div className="relative" onClick={() => setForm(f => ({ ...f, reminder_enabled: !f.reminder_enabled }))}>
                <div className="w-11 h-6 rounded-full transition-all duration-200"
                  style={{ background: form.reminder_enabled ? 'var(--color-gold)' : 'var(--color-shadow-md)' }}>
                  <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200"
                    style={{ right: form.reminder_enabled ? '2px' : 'calc(100% - 22px)' }} />
                </div>
              </div>
            </label>

            {form.reminder_enabled && (<>
              {/* Channel */}
              <div>
                <label className="block text-sm font-medium mb-2">ערוץ שליחה</label>
                <div className="flex gap-2">
                  {[
                    { key: 'whatsapp', label: '📱 WhatsApp' },
                    { key: 'push',     label: '🔔 Push' },
                    { key: 'both',     label: '📨 שניהם' },
                  ].map(ch => (
                    <button key={ch.key} type="button"
                      onClick={() => setForm(f => ({ ...f, reminder_channel: ch.key }))}
                      className="px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all"
                      style={{
                        borderColor: form.reminder_channel === ch.key ? 'var(--color-gold)' : 'var(--color-border)',
                        background: form.reminder_channel === ch.key ? 'var(--color-gold-tint)' : 'transparent',
                        color: form.reminder_channel === ch.key ? 'var(--color-gold)' : 'var(--color-muted)',
                      }}>
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reminder 1 — always on */}
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--color-surface)' }}>
                <span className="text-sm font-medium flex-1">תזכורת 1 (תמיד פעיל)</span>
                <input
                  type="number" min="1" max="168"
                  className="input w-20 py-1 text-center"
                  value={form.reminder_1_hours ?? 24}
                  onChange={e => setForm(f => ({ ...f, reminder_1_hours: Number(e.target.value) }))}
                />
                <span className="text-sm text-muted">שעות לפני</span>
              </div>

              {/* Reminder 2 */}
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--color-surface)' }}>
                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                  <div className="relative" onClick={() => setForm(f => ({ ...f, reminder_2_enabled: !f.reminder_2_enabled }))}>
                    <div className="w-9 h-5 rounded-full transition-all"
                      style={{ background: form.reminder_2_enabled ? 'var(--color-gold)' : 'var(--color-shadow-md)' }}>
                      <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                        style={{ right: form.reminder_2_enabled ? '2px' : 'calc(100% - 18px)' }} />
                    </div>
                  </div>
                  <span className="text-sm font-medium">תזכורת 2</span>
                </label>
                <input
                  type="number" min="1" max="72"
                  className="input w-20 py-1 text-center"
                  disabled={!form.reminder_2_enabled}
                  value={form.reminder_2_hours ?? 2}
                  onChange={e => setForm(f => ({ ...f, reminder_2_hours: Number(e.target.value) }))}
                  style={{ opacity: form.reminder_2_enabled ? 1 : 0.4 }}
                />
                <span className="text-sm text-muted">שעות לפני</span>
              </div>

              {/* Reminder 3 */}
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--color-surface)' }}>
                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                  <div className="relative" onClick={() => setForm(f => ({ ...f, reminder_3_enabled: !f.reminder_3_enabled }))}>
                    <div className="w-9 h-5 rounded-full transition-all"
                      style={{ background: form.reminder_3_enabled ? 'var(--color-gold)' : 'var(--color-shadow-md)' }}>
                      <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                        style={{ right: form.reminder_3_enabled ? '2px' : 'calc(100% - 18px)' }} />
                    </div>
                  </div>
                  <span className="text-sm font-medium">תזכורת 3</span>
                </label>
                <input
                  type="number" min="1" max="24"
                  className="input w-20 py-1 text-center"
                  disabled={!form.reminder_3_enabled}
                  value={form.reminder_3_hours ?? 1}
                  onChange={e => setForm(f => ({ ...f, reminder_3_hours: Number(e.target.value) }))}
                  style={{ opacity: form.reminder_3_enabled ? 1 : 0.4 }}
                />
                <span className="text-sm text-muted">שעות לפני</span>
              </div>

            </>)}
          </div>
        </section>

        {/* ── Payment Settings ───────────────────────────────────────── */}
        {(form.invoicing_enabled ?? true) && <section className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">💳</span>
            <h2 className="font-semibold text-lg">תשלום אונליין</h2>
          </div>
          <p className="text-sm text-muted mb-5">
            אפשר ללקוחות לשלם בעת ההזמנה דרך PayPlus. הכסף מועבר ישירות לחשבון שלך.
          </p>

          <ToggleRow
            label="הפעל סליקה בהזמנה"
            desc="לקוחות יראו אפשרות תשלום בעת קביעת תור"
            checked={!!form?.payment_enabled}
            onChange={v => setForm(f => ({ ...f, payment_enabled: v }))}
          />

          {form?.payment_enabled && (
            <div className="mt-5 space-y-5">

              {/* ── Step 1: Grow account ── */}
              <div className="rounded-2xl p-4" style={{ background: 'var(--color-gold-tint)', border: '1px solid var(--color-gold-ring)' }}>
                <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-gold)' }}>שלב 1 — פתח חשבון Grow</p>
                <p className="text-xs text-muted mb-3">ההרשמה חינמית. תומך ב-Bit, Apple Pay, Google Pay, PayBox. הכסף מגיע ישירות לחשבון הבנק שלך.</p>
                <a
                  href="https://grow.business"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl"
                  style={{ background: 'var(--color-gold)', color: '#fff' }}
                >
                  פתח חשבון Grow ↗
                </a>
              </div>

              {/* ── Step 2: API Keys ── */}
              <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <p className="text-sm font-bold mb-1">שלב 2 — חבר את חשבון Grow</p>
                <p className="text-xs text-muted mb-4">בדשבורד Grow: API ← העתק את שלושת הפרטים הבאים</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-muted">API Key</label>
                    <PaymentKeyInput
                      value={form?.grow_api_key ?? ''}
                      onChange={v => setForm(f => ({ ...f, grow_api_key: v }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-muted">User ID</label>
                    <input
                      type="text"
                      className="input w-full font-mono text-sm"
                      placeholder="12345"
                      value={form?.grow_user_id ?? ''}
                      onChange={e => setForm(f => ({ ...f, grow_user_id: e.target.value }))}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-muted">Page Code</label>
                    <input
                      type="text"
                      className="input w-full font-mono text-sm"
                      placeholder="abc123"
                      value={form?.grow_page_code ?? ''}
                      onChange={e => setForm(f => ({ ...f, grow_page_code: e.target.value }))}
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              {/* ── Step 3: Connected → go to Payments ── */}
              <div
                className="rounded-2xl p-4"
                style={{
                  background: settings?.grow_api_key && settings?.grow_user_id && settings?.grow_page_code
                    ? 'var(--color-success-tint)'
                    : 'var(--color-surface)',
                  border: `1px solid ${settings?.grow_api_key && settings?.grow_user_id && settings?.grow_page_code
                    ? 'var(--color-success-ring)'
                    : 'var(--color-border)'}`,
                }}
              >
                {settings?.grow_api_key && settings?.grow_user_id && settings?.grow_page_code ? (
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-base">✅</span>
                        <p className="text-sm font-bold" style={{ color: '#16a34a' }}>Grow מחובר בהצלחה</p>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>שלב 3 — הגדר מצב תשלום, לפי שירות ולפי סניף</p>
                    </div>
                    <a
                      href="/admin/payments"
                      className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl"
                      style={{ background: 'var(--color-gold)', color: '#fff' }}
                    >
                      הגדרות תשלום ←
                    </a>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-bold mb-1">שלב 3 — הגדרות תשלום</p>
                    <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      מלא את פרטי Grow ושמור — לאחר מכן תוכל להגדיר מצב תשלום, לפי שירות ולפי סניף.
                    </p>
                  </div>
                )}
              </div>

            </div>
          )}
        </section>}

        {/* ── רשימת המתנה ── */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">📋</span>
              <h2 className="font-semibold text-lg">רשימת המתנה</h2>
            </div>
            <Toggle
              checked={form.waitlist_enabled ?? false}
              onChange={v => setForm(f => ({ ...f, waitlist_enabled: v }))}
            />
          </div>
          <p className="text-sm mb-0" style={{ color: 'var(--color-muted)' }}>
            לקוחות יכולים להצטרף לרשימת המתנה לשירות מבוקש. כשתור מתבטל — הראשון ברשימה מקבל הודעה.
          </p>
        </section>

        {/* ── Gap Closer ── */}
        <section className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🧩</span>
            <h2 className="font-semibold text-lg">Gap Closer — מילוי חורים</h2>
            <button onClick={() => setShowGapHelp(true)}
              className="w-5 h-5 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-border)', color: 'var(--color-muted)' }}>
              ?
            </button>
          </div>
          <p className="text-sm mb-5" style={{ color: 'var(--color-muted)' }}>
            כשתור מתבטל ונוצר חור ביומן, המערכת מנסה להקדים תור קיים כדי למלא את החור.
          </p>

          <div className="space-y-2 mb-4">
            {[
              { value: 'off',      label: 'כבוי',       desc: 'ללא פעולה — רק התראה רגילה בלוח הבקרה' },
              { value: 'approval', label: 'אישור ידני', desc: 'מציג הצעות ואתה שולח כל הצעה בלחיצה' },
              { value: 'auto',     label: 'אוטומטי',    desc: 'שולח הודעות להקדמת תור אוטומטית ללא אישור' },
            ].map(opt => (
              <label
                key={opt.value}
                className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all"
                style={{
                  background: form.gap_closer_mode === opt.value ? 'var(--color-gold-tint)' : 'transparent',
                  border: `2px solid ${form.gap_closer_mode === opt.value ? 'var(--color-gold)' : 'var(--color-border)'}`,
                }}
              >
                <input
                  type="radio"
                  name="gap_closer_mode"
                  value={opt.value}
                  checked={form.gap_closer_mode === opt.value}
                  onChange={e => setForm(f => ({ ...f, gap_closer_mode: e.target.value }))}
                  className="mt-1"
                />
                <div>
                  <div className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{opt.label}</div>
                  <div className="text-xs" style={{ color: 'var(--color-muted)' }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {form.gap_closer_mode !== 'off' && (
            <div className="mt-2 pt-4 space-y-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <div>
                <label className="block text-sm font-medium mb-1">סף חור מינימלי (דקות)</label>
                <input
                  className="input w-28"
                  type="number"
                  min={10}
                  max={120}
                  step={5}
                  value={form.gap_closer_threshold_minutes ?? 30}
                  onChange={e => setForm(f => ({ ...f, gap_closer_threshold_minutes: parseInt(e.target.value) || 30 }))}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                  חורים קטנים מ-{form.gap_closer_threshold_minutes || 30} דקות לא יפעילו את המערכת
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">כמה שעות לפני החור לשלוח הצעות הזזה ללקוחות?</label>
                <input
                  className="input w-28"
                  type="number"
                  min={0.5}
                  max={12}
                  step={0.5}
                  value={form.gap_closer_advance_hours ?? 2}
                  onChange={e => setForm(f => ({ ...f, gap_closer_advance_hours: parseFloat(e.target.value) || 2 }))}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                  לדוגמה: חור בשעה 17:00 עם ערך 2 — הצעות יישלחו רק מ-15:00. רשימת המתנה מופעלת תמיד — מיידי, בכל ביטול.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">הזזה מקסימלית ללקוח (דק')</label>
                <input
                  className="input w-28"
                  type="number"
                  min={15}
                  max={180}
                  step={15}
                  value={form.gap_closer_max_shift_minutes ?? 90}
                  onChange={e => setForm(f => ({ ...f, gap_closer_max_shift_minutes: parseInt(e.target.value) || 90 }))}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                  המקסימום שמציעים ללקוח להזיז את תורו קדימה או אחורה
                </p>
              </div>
            </div>
          )}

          <Modal open={showGapHelp} onClose={() => setShowGapHelp(false)} title="🧩 Gap Closer — מה זה בדיוק?">
            <GapCloserHelpBody />
          </Modal>
        </section>

        {/* ── ערוץ הודעות אוטומטיות ── */}
        {(form.waitlist_enabled || form.gap_closer_mode !== 'off') && (
          <section className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🔔</span>
              <h2 className="font-semibold text-lg">ערוץ הודעות אוטומטיות</h2>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--color-muted)' }}>
              באיזה ערוץ לשלוח הודעות? חל הן על רשימת המתנה והן על Gap Closer.
            </p>
            <div className="space-y-2">
              {[
                { value: 'push',     label: '🔔 הודעת Push', desc: 'הודעה ישירה לטלפון — לחיצה פותחת חלון אישור באפליקציה' },
                { value: 'whatsapp', label: '💬 WhatsApp',   desc: 'הודעת WhatsApp עם קישור לאישור ודחייה' },
              ].map(opt => (
                <label
                  key={opt.value}
                  className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all"
                  style={{
                    background: (form.gap_closer_notification_channel ?? 'push') === opt.value ? 'var(--color-gold-tint)' : 'transparent',
                    border: `2px solid ${(form.gap_closer_notification_channel ?? 'push') === opt.value ? 'var(--color-gold)' : 'var(--color-border)'}`,
                  }}
                >
                  <input
                    type="radio"
                    name="gap_closer_notification_channel"
                    value={opt.value}
                    checked={(form.gap_closer_notification_channel ?? 'push') === opt.value}
                    onChange={e => setForm(f => ({ ...f, gap_closer_notification_channel: e.target.value }))}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{opt.label}</div>
                    <div className="text-xs" style={{ color: 'var(--color-muted)' }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </section>
        )}

      </form>

      {/* Recurring Breaks — outside form */}
      <section className="card p-6 mt-8">
        <h2 className="font-semibold text-lg mb-1">הפסקות קבועות</h2>
        <p className="text-sm text-muted mb-5">חסום שעות קבועות ביומן (למשל: הפסקת צהריים)</p>

        {/* Existing breaks list */}
        {breaksLoading ? (
          <div className="flex justify-center py-4"><Spinner size="sm" /></div>
        ) : breaks.length === 0 ? (
          <p className="text-sm text-muted mb-4">אין הפסקות קבועות מוגדרות</p>
        ) : (
          <div className="space-y-2 mb-5">
            {breaks.map(b => (
              <div
                key={b.id}
                className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{b.label}</span>
                  <span className="text-muted">
                    {b.day_of_week === null ? 'כל יום' : DAY_NAMES[b.day_of_week]}
                  </span>
                  <span className="text-muted">{b.start_time} — {b.end_time}</span>
                </div>
                <button
                  onClick={async () => {
                    await deleteBreak(b.id)
                    toast({ message: 'הפסקה נמחקה', type: 'success' })
                  }}
                  className="text-red-500 hover:text-red-700 text-sm px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                >
                  מחק
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add break form */}
        <form onSubmit={handleAddBreak} className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-medium">הוסף הפסקה חדשה</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              className="input"
              placeholder="שם ההפסקה (למשל: הפסקת צהריים)"
              value={breakForm.label}
              onChange={e => setBreakForm(f => ({ ...f, label: e.target.value }))}
              required
            />
            <select
              className="input"
              value={breakForm.day_of_week}
              onChange={e => setBreakForm(f => ({ ...f, day_of_week: e.target.value }))}
            >
              <option value="">כל יום</option>
              {DAY_NAMES.map((name, idx) => (
                <option key={idx} value={idx}>{name}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium w-12 flex-shrink-0">מ:</label>
              <input
                type="time"
                className="input flex-1"
                value={breakForm.start_time}
                onChange={e => setBreakForm(f => ({ ...f, start_time: e.target.value }))}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium w-12 flex-shrink-0">עד:</label>
              <input
                type="time"
                className="input flex-1"
                value={breakForm.end_time}
                onChange={e => setBreakForm(f => ({ ...f, end_time: e.target.value }))}
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={addingBreak}
            className="btn-primary text-sm"
          >
            {addingBreak ? 'מוסיף...' : '+ הוסף הפסקה'}
          </button>
        </form>
      </section>
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none"
      style={{ background: checked ? 'var(--color-gold)' : 'var(--color-shadow-md)' }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200"
        style={{ right: checked ? '2px' : 'calc(100% - 22px)' }}
      />
    </button>
  )
}

function PaymentKeyInput({ value, onChange }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className="input w-full font-mono text-sm pr-3 pl-10"
        placeholder="הדבק כאן את המפתח הסודי"
        value={value}
        onChange={e => onChange(e.target.value)}
        dir="ltr"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute left-2 top-1/2 -translate-y-1/2 text-muted hover:text-gray-700 text-base px-1"
        tabIndex={-1}
      >
        {show ? '🙈' : '👁'}
      </button>
    </div>
  )
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-gray-50">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}
