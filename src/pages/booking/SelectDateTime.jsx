import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { addDays, startOfDay, isSameDay, addMinutes, isToday, isBefore, format } from 'date-fns'
import { BookingProgress } from '../../components/booking/BookingProgress'
import { Spinner } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../contexts/AuthContext'
import { useAppointments } from '../../hooks/useAppointments'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useStaff } from '../../hooks/useStaff'
import { joinWaitlist } from '../../hooks/useWaitlist'
import { generateSlots, formatTime, dayName, isShabbatDay } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { useRecurringBreaks } from '../../hooks/useRecurringBreaks'

const DAYS_AHEAD = 30

// Generate time options HH:MM from 07:00 to 21:00 in 30-min steps
const TIME_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 30
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const m = String(totalMinutes % 60).padStart(2, '0')
  return `${h}:${m}`
})

export function SelectDateTime() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const showToast = useToast()
  const bookingState = JSON.parse(sessionStorage.getItem('booking_state') ?? '{}')

  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()))
  const [blockedTimes, setBlockedTimes] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [availableSlots, setAvailableSlots] = useState([])

  // Waitlist modal state
  const [showWaitlist,  setShowWaitlist]  = useState(false)
  const [wlTimeFrom,    setWlTimeFrom]    = useState('08:00')
  const [wlTimeTo,      setWlTimeTo]      = useState('20:00')
  const [wlPickerMode,  setWlPickerMode]  = useState('from') // 'from' | 'to'
  const [wlSaving,      setWlSaving]      = useState(false)
  const [wlSuccess,     setWlSuccess]     = useState(null)  // { date, timeFrom, timeTo, serviceName }
  const [wlConflict,    setWlConflict]    = useState(null)  // { sameStaff: [{slot,staffName}], otherStaff: [{slot,staffName}] }
  const [wlChecking,    setWlChecking]    = useState(false)
  const [wlExisting,    setWlExisting]    = useState(null)  // existing entry: { id, time_from, time_to } when duplicate detected

  const { appointments } = useAppointments({ staffId: bookingState.staffId || undefined, date: selectedDate })
  const { settings, hours: globalHours, fetchBranchHours } = useBusinessSettings()
  const { staff } = useStaff({ activeOnly: true, branchId: bookingState.branchId ?? null })

  const [hours, setHours] = useState(globalHours)

  useEffect(() => {
    if (bookingState.branchId) {
      fetchBranchHours(bookingState.branchId).then(h => setHours(h))
    } else {
      setHours(globalHours)
    }
  }, [bookingState.branchId, globalHours.length])
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
    const groupSize = bookingState.groupSize ?? 1

    const staffToCheck = bookingState.staffId
      ? staff.filter(s => s.id === bookingState.staffId)
      : staff

    const allSlots = []

    staffToCheck.forEach(member => {
      const staffDay   = member.staff_hours?.find(h => h.day_of_week === dayOfWeek)
      const memberAppts = appointments.filter(a => !bookingState.staffId || a.staff_id === member.id)
      const shabbatConfig = {
        enabled: settings.shabbat_mode,
        lat: settings.shabbat_lat,
        lng: settings.shabbat_lng,
        offsetMinutes: settings.shabbat_offset_minutes,
      }
      const smartBase = {
        enabled: settings.smart_scheduling_enabled,
        freeCount: settings.free_slots_count,
        appointmentCount: memberAppts.length,
        adjacent: settings.smart_adjacent ?? true,
        startOfDay: settings.smart_start_of_day ?? true,
        endOfDay: settings.smart_end_of_day ?? true,
      }

      // For group bookings, generate raw slots (smart scheduling OFF) so the
      // elimination filter doesn't remove consecutive-group candidates before we check them.
      // For single bookings, respect smart scheduling normally.
      const rawSlots = generateSlots({
        date: selectedDate,
        durationMinutes: bookingState.serviceDuration ?? 30,
        staffHours: staffDay,
        businessHours: businessDay,
        existingAppointments: memberAppts,
        blockedTimes,
        recurringBreaks,
        smartScheduling: groupSize > 1 ? { enabled: false } : smartBase,
        shabbatConfig,
      })

      // For group bookings, separately compute which slots smart scheduling would
      // have kept — these become "recommended" (demoted, not eliminated).
      const smartTimestamps = new Set()
      if (groupSize > 1 && settings.smart_scheduling_enabled) {
        const smartSlots = generateSlots({
          date: selectedDate,
          durationMinutes: bookingState.serviceDuration ?? 30,
          staffHours: staffDay,
          businessHours: businessDay,
          existingAppointments: memberAppts,
          blockedTimes,
          recurringBreaks,
          smartScheduling: smartBase,
          shabbatConfig,
        })
        smartSlots.forEach(s => smartTimestamps.add(s.start.getTime()))
      }

      rawSlots.forEach(slot => {
        if (!allSlots.find(s => s.start.getTime() === slot.start.getTime())) {
          allSlots.push({
            ...slot,
            staffId:     member.id,
            staffName:   member.name,
            recommended: groupSize > 1 && smartTimestamps.size > 0
              ? smartTimestamps.has(slot.start.getTime())
              : false,
          })
        }
      })
    })

    const now = new Date()
    const future = allSlots
      .filter(s => isToday(selectedDate) ? !isBefore(s.start, addMinutes(now, 30)) : true)
      .sort((a, b) => a.start - b.start)

    // ── Group booking: keep only slots that have N consecutive free slots for the same staff ──
    if (groupSize > 1) {
      const dur = (bookingState.serviceDuration ?? 30) * 60_000
      const grouped = future.filter(slot => {
        for (let n = 1; n < groupSize; n++) {
          const nextTime = slot.start.getTime() + n * dur
          if (!future.some(s => s.start.getTime() === nextTime && s.staffId === slot.staffId)) return false
        }
        return true
      })
      // Surface smart-recommended slots first, then chronological
      grouped.sort((a, b) => {
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
        return a.start - b.start
      })
      setAvailableSlots(grouped)
    } else {
      setAvailableSlots(future)
    }
    setSlotsLoading(false)
  }

  function selectSlot(slot) {
    const groupSize = bookingState.groupSize ?? 1
    const dur       = (bookingState.serviceDuration ?? 30) * 60_000
    const groupEnd  = new Date(slot.start.getTime() + groupSize * dur)
    const updated = {
      ...bookingState,
      selectedDate:  selectedDate.toISOString(),
      slotStart:     slot.start.toISOString(),
      slotEnd:       slot.end.toISOString(),
      slotGroupEnd:  groupSize > 1 ? groupEnd.toISOString() : undefined,
      staffId:       slot.staffId   ?? bookingState.staffId,
      staffName:     slot.staffName ?? bookingState.staffName,
    }
    sessionStorage.setItem('booking_state', JSON.stringify(updated))
    navigate('/book/confirm')
  }

  async function checkThenJoin() {
    if (!user) return
    setWlConflict(null)
    setWlChecking(true)

    try {
      const dateStr  = format(selectedDate, 'yyyy-MM-dd')
      const dayStart = new Date(selectedDate); dayStart.setHours(0,0,0,0)
      const dayEnd   = new Date(selectedDate); dayEnd.setHours(23,59,59,999)

      // ── #4: Duplicate check ──────────────────────────────────────
      const { data: existing } = await supabase
        .from('waitlist')
        .select('id, time_from, time_to')
        .eq('customer_id', user.id)
        .eq('preferred_date', dateStr)
        .in('status', ['pending', 'notified'])

      const overlapping = existing?.find(e => {
        const eFrom = (e.time_from ?? '').slice(0,5)
        const eTo   = (e.time_to   ?? '').slice(0,5)
        return eFrom < wlTimeTo && eTo > wlTimeFrom
      })

      if (overlapping) {
        setWlExisting({
          id:        overlapping.id,
          time_from: overlapping.time_from?.slice(0,5) ?? '',
          time_to:   overlapping.time_to?.slice(0,5)   ?? '',
        })
        setWlChecking(false)
        return
      }

      // Helper: slot time string
      const slotTime = s => `${String(s.start.getHours()).padStart(2,'0')}:${String(s.start.getMinutes()).padStart(2,'0')}`
      const inRange  = s => slotTime(s) >= wlTimeFrom && slotTime(s) < wlTimeTo

      // ── #2: Same staff slots in range ────────────────────────────
      const sameStaff = availableSlots.filter(inRange)

      // ── #3: Other staff slots (only when a specific staff was chosen) ─
      let otherStaff = []
      if (bookingState.staffId && staff.length > 1) {
        const dow       = selectedDate.getDay()
        const bizDay    = hours.find(h => h.day_of_week === dow)
        const otherMembers = staff.filter(s => s.id !== bookingState.staffId)

        // Fetch all day appointments for other staff in one call
        const { data: allDayAppts } = await supabase
          .from('appointments')
          .select('start_at, end_at, staff_id')
          .in('staff_id', otherMembers.map(s => s.id))
          .in('status', ['confirmed'])
          .gte('start_at', dayStart.toISOString())
          .lte('start_at', dayEnd.toISOString())

        otherMembers.forEach(member => {
          const staffDay = member.staff_hours?.find(h => h.day_of_week === dow)
          if (!staffDay?.is_working) return
          const memberAppts = (allDayAppts ?? []).filter(a => a.staff_id === member.id)
          const slots = generateSlots({
            date: selectedDate,
            durationMinutes: bookingState.serviceDuration ?? 30,
            staffHours: staffDay,
            businessHours: bizDay,
            existingAppointments: memberAppts,
            blockedTimes: [],
            recurringBreaks,
          })
          slots.filter(inRange).forEach(s => {
            otherStaff.push({ ...s, staffId: member.id, staffName: member.name })
          })
        })
      }

      if (sameStaff.length > 0 || otherStaff.length > 0) {
        setWlConflict({ sameStaff, otherStaff })
        setWlChecking(false)
        return
      }

      // No conflicts — proceed
      setWlChecking(false)
      await handleJoinWaitlist()
    } catch {
      setWlChecking(false)
      await handleJoinWaitlist()
    }
  }

  async function handleJoinWaitlist() {
    if (!user) return
    setWlSaving(true)
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      await joinWaitlist({
        userId:    user.id,
        serviceId: bookingState.serviceId   ?? null,
        staffId:   bookingState.staffId     ?? null,
        branchId:  bookingState.branchId    ?? null,
        date:      dateStr,
        timeFrom:  wlTimeFrom,
        timeTo:    wlTimeTo,
      })
      setShowWaitlist(false)
      setWlPickerMode('from')
      setWlSuccess({
        date:        format(selectedDate, 'dd.MM.yyyy'),
        timeFrom:    wlTimeFrom,
        timeTo:      wlTimeTo,
        serviceName: bookingState.serviceName ?? '',
      })
    } catch (err) {
      showToast({ message: err.message ?? 'שגיאה', type: 'error' })
    } finally {
      setWlSaving(false)
    }
  }

  async function updateWaitlistEntry() {
    if (!wlExisting) return
    setWlSaving(true)
    try {
      const { error } = await supabase
        .from('waitlist')
        .update({ time_from: wlTimeFrom, time_to: wlTimeTo })
        .eq('id', wlExisting.id)
      if (error) throw error
      setShowWaitlist(false)
      setWlPickerMode('from')
      setWlExisting(null)
      setWlSuccess({
        date:        format(selectedDate, 'dd.MM.yyyy'),
        timeFrom:    wlTimeFrom,
        timeTo:      wlTimeTo,
        serviceName: bookingState.serviceName ?? '',
        updated:     true,
      })
    } catch (err) {
      showToast({ message: err.message ?? 'שגיאה', type: 'error' })
    } finally {
      setWlSaving(false)
    }
  }

  // Date options (next 30 days, excluding closed days + full Shabbat Saturdays)
  const dateOptions = []
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = startOfDay(addDays(new Date(), i))
    const dow = d.getDay()
    const bh = hours.find(h => h.day_of_week === dow)
    if (bh?.is_closed) continue
    if (settings.shabbat_mode && dow === 6) continue
    dateOptions.push(d)
  }

  const shabbatConfig = {
    enabled: settings.shabbat_mode,
    lat: settings.shabbat_lat,
    lng: settings.shabbat_lng,
    offsetMinutes: settings.shabbat_offset_minutes,
  }
  const isSelectedShabbat = isShabbatDay(selectedDate, shabbatConfig)

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: 'var(--color-surface)' }}>
      <div className="container px-4 sm:px-6 max-w-xl mx-auto">
        <BookingProgress currentStep="time" />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-black mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            בחר תאריך ושעה
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {bookingState.serviceName} · {bookingState.staffName ?? 'כל ספר פנוי'}
          </p>
          {(bookingState.groupSize ?? 1) > 1 && (
            <div
              className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: 'rgba(255,122,0,0.10)', color: 'var(--color-gold)', border: '1px solid rgba(255,122,0,0.2)' }}
            >
              👥 קבוצה של {bookingState.groupSize} · {bookingState.groupSize * bookingState.serviceDuration} דקות סה״כ
            </div>
          )}
        </div>

        <button onClick={() => navigate('/book/staff')} className="btn-ghost mb-5 text-sm">
          ← חזרה
        </button>

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
                  className="flex flex-col items-center px-3 py-2.5 font-semibold text-xs transition-all min-w-[58px] border-2"
                  style={{
                    background:   active ? 'var(--color-gold)'   : 'var(--color-card)',
                    borderColor:  active ? 'var(--color-gold)'   : 'var(--color-border)',
                    color:        active ? '#fff'                : 'var(--color-text)',
                    boxShadow:    active ? '0 2px 12px rgba(255,122,0,0.25)' : 'none',
                    borderRadius: 'var(--radius-btn)',
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

        {/* Shabbat notice */}
        {isSelectedShabbat && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(100,90,200,0.08)', color: '#6b5ecc', border: '1.5px solid rgba(100,90,200,0.2)' }}>
            🕍 מקום זה שומר שבת — לא ניתן לקבוע תורים בשעות שבת
          </div>
        )}

        {/* Time Slots */}
        {slotsLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : availableSlots.length === 0 ? (
          <div className="text-center py-12 rounded-2xl" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
            <div className="text-4xl mb-3">📅</div>
            <p className="font-bold" style={{ color: 'var(--color-text)' }}>אין שעות פנויות ביום זה</p>
            <p className="text-sm mt-1 mb-5" style={{ color: 'var(--color-muted)' }}>נסה תאריך אחר</p>

            {settings.waitlist_enabled && (
              user ? (
                <button
                  onClick={() => setShowWaitlist(true)}
                  className="btn-primary text-sm py-2.5 px-5"
                >
                  📋 הוסף לרשימת המתנה
                </button>
              ) : (
                <Link
                  to={`/login?redirect=/book/datetime`}
                  className="btn-ghost text-sm py-2.5 px-5"
                >
                  התחבר להצטרפות לרשימת המתנה
                </Link>
              )
            )}
          </div>
        ) : (
          <>
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
                  className="py-3 px-2 border-2 transition-all text-sm font-bold text-center relative"
                  style={{
                    background:   slot.recommended ? 'rgba(255,122,0,0.08)' : 'var(--color-card)',
                    borderColor:  slot.recommended ? 'var(--color-gold)'    : 'var(--color-border)',
                    color:        'var(--color-text)',
                    borderRadius: 'var(--radius-btn)',
                    transition:   'all var(--ui-transition, 200ms ease)',
                    boxShadow:    slot.recommended ? '0 2px 10px rgba(255,122,0,0.15)' : 'none',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background  = 'var(--color-gold)'
                    e.currentTarget.style.borderColor = 'var(--color-gold)'
                    e.currentTarget.style.color       = '#fff'
                    e.currentTarget.style.boxShadow   = '0 2px 12px rgba(255,122,0,0.25)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background  = slot.recommended ? 'rgba(255,122,0,0.08)' : 'var(--color-card)'
                    e.currentTarget.style.borderColor = slot.recommended ? 'var(--color-gold)'    : 'var(--color-border)'
                    e.currentTarget.style.color       = 'var(--color-text)'
                    e.currentTarget.style.boxShadow   = slot.recommended ? '0 2px 10px rgba(255,122,0,0.15)' : 'none'
                  }}
                >
                  {slot.recommended && (
                    <span className="absolute top-0.5 left-1 text-[8px] leading-none" style={{ color: 'var(--color-gold)' }}>⭐</span>
                  )}
                  {formatTime(slot.start)}
                  {(bookingState.groupSize ?? 1) > 1 && (
                    <div className="text-[9px] font-semibold mt-0.5 leading-none opacity-60">
                      עד {formatTime(new Date(slot.start.getTime() + (bookingState.groupSize ?? 1) * (bookingState.serviceDuration ?? 30) * 60_000))}
                    </div>
                  )}
                  {!bookingState.staffId && (
                    <div className="text-[10px] font-medium mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>
                      {slot.staffName}
                    </div>
                  )}
                </motion.button>
              ))}
            </motion.div>

            {/* Waitlist option — shown even when slots exist */}
            {settings.waitlist_enabled && (
              <div
                className="mt-5 flex items-center justify-between rounded-2xl px-4 py-3"
                style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
              >
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>השעות לא מתאימות לך?</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>הצטרף לרשימת המתנה ונעדכן כשיתפנה תור בשעה שנוחה לך</p>
                </div>
                {user ? (
                  <button
                    onClick={() => setShowWaitlist(true)}
                    className="btn-ghost text-xs py-2 px-3 flex-shrink-0 mr-3"
                    style={{ color: 'var(--color-gold)', border: '1.5px solid var(--color-gold)' }}
                  >
                    📋 הרשם
                  </button>
                ) : (
                  <Link
                    to={`/login?redirect=/book/datetime`}
                    className="btn-ghost text-xs py-2 px-3 flex-shrink-0 mr-3"
                    style={{ color: 'var(--color-gold)', border: '1.5px solid var(--color-gold)' }}
                  >
                    התחבר
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Waitlist Success Overlay */}
      <AnimatePresence>
        {wlSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1,    opacity: 1, y: 0 }}
              exit={{    scale: 0.85, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              className="rounded-3xl w-full max-w-sm text-center overflow-hidden"
              style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
            >
              {/* Top accent */}
              <div className="h-1.5 w-full" style={{ background: 'var(--color-gold)' }} />

              <div className="p-7">
                {/* Animated checkmark */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 320 }}
                  className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
                  style={{ background: 'rgba(255,122,0,0.12)', border: '2px solid var(--color-gold)' }}
                >
                  <span className="text-4xl">📋</span>
                </motion.div>

                <h2 className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
                  {wlSuccess?.updated ? 'ההרשמה עודכנה!' : 'נרשמת לרשימת ההמתנה!'}
                </h2>
                <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>
                  {wlSuccess?.updated ? 'הטווח עודכן — נעדכן אותך ברגע שיתפנה תור' : 'נעדכן אותך ברגע שיתפנה תור'}
                </p>

                {/* Summary card */}
                <div
                  className="rounded-2xl p-4 mb-6 text-right space-y-2"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  {wlSuccess.serviceName && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{wlSuccess.serviceName}</span>
                      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>שירות</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>📅 {wlSuccess.date}</span>
                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>תאריך</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>🕐 {wlSuccess.timeFrom} – {wlSuccess.timeTo}</span>
                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>טווח שעות</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  <Link
                    to="/my-appointments"
                    className="btn-primary w-full justify-center py-3"
                    onClick={() => setWlSuccess(null)}
                  >
                    הצג את התורים שלי
                  </Link>
                  <button
                    onClick={() => setWlSuccess(null)}
                    className="btn-ghost w-full justify-center py-3 text-sm"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    המשך בחירת תאריך
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waitlist Modal */}
      <Modal
        open={showWaitlist}
        onClose={() => { setShowWaitlist(false); setWlPickerMode('from'); setWlConflict(null); setWlExisting(null) }}
        title="📋 הצטרפות לרשימת המתנה"
        size="sm"
      >
        <div className="space-y-4">
          {/* Date — read-only */}
          <div>
            <label className="block text-sm font-bold mb-1" style={{ color: 'var(--color-text)' }}>תאריך</label>
            <div
              className="input flex items-center"
              style={{ color: 'var(--color-muted)', cursor: 'default' }}
            >
              {format(selectedDate, 'dd.MM.yyyy')}
            </div>
          </div>

          {/* Service — read-only */}
          {bookingState.serviceName && (
            <div>
              <label className="block text-sm font-bold mb-1" style={{ color: 'var(--color-text)' }}>שירות</label>
              <div className="input" style={{ color: 'var(--color-muted)', cursor: 'default' }}>
                {bookingState.serviceName}
              </div>
            </div>
          )}

          {/* Time range — two-tab picker */}
          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--color-text)' }}>
              טווח שעות מועדף
            </label>

            {/* Tab selector: FROM / TO */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { key: 'from', label: 'משעה', value: wlTimeFrom },
                { key: 'to',   label: 'עד שעה', value: wlTimeTo  },
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setWlPickerMode(tab.key)}
                  className="flex flex-col items-center py-2.5 rounded-xl transition-all"
                  style={{
                    background:  wlPickerMode === tab.key ? 'var(--color-gold)'            : 'var(--color-surface)',
                    color:       wlPickerMode === tab.key ? '#fff'                          : 'var(--color-text)',
                    border:      `2px solid ${wlPickerMode === tab.key ? 'var(--color-gold)' : 'var(--color-border)'}`,
                    boxShadow:   wlPickerMode === tab.key ? '0 2px 12px rgba(255,122,0,0.2)' : 'none',
                  }}
                >
                  <span className="text-[10px] font-semibold mb-0.5" style={{ opacity: 0.8 }}>{tab.label}</span>
                  <span className="text-lg font-black">{tab.value}</span>
                </button>
              ))}
            </div>

            {/* Time grid — for whichever tab is active */}
            <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto rounded-xl p-2"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              {TIME_OPTIONS.map(t => {
                const isFrom    = t === wlTimeFrom
                const isTo      = t === wlTimeTo
                const inRange   = t > wlTimeFrom && t < wlTimeTo
                const isActive  = wlPickerMode === 'from' ? isFrom : isTo
                const disabled  = wlPickerMode === 'to' && t <= wlTimeFrom

                return (
                  <button
                    key={t}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (wlPickerMode === 'from') {
                        setWlTimeFrom(t)
                        // if "to" is now invalid, push it forward
                        if (wlTimeTo <= t) {
                          const next = TIME_OPTIONS[TIME_OPTIONS.indexOf(t) + 1]
                          if (next) setWlTimeTo(next)
                        }
                      } else {
                        setWlTimeTo(t)
                      }
                    }}
                    className="py-1.5 text-xs font-bold rounded-lg transition-all"
                    style={{
                      background: isActive  ? 'var(--color-gold)'          : inRange ? 'rgba(255,122,0,0.12)' : 'transparent',
                      color:      isActive  ? '#fff'                        : inRange ? 'var(--color-gold)'    : disabled ? 'var(--color-border)' : 'var(--color-text)',
                      border:     `1px solid ${isActive ? 'var(--color-gold)' : inRange ? 'rgba(255,122,0,0.3)' : 'transparent'}`,
                      opacity:    disabled ? 0.35 : 1,
                      cursor:     disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            כאשר יתפנה תור בטווח השעות הזה, תקבל הודעה אוטומטית.
          </p>

          {/* Conflict warning */}
          {wlConflict && (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid var(--color-gold)' }}>
              <div className="px-4 py-3" style={{ background: 'rgba(255,122,0,0.08)' }}>
                <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-gold)' }}>
                  ⚠️ שים לב — יש תורים פנויים בטווח השעות שבחרת!
                </p>
                {wlConflict.sameStaff.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs mb-1.5" style={{ color: 'var(--color-muted)' }}>
                      {bookingState.staffName ? `תורים פנויים עם ${bookingState.staffName}:` : 'תורים פנויים:'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {wlConflict.sameStaff.slice(0,5).map(slot => {
                        const t = `${String(slot.start.getHours()).padStart(2,'0')}:${String(slot.start.getMinutes()).padStart(2,'0')}`
                        return (
                          <button key={t} type="button"
                            onClick={() => { setShowWaitlist(false); selectSlot(slot) }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold"
                            style={{ background: 'var(--color-gold)', color: '#fff' }}
                          >{t} — הזמן עכשיו</button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {wlConflict.otherStaff.length > 0 && (
                  <div>
                    <p className="text-xs mb-1.5" style={{ color: 'var(--color-muted)' }}>תורים פנויים עם ספרים אחרים:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {wlConflict.otherStaff.slice(0,4).map((slot, i) => {
                        const t = `${String(slot.start.getHours()).padStart(2,'0')}:${String(slot.start.getMinutes()).padStart(2,'0')}`
                        return (
                          <button key={i} type="button"
                            onClick={() => { setShowWaitlist(false); selectSlot(slot) }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold"
                            style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                          >{t} · {slot.staffName}</button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => { setWlConflict(null); handleJoinWaitlist() }}
                className="w-full py-2.5 text-xs font-bold text-center transition-all"
                style={{ background: 'var(--color-surface)', color: 'var(--color-muted)', borderTop: '1px solid var(--color-border)' }}
              >
                הבנתי, הוסף לרשימת המתנה בכל זאת ←
              </button>
            </div>
          )}

          {/* Existing registration — update prompt */}
          {wlExisting && !wlConflict && (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid var(--color-border)' }}>
              <div className="px-4 py-3 space-y-2" style={{ background: 'var(--color-surface)' }}>
                <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  📋 כבר נרשמת לרשימת המתנה ליום זה
                </p>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
                  <span>הרשמה קיימת:</span>
                  <span className="font-bold px-2 py-0.5 rounded-lg" style={{ background: 'var(--color-card)', color: 'var(--color-text)' }}>
                    {wlExisting.time_from} – {wlExisting.time_to}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
                  <span>שעות חדשות שבחרת:</span>
                  <span className="font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,122,0,0.12)', color: 'var(--color-gold)' }}>
                    {wlTimeFrom} – {wlTimeTo}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  האם לעדכן את ההרשמה הקיימת לשעות החדשות?
                </p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-x-reverse" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setWlExisting(null)}
                  className="py-2.5 text-sm font-bold transition-all"
                  style={{ color: 'var(--color-muted)' }}
                >
                  ← שנה שעות
                </button>
                <button
                  type="button"
                  onClick={updateWaitlistEntry}
                  disabled={wlSaving}
                  className="py-2.5 text-sm font-bold transition-all"
                  style={{ color: 'var(--color-gold)' }}
                >
                  {wlSaving ? 'מעדכן...' : '✓ עדכן הרשמה'}
                </button>
              </div>
            </div>
          )}

          {!wlConflict && !wlExisting && (
            <button
              onClick={checkThenJoin}
              disabled={wlSaving || wlChecking}
              className="btn-primary w-full justify-center py-3"
            >
              {(wlSaving || wlChecking) ? <><Spinner size="sm" className="border-white border-t-transparent" /> {wlChecking ? 'בודק...' : 'שומר...'}</> : '✅ הצטרף לרשימה'}
            </button>
          )}
        </div>
      </Modal>
    </div>
  )
}
