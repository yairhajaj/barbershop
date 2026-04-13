import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  addDays, startOfWeek, endOfWeek, startOfDay, endOfDay,
  isSameDay, format,
} from 'date-fns'
import { he } from 'date-fns/locale'
import {
  DndContext, useDraggable, useDroppable,
  PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { useAllAppointments } from '../../hooks/useAppointments'
import { useStaff } from '../../hooks/useStaff'
import { useServices } from '../../hooks/useServices'
import { StatusBadge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { findGapOpportunities, formatTime, formatDate } from '../../lib/utils'
import { supabase } from '../../lib/supabase'

// ─── Constants ────────────────────────────────────────────────────────────────
const VIEWS = ['day', 'week', 'list']
const VIEW_LABELS = { day: 'יומי', week: 'שבועי', list: 'רשימה' }

const START_HOUR = 7
const END_HOUR = 20
const SLOT_HEIGHT = 52 // px per slot unit

const COLOR_PRESETS = [
  '#C9A96E', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#ec4899', '#64748b',
]
const DEFAULT_COLOR = '#C9A96E'

const EMPTY_EVENT = {
  title: '',
  staff_id: '',
  date: '',
  start_time: '',
  end_time: '',
}

// ─── localStorage helpers ──────────────────────────────────────────────────────
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* noop */ }
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function Appointments() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState('week')
  const [filterStaff, setFilterStaff] = useState('')
  const [selectedAppt, setSelectedAppt] = useState(null)
  const [gapAppts, setGapAppts] = useState([])
  const [addEventOpen, setAddEventOpen] = useState(false)
  const [eventForm, setEventForm] = useState(EMPTY_EVENT)
  const [savingEvent, setSavingEvent] = useState(false)

  // Calendar settings (localStorage)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [slotMinutes, setSlotMinutesState] = useState(() => lsGet('cal_slot_minutes', 30))
  const [calColumns, setCalColumnsState] = useState(() => lsGet('cal_columns', 3))
  const [serviceColors, setServiceColorsState] = useState(() => lsGet('cal_service_colors', {}))

  // Pending move confirmation
  const [pendingMove, setPendingMove] = useState(null)
  const [movingSave, setMovingSave] = useState(false)

  const toast = useToast()
  const { staff } = useStaff({ activeOnly: true })
  const { services } = useServices({ activeOnly: false })

  // ── Setters that also persist ────────────────────────────────────────────────
  const setSlotMinutes = useCallback(v => {
    setSlotMinutesState(v); lsSet('cal_slot_minutes', v)
  }, [])
  const setCalColumns = useCallback(v => {
    setCalColumnsState(v); lsSet('cal_columns', v)
  }, [])
  const setServiceColor = useCallback((serviceId, color) => {
    setServiceColorsState(prev => {
      const next = { ...prev, [serviceId]: color }
      lsSet('cal_service_colors', next)
      return next
    })
  }, [])

  // ── Date range ────────────────────────────────────────────────────────────────
  const startDate = view === 'day'
    ? startOfDay(currentDate)
    : startOfWeek(currentDate, { weekStartsOn: 0 })
  const endDate = view === 'day'
    ? endOfDay(currentDate)
    : endOfWeek(currentDate, { weekStartsOn: 0 })

  const { appointments, loading, refetch } = useAllAppointments({
    startDate,
    endDate,
    staffId: filterStaff || undefined,
  })

  function navigate(dir) {
    const delta = dir * (view === 'day' ? 1 : 7)
    setCurrentDate(d => addDays(d, delta))
  }

  // ── Staff columns for day view ─────────────────────────────────────────────
  const staffColumns = useMemo(() => {
    if (filterStaff) return staff.filter(s => s.id === filterStaff)
    return staff.slice(0, calColumns)
  }, [staff, filterStaff, calColumns])

  // ── Appointment actions ────────────────────────────────────────────────────
  async function handleCancel(id) {
    if (!confirm('לבטל תור זה?')) return
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', cancelled_by: 'admin' })
      .eq('id', id)
    if (error) { toast({ message: 'שגיאה', type: 'error' }); return }

    const remaining = appointments.filter(a => a.id !== id)
    const opps = findGapOpportunities(remaining, id)
    if (opps.length > 0) setGapAppts(opps)

    await refetch()
    setSelectedAppt(null)
    toast({ message: 'תור בוטל', type: 'success' })
  }

  async function handleComplete(id) {
    await supabase.from('appointments').update({ status: 'completed' }).eq('id', id)
    await refetch()
    setSelectedAppt(null)
    toast({ message: 'תור סומן כהושלם ✓', type: 'success' })
  }

  async function handleSaveEvent(e) {
    e.preventDefault()
    if (!eventForm.title || !eventForm.staff_id || !eventForm.date || !eventForm.start_time || !eventForm.end_time) {
      toast({ message: 'יש למלא את כל השדות', type: 'error' })
      return
    }
    setSavingEvent(true)
    try {
      const start_at = new Date(`${eventForm.date}T${eventForm.start_time}`).toISOString()
      const end_at = new Date(`${eventForm.date}T${eventForm.end_time}`).toISOString()
      const { error } = await supabase.from('blocked_times').insert({
        staff_id: eventForm.staff_id,
        start_at,
        end_at,
        reason: eventForm.title,
      })
      if (error) throw error
      toast({ message: 'אירוע נוסף ליומן', type: 'success' })
      setEventForm(EMPTY_EVENT)
      setAddEventOpen(false)
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setSavingEvent(false)
    }
  }

  // ── Move request (from DayView drag-end) ────────────────────────────────────
  function handleMoveRequest(appt, newStart, newEnd, newStaffId) {
    setPendingMove({ appt, newStart, newEnd, newStaffId })
  }

  async function confirmMove() {
    if (!pendingMove) return
    setMovingSave(true)
    try {
      const { appt, newStart, newEnd, newStaffId } = pendingMove
      const { error } = await supabase
        .from('appointments')
        .update({
          start_at: newStart.toISOString(),
          end_at: newEnd.toISOString(),
          staff_id: newStaffId,
        })
        .eq('id', appt.id)
      if (error) throw error
      await refetch()
      toast({ message: 'תור הועבר בהצלחה ✓', type: 'success' })
      setPendingMove(null)
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setMovingSave(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const weekDays = useMemo(() => (
    Array.from({ length: 7 }, (_, i) =>
      addDays(startOfWeek(currentDate, { weekStartsOn: 0 }), i)
    )
  ), [currentDate])

  const pendingMoveStaff = pendingMove
    ? staff.find(s => s.id === pendingMove.newStaffId)
    : null

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>יומן תורים</h1>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setAddEventOpen(true)} className="btn-primary text-sm">
            + הוסף אירוע אישי
          </button>

          <button
            onClick={() => setSettingsOpen(o => !o)}
            className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              settingsOpen
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            ⚙ הגדרות יומן
          </button>

          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {VIEWS.map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === v
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <select
            className="input w-auto py-1.5 text-sm"
            value={filterStaff}
            onChange={e => setFilterStaff(e.target.value)}
          >
            <option value="">כל הספרים</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* ── Calendar Settings Panel ── */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            key="cal-settings"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-5 mb-4 border border-gray-100 space-y-5">
              <h2 className="font-semibold text-gray-800">הגדרות יומן</h2>

              {/* Slot size */}
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium text-gray-700 w-32">גודל סלוט</span>
                <div className="flex gap-2">
                  {[15, 30, 60].map(m => (
                    <button
                      key={m}
                      onClick={() => setSlotMinutes(m)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors border ${
                        slotMinutes === m
                          ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {m} דק׳
                    </button>
                  ))}
                </div>
              </div>

              {/* Columns */}
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium text-gray-700 w-32">עמודות יומי</span>
                <div className="flex gap-2">
                  {Array.from({ length: Math.min(staff.length || 5, 6) }, (_, i) => i + 1).map(n => (
                    <button
                      key={n}
                      onClick={() => setCalColumns(n)}
                      className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors border ${
                        calColumns === n
                          ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Service colors */}
              {services.length > 0 && (
                <div className="space-y-3">
                  <span className="text-sm font-medium text-gray-700">צבע שירות</span>
                  <div className="space-y-2">
                    {services.map(svc => {
                      const currentColor = serviceColors[svc.id] || DEFAULT_COLOR
                      return (
                        <div key={svc.id} className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm text-gray-600 w-36 truncate">{svc.name}</span>
                          <div className="flex gap-1.5 flex-wrap">
                            {COLOR_PRESETS.map(color => (
                              <button
                                key={color}
                                onClick={() => setServiceColor(svc.id, color)}
                                title={color}
                                className="w-6 h-6 rounded-full transition-transform hover:scale-110 border-2"
                                style={{
                                  backgroundColor: color,
                                  borderColor: currentColor === color ? '#fff' : 'transparent',
                                  outline: currentColor === color ? `2px solid ${color}` : 'none',
                                }}
                              />
                            ))}
                          </div>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                            style={{ backgroundColor: currentColor }}
                          >
                            {svc.name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Navigation ── */}
      <div className="flex items-center gap-4 mb-4">
        <button onClick={() => navigate(-1)} className="btn-ghost px-3 py-1.5">← הקודם</button>
        <button onClick={() => setCurrentDate(new Date())} className="text-sm font-medium text-[var(--color-gold)]">היום</button>
        <button onClick={() => navigate(1)} className="btn-ghost px-3 py-1.5">הבא →</button>
        <span className="text-sm font-medium text-gray-600">
          {view === 'day'
            ? format(currentDate, 'EEEE, d בMMMM', { locale: he })
            : `${format(startDate, 'd MMM', { locale: he })} — ${format(endDate, 'd MMM yyyy', { locale: he })}`
          }
        </span>
      </div>

      {/* ── Gap Closer Alert ── */}
      {gapAppts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-amber-800">⚡ Gap Closer — נמצאו תורים בודדים ביומן</p>
              <p className="text-sm text-amber-700">
                {gapAppts.length} לקוחות יכולים למלא חורים — שלח להם הצעת העברה
              </p>
            </div>
            <button
              onClick={() => setGapAppts([])}
              className="text-amber-600 hover:text-amber-800 text-sm font-medium"
            >
              סגור
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {gapAppts.map(({ appointment }) => (
              <div key={appointment.id} className="flex items-center justify-between bg-white rounded-lg p-2 text-sm">
                <span>{appointment.profiles?.name} — {formatTime(appointment.start_at)}</span>
                <button
                  onClick={async () => {
                    await supabase.from('reschedule_offers').insert({
                      appointment_id: appointment.id,
                      offered_start_at: appointment.start_at,
                      offered_end_at: appointment.end_at,
                    })
                    toast({ message: 'הצעת העברה נשלחה ללקוח', type: 'success' })
                    setGapAppts(g => g.filter(x => x.appointment.id !== appointment.id))
                  }}
                  className="text-xs px-3 py-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                >
                  שלח הצעה
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Calendar Content ── */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : view === 'list' ? (
        <ListViewAppointments appointments={appointments} onSelect={setSelectedAppt} />
      ) : view === 'day' ? (
        <DayView
          date={currentDate}
          appointments={appointments.filter(a => isSameDay(new Date(a.start_at), currentDate))}
          staffColumns={staffColumns}
          slotMinutes={slotMinutes}
          serviceColors={serviceColors}
          onSelect={setSelectedAppt}
          onMoveRequest={handleMoveRequest}
        />
      ) : (
        <WeekView
          days={weekDays}
          appointments={appointments}
          serviceColors={serviceColors}
          onSelect={setSelectedAppt}
        />
      )}

      {/* ── Appointment detail modal ── */}
      <Modal open={!!selectedAppt} onClose={() => setSelectedAppt(null)} title="פרטי תור">
        {selectedAppt && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'לקוח', value: selectedAppt.profiles?.name },
                { label: 'טלפון', value: selectedAppt.profiles?.phone },
                { label: 'שירות', value: selectedAppt.services?.name },
                { label: 'ספר', value: selectedAppt.staff?.name },
                { label: 'תאריך', value: formatDate(selectedAppt.start_at) },
                { label: 'שעה', value: `${formatTime(selectedAppt.start_at)} — ${formatTime(selectedAppt.end_at)}` },
                { label: 'מחיר', value: selectedAppt.services?.price ? `₪${selectedAppt.services.price}` : '-' },
                { label: 'סטטוס', value: <StatusBadge status={selectedAppt.status} /> },
              ].map(row => (
                <div key={row.label}>
                  <span className="text-muted">{row.label}: </span>
                  <span className="font-medium">{row.value}</span>
                </div>
              ))}
            </div>
            {selectedAppt.notes && (
              <p className="text-sm bg-gray-50 rounded-lg p-3">
                <span className="text-muted">הערות: </span>{selectedAppt.notes}
              </p>
            )}

            {/* WhatsApp */}
            {selectedAppt.profiles?.phone && (() => {
              const rawPhone = selectedAppt.profiles.phone.replace(/\D/g, '')
              const waPhone = rawPhone.startsWith('0') ? '972' + rawPhone.slice(1) : rawPhone
              const apptDate = formatDate(selectedAppt.start_at)
              const apptTime = formatTime(selectedAppt.start_at)
              const svcName = selectedAppt.services?.name ?? ''
              const msg = encodeURIComponent(
                `שלום ${selectedAppt.profiles?.name ?? ''}, רצינו להזכיר לך את התור שלך ל${svcName} בתאריך ${apptDate} בשעה ${apptTime}. נתראה! 💈`
              )
              return (
                <a
                  href={`https://wa.me/${waPhone}?text=${msg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-colors"
                  style={{ background: '#25D366', color: '#fff' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp ללקוח
                </a>
              )
            })()}

            {selectedAppt.status === 'confirmed' && (
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => handleComplete(selectedAppt.id)}
                  className="btn-primary flex-1 justify-center text-sm py-2"
                >
                  ✓ סמן הושלם
                </button>
                <button
                  onClick={() => handleCancel(selectedAppt.id)}
                  className="flex-1 py-2 px-4 bg-red-50 text-red-600 rounded-lg font-medium text-sm hover:bg-red-100 transition-colors"
                >
                  ✕ בטל
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Add Personal Event Modal ── */}
      <Modal
        open={addEventOpen}
        onClose={() => { setAddEventOpen(false); setEventForm(EMPTY_EVENT) }}
        title="הוסף אירוע אישי"
      >
        <form onSubmit={handleSaveEvent} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">כותרת / תיאור *</label>
            <input
              className="input"
              placeholder="למשל: פגישה, חופשה, תורנות..."
              value={eventForm.title}
              onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">ספר *</label>
            <select
              className="input"
              value={eventForm.staff_id}
              onChange={e => setEventForm(f => ({ ...f, staff_id: e.target.value }))}
              required
            >
              <option value="">בחר ספר...</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">תאריך *</label>
            <input
              type="date"
              className="input"
              value={eventForm.date}
              onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">שעת התחלה *</label>
              <input
                type="time"
                className="input"
                value={eventForm.start_time}
                onChange={e => setEventForm(f => ({ ...f, start_time: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">שעת סיום *</label>
              <input
                type="time"
                className="input"
                value={eventForm.end_time}
                onChange={e => setEventForm(f => ({ ...f, end_time: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={savingEvent} className="btn-primary flex-1 justify-center">
              {savingEvent ? 'שומר...' : 'שמור אירוע'}
            </button>
            <button
              type="button"
              onClick={() => { setAddEventOpen(false); setEventForm(EMPTY_EVENT) }}
              className="btn-outline flex-1 justify-center"
            >
              ביטול
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Move Confirmation Modal ── */}
      <Modal
        open={!!pendingMove}
        onClose={() => setPendingMove(null)}
        title="אישור העברת תור"
      >
        {pendingMove && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              האם להעביר את התור הבא?
            </p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              <div>
                <span className="text-muted">לקוח: </span>
                <span className="font-semibold">{pendingMove.appt.profiles?.name}</span>
              </div>
              <div>
                <span className="text-muted">שירות: </span>
                <span className="font-medium">{pendingMove.appt.services?.name}</span>
              </div>
              <div>
                <span className="text-muted">שעה חדשה: </span>
                <span className="font-medium">
                  {format(pendingMove.newStart, 'HH:mm')} — {format(pendingMove.newEnd, 'HH:mm')}
                </span>
              </div>
              {pendingMoveStaff && pendingMove.appt.staff_id !== pendingMove.newStaffId && (
                <div>
                  <span className="text-muted">ספר חדש: </span>
                  <span className="font-medium text-[var(--color-gold)]">{pendingMoveStaff.name}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={confirmMove}
                disabled={movingSave}
                className="btn-primary flex-1 justify-center"
              >
                {movingSave ? 'מעביר...' : '✓ כן, הזז תור'}
              </button>
              <button
                onClick={() => setPendingMove(null)}
                className="btn-outline flex-1 justify-center"
              >
                ביטול
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── List View ─────────────────────────────────────────────────────────────────
function ListViewAppointments({ appointments, onSelect }) {
  const sorted = [...appointments].sort((a, b) => new Date(a.start_at) - new Date(b.start_at))

  if (sorted.length === 0) {
    return (
      <div className="card p-12 text-center text-muted">
        <div className="text-4xl mb-3">📭</div>
        <p>אין תורים בטווח זה</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {sorted.map(appt => (
        <motion.button
          key={appt.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => onSelect(appt)}
          className="card p-4 text-right hover:ring-2 hover:ring-[var(--color-gold)] transition-all w-full"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-xs text-muted">{format(new Date(appt.start_at), 'EEE', { locale: he })}</div>
                <div className="font-bold">{formatTime(appt.start_at)}</div>
                <div className="text-xs text-muted">{formatDate(appt.start_at)}</div>
              </div>
              <div>
                <p className="font-semibold">{appt.profiles?.name}</p>
                <p className="text-sm text-muted">{appt.services?.name} · {appt.staff?.name}</p>
              </div>
            </div>
            <StatusBadge status={appt.status} />
          </div>
        </motion.button>
      ))}
    </div>
  )
}

// ─── Week View ─────────────────────────────────────────────────────────────────
function WeekView({ days, appointments, serviceColors, onSelect }) {
  const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 08:00–19:00

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        <div />
        {days.map(day => (
          <div
            key={day.toISOString()}
            className={`p-2 text-center text-xs font-semibold border-r border-gray-100 last:border-0 ${
              isSameDay(day, new Date())
                ? 'bg-[var(--color-gold)]/10 text-[var(--color-gold)]'
                : 'text-muted'
            }`}
          >
            <div>{format(day, 'EEE', { locale: he })}</div>
            <div className={`text-lg font-bold mt-0.5 ${isSameDay(day, new Date()) ? 'text-[var(--color-gold)]' : 'text-gray-800'}`}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="overflow-auto max-h-[600px]">
        {HOURS.map(hour => (
          <div
            key={hour}
            className="grid border-b border-gray-50"
            style={{ gridTemplateColumns: '48px repeat(7, 1fr)', minHeight: '60px' }}
          >
            <div className="text-xs text-muted p-1 text-center pt-2">{hour}:00</div>
            {days.map(day => {
              const dayAppts = appointments.filter(a => {
                const start = new Date(a.start_at)
                return isSameDay(start, day) && start.getHours() === hour && a.status !== 'cancelled'
              })
              return (
                <div key={day.toISOString()} className="border-r border-gray-50 last:border-0 p-0.5 relative">
                  {dayAppts.map(appt => {
                    const color = serviceColors[appt.service_id] || DEFAULT_COLOR
                    return (
                      <button
                        key={appt.id}
                        onClick={() => onSelect(appt)}
                        className="w-full text-right px-2 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-80 mb-0.5"
                        style={{ background: color, color: '#fff' }}
                      >
                        <div className="truncate">{appt.profiles?.name}</div>
                        <div className="opacity-80 truncate">{appt.services?.name}</div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Day View (with DnD) ───────────────────────────────────────────────────────
function DayView({ date, appointments, staffColumns, slotMinutes, serviceColors, onSelect, onMoveRequest }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  const totalMinutes = (END_HOUR - START_HOUR) * 60
  const slotsCount = totalMinutes / slotMinutes
  const TOTAL_HEIGHT = slotsCount * SLOT_HEIGHT

  // All time slots — for row labels
  const timeSlots = useMemo(() => {
    const slots = []
    for (let m = 0; m < totalMinutes; m += slotMinutes) {
      slots.push(m)
    }
    return slots
  }, [totalMinutes, slotMinutes])

  // Only active appointments for this day
  const dayAppts = appointments.filter(a => a.status !== 'cancelled')

  function handleDragEnd({ active, over }) {
    if (!over) return
    const parts = over.id.split('__')
    if (parts.length < 2) return
    const newStaffId = parts[0]
    const minuteOffset = Number(parts[1])
    const appt = dayAppts.find(a => a.id === active.id)
    if (!appt) return

    const duration = (new Date(appt.end_at) - new Date(appt.start_at)) / 60000
    const newStart = new Date(date)
    newStart.setHours(START_HOUR + Math.floor(minuteOffset / 60), minuteOffset % 60, 0, 0)
    const newEnd = new Date(newStart.getTime() + duration * 60000)
    onMoveRequest(appt, newStart, newEnd, newStaffId)
  }

  if (staffColumns.length === 0) {
    return (
      <div className="card p-12 text-center text-muted">
        <div className="text-3xl mb-2">👤</div>
        <p>לא נמצאו ספרים פעילים</p>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="card overflow-hidden">
        {/* Header */}
        <div
          className="grid border-b border-gray-100 sticky top-0 bg-white z-10"
          style={{ gridTemplateColumns: `52px repeat(${staffColumns.length}, 1fr)` }}
        >
          <div />
          {staffColumns.map(s => (
            <div
              key={s.id}
              className="p-3 text-center text-sm font-semibold text-gray-700 border-r border-gray-100 last:border-0"
            >
              {s.name}
            </div>
          ))}
        </div>

        {/* Scrollable grid */}
        <div className="overflow-auto max-h-[680px]">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `52px repeat(${staffColumns.length}, 1fr)`,
              height: TOTAL_HEIGHT,
              position: 'relative',
            }}
          >
            {/* Time axis */}
            <div className="relative border-r border-gray-100" style={{ height: TOTAL_HEIGHT }}>
              {timeSlots.map(minuteOff => {
                const isHour = minuteOff % 60 === 0
                const top = (minuteOff / slotMinutes) * SLOT_HEIGHT
                const hour = START_HOUR + Math.floor(minuteOff / 60)
                return (
                  <div
                    key={minuteOff}
                    className="absolute w-full flex items-start justify-center"
                    style={{ top, height: SLOT_HEIGHT }}
                  >
                    {isHour && (
                      <span className="text-xs text-gray-400 font-medium mt-0.5 select-none">
                        {String(hour).padStart(2, '0')}:00
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Staff columns */}
            {staffColumns.map(s => {
              const staffAppts = dayAppts.filter(a => a.staff_id === s.id)

              return (
                <div
                  key={s.id}
                  className="relative border-r border-gray-100 last:border-0"
                  style={{ height: TOTAL_HEIGHT }}
                >
                  {/* Droppable slots */}
                  {timeSlots.map(minuteOff => {
                    const isHour = minuteOff % 60 === 0
                    const top = (minuteOff / slotMinutes) * SLOT_HEIGHT
                    return (
                      <DroppableSlot
                        key={minuteOff}
                        id={`${s.id}__${minuteOff}`}
                        top={top}
                        height={SLOT_HEIGHT}
                        isHour={isHour}
                      />
                    )
                  })}

                  {/* Appointment blocks */}
                  {staffAppts.map(appt => {
                    const startDt = new Date(appt.start_at)
                    const startHour = startDt.getHours()
                    const startMin = startDt.getMinutes()
                    const totalStartMin = (startHour - START_HOUR) * 60 + startMin
                    const durationMin = (new Date(appt.end_at) - startDt) / 60000

                    const top = (totalStartMin / slotMinutes) * SLOT_HEIGHT
                    const height = Math.max((durationMin / slotMinutes) * SLOT_HEIGHT, 26)
                    const color = serviceColors[appt.service_id] || DEFAULT_COLOR
                    const isTall = height >= 44

                    return (
                      <DraggableAppt
                        key={appt.id}
                        appt={appt}
                        top={top}
                        height={height}
                        color={color}
                        isTall={isTall}
                        onSelect={onSelect}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </DndContext>
  )
}

// ─── DroppableSlot ─────────────────────────────────────────────────────────────
function DroppableSlot({ id, top, height, isHour }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className="absolute inset-x-0 transition-colors"
      style={{
        top,
        height,
        borderTop: isHour ? '1px solid #e5e7eb' : '1px solid #f3f4f6',
        backgroundColor: isOver ? 'rgba(201,169,110,0.12)' : 'transparent',
      }}
    />
  )
}

// ─── DraggableAppt ─────────────────────────────────────────────────────────────
function DraggableAppt({ appt, top, height, color, isTall, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: appt.id })

  const style = {
    position: 'absolute',
    top,
    height,
    left: 3,
    right: 3,
    backgroundColor: color,
    opacity: isDragging ? 0.55 : 1,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    zIndex: isDragging ? 50 : 2,
    borderRadius: 8,
    cursor: isDragging ? 'grabbing' : 'grab',
    overflow: 'hidden',
    userSelect: 'none',
    boxShadow: isDragging
      ? '0 8px 24px rgba(0,0,0,0.18)'
      : '0 1px 3px rgba(0,0,0,0.12)',
    transition: isDragging ? 'none' : 'box-shadow 0.15s',
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {/* Click target (separate from drag) */}
      <button
        onClick={e => { e.stopPropagation(); onSelect(appt) }}
        onPointerDown={e => e.stopPropagation()}
        className="absolute inset-0 w-full h-full text-right px-2 py-1"
        tabIndex={-1}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <div className="text-white text-xs font-semibold truncate leading-tight">
          {appt.profiles?.name}
        </div>
        {isTall && (
          <>
            <div className="text-white/80 text-xs truncate leading-tight">{appt.services?.name}</div>
            <div className="text-white/70 text-xs leading-tight">{formatTime(appt.start_at)}</div>
          </>
        )}
      </button>
    </div>
  )
}
