/**
 * BookCinematic — immersive full-screen booking flow
 * Staff → Service → Date+Time → /book/confirm
 * Slot logic mirrors BookAll.jsx exactly.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { addDays, startOfDay, addMinutes, isToday, isBefore } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { useStaff } from '../../hooks/useStaff'
import { useServices } from '../../hooks/useServices'
import { useAppointments } from '../../hooks/useAppointments'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useRecurringBreaks } from '../../hooks/useRecurringBreaks'
import { generateSlots, formatTime } from '../../lib/utils'
import { supabase } from '../../lib/supabase'

const DAYS_AHEAD = 30

const pageVariants = {
  enter: (dir) => ({ x: dir > 0 ? '55%' : '-55%', opacity: 0, filter: 'blur(6px)' }),
  center: { x: 0, opacity: 1, filter: 'blur(0px)', transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  exit:  (dir) => ({ x: dir > 0 ? '-55%' : '55%', opacity: 0, filter: 'blur(4px)', transition: { duration: 0.25, ease: 'easeIn' } }),
}

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
const fadeUp  = {
  hidden: { opacity: 0, y: 26, scale: 0.96 },
  show:   { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}

export default function BookCinematic() {
  const navigate       = useNavigate()
  const [searchParams] = useSearchParams()
  const { user }       = useAuth()

  const { staff, loading: staffLoading } = useStaff({ activeOnly: true })
  const { services }                     = useServices({ activeOnly: true })
  const { settings, hours }              = useBusinessSettings()
  const { breaks: recurringBreaks }      = useRecurringBreaks()

  const [step, setStep] = useState(0)
  const [dir,  setDir]  = useState(1)

  // undefined = untouched, null = "any staff"
  const [selStaff,   setSelStaff]   = useState(undefined)
  const [selDate,    setSelDate]     = useState(startOfDay(new Date()))
  const [selService, setSelService]  = useState(null)
  const [selSlot,    setSelSlot]     = useState(null)

  const [blockedTimes, setBlockedTimes] = useState([])
  const [slots,        setSlots]        = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  const { appointments } = useAppointments({
    staffId: selStaff?.id || undefined,
    date:    selDate,
  })

  // Pre-select staff from URL param (?staff=ID)
  useEffect(() => {
    const staffId = searchParams.get('staff')
    if (!staffId || !staff.length) return
    const found = staff.find(s => s.id === staffId)
    if (found) setSelStaff(found)
  }, [searchParams, staff])

  // Fetch blocked times
  useEffect(() => {
    if (!selStaff?.id) { setBlockedTimes([]); return }
    const start = new Date(selDate); start.setHours(0, 0, 0, 0)
    const end   = new Date(selDate); end.setHours(23, 59, 59, 999)
    supabase.from('blocked_times').select('*')
      .eq('staff_id', selStaff.id)
      .lte('start_at', end.toISOString())
      .gte('end_at',  start.toISOString())
      .then(({ data }) => setBlockedTimes(data ?? []))
  }, [selStaff, selDate])

  // Generate slots — identical logic to BookAll.jsx
  useEffect(() => {
    if (!selService) { setSlots([]); return }
    setSlotsLoading(true)
    const dow         = selDate.getDay()
    const businessDay = hours.find(h => h.day_of_week === dow)
    const staffToCheck = (selStaff && selStaff !== null) ? [selStaff] : staff
    const allSlots = []
    staffToCheck.forEach(member => {
      const staffDay = member.staff_hours?.find(h => h.day_of_week === dow)
      const appts    = appointments.filter(a => a.staff_id === member.id)
      generateSlots({
        date: selDate, durationMinutes: selService.duration_minutes,
        staffHours: staffDay, businessHours: businessDay,
        existingAppointments: appts, blockedTimes, recurringBreaks,
        smartScheduling: {
          enabled: settings.smart_scheduling_enabled, freeCount: settings.free_slots_count,
          appointmentCount: appts.length, adjacent: settings.smart_adjacent ?? true,
          startOfDay: settings.smart_start_of_day ?? true, endOfDay: settings.smart_end_of_day ?? true,
        },
        shabbatConfig: {
          enabled: settings.shabbat_mode, lat: settings.shabbat_lat,
          lng: settings.shabbat_lng, offsetMinutes: settings.shabbat_offset_minutes,
        },
      }).forEach(slot => {
        if (!allSlots.find(x => x.start.getTime() === slot.start.getTime()))
          allSlots.push({ ...slot, staffId: member.id, staffName: member.name })
      })
    })
    const now = new Date()
    setSlots(allSlots
      .filter(s => isToday(selDate) ? !isBefore(s.start, addMinutes(now, 30)) : true)
      .sort((a, b) => a.start - b.start))
    setSlotsLoading(false)
  }, [selService, selDate, selStaff, appointments, blockedTimes, hours, staff, settings, recurringBreaks])

  // Date options
  const dateOptions = []
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d  = startOfDay(addDays(new Date(), i))
    const bh = hours.find(h => h.day_of_week === d.getDay())
    if (bh?.is_closed) continue
    if (settings.shabbat_mode && d.getDay() === 6) continue
    dateOptions.push(d)
  }

  // Eligible services for selected staff
  const eligibleServices = (selStaff && selStaff !== null)
    ? services.filter(s =>
        selStaff.staff_services?.some(ss => ss.service_id === s.id) &&
        s.booking_type !== 'by_request')
    : services.filter(s => s.booking_type !== 'by_request')

  // ── Auto-advance on selection ──────────────────────────────────────
  // Staff: tap → select → 300ms delay → advance to service
  function handleSelectStaff(m) {
    setSelStaff(m)
    setSelSlot(null)
    setTimeout(() => { setDir(1); setStep(1) }, 300)
  }

  // Service: tap → select → 300ms delay → advance to datetime
  function handleSelectService(svc) {
    setSelService(svc)
    setSelSlot(null)
    setTimeout(() => { setDir(1); setStep(2) }, 300)
  }

  function goBack() { setDir(-1); setStep(s => s - 1) }

  function goConfirm() {
    sessionStorage.setItem('booking_state', JSON.stringify({
      branchId: null, branchName: null,
      serviceId:       selService.id,       serviceName:     selService.name,
      serviceDuration: selService.duration_minutes, servicePrice: selService.price,
      staffId:   selSlot.staffId   ?? selStaff?.id   ?? null,
      staffName: selSlot.staffName ?? selStaff?.name ?? 'כל ספר פנוי',
      slotStart: selSlot.start.toISOString(),
      slotEnd:   selSlot.end.toISOString(),
    }))
    navigate(!user ? '/login?redirect=/book/confirm' : '/book/confirm')
  }

  const bgPhoto = selStaff?.photo_url ?? null

  return (
    // ── Outer container: locked to screen height ──────────────────
    <div dir="rtl" style={{
      height: '100dvh', overflow: 'hidden', position: 'relative', background: '#0d0a07',
    }}>
      {/* Ambient blurred bg photo */}
      <AnimatePresence>
        {bgPhoto && (
          <motion.div key={bgPhoto}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
              backgroundImage: `url(${bgPhoto})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              filter: 'blur(55px) saturate(0.4)', transform: 'scale(1.18)', opacity: 0.15,
            }}
          />
        )}
      </AnimatePresence>
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(160deg, rgba(13,10,7,0.9) 0%, rgba(13,10,7,0.8) 100%)' }} />

      {/* ── Content column ── */}
      <div style={{
        position: 'relative', zIndex: 2,
        height: '100dvh', display: 'flex', flexDirection: 'column', paddingTop: 64,
      }}>
        <StepBar step={step} onBack={step === 0 ? () => navigate(-1) : goBack} />

        {/* Scrollable step area — 160px bottom gap clears toolbar + CTA */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 160 }}>
          <AnimatePresence custom={dir} mode="wait">
            {step === 0 && (
              <motion.div key="staff" custom={dir} variants={pageVariants} initial="enter" animate="center" exit="exit">
                <StepStaff staff={staff} loading={staffLoading} selected={selStaff} onSelect={handleSelectStaff} />
              </motion.div>
            )}
            {step === 1 && (
              <motion.div key="service" custom={dir} variants={pageVariants} initial="enter" animate="center" exit="exit">
                <StepService services={eligibleServices} selected={selService} onSelect={handleSelectService} />
              </motion.div>
            )}
            {step === 2 && (
              <motion.div key="datetime" custom={dir} variants={pageVariants} initial="enter" animate="center" exit="exit">
                <StepDateTime
                  dateOptions={dateOptions} selDate={selDate}
                  onDate={d => { setSelDate(d); setSelSlot(null) }}
                  slots={slots} slotsLoading={slotsLoading}
                  selSlot={selSlot} onSlot={setSelSlot}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── CTA: only on step 2 after slot is chosen, sits above toolbar ── */}
      <AnimatePresence>
        {step === 2 && selSlot && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 28 } }}
            exit={{ y: 80, opacity: 0, transition: { duration: 0.2 } }}
            style={{
              position: 'fixed', zIndex: 55,
              bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))',
              left: 0, right: 0, padding: '10px 20px',
              background: 'linear-gradient(to top, rgba(10,8,5,0.97) 0%, transparent 100%)',
              pointerEvents: 'auto',
            }}
          >
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={goConfirm}
              style={{
                width: '100%', padding: '15px 0', borderRadius: 16, border: 'none',
                background: 'linear-gradient(135deg, var(--color-gold-light, var(--color-gold)), var(--color-gold-dark, var(--color-gold)))',
                color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer',
                letterSpacing: '0.02em', boxShadow: '0 6px 28px rgba(0,0,0,0.4)',
              }}
            >
              לאישור הזמנה ←
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Step bar ─────────────────────────────────────────────────────── */
function StepBar({ step, onBack }) {
  return (
    <div style={{ padding: '0 20px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '50%', width: 38, height: 38, display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </motion.button>

      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
          <motion.div key={i}
            animate={{ width: i === step ? 26 : 7 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            style={{ height: 7, borderRadius: 4, transition: 'background 0.3s',
              background: i === step ? 'var(--color-gold)' : i < step ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.18)' }}
          />
        ))}
      </div>
      <div style={{ width: 38 }} />
    </div>
  )
}

/* ── Step 0: Staff ─────────────────────────────────────────────────── */
function StepStaff({ staff, loading, selected, onSelect }) {
  return (
    <div style={{ padding: '0 20px' }}>
      <StepHeading num={1} title="מי ייטפל בך?" />
      {loading ? <LoadingDots /> : (
        <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Any staff */}
          <motion.button variants={fadeUp} whileTap={{ scale: 0.97 }} onClick={() => onSelect(null)} style={cardStyle(selected === null)}>
            <div style={avatarBox}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="7" r="3" /><path d="M1 21v-1a7 7 0 0114 0v1" />
                <circle cx="17" cy="7" r="3" /><path d="M23 21v-1a7 7 0 00-5.3-6.8" />
              </svg>
            </div>
            <div style={cardText}>
              <p style={cardName}>כל ספר פנוי</p>
              <p style={cardSub}>השעות המוקדמות ביותר</p>
            </div>
            {selected === null && <CheckMark />}
          </motion.button>

          {staff.map(m => (
            <motion.button key={m.id} variants={fadeUp} whileTap={{ scale: 0.97 }} onClick={() => onSelect(m)} style={cardStyle(selected?.id === m.id)}>
              <div style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: '#2a1f0e' }}>
                {m.photo_url
                  ? <img src={m.photo_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 22, color: 'rgba(255,255,255,0.3)' }}>{m.name[0]}</span>
                    </div>
                }
              </div>
              <div style={cardText}>
                <p style={cardName}>{m.name}</p>
                {m.bio && <p style={{ ...cardSub, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{m.bio}</p>}
              </div>
              {selected?.id === m.id && <CheckMark />}
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  )
}

/* ── Step 1: Service ───────────────────────────────────────────────── */
function StepService({ services, selected, onSelect }) {
  return (
    <div style={{ padding: '0 20px' }}>
      <StepHeading num={2} title="איזה שירות?" />
      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {services.map(svc => (
          <motion.button key={svc.id} variants={fadeUp} whileTap={{ scale: 0.97 }} onClick={() => onSelect(svc)} style={cardStyle(selected?.id === svc.id)}>
            <div style={{ ...avatarBox, fontSize: 22, background: 'rgba(255,255,255,0.06)' }}>
              {svcIcon(svc.name)}
            </div>
            <div style={cardText}>
              <p style={cardName}>{svc.name}</p>
              <p style={cardSub}>{svc.duration_minutes} דקות</p>
            </div>
            {svc.price ? <p style={{ color: 'var(--color-gold)', fontWeight: 800, fontSize: 16, margin: 0, flexShrink: 0 }}>₪{svc.price}</p> : null}
            {selected?.id === svc.id && <CheckMark />}
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}

/* ── Step 2: Date + Time ───────────────────────────────────────────── */
function StepDateTime({ dateOptions, selDate, onDate, slots, slotsLoading, selSlot, onSlot }) {
  const HE_DAY = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  const HE_MON = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ']

  return (
    <div>
      <div style={{ padding: '0 20px 18px' }}>
        <StepHeading num={3} title="מתי?" />
      </div>

      {/* Date strip */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.08 } }}
        style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 20px 18px', scrollbarWidth: 'none' }}>
        {dateOptions.map(d => {
          const active = d.toDateString() === selDate.toDateString()
          return (
            <motion.button key={d.toISOString()} whileTap={{ scale: 0.93 }} onClick={() => onDate(d)}
              style={{ flexShrink: 0, width: 54, padding: '10px 0', borderRadius: 14, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: active ? 'var(--color-gold)' : 'rgba(255,255,255,0.06)',
                border: `1.5px solid ${active ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}`,
                transition: 'all 0.2s' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: active ? '#fff' : 'rgba(255,255,255,0.45)' }}>{HE_DAY[d.getDay()]}</span>
              <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, color: '#fff' }}>{d.getDate()}</span>
              <span style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)' }}>{HE_MON[d.getMonth()]}</span>
            </motion.button>
          )
        })}
      </motion.div>

      {/* Slots */}
      <div style={{ padding: '0 20px' }}>
        <AnimatePresence mode="wait">
          {slotsLoading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <LoadingDots />
            </motion.div>
          ) : slots.length === 0 ? (
            <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '40px 0', fontSize: 14 }}>
              אין שעות פנויות בתאריך זה
            </motion.p>
          ) : (
            <motion.div key={selDate.toISOString()}
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } } }}
              initial="hidden" animate="show"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {slots.map((slot, i) => {
                const active = selSlot?.start.getTime() === slot.start.getTime()
                return (
                  <motion.button key={i} whileTap={{ scale: 0.93 }} onClick={() => onSlot(slot)}
                    variants={{ hidden: { opacity: 0, scale: 0.82 }, show: { opacity: 1, scale: 1, transition: { duration: 0.28 } } }}
                    style={{
                      padding: '13px 0', borderRadius: 12, cursor: 'pointer',
                      background: active ? 'var(--color-gold)' : 'rgba(255,255,255,0.06)',
                      border: `1.5px solid ${active ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}`,
                      color: active ? '#fff' : 'rgba(255,255,255,0.8)',
                      fontSize: 14, fontWeight: active ? 800 : 600, transition: 'all 0.18s',
                    }}>
                    {formatTime(slot.start)}
                  </motion.button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ── Shared ────────────────────────────────────────────────────────── */
function StepHeading({ num, title }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.4 } }}
      style={{ marginBottom: 20 }}>
      <p style={{ color: 'var(--color-gold)', fontSize: 11, fontWeight: 700, letterSpacing: '0.22em',
        textTransform: 'uppercase', marginBottom: 6, opacity: 0.85 }}>שלב {num} מתוך 3</p>
      <h2 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>{title}</h2>
      <motion.div initial={{ width: 0 }} animate={{ width: 34, transition: { delay: 0.18, duration: 0.45 } }}
        style={{ height: 2, background: 'var(--color-gold)', borderRadius: 2, marginTop: 8, opacity: 0.7 }} />
    </motion.div>
  )
}

function CheckMark() {
  return (
    <motion.div initial={{ scale: 0 }} animate={{ scale: 1, transition: { type: 'spring', stiffness: 420, damping: 20 } }}
      style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--color-gold)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </motion.div>
  )
}

function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '40px 0' }}>
      {[0, 1, 2].map(i => (
        <motion.div key={i} animate={{ y: [0, -10, 0] }}
          transition={{ duration: 0.7, delay: i * 0.15, repeat: Infinity }}
          style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(212,175,55,0.6)' }} />
      ))}
    </div>
  )
}

/* ── Styles ────────────────────────────────────────────────────────── */
const cardStyle = (active) => ({
  background:   active ? 'var(--color-gold-tint, rgba(212,175,55,0.12))' : 'rgba(255,255,255,0.04)',
  border:       `1.5px solid ${active ? 'var(--color-gold)' : 'rgba(255,255,255,0.08)'}`,
  borderRadius: 16, padding: '12px 16px',
  display: 'flex', alignItems: 'center', gap: 14,
  cursor: 'pointer', textAlign: 'right', width: '100%', transition: 'all 0.22s',
})

const avatarBox = {
  width: 48, height: 48, borderRadius: 14, flexShrink: 0,
  background: 'rgba(212,175,55,0.12)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const cardText = { flex: 1, textAlign: 'right' }
const cardName = { color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }
const cardSub  = { color: 'rgba(255,255,255,0.45)', fontSize: 12, margin: '3px 0 0' }

function svcIcon(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('תספורת') || n.includes('שיער'))  return '✂️'
  if (n.includes('זקן')    || n.includes('גילוח')) return '🪒'
  if (n.includes('צבע')    || n.includes('הברקה')) return '🎨'
  if (n.includes('טיפול'))                          return '💆'
  return '💈'
}
