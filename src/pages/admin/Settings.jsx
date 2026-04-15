import { useState, useEffect, useRef } from 'react'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useRecurringBreaks } from '../../hooks/useRecurringBreaks'
import { useToast } from '../../components/ui/Toast'
import { Spinner } from '../../components/ui/Spinner'
import { dayName } from '../../lib/utils'

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

export function Settings() {
  const { settings, hours, loading, saveSettings, saveBusinessHours } = useBusinessSettings()
  const { breaks, loading: breaksLoading, addBreak, deleteBreak } = useRecurringBreaks()
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [hoursForm, setHoursForm] = useState([])
  const [saving, setSaving] = useState(false)

  // Recurring breaks form state
  const [breakForm, setBreakForm] = useState({
    label: '',
    day_of_week: '',
    start_time: '13:00',
    end_time: '14:00',
  })
  const [addingBreak, setAddingBreak] = useState(false)

  useEffect(() => {
    if (settings) setForm({ ...settings })
  }, [settings])

  useEffect(() => {
    if (hours.length) setHoursForm([...hours])
    else setHoursForm(
      Array.from({ length: 7 }, (_, i) => ({
        day_of_week: i,
        open_time: '09:00',
        close_time: '19:00',
        is_closed: i === 6,
      }))
    )
  }, [hours])

  function updateHour(day, field, value) {
    setHoursForm(h => h.map(r => r.day_of_week === day ? { ...r, [field]: value } : r))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await saveSettings(form)
      await saveBusinessHours(hoursForm)
      toast({ message: 'הגדרות נשמרו', type: 'success' })
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

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
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)' }}>הגדרות</h1>

      <form onSubmit={handleSave} className="space-y-8">

        {/* Business Hours */}
        <section className="card p-6">
          <h2 className="font-semibold text-lg mb-4">שעות פעילות</h2>
          <div className="space-y-3">
            {hoursForm.map(h => (
              <div key={h.day_of_week} className="flex items-center gap-3 text-sm">
                <div className="w-16 font-medium">{dayName(h.day_of_week)}</div>
                <input
                  type="checkbox"
                  checked={!h.is_closed}
                  onChange={e => updateHour(h.day_of_week, 'is_closed', !e.target.checked)}
                />
                {!h.is_closed ? (
                  <>
                    <input
                      type="time"
                      className="input w-28 py-1"
                      value={h.open_time || '09:00'}
                      onChange={e => updateHour(h.day_of_week, 'open_time', e.target.value)}
                    />
                    <span className="text-muted">—</span>
                    <input
                      type="time"
                      className="input w-28 py-1"
                      value={h.close_time || '19:00'}
                      onChange={e => updateHour(h.day_of_week, 'close_time', e.target.value)}
                    />
                  </>
                ) : (
                  <span className="text-muted">סגור</span>
                )}
              </div>
            ))}
          </div>
        </section>

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
                      background: form.cancellation_fee_type === opt.value ? 'rgba(201,169,110,0.1)' : 'transparent',
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
              style={{ background: 'rgba(201,169,110,0.07)', border: '1px solid rgba(201,169,110,0.2)' }}>
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
                  style={{ background: form.reminder_enabled ? 'var(--color-gold)' : 'rgba(0,0,0,0.12)' }}>
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
                        background: form.reminder_channel === ch.key ? 'rgba(201,169,110,0.1)' : 'transparent',
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
                      style={{ background: form.reminder_2_enabled ? 'var(--color-gold)' : 'rgba(0,0,0,0.12)' }}>
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
                      style={{ background: form.reminder_3_enabled ? 'var(--color-gold)' : 'rgba(0,0,0,0.12)' }}>
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
        <section className="card p-6">
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
              <div className="rounded-2xl p-4" style={{ background: 'rgba(201,169,110,0.07)', border: '1px solid rgba(201,169,110,0.25)' }}>
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
                    ? 'rgba(22,163,74,0.06)'
                    : 'var(--color-surface)',
                  border: `1px solid ${settings?.grow_api_key && settings?.grow_user_id && settings?.grow_page_code
                    ? 'rgba(22,163,74,0.25)'
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
        </section>

        <button type="submit" disabled={saving} className="btn-primary text-base px-8 py-3">
          {saving ? 'שומר...' : 'שמור הגדרות'}
        </button>
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
      style={{ background: checked ? 'var(--color-gold)' : 'rgba(0,0,0,0.15)' }}
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
