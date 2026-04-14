/**
 * BookAll — Single-page booking (exact copy of reference app style)
 * Staff → Date → Service → Time all on one scrollable page
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { addDays, startOfDay, isSameDay, addMinutes, isToday, isBefore } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { useStaff } from '../../hooks/useStaff'
import { useServices } from '../../hooks/useServices'
import { useAppointments } from '../../hooks/useAppointments'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useRecurringBreaks } from '../../hooks/useRecurringBreaks'
import { Spinner } from '../../components/ui/Spinner'
import { generateSlots, formatTime, dayName, priceDisplay, isShabbatDay } from '../../lib/utils'
import { supabase } from '../../lib/supabase'

const DAYS_AHEAD = 30

export function BookAll() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  // ── Branch state ──────────────────────────────────────────────────────────
  const [branches,   setBranches]  = useState([])
  const [selBranch,  setSelBranch] = useState(null) // null until loaded

  useEffect(() => {
    supabase.from('branches').select('*').eq('is_active', true).order('name')
      .then(({ data }) => {
        const list = data ?? []
        setBranches(list)
        if (list.length === 1) {
          // Only one branch — auto-select silently
          setSelBranch(list[0])
        }
        // If 0 or 2+ branches: wait for user to pick (or no branch needed)
      })
  }, [])

  const multiBranch = branches.length > 1

  const { staff, loading: staffLoading } = useStaff({
    activeOnly: true,
    branchId: selBranch?.id ?? null,
  })
  const { services, loading: servicesLoading } = useServices({ activeOnly: true })
  const { settings, hours } = useBusinessSettings()
  const { breaks: recurringBreaks } = useRecurringBreaks()

  // initial state: staff not yet chosen (undefined = untouched, null = "any")
  const [selStaff,   setSelStaff]   = useState(undefined)
  const [selDate,    setSelDate]     = useState(startOfDay(new Date()))
  const [selService, setSelService]  = useState(null)
  const [selSlot,    setSelSlot]     = useState(null)

  // Pre-select service from URL param (e.g. /book/all?service=ID)
  useEffect(() => {
    const serviceId = searchParams.get('service')
    if (!serviceId || services.length === 0) return
    const found = services.find(s => s.id === serviceId)
    if (found) setSelService(found)
  }, [searchParams, services])

  // Pre-select staff from URL param (e.g. /book/all?staff=ID)
  useEffect(() => {
    const staffId = searchParams.get('staff')
    if (!staffId || staff.length === 0) return
    const found = staff.find(s => s.id === staffId)
    if (found) setSelStaff(found)
  }, [searchParams, staff])

  const [blockedTimes, setBlockedTimes] = useState([])
  const [slots, setSlots]               = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  const { appointments } = useAppointments({
    staffId: selStaff?.id || undefined,
    date: selDate,
  })

  const dateRef    = useRef(null)
  const serviceRef = useRef(null)
  const timeRef    = useRef(null)
  const bottomRef  = useRef(null)

  // Load blocked times when staff/date changes
  useEffect(() => {
    if (!selStaff?.id) { setBlockedTimes([]); return }
    const start = new Date(selDate); start.setHours(0,0,0,0)
    const end   = new Date(selDate); end.setHours(23,59,59,999)
    supabase.from('blocked_times').select('*')
      .eq('staff_id', selStaff.id)
      .lte('start_at', end.toISOString())
      .gte('end_at', start.toISOString())
      .then(({ data }) => setBlockedTimes(data ?? []))
  }, [selStaff, selDate])

  // Compute slots when service is selected
  useEffect(() => {
    if (!selService) { setSlots([]); return }
    setSlotsLoading(true)

    const dow = selDate.getDay()
    const businessDay = hours.find(h => h.day_of_week === dow)
    const staffToCheck = (selStaff && selStaff !== null) ? [selStaff] : staff

    const allSlots = []
    staffToCheck.forEach(member => {
      const staffDay = member.staff_hours?.find(h => h.day_of_week === dow)
      const appts = appointments.filter(a => a.staff_id === member.id)
      const s = generateSlots({
        date: selDate,
        durationMinutes: selService.duration_minutes,
        staffHours: staffDay,
        businessHours: businessDay,
        existingAppointments: appts,
        blockedTimes,
        recurringBreaks,
        smartScheduling: {
          enabled: settings.smart_scheduling_enabled,
          freeCount: settings.free_slots_count,
          appointmentCount: appts.length,
          adjacent: settings.smart_adjacent ?? true,
          startOfDay: settings.smart_start_of_day ?? true,
          endOfDay: settings.smart_end_of_day ?? true,
        },
        shabbatConfig: {
          enabled: settings.shabbat_mode,
          lat: settings.shabbat_lat,
          lng: settings.shabbat_lng,
          offsetMinutes: settings.shabbat_offset_minutes,
        },
      })
      s.forEach(slot => {
        if (!allSlots.find(x => x.start.getTime() === slot.start.getTime()))
          allSlots.push({ ...slot, staffId: member.id, staffName: member.name })
      })
    })

    const now = new Date()
    setSlots(allSlots.filter(s =>
      isToday(selDate) ? !isBefore(s.start, addMinutes(now, 30)) : true
    ).sort((a, b) => a.start - b.start))
    setSlotsLoading(false)
  }, [selService, selDate, selStaff, appointments, blockedTimes, hours, staff, settings])

  function scrollTo(ref) {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
  }

  function pickStaff(member) {
    setSelStaff(member)   // null = "any"
    setSelSlot(null)
    scrollTo(dateRef)
  }

  function pickDate(d) {
    setSelDate(d)
    setSelSlot(null)
    if (!selService) scrollTo(serviceRef)
    else scrollTo(timeRef)
  }

  function pickService(svc) {
    setSelService(svc)
    setSelSlot(null)
    scrollTo(timeRef)
  }

  function pickSlot(slot) {
    setSelSlot(slot)
    scrollTo(bottomRef)
  }

  function goConfirm() {
    const state = {
      branchId:        selBranch?.id ?? null,
      branchName:      selBranch?.name ?? null,
      serviceId:       selService.id,
      serviceName:     selService.name,
      serviceDuration: selService.duration_minutes,
      servicePrice:    selService.price,
      staffId:         selSlot.staffId ?? selStaff?.id ?? null,
      staffName:       selSlot.staffName ?? selStaff?.name ?? 'כל ספר פנוי',
      slotStart:       selSlot.start.toISOString(),
      slotEnd:         selSlot.end.toISOString(),
    }
    sessionStorage.setItem('booking_state', JSON.stringify(state))
    navigate(!user ? '/login?redirect=/book/confirm' : '/book/confirm')
  }

  // Build shabbat config from settings
  const shabbatConfig = {
    enabled: settings.shabbat_mode,
    lat: settings.shabbat_lat,
    lng: settings.shabbat_lng,
    offsetMinutes: settings.shabbat_offset_minutes,
  }

  // Date options (exclude closed days and full Shabbat days)
  const dateOptions = []
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = startOfDay(addDays(new Date(), i))
    const bh = hours.find(h => h.day_of_week === d.getDay())
    if (bh?.is_closed) continue
    // Exclude full-Shabbat days (Saturday when shabbat mode is on)
    if (settings.shabbat_mode && d.getDay() === 6) continue
    dateOptions.push(d)
  }

  // Is the selected date within any Shabbat period (e.g., Friday evening)?
  const selDateIsShabbat = isShabbatDay(selDate, shabbatConfig)

  const allEligible = (selStaff && selStaff !== null)
    ? services.filter(svc => selStaff.staff_services?.some(ss => ss.service_id === svc.id))
    : services
  const eligibleServices = allEligible.filter(svc => svc.booking_type !== 'by_request')
  const byRequestServices = allEligible.filter(svc => svc.booking_type === 'by_request')

  return (
    <div className="min-h-screen pb-36" style={{ background: 'var(--color-surface)' }}>

      {/* ── Top spacer for fixed navbar ── */}
      <div className="h-16" />

      {/* ── Page heading ── */}
      <div className="px-5 pt-4 pb-2">
        <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', letterSpacing: '-0.03em' }}>
          הזמנת תור
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
          בחר ספר, יום, טיפול ושעה
        </p>
      </div>

      {/* ══ BRANCH (only when 2+ branches) ═══════════════════════ */}
      {multiBranch && (
        <>
          <div className="px-5 pt-5 pb-4">
            <SectionLabel>בחר סניף</SectionLabel>
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-5 px-5" style={{ scrollbarWidth: 'none' }}>
              {branches.map(branch => (
                <button
                  key={branch.id}
                  onClick={() => {
                    setSelBranch(branch)
                    setSelStaff(undefined) // reset staff when branch changes
                    setSelSlot(null)
                  }}
                  className="flex-shrink-0 flex flex-col items-start transition-all"
                  style={{
                    padding:      '10px 18px',
                    borderRadius: '16px',
                    background:   selBranch?.id === branch.id ? 'var(--color-gold)' : '#f2f2f2',
                    color:        selBranch?.id === branch.id ? '#fff' : 'var(--color-text)',
                    fontWeight:   700,
                    fontSize:     '14px',
                    border:       'none',
                    cursor:       'pointer',
                    boxShadow:    selBranch?.id === branch.id ? '0 3px 12px rgba(255,133,0,0.35)' : 'none',
                    transition:   'all 0.15s ease',
                    minWidth:     '120px',
                    textAlign:    'right',
                  }}
                >
                  <span>📍 {branch.name}</span>
                  {branch.address && (
                    <span style={{ fontSize: '11px', opacity: 0.75, fontWeight: 500, marginTop: '2px' }}>
                      {branch.address}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <Divider />
        </>
      )}

      {/* ══ STAFF ══════════════════════════════════════════════════ */}
      <div className="px-5 pt-5 pb-4">
        <SectionLabel>בחר איש צוות</SectionLabel>
        {multiBranch && !selBranch ? (
          <p className="text-sm py-2" style={{ color: 'var(--color-muted)' }}>בחר סניף תחילה ↑</p>
        ) : staffLoading ? <MiniSpinner /> : (
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-5 px-5" style={{ scrollbarWidth: 'none' }}>
            {/* Any */}
            <Pill
              active={selStaff === null}
              onClick={() => pickStaff(null)}
            >
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0"
                style={{
                  background: selStaff === null ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.08)',
                }}
              >✂</span>
              <span>כל ספר</span>
            </Pill>

            {staff.map(m => (
              <Pill
                key={m.id}
                active={selStaff?.id === m.id}
                onClick={() => pickStaff(m)}
              >
                {m.photo_url ? (
                  <img src={m.photo_url} alt={m.name}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                    style={{
                      background: selStaff?.id === m.id ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)',
                      color: selStaff?.id === m.id ? '#fff' : 'var(--color-text)',
                    }}
                  >{m.name[0]}</span>
                )}
                <span>{m.name}</span>
              </Pill>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* ══ DATE ═══════════════════════════════════════════════════ */}
      <div className="px-5 pt-4 pb-4" ref={dateRef}>
        <SectionLabel>בחר יום</SectionLabel>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5" style={{ scrollbarWidth: 'none' }}>
          {dateOptions.map(d => {
            const active = isSameDay(d, selDate)
            const today  = isToday(d)
            return (
              <button
                key={d.toISOString()}
                onClick={() => pickDate(d)}
                className="flex-shrink-0 flex flex-col items-center justify-center rounded-2xl transition-all"
                style={{
                  minWidth:    '64px',
                  padding:     '10px 8px',
                  background:  active ? 'var(--color-gold)' : '#f2f2f2',
                  color:       active ? '#fff' : 'var(--color-text)',
                  boxShadow:   active ? '0 3px 12px rgba(255,133,0,0.35)' : 'none',
                  border:      'none',
                  cursor:      'pointer',
                }}
              >
                <span style={{ fontSize: '10px', fontWeight: 600, opacity: active ? 0.85 : 0.5, letterSpacing: '0.02em' }}>
                  {today ? 'היום' : dayName(d.getDay())}
                </span>
                <span style={{ fontSize: '22px', fontWeight: 900, lineHeight: 1.1 }}>
                  {d.getDate()}
                </span>
                <span style={{ fontSize: '10px', opacity: active ? 0.75 : 0.45 }}>
                  {d.toLocaleDateString('he-IL', { month: 'short' })}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <Divider />

      {/* ══ SERVICE ════════════════════════════════════════════════ */}
      <div className="px-5 pt-4 pb-4" ref={serviceRef}>
        <SectionLabel>בחר טיפול</SectionLabel>
        {servicesLoading ? <MiniSpinner /> : (
          <>
            <div className="flex flex-wrap gap-2.5">
              {eligibleServices.map(svc => {
                const active = selService?.id === svc.id
                return (
                  <button
                    key={svc.id}
                    onClick={() => pickService(svc)}
                    className="relative flex items-center gap-2 transition-all"
                    style={{
                      padding:    '10px 18px',
                      borderRadius: '999px',
                      background: active ? 'var(--color-gold)' : '#f2f2f2',
                      color:      active ? '#fff' : 'var(--color-text)',
                      fontWeight: 700,
                      fontSize:   '14px',
                      border:     'none',
                      cursor:     'pointer',
                      boxShadow:  active ? '0 3px 12px rgba(255,133,0,0.35)' : 'none',
                    }}
                  >
                    <span>{svc.name}</span>
                    {svc.price > 0 && (
                      <span style={{ opacity: 0.75, fontSize: '12px' }}>
                        ₪{svc.price}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {byRequestServices.length > 0 && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-xs mb-2 font-medium" style={{ color: 'var(--color-muted)' }}>
                  🔒 שירותים בתיאום מראש בלבד — צור קשר לקביעת תור
                </p>
                <div className="flex flex-wrap gap-2">
                  {byRequestServices.map(svc => (
                    <a
                      key={svc.id}
                      href={settings?.phone ? `tel:${settings.phone}` : '#'}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold"
                      style={{
                        background: 'rgba(255,133,0,0.10)',
                        color: 'var(--color-primary)',
                        border: '1.5px solid var(--color-primary)',
                        textDecoration: 'none',
                      }}
                    >
                      📞 {svc.name}
                      {svc.price > 0 && <span style={{ opacity: 0.75, fontSize: '11px' }}>₪{svc.price}</span>}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Divider />

      {/* ══ TIME ═══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selService && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pt-4 pb-4" ref={timeRef}>
              <SectionLabel>בחר תור</SectionLabel>
              {settings.shabbat_mode && selDateIsShabbat && (
                <div className="mb-3 px-4 py-3 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(100,90,200,0.08)', color: '#6b5ecc', border: '1.5px solid rgba(100,90,200,0.2)' }}>
                  🕍 מקום זה שומר שבת — לא ניתן לקבוע תורים בשעות שבת
                </div>
              )}
              {slotsLoading ? <MiniSpinner /> : slots.length === 0 ? (
                <p className="text-sm py-2" style={{ color: 'var(--color-muted)' }}>
                  אין שעות פנויות — נסה תאריך אחר
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map(slot => {
                    const active = selSlot?.start.getTime() === slot.start.getTime()
                    return (
                      <button
                        key={slot.start.toISOString()}
                        onClick={() => pickSlot(slot)}
                        style={{
                          padding:      '9px 18px',
                          borderRadius: '999px',
                          background:   active ? 'var(--color-gold)' : '#f2f2f2',
                          color:        active ? '#fff' : 'var(--color-text)',
                          fontWeight:   700,
                          fontSize:     '14px',
                          border:       'none',
                          cursor:       'pointer',
                          boxShadow:    active ? '0 3px 12px rgba(255,133,0,0.35)' : 'none',
                          transition:   'all 0.15s ease',
                        }}
                      >
                        {formatTime(slot.start)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <Divider />
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={bottomRef} />

      {/* ══ STICKY CONFIRM ═════════════════════════════════════════ */}
      <AnimatePresence>
        {selSlot && selService && (!multiBranch || selBranch) && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0,   opacity: 1 }}
            exit={  { y: 120, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 right-0 left-0 z-30"
            style={{
              background: '#fff',
              borderTop: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.08)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <div className="max-w-lg mx-auto px-5 py-4">
              {/* Mini summary row */}
              <div className="flex items-center justify-between mb-3">
                <div style={{ fontSize: '13px', color: '#888' }}>
                  {selService.name} · {formatTime(selSlot.start)}
                  {selService.duration_minutes && (
                    <span> · ⏱ {selService.duration_minutes} דק׳</span>
                  )}
                </div>
                {selService.price > 0 && (
                  <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--color-gold)' }}>
                    ₪{selService.price}
                  </div>
                )}
              </div>
              <button
                onClick={goConfirm}
                style={{
                  width: '100%',
                  padding: '15px',
                  borderRadius: '999px',
                  background: 'var(--color-gold)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '16px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(255,133,0,0.4)',
                  letterSpacing: '-0.01em',
                }}
              >
                קבע תור →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Helpers ────────────────────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <p style={{
      fontSize: '11px',
      fontWeight: 700,
      color: '#aaa',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      marginBottom: '12px',
    }}>
      {children}
    </p>
  )
}

function Divider() {
  return (
    <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', margin: '0 20px' }} />
  )
}

function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 flex items-center gap-2 transition-all"
      style={{
        padding:      '9px 16px 9px 10px',
        borderRadius: '999px',
        background:   active ? 'var(--color-gold)' : '#f2f2f2',
        color:        active ? '#fff' : '#1a1a1a',
        fontWeight:   700,
        fontSize:     '14px',
        border:       'none',
        cursor:       'pointer',
        whiteSpace:   'nowrap',
        boxShadow:    active ? '0 3px 12px rgba(255,133,0,0.35)' : 'none',
        transition:   'all 0.15s ease',
      }}
    >
      {children}
    </button>
  )
}

function MiniSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
      <Spinner size="sm" />
    </div>
  )
}
