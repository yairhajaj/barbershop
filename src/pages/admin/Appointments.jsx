import { useState } from 'react'
import { motion } from 'framer-motion'
import { addDays, startOfWeek, endOfWeek, startOfDay, endOfDay, isSameDay, format } from 'date-fns'
import { he } from 'date-fns/locale'
import { useAllAppointments } from '../../hooks/useAppointments'
import { useStaff } from '../../hooks/useStaff'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { StatusBadge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { findGapOpportunities, formatTime, formatDate } from '../../lib/utils'
import { supabase } from '../../lib/supabase'

const VIEWS = ['day', 'week', 'list']
const VIEW_LABELS = { day: 'יומי', week: 'שבועי', list: 'רשימה' }

const EMPTY_EVENT = {
  title: '',
  staff_id: '',
  date: '',
  start_time: '',
  end_time: '',
}

export function Appointments() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState('week')
  const [filterStaff, setFilterStaff] = useState('')
  const [selectedAppt, setSelectedAppt] = useState(null)
  const [gapAppts, setGapAppts] = useState([])
  const [addEventOpen, setAddEventOpen] = useState(false)
  const [eventForm, setEventForm] = useState(EMPTY_EVENT)
  const [savingEvent, setSavingEvent] = useState(false)
  const toast = useToast()
  const { settings } = useBusinessSettings()
  const { staff } = useStaff({ activeOnly: true })

  const columns = settings.calendar_columns || 1

  // Date range based on view
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

  async function handleCancel(id) {
    if (!confirm('לבטל תור זה?')) return
    const { error } = await supabase.from('appointments').update({ status: 'cancelled', cancelled_by: 'admin' }).eq('id', id)
    if (error) { toast({ message: 'שגיאה', type: 'error' }); return }

    // Gap Closer
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
      const end_at   = new Date(`${eventForm.date}T${eventForm.end_time}`).toISOString()
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

  // Build week day columns
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    addDays(startOfWeek(currentDate, { weekStartsOn: 0 }), i)
  )

  // Staff columns for multi-column calendar
  const staffColumns = filterStaff
    ? staff.filter(s => s.id === filterStaff)
    : staff.slice(0, columns)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>יומן תורים</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Add personal event */}
          <button
            onClick={() => setAddEventOpen(true)}
            className="btn-primary text-sm"
          >
            + הוסף אירוע אישי
          </button>

          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {VIEWS.map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === v ? 'bg-[var(--color-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          {/* Staff filter */}
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

      {/* Navigation */}
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

      {/* Gap Closer Alert */}
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

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : view === 'list' ? (
        <ListViewAppointments appointments={appointments} onSelect={setSelectedAppt} />
      ) : view === 'day' ? (
        <DayView
          date={currentDate}
          appointments={appointments.filter(a => isSameDay(new Date(a.start_at), currentDate))}
          staffColumns={staffColumns}
          onSelect={setSelectedAppt}
        />
      ) : (
        <WeekView
          days={weekDays}
          appointments={appointments}
          onSelect={setSelectedAppt}
        />
      )}

      {/* Appointment detail modal */}
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
              <p className="text-sm bg-gray-50 rounded-lg p-3"><span className="text-muted">הערות: </span>{selectedAppt.notes}</p>
            )}
            {/* WhatsApp button — always shown if customer has phone */}
            {selectedAppt.profiles?.phone && (() => {
              const rawPhone = selectedAppt.profiles.phone.replace(/\D/g, '')
              const waPhone = rawPhone.startsWith('0') ? '972' + rawPhone.slice(1) : rawPhone
              const apptDate = formatDate(selectedAppt.start_at)
              const apptTime = formatTime(selectedAppt.start_at)
              const svcName  = selectedAppt.services?.name ?? ''
              const msg = encodeURIComponent(`שלום ${selectedAppt.profiles?.name ?? ''}, רצינו להזכיר לך את התור שלך ל${svcName} בתאריך ${apptDate} בשעה ${apptTime}. נתראה! 💈`)
              return (
                <a
                  href={`https://wa.me/${waPhone}?text=${msg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-colors"
                  style={{ background: '#25D366', color: '#fff' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp ללקוח
                </a>
              )
            })()}
            {selectedAppt.status === 'confirmed' && (
              <div className="flex gap-3 pt-2">
                <button onClick={() => handleComplete(selectedAppt.id)} className="btn-primary flex-1 justify-center text-sm py-2">
                  ✓ סמן הושלם
                </button>
                <button onClick={() => handleCancel(selectedAppt.id)} className="flex-1 py-2 px-4 bg-red-50 text-red-600 rounded-lg font-medium text-sm hover:bg-red-100 transition-colors">
                  ✕ בטל
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Add Personal Event Modal */}
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
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
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
    </div>
  )
}

function ListViewAppointments({ appointments, onSelect }) {
  const sorted = [...appointments].sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
  if (sorted.length === 0) return (
    <div className="card p-12 text-center text-muted">
      <div className="text-4xl mb-3">📭</div>
      <p>אין תורים בטווח זה</p>
    </div>
  )
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

function WeekView({ days, appointments, onSelect }) {
  const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 08:00–19:00

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        <div />
        {days.map(day => (
          <div key={day.toISOString()} className={`p-2 text-center text-xs font-semibold border-r border-gray-100 last:border-0 ${
            isSameDay(day, new Date()) ? 'bg-[var(--color-gold)]/10 text-[var(--color-gold)]' : 'text-muted'
          }`}>
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
          <div key={hour} className="grid border-b border-gray-50" style={{ gridTemplateColumns: '48px repeat(7, 1fr)', minHeight: '60px' }}>
            <div className="text-xs text-muted p-1 text-center pt-2">{hour}:00</div>
            {days.map(day => {
              const dayAppts = appointments.filter(a => {
                const start = new Date(a.start_at)
                return isSameDay(start, day) && start.getHours() === hour && a.status !== 'cancelled'
              })
              return (
                <div key={day.toISOString()} className="border-r border-gray-50 last:border-0 p-0.5 relative">
                  {dayAppts.map(appt => (
                    <button
                      key={appt.id}
                      onClick={() => onSelect(appt)}
                      className="w-full text-right px-2 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                      style={{ background: 'var(--color-gold)', color: 'white' }}
                    >
                      <div className="truncate">{appt.profiles?.name}</div>
                      <div className="opacity-80 truncate">{appt.services?.name}</div>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function DayView({ date, appointments, staffColumns, onSelect }) {
  const HOURS = Array.from({ length: 12 }, (_, i) => i + 8)

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: `48px repeat(${staffColumns.length}, 1fr)` }}>
        <div />
        {staffColumns.map(s => (
          <div key={s.id} className="p-3 text-center text-sm font-semibold text-muted border-r border-gray-100 last:border-0">
            {s.name}
          </div>
        ))}
      </div>
      <div className="overflow-auto max-h-[600px]">
        {HOURS.map(hour => (
          <div key={hour} className="grid border-b border-gray-50" style={{ gridTemplateColumns: `48px repeat(${staffColumns.length}, 1fr)`, minHeight: '60px' }}>
            <div className="text-xs text-muted p-1 text-center pt-2">{hour}:00</div>
            {staffColumns.map(s => {
              const appts = appointments.filter(a => {
                const start = new Date(a.start_at)
                return a.staff_id === s.id && start.getHours() === hour && a.status !== 'cancelled'
              })
              return (
                <div key={s.id} className="border-r border-gray-50 last:border-0 p-0.5">
                  {appts.map(appt => (
                    <button
                      key={appt.id}
                      onClick={() => onSelect(appt)}
                      className="w-full text-right px-2 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                      style={{ background: 'var(--color-gold)', color: 'white' }}
                    >
                      <div className="truncate">{appt.profiles?.name}</div>
                      <div className="opacity-80 truncate">{appt.services?.name}</div>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
