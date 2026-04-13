import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  addDays, startOfWeek, endOfWeek, startOfDay, endOfDay,
  isSameDay, format, isToday,
} from 'date-fns'
import { he } from 'date-fns/locale'
import {
  DndContext, useDraggable, useDroppable,
  PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { useAllAppointments } from '../../hooks/useAppointments'
import { useStaff } from '../../hooks/useStaff'
import { useServices } from '../../hooks/useServices'
import { useRecurringBreaks } from '../../hooks/useRecurringBreaks'
import { StatusBadge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { findGapOpportunities, formatTime, formatDate } from '../../lib/utils'
import { supabase } from '../../lib/supabase'

// ─── Constants ────────────────────────────────────────────────────────────────
const VIEWS = ['day', 'week', 'list']
const VIEW_LABELS = { day: 'יומי', week: 'שבועי', list: 'רשימה' }
const VIEW_ICONS  = { day: '📅', week: '📆', list: '☰' }

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
  const [slotMinutes, setSlotMinutesState] = useState(() => lsGet('cal_slot_minutes', 15))
  const [calColumns, setCalColumnsState] = useState(() => lsGet('cal_columns', 3))
  const [serviceColors, setServiceColorsState] = useState(() => lsGet('cal_service_colors', {}))

  // Pending move confirmation
  const [pendingMove, setPendingMove] = useState(null)
  const [movingSave, setMovingSave] = useState(false)

  // Book for customer modal
  const [bookOpen, setBookOpen] = useState(false)
  const [bookForm, setBookForm] = useState({ customerSearch: '', customerId: null, customerName: '', customerPhone: '', serviceId: '', staffId: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '', notes: '' })
  const [customerResults, setCustomerResults] = useState([])
  const [savingBook, setSavingBook] = useState(false)

  // WhatsApp prompt after move
  const [whatsappAfterMove, setWhatsappAfterMove] = useState(null)

  // Blocked times for current range
  const [allBlockedTimes, setAllBlockedTimes] = useState([])

  const toast = useToast()
  const { breaks: recurringBreaks } = useRecurringBreaks()
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

  const { appointments, loading, refetch, markNoShow } = useAllAppointments({
    startDate,
    endDate,
    staffId: filterStaff || undefined,
  })

  // Load blocked times for the visible date range
  useEffect(() => {
    supabase
      .from('blocked_times')
      .select('*')
      .gte('end_at', startDate.toISOString())
      .lte('start_at', endDate.toISOString())
      .then(({ data }) => setAllBlockedTimes(data ?? []))
  }, [startDate.toISOString(), endDate.toISOString()])

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

  async function handleNoShow(id) {
    if (!confirm('לסמן לקוח כלא הגיע?')) return
    try {
      await markNoShow(id)
      setSelectedAppt(null)
      toast({ message: 'סומן: לא הגיע', type: 'success' })
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    }
  }

  // Customer search for book modal
  async function searchCustomers(q) {
    if (!q || q.length < 2) { setCustomerResults([]); return }
    const { data } = await supabase
      .from('profiles')
      .select('id, name, phone')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8)
    setCustomerResults(data ?? [])
  }

  // Book appointment for customer
  async function handleBookForCustomer(e) {
    e.preventDefault()
    if (!bookForm.customerId) { toast({ message: 'יש לבחור לקוח', type: 'error' }); return }
    if (!bookForm.serviceId)  { toast({ message: 'יש לבחור שירות', type: 'error' }); return }
    if (!bookForm.staffId)    { toast({ message: 'יש לבחור ספר', type: 'error' }); return }
    if (!bookForm.date || !bookForm.startTime) { toast({ message: 'יש לבחור תאריך ושעה', type: 'error' }); return }

    const svc = services.find(s => s.id === bookForm.serviceId)
    const durationMin = svc?.duration_minutes ?? 30
    const start_at = new Date(`${bookForm.date}T${bookForm.startTime}`).toISOString()
    const end_at   = new Date(new Date(start_at).getTime() + durationMin * 60000).toISOString()

    setSavingBook(true)
    try {
      const { error } = await supabase.from('appointments').insert({
        customer_id: bookForm.customerId,
        service_id:  bookForm.serviceId,
        staff_id:    bookForm.staffId,
        start_at,
        end_at,
        status: 'confirmed',
        notes: bookForm.notes || null,
      })
      if (error) throw error
      await refetch()
      toast({ message: 'תור נקבע בהצלחה ✓', type: 'success' })
      setBookOpen(false)
      setBookForm({ customerSearch: '', customerId: null, customerName: '', customerPhone: '', serviceId: '', staffId: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '', notes: '' })
      setCustomerResults([])
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setSavingBook(false)
    }
  }

  // Open book modal pre-filled from a slot click in DayView
  function handleSlotClick(staffId, minuteOffset, date) {
    const h = START_HOUR + Math.floor(minuteOffset / 60)
    const m = minuteOffset % 60
    const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
    const dateStr = format(date, 'yyyy-MM-dd')
    setBookForm(f => ({ ...f, staffId, date: dateStr, startTime: timeStr }))
    setBookOpen(true)
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
      // Prompt WhatsApp notification if customer has phone
      if (appt.profiles?.phone) {
        setWhatsappAfterMove({
          phone: appt.profiles.phone,
          name: appt.profiles.name,
          newStart,
        })
      }
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>יומן תורים</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Book for customer — primary action */}
          <button
            onClick={() => setBookOpen(true)}
            className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>
            </svg>
            קבע תור ללקוח
          </button>

          <button
            onClick={() => setAddEventOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            🔒 אירוע אישי
          </button>

          <button
            onClick={() => setSettingsOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm rounded-lg border font-medium transition-colors ${
              settingsOpen
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            ⚙ הגדרות
          </button>

          {/* View switcher — bigger */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {VIEWS.map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  view === v
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {VIEW_ICONS[v]} {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <select
            className="input w-auto py-2.5 text-sm font-medium"
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
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors shadow-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          הקודם
        </button>
        <button
          onClick={() => setCurrentDate(new Date())}
          className="px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
          style={{ background: 'var(--color-gold)', color: '#fff' }}
        >
          היום
        </button>
        <button
          onClick={() => navigate(1)}
          className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors shadow-sm"
        >
          הבא
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <span className="text-base font-bold text-gray-700">
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
          onSlotClick={handleSlotClick}
          recurringBreaks={recurringBreaks}
          blockedTimes={allBlockedTimes.filter(bt => isSameDay(new Date(bt.start_at), currentDate))}
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

            {/* Quick actions: phone + WhatsApp */}
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
                <div className="flex gap-2">
                  <a
                    href={`tel:${selectedAppt.profiles.phone}`}
                    className="flex items-center justify-center gap-2 flex-1 py-2.5 px-3 rounded-xl font-semibold text-sm transition-colors"
                    style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                    </svg>
                    התקשר
                  </a>
                  <a
                    href={`https://wa.me/${waPhone}?text=${msg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 flex-1 py-2.5 px-3 rounded-xl font-semibold text-sm transition-colors"
                    style={{ background: '#25D366', color: '#fff' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                  </a>
                </div>
              )
            })()}

            {selectedAppt.status === 'confirmed' && (
              <div className="flex gap-2 pt-2 flex-wrap">
                <button
                  onClick={() => handleComplete(selectedAppt.id)}
                  className="btn-primary flex-1 justify-center text-sm py-2"
                >
                  ✓ הושלם
                </button>
                <button
                  onClick={() => handleNoShow(selectedAppt.id)}
                  className="flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-colors"
                  style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-muted)' }}
                >
                  👻 לא הגיע
                </button>
                <button
                  onClick={() => handleCancel(selectedAppt.id)}
                  className="flex-1 py-2 px-3 bg-red-50 text-red-600 rounded-lg font-medium text-sm hover:bg-red-100 transition-colors"
                >
                  ✕ בטל
                </button>
              </div>
            )}
            {selectedAppt.no_show && (
              <div className="text-center text-sm py-1 rounded-lg" style={{ background: '#fff3cd', color: '#856404' }}>
                ⚠️ לקוח זה סומן כ&quot;לא הגיע&quot;
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

      {/* ── Book for Customer Modal ── */}
      <Modal open={bookOpen} onClose={() => { setBookOpen(false); setCustomerResults([]) }} title="קביעת תור ללקוח">
        <form onSubmit={handleBookForCustomer} className="space-y-4">
          {/* Customer search */}
          <div className="relative">
            <label className="block text-sm font-medium mb-1">חיפוש לקוח (שם / טלפון) *</label>
            <input
              className="input"
              placeholder="הקלד לחיפוש..."
              value={bookForm.customerSearch}
              onChange={e => {
                const q = e.target.value
                setBookForm(f => ({ ...f, customerSearch: q, customerId: null, customerName: '', customerPhone: '' }))
                searchCustomers(q)
              }}
            />
            {customerResults.length > 0 && (
              <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {customerResults.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-right px-4 py-2.5 hover:bg-gray-50 transition-colors text-sm border-b border-gray-50 last:border-0"
                    onClick={() => {
                      setBookForm(f => ({ ...f, customerId: c.id, customerName: c.name, customerPhone: c.phone || '', customerSearch: `${c.name}${c.phone ? ' · ' + c.phone : ''}` }))
                      setCustomerResults([])
                    }}
                  >
                    <span className="font-semibold">{c.name}</span>
                    {c.phone && <span className="text-muted text-xs mr-2">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
            {bookForm.customerId && (
              <p className="text-xs mt-1 font-medium" style={{ color: 'var(--color-primary)' }}>✓ לקוח נבחר: {bookForm.customerName}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">שירות *</label>
              <select className="input" value={bookForm.serviceId} onChange={e => setBookForm(f => ({ ...f, serviceId: e.target.value }))} required>
                <option value="">בחר שירות...</option>
                {services.filter(s => s.is_active && s.booking_type !== 'by_request').map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes} דק׳)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ספר *</label>
              <select className="input" value={bookForm.staffId} onChange={e => setBookForm(f => ({ ...f, staffId: e.target.value }))} required>
                <option value="">בחר ספר...</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">תאריך *</label>
              <input type="date" className="input" value={bookForm.date} onChange={e => setBookForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">שעת התחלה *</label>
              <input type="time" className="input" value={bookForm.startTime} onChange={e => setBookForm(f => ({ ...f, startTime: e.target.value }))} required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">הערות</label>
            <textarea className="input resize-none h-14" placeholder="הערות לתור..." value={bookForm.notes} onChange={e => setBookForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={savingBook} className="btn-primary flex-1 justify-center">
              {savingBook ? 'שומר...' : '✓ קבע תור'}
            </button>
            <button type="button" onClick={() => { setBookOpen(false); setCustomerResults([]) }} className="btn-outline flex-1 justify-center">ביטול</button>
          </div>
        </form>
      </Modal>

      {/* ── WhatsApp After Move Modal ── */}
      <Modal open={!!whatsappAfterMove} onClose={() => setWhatsappAfterMove(null)} title="שליחת הודעה ללקוח">
        {whatsappAfterMove && (() => {
          const rawPhone = whatsappAfterMove.phone.replace(/\D/g, '')
          const waPhone = rawPhone.startsWith('0') ? '972' + rawPhone.slice(1) : rawPhone
          const newDate = formatDate(whatsappAfterMove.newStart)
          const newTime = formatTime(whatsappAfterMove.newStart)
          const msg = encodeURIComponent(`שלום ${whatsappAfterMove.name}, תורך שונה ל-${newDate} בשעה ${newTime}. נתראה! 💈`)
          return (
            <div className="space-y-4 text-center">
              <div className="text-4xl">📲</div>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                האם לשלוח הודעת WhatsApp ל<strong style={{ color: 'var(--color-text)' }}>{whatsappAfterMove.name}</strong> על שינוי המועד?
              </p>
              <div className="bg-gray-50 rounded-xl p-3 text-sm text-right" style={{ direction: 'rtl' }}>
                שלום {whatsappAfterMove.name}, תורך שונה ל-{newDate} בשעה {newTime}. נתראה! 💈
              </div>
              <div className="flex gap-3">
                <a
                  href={`https://wa.me/${waPhone}?text=${msg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWhatsappAfterMove(null)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm"
                  style={{ background: '#25D366', color: '#fff' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  שלח WhatsApp
                </a>
                <button onClick={() => setWhatsappAfterMove(null)} className="flex-1 btn-outline py-2.5">לא עכשיו</button>
              </div>
            </div>
          )
        })()}
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
  const HOURS = Array.from({ length: 13 }, (_, i) => i + 7) // 07:00–19:00
  const activeAppts = appointments.filter(a => a.status !== 'cancelled')

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: '52px repeat(7, 1fr)' }}>
        <div />
        {days.map(day => {
          const isNow = isSameDay(day, new Date())
          const count = activeAppts.filter(a => isSameDay(new Date(a.start_at), day)).length
          return (
            <div
              key={day.toISOString()}
              className="p-2 text-center border-r border-gray-100 last:border-0"
              style={{ background: isNow ? 'rgba(255,133,0,0.06)' : undefined }}
            >
              <div className="text-xs font-semibold" style={{ color: isNow ? 'var(--color-primary)' : 'var(--color-muted)' }}>
                {format(day, 'EEE', { locale: he })}
              </div>
              <div className="text-xl font-black" style={{ color: isNow ? 'var(--color-primary)' : 'var(--color-text)' }}>
                {format(day, 'd')}
              </div>
              {count > 0 && (
                <div className="inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1.5 py-0.5 mt-0.5"
                  style={{ background: isNow ? 'var(--color-primary)' : '#e5e7eb', color: isNow ? '#fff' : '#6b7280' }}>
                  {count}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Body */}
      <div className="overflow-auto max-h-[620px]">
        {HOURS.map(hour => (
          <div
            key={hour}
            className="grid"
            style={{ gridTemplateColumns: '52px repeat(7, 1fr)', minHeight: '64px', borderBottom: '1px solid #f0f0f0' }}
          >
            <div className="text-xs font-medium text-gray-400 pt-1.5 text-center select-none border-r border-gray-100">{hour}:00</div>
            {days.map(day => {
              const dayAppts = activeAppts.filter(a => {
                const start = new Date(a.start_at)
                return isSameDay(start, day) && start.getHours() === hour
              })
              const isNow = isSameDay(day, new Date())
              return (
                <div
                  key={day.toISOString()}
                  className="border-r border-gray-50 last:border-0 p-0.5 relative"
                  style={{ background: isNow ? 'rgba(255,133,0,0.02)' : undefined }}
                >
                  {dayAppts.map(appt => {
                    const color = appt.no_show ? '#ef4444' : (serviceColors[appt.service_id] || DEFAULT_COLOR)
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
function DayView({ date, appointments, staffColumns, slotMinutes, serviceColors, onSelect, onMoveRequest, onSlotClick, recurringBreaks = [], blockedTimes = [] }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  const totalMinutes = (END_HOUR - START_HOUR) * 60
  const slotsCount = totalMinutes / slotMinutes
  const TOTAL_HEIGHT = slotsCount * SLOT_HEIGHT

  // Current time for "now" indicator
  const [nowTop, setNowTop] = useState(null)
  useEffect(() => {
    function calcNow() {
      const now = new Date()
      if (!isToday(date)) { setNowTop(null); return }
      const mins = (now.getHours() - START_HOUR) * 60 + now.getMinutes()
      if (mins < 0 || mins > totalMinutes) { setNowTop(null); return }
      setNowTop((mins / slotMinutes) * SLOT_HEIGHT)
    }
    calcNow()
    const iv = setInterval(calcNow, 60000)
    return () => clearInterval(iv)
  }, [date, slotMinutes, totalMinutes])

  // All time slots — for row labels
  const timeSlots = useMemo(() => {
    const slots = []
    for (let m = 0; m < totalMinutes; m += slotMinutes) slots.push(m)
    return slots
  }, [totalMinutes, slotMinutes])

  // Only active appointments for this day
  const dayAppts = appointments.filter(a => a.status !== 'cancelled')
  const dow = date.getDay()

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

  // Compute break blocks for a given staff column
  function getBreakBlocks(staffId) {
    const blocks = []
    // Recurring breaks
    recurringBreaks
      .filter(b => b.is_active && (b.day_of_week === null || b.day_of_week === dow) && (!b.staff_id || b.staff_id === staffId))
      .forEach(b => {
        const [sh, sm] = b.start_time.split(':').map(Number)
        const [eh, em] = b.end_time.split(':').map(Number)
        const startMin = (sh - START_HOUR) * 60 + sm
        const endMin   = (eh - START_HOUR) * 60 + em
        if (startMin >= totalMinutes || endMin <= 0) return
        blocks.push({ top: (Math.max(startMin,0) / slotMinutes) * SLOT_HEIGHT, height: ((endMin - Math.max(startMin,0)) / slotMinutes) * SLOT_HEIGHT, label: b.label || 'הפסקה' })
      })
    // Blocked times (personal events) for this staff
    blockedTimes
      .filter(bt => bt.staff_id === staffId)
      .forEach(bt => {
        const start = new Date(bt.start_at)
        const end   = new Date(bt.end_at)
        const startMin = (start.getHours() - START_HOUR) * 60 + start.getMinutes()
        const endMin   = (end.getHours()   - START_HOUR) * 60 + end.getMinutes()
        if (startMin >= totalMinutes || endMin <= 0) return
        blocks.push({ top: (Math.max(startMin,0) / slotMinutes) * SLOT_HEIGHT, height: ((endMin - Math.max(startMin,0)) / slotMinutes) * SLOT_HEIGHT, label: bt.reason || 'חסום' })
      })
    return blocks
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
          className="grid border-b border-gray-200 sticky top-0 z-10"
          style={{ gridTemplateColumns: `52px repeat(${staffColumns.length}, 1fr)`, background: 'var(--color-card)' }}
        >
          <div className="border-r border-gray-100" />
          {staffColumns.map(s => (
            <div
              key={s.id}
              className="p-3 text-center font-bold text-gray-800 border-r border-gray-100 last:border-0"
              style={{ fontSize: '13px' }}
            >
              {s.name}
            </div>
          ))}
        </div>

        {/* Scrollable grid */}
        <div className="overflow-auto max-h-[700px]">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `52px repeat(${staffColumns.length}, 1fr)`,
              height: TOTAL_HEIGHT,
              position: 'relative',
            }}
          >
            {/* Time axis */}
            <div className="relative border-r border-gray-200" style={{ height: TOTAL_HEIGHT }}>
              {timeSlots.map(minuteOff => {
                const isHour   = minuteOff % 60 === 0
                const isHalf   = !isHour && minuteOff % 30 === 0
                const top = (minuteOff / slotMinutes) * SLOT_HEIGHT
                const hour = START_HOUR + Math.floor(minuteOff / 60)
                const min  = minuteOff % 60
                return (
                  <div key={minuteOff} className="absolute w-full flex items-start justify-center" style={{ top, height: SLOT_HEIGHT }}>
                    {isHour ? (
                      <span className="text-xs font-bold text-gray-500 mt-0.5 select-none leading-none">
                        {String(hour).padStart(2,'0')}:00
                      </span>
                    ) : isHalf ? (
                      <span className="text-[10px] text-gray-300 mt-0.5 select-none leading-none">
                        :{String(min).padStart(2,'0')}
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {/* Staff columns */}
            {staffColumns.map(s => {
              const staffAppts  = dayAppts.filter(a => a.staff_id === s.id)
              const breakBlocks = getBreakBlocks(s.id)

              return (
                <div key={s.id} className="relative border-r border-gray-200 last:border-0" style={{ height: TOTAL_HEIGHT }}>
                  {/* Droppable slots */}
                  {timeSlots.map(minuteOff => {
                    const isHour  = minuteOff % 60 === 0
                    const isHalf  = !isHour && minuteOff % 30 === 0
                    const top = (minuteOff / slotMinutes) * SLOT_HEIGHT
                    return (
                      <DroppableSlot
                        key={minuteOff}
                        id={`${s.id}__${minuteOff}`}
                        top={top}
                        height={SLOT_HEIGHT}
                        isHour={isHour}
                        isHalf={isHalf}
                        onEmptyClick={() => onSlotClick(s.id, minuteOff, date)}
                      />
                    )
                  })}

                  {/* Break / blocked-time blocks */}
                  {breakBlocks.map((b, i) => (
                    <BreakBlock key={i} top={b.top} height={b.height} label={b.label} />
                  ))}

                  {/* Appointment blocks */}
                  {staffAppts.map(appt => {
                    const startDt = new Date(appt.start_at)
                    const totalStartMin = (startDt.getHours() - START_HOUR) * 60 + startDt.getMinutes()
                    const durationMin   = (new Date(appt.end_at) - startDt) / 60000
                    const top    = (totalStartMin / slotMinutes) * SLOT_HEIGHT
                    const height = Math.max((durationMin / slotMinutes) * SLOT_HEIGHT, 28)
                    const color  = appt.no_show ? '#ef4444' : (serviceColors[appt.service_id] || DEFAULT_COLOR)
                    const isTall = height >= 52
                    const isXTall = height >= 76
                    return (
                      <DraggableAppt
                        key={appt.id}
                        appt={appt}
                        top={top}
                        height={height}
                        color={color}
                        isTall={isTall}
                        isXTall={isXTall}
                        onSelect={onSelect}
                      />
                    )
                  })}

                  {/* Now indicator line */}
                  {nowTop !== null && (
                    <div
                      className="absolute inset-x-0 z-20 pointer-events-none"
                      style={{ top: nowTop }}
                    >
                      <div className="h-0.5 bg-red-500 w-full" style={{ boxShadow: '0 0 4px rgba(239,68,68,0.6)' }} />
                      <div className="absolute -top-1 right-0 w-2.5 h-2.5 rounded-full bg-red-500" />
                    </div>
                  )}
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
function DroppableSlot({ id, top, height, isHour, isHalf, onEmptyClick }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  let borderTop
  if (isHour)       borderTop = '1.5px solid #d1d5db'   // hour — solid gray
  else if (isHalf)  borderTop = '1px dashed #e5e7eb'    // half-hour — dashed
  else              borderTop = '1px dotted #f0f0f0'     // 15-min — dotted subtle

  return (
    <div
      ref={setNodeRef}
      className="absolute inset-x-0 transition-colors cursor-pointer"
      style={{
        top,
        height,
        borderTop,
        backgroundColor: isOver ? 'rgba(201,169,110,0.14)' : 'transparent',
      }}
      onClick={onEmptyClick}
    />
  )
}

// ─── BreakBlock ────────────────────────────────────────────────────────────────
function BreakBlock({ top, height, label }) {
  return (
    <div
      className="absolute inset-x-0 z-[1] flex items-center justify-center overflow-hidden pointer-events-none select-none"
      style={{
        top,
        height: Math.max(height, 16),
        background: 'repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 6px, #e9eaec 6px, #e9eaec 12px)',
        borderTop: '1px solid #d1d5db',
        borderBottom: '1px solid #d1d5db',
      }}
    >
      {height >= 24 && (
        <span className="text-[10px] font-semibold text-gray-400 px-1 text-center truncate w-full text-center">
          {label}
        </span>
      )}
    </div>
  )
}

// ─── DraggableAppt ─────────────────────────────────────────────────────────────
function DraggableAppt({ appt, top, height, color, isTall, isXTall, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: appt.id })

  const isNoShow = appt.no_show

  const style = {
    position: 'absolute',
    top,
    height,
    left: 3,
    right: 3,
    backgroundColor: color,
    opacity: isDragging ? 0.55 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 50 : 2,
    borderRadius: 8,
    cursor: isDragging ? 'grabbing' : 'grab',
    overflow: 'hidden',
    userSelect: 'none',
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.22)' : '0 1px 4px rgba(0,0,0,0.14)',
    transition: isDragging ? 'none' : 'box-shadow 0.15s',
    // Striped overlay for no-show
    backgroundImage: isNoShow
      ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.08), rgba(0,0,0,0.08) 3px, transparent 3px, transparent 9px)'
      : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <button
        onClick={e => { e.stopPropagation(); onSelect(appt) }}
        onPointerDown={e => e.stopPropagation()}
        className="absolute inset-0 w-full h-full text-right px-2 py-1"
        tabIndex={-1}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <div className="text-white text-xs font-bold truncate leading-tight">
          {appt.profiles?.name}
        </div>
        {isTall && (
          <div className="text-white/85 text-xs truncate leading-tight">{appt.services?.name}</div>
        )}
        {isTall && (
          <div className="text-white/70 text-[10px] leading-tight">{formatTime(appt.start_at)} — {formatTime(appt.end_at)}</div>
        )}
        {isXTall && appt.profiles?.phone && (
          <div className="text-white/60 text-[10px] leading-tight mt-0.5">{appt.profiles.phone}</div>
        )}
        {isNoShow && height >= 28 && (
          <div className="text-white/90 text-[10px] font-bold leading-tight">✕ לא הגיע</div>
        )}
      </button>
    </div>
  )
}
