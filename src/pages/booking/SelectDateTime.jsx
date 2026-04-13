import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { addDays, startOfDay, isSameDay, addMinutes, isToday, isBefore } from 'date-fns'
import { BookingProgress } from '../../components/booking/BookingProgress'
import { Spinner } from '../../components/ui/Spinner'
import { useAppointments } from '../../hooks/useAppointments'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useStaff } from '../../hooks/useStaff'
import { generateSlots, formatTime, dayName } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { useRecurringBreaks } from '../../hooks/useRecurringBreaks'

const DAYS_AHEAD = 30

export function SelectDateTime() {
  const navigate = useNavigate()
  const bookingState = JSON.parse(sessionStorage.getItem('booking_state') ?? '{}')

  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()))
  const [blockedTimes, setBlockedTimes] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [availableSlots, setAvailableSlots] = useState([])

  const { appointments } = useAppointments({ staffId: bookingState.staffId || undefined, date: selectedDate })
  const { settings, hours } = useBusinessSettings()
  const { staff } = useStaff({ activeOnly: true })
  const { breaks: recurringBreaks } = useRecurringBreaks()

  useEffect(() => {
    if (!bookingState.serviceId) navigate('/book/service', { replace: true })
  }, [])

  useEffect(() => {
    loadBlockedTimes()
  }, [selectedDate, bookingState.staffId])

  async function loadBlockedTimes() {
    if (!bookingState.staffId) return
    const start = new Date(selectedDate); start.setHours(0,0,0,0)
    const end   = new Date(selectedDate); end.setHours(23,59,59,999)
    const { data } = await supabase
      .from('blocked_times')
      .select('*')
      .eq('staff_id', bookingState.staffId)
      .lte('start_at', end.toISOString())
      .gte('end_at', start.toISOString())
    setBlockedTimes(data ?? [])
  }

  useEffect(() => {
    computeSlots()
  }, [selectedDate, appointments, blockedTimes, settings, hours, staff])

  function computeSlots() {
    setSlotsLoading(true)
    const dayOfWeek = selectedDate.getDay()
    const businessDay = hours.find(h => h.day_of_week === dayOfWeek)

    const staffToCheck = bookingState.staffId
      ? staff.filter(s => s.id === bookingState.staffId)
      : staff

    const allSlots = []

    staffToCheck.forEach(member => {
      const staffDay = member.staff_hours?.find(h => h.day_of_week === dayOfWeek)
      const slots = generateSlots({
        date: selectedDate,
        durationMinutes: bookingState.serviceDuration ?? 30,
        staffHours: staffDay,
        businessHours: businessDay,
        existingAppointments: appointments.filter(a => !bookingState.staffId || a.staff_id === member.id),
        blockedTimes,
        recurringBreaks,
        smartScheduling: {
          enabled: settings.smart_scheduling_enabled,
          freeCount: settings.free_slots_count,
          appointmentCount: appointments.filter(a => !bookingState.staffId || a.staff_id === member.id).length,
          adjacent: settings.smart_adjacent ?? true,
          startOfDay: settings.smart_start_of_day ?? true,
          endOfDay: settings.smart_end_of_day ?? true,
        },
      })
      slots.forEach(slot => {
        if (!allSlots.find(s => s.start.getTime() === slot.start.getTime())) {
          allSlots.push({ ...slot, staffId: member.id, staffName: member.name })
        }
      })
    })

    const now = new Date()
    const future = allSlots.filter(s => isToday(selectedDate) ? !isBefore(s.start, addMinutes(now, 30)) : true)
    setAvailableSlots(future.sort((a, b) => a.start - b.start))
    setSlotsLoading(false)
  }

  function selectSlot(slot) {
    const updated = {
      ...bookingState,
      selectedDate: selectedDate.toISOString(),
      slotStart: slot.start.toISOString(),
      slotEnd:   slot.end.toISOString(),
      staffId:   slot.staffId   ?? bookingState.staffId,
      staffName: slot.staffName ?? bookingState.staffName,
    }
    sessionStorage.setItem('booking_state', JSON.stringify(updated))
    navigate('/book/confirm')
  }

  // Date options (next 30 days, excluding closed days)
  const dateOptions = []
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = startOfDay(addDays(new Date(), i))
    const dow = d.getDay()
    const bh = hours.find(h => h.day_of_week === dow)
    if (!bh?.is_closed) dateOptions.push(d)
  }

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: 'var(--color-surface)' }}>
      <div className="container px-4 sm:px-6 max-w-xl mx-auto">
        <BookingProgress currentStep={3} />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-black mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            בחר תאריך ושעה
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {bookingState.serviceName} · {bookingState.staffName ?? 'כל ספר פנוי'}
          </p>
        </div>

        <button onClick={() => navigate('/book/staff')} className="btn-ghost mb-5 text-sm">
          ← חזרה
        </button>

        {/* Smart Scheduling notice */}
        {settings.smart_scheduling_enabled && (
          <div
            className="rounded-2xl p-3 mb-5 text-sm flex items-center gap-2"
            style={{ background: 'rgba(255,122,0,0.08)', border: '1px solid rgba(255,122,0,0.2)', color: 'var(--color-gold)' }}
          >
            ⚡ מצב חיסכון בזמן פעיל — מוצגים חריצים צמודים לתורים קיימים
          </div>
        )}

        {/* Section label */}
        <p className="text-xs font-bold mb-2 tracking-wide" style={{ color: 'var(--color-muted)' }}>בחר יום</p>

        {/* Date Picker — horizontal pills */}
        <div className="overflow-x-auto pb-2 mb-6" style={{ scrollbarWidth: 'none' }}>
          <div className="flex gap-2 min-w-max">
            {dateOptions.map(date => {
              const active = isSameDay(date, selectedDate)
              const isToday = isSameDay(date, new Date())
              return (
                <button
                  key={date.toISOString()}
                  onClick={() => setSelectedDate(date)}
                  className="flex flex-col items-center px-3 py-2.5 rounded-2xl font-semibold text-xs transition-all min-w-[58px] border-2"
                  style={{
                    background:   active ? 'var(--color-gold)'   : 'var(--color-card)',
                    borderColor:  active ? 'var(--color-gold)'   : 'var(--color-border)',
                    color:        active ? '#fff'                : 'var(--color-text)',
                    boxShadow:    active ? '0 2px 12px rgba(255,122,0,0.25)' : 'none',
                  }}
                >
                  <span className="text-[10px] font-semibold mb-0.5" style={{ opacity: active ? 1 : 0.6 }}>
                    {dayName(date.getDay())}
                  </span>
                  <span className="text-base font-black">{date.getDate()}</span>
                  {isToday && (
                    <span className="text-[9px] mt-0.5" style={{ opacity: 0.7 }}>היום</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Section label */}
        <p className="text-xs font-bold mb-2 tracking-wide" style={{ color: 'var(--color-muted)' }}>בחר שעה</p>

        {/* Time Slots */}
        {slotsLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : availableSlots.length === 0 ? (
          <div className="text-center py-12 rounded-2xl" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
            <div className="text-4xl mb-3">📅</div>
            <p className="font-bold" style={{ color: 'var(--color-text)' }}>אין שעות פנויות ביום זה</p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>נסה תאריך אחר</p>
          </div>
        ) : (
          <motion.div
            key={selectedDate.toISOString()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-3 sm:grid-cols-4 gap-2"
          >
            {availableSlots.map((slot, i) => (
              <motion.button
                key={slot.start.toISOString()}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => selectSlot(slot)}
                className="py-3 px-2 rounded-2xl border-2 transition-all text-sm font-bold text-center"
                style={{
                  background: 'var(--color-card)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--color-gold)'
                  e.currentTarget.style.borderColor = 'var(--color-gold)'
                  e.currentTarget.style.color = '#fff'
                  e.currentTarget.style.boxShadow = '0 2px 12px rgba(255,122,0,0.25)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--color-card)'
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.color = 'var(--color-text)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {formatTime(slot.start)}
                {!bookingState.staffId && (
                  <div className="text-[10px] font-medium mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>
                    {slot.staffName}
                  </div>
                )}
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
