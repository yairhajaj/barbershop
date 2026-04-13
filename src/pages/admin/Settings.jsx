import { useState, useEffect } from 'react'
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

        {/* Calendar Settings */}
        <section className="card p-6">
          <h2 className="font-semibold text-lg mb-4">הגדרות יומן</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">תצוגת ברירת מחדל</label>
              <select
                className="input"
                value={form.calendar_default_view}
                onChange={e => setForm(f => ({ ...f, calendar_default_view: e.target.value }))}
              >
                <option value="day">יומי</option>
                <option value="week">שבועי</option>
                <option value="list">רשימה</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">עמודות ספרים ביומן</label>
              <input
                className="input"
                type="number"
                min="1"
                max="10"
                value={form.calendar_columns}
                onChange={e => setForm(f => ({ ...f, calendar_columns: Number(e.target.value) }))}
              />
              <p className="text-xs text-muted mt-1">מספר ספרים בתצוגה היומית</p>
            </div>
          </div>
        </section>

        {/* Invoice */}
        <section className="card p-6">
          <h2 className="font-semibold text-lg mb-4">חשבוניות</h2>
          <div>
            <label className="block text-sm font-medium mb-1">טקסט תחתית חשבונית</label>
            <textarea
              className="input resize-none h-20"
              placeholder="תנאים, מספר עסק, הודעות..."
              value={form.invoice_footer_text || ''}
              onChange={e => setForm(f => ({ ...f, invoice_footer_text: e.target.value }))}
            />
          </div>
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
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
        checked ? 'bg-[var(--color-gold)]' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 mt-0.5 ${
          checked ? 'translate-x-0.5' : 'translate-x-5'
        }`}
      />
    </button>
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
