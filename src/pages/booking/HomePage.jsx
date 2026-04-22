import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BUSINESS } from '../../config/business'
import { useServices } from '../../hooks/useServices'
import { useStaff } from '../../hooks/useStaff'
import { useReviews } from '../../hooks/useReviews'
import { useProducts } from '../../hooks/useProducts'
import { useStaffPortfolio } from '../../hooks/useStaffPortfolio'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useBusinessGallery } from '../../hooks/useBusinessGallery'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { minutesToDisplay, priceDisplay } from '../../lib/utils'

function getServiceIcon(name = '') {
  const n = name
  const p = { width:20, height:20, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.8, strokeLinecap:'round', strokeLinejoin:'round' }
  if (n.includes('ילד') || n.includes('קטן') || n.includes('נוער'))
    return <svg {...p}><circle cx="12" cy="6" r="3"/><path d="M12 9v7M9 12h6M9 21l3-5 3 5"/></svg>
  if (n.includes('זקן') || n.includes('גילוח') || n.includes('ריש'))
    return <svg {...p}><rect x="8" y="3" width="8" height="5" rx="1"/><path d="M8 8l-2 13h12L16 8"/><line x1="10" y1="12" x2="14" y2="12"/><line x1="10" y1="15" x2="14" y2="15"/></svg>
  if (n.includes('צבע') || n.includes('צביעה') || n.includes('בלונד'))
    return <svg {...p}><path d="M12 22a7 7 0 007-7c0-2-1-3.9-3-5.5S13.5 5.5 13 3c-.5 2.5-2 4.9-4 6.5C7 11.1 5 13 5 15a7 7 0 007 7z"/></svg>
  if (n.includes('שמן') || n.includes('טיפול') || n.includes('מסכ'))
    return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/></svg>
  if (n.includes('פייד') || n.includes('מוהוק') || n.includes('דגרד'))
    return <svg {...p}><path d="M12 3C7 3 3 7.03 3 12s4 9 9 9 9-4.03 9-9"/><path d="M16 12a4 4 0 00-8 0"/><line x1="20" y1="3" x2="20" y2="9"/><line x1="17" y1="6" x2="23" y2="6"/></svg>
  // Default — scissors
  return <svg {...p}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
}
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'
import { he } from 'date-fns/locale/he'


const FAN_ANGLES = {
  1: [0],
  2: [-25, 25],
  3: [-25, 0, 25],
  4: [-37, -12, 12, 37],
  5: [-45, -22, 0, 22, 45],
}

const LB_BTN = {
  background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%',
  width: 48, height: 48, color: '#fff', fontSize: 22, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
}

function FanGallery({ items }) {
  const stageRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState(null)
  const [dir, setDir] = useState(0)
  const touchStartX = useRef(null)
  const scrollYRef = useRef(0)

  // Body scroll lock — iOS Safari fix (same pattern as Modal.jsx)
  useEffect(() => {
    if (lightboxIdx !== null) {
      scrollYRef.current = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollYRef.current}px`
      document.body.style.width = '100%'
    } else {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollYRef.current)
    }
    return () => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
    }
  }, [lightboxIdx])

  useEffect(() => {
    if (!stageRef.current) return
    const el = stageRef.current
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setTimeout(() => setOpen(true), 350)
        io.unobserve(el)
      }
    }, { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const cards = items.slice(0, 5)
  const n = cards.length
  const centerIdx = Math.floor(n / 2)
  const angles = FAN_ANGLES[n] ?? FAN_ANGLES[5]

  function navigate(delta) {
    setDir(delta)
    setLightboxIdx(i => ((i + delta) + n) % n)
  }

  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return
    const dx = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(dx) > 40) navigate(dx > 0 ? 1 : -1)
    touchStartX.current = null
  }

  return (
    <>
      <div className="v6-fan-wrap">
        <div ref={stageRef} className="v6-fan-stage" onClick={() => setOpen(o => !o)}>
          {cards.map((item, i) => {
            const angle = open ? angles[i] : 0
            const isCenter = open && i === centerIdx
            const zIdx = open ? (centerIdx + 1) - Math.abs(i - centerIdx) : n - i
            return (
              <motion.div
                key={item.id ?? i}
                className="v6-fan-card"
                style={{ transformOrigin: 'bottom center', zIndex: zIdx,
                  boxShadow: isCenter
                    ? '0 16px 48px rgba(0,0,0,.55), 0 4px 16px rgba(0,0,0,.30)'
                    : '0 8px 32px rgba(0,0,0,.35), 0 2px 8px rgba(0,0,0,.18)'
                }}
                animate={{ x: '-50%', rotate: angle, scale: isCenter ? 1.06 : 1 }}
                transition={{ type: 'spring', stiffness: 180, damping: 22, delay: open ? i * 0.055 : 0 }}
                onClick={open ? e => { e.stopPropagation(); setDir(0); setLightboxIdx(i) } : undefined}
              >
                <img className="v6-fan-img" src={item.url} alt={item.caption || ''} loading="lazy" />
                <div className="v6-fan-overlay">
                  <span className="v6-fan-lbl">{item.caption || ''}</span>
                </div>
              </motion.div>
            )
          })}
        </div>
        <p className="v6-fan-hint">{open ? 'לחץ על תמונה לפתיחה' : 'לחץ לפתיחת הגלריה'}</p>
      </div>

      {createPortal(
        <AnimatePresence>
          {lightboxIdx !== null && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setLightboxIdx(null)}
              onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {/* Close */}
              <button onClick={e => { e.stopPropagation(); setLightboxIdx(null) }}
                style={{ ...LB_BTN, position: 'absolute', top: 16, right: 16 }}>✕</button>

              {/* Nav row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', justifyContent: 'center' }}
                onClick={e => e.stopPropagation()}>
                {n > 1 && <button style={LB_BTN} onClick={() => navigate(-1)}>→</button>}

                <AnimatePresence mode="wait" custom={dir}>
                  <motion.img
                    key={lightboxIdx}
                    src={cards[lightboxIdx]?.url}
                    alt={cards[lightboxIdx]?.caption || ''}
                    custom={dir}
                    variants={{
                      enter: d => ({ opacity: 0, x: d * 80 }),
                      center: { opacity: 1, x: 0 },
                      exit: d => ({ opacity: 0, x: d * -80 }),
                    }}
                    initial="enter" animate="center" exit="exit"
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    style={{ maxWidth: '80vw', maxHeight: '74vh', objectFit: 'contain',
                      borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', flexShrink: 0 }}
                  />
                </AnimatePresence>

                {n > 1 && <button style={LB_BTN} onClick={() => navigate(1)}>←</button>}
              </div>

              {/* Caption + counter */}
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                onClick={e => e.stopPropagation()}>
                {cards[lightboxIdx]?.caption && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                    {cards[lightboxIdx].caption}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em' }}>
                  {lightboxIdx + 1} / {n}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

function StaffVideoCard({ member, portfolioMode }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!member.video_url || !videoRef.current || !containerRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          videoRef.current?.play().catch(() => {})
        } else {
          if (videoRef.current) {
            videoRef.current.pause()
            videoRef.current.currentTime = 0
          }
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [member.video_url])

  return (
    <div ref={containerRef} className="relative h-72 bg-gray-100 overflow-hidden">
      {member.video_url ? (
        <motion.video
          ref={videoRef}
          src={member.video_url}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          muted
          loop
          playsInline
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        />
      ) : member.photo_url ? (
        <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(201,169,110,0.15), rgba(201,169,110,0.05))' }}>
          <span className="text-7xl font-black" style={{ color: 'var(--color-gold)', opacity: 0.4 }}>{member.name[0]}</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-28" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }} />
      <div className="absolute bottom-4 right-4 left-4">
        <h3 className="text-sm font-black text-white leading-tight">{member.name}</h3>
        {member.bio && <p className="text-[11px] text-white/60 mt-1 line-clamp-1">{member.bio}</p>}
        <div className="w-6 h-0.5 rounded-full mt-2" style={{ background: 'var(--color-gold)' }} />
      </div>
      {portfolioMode === 'story' && (
        <div className="absolute top-3 right-3 left-3 flex gap-0.5">
          {[...Array(Math.min(5, 3))].map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full bg-white/50" />
          ))}
        </div>
      )}
    </div>
  )
}

function TeamVideoMedia({ member }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  useEffect(() => {
    if (!member.video_url || !videoRef.current || !containerRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) videoRef.current?.play().catch(() => {})
        else { if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0 } }
      },
      { threshold: 0.5 }
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [member.video_url])
  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      <video
        ref={videoRef}
        src={member.video_url}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        muted loop playsInline
      />
    </div>
  )
}

function TeamCardMedia({ member }) {
  const [landscape, setLandscape] = useState(false)
  return (
    <div style={{ position: 'relative', aspectRatio: landscape ? '4/3' : '4/5', minHeight: 180, overflow: 'hidden', background: 'linear-gradient(145deg,#ede0c8,#c8a87c)' }}>
      {member.video_url ? (
        <TeamVideoMedia member={member} />
      ) : member.photo_url ? (
        <img
          src={member.photo_url}
          alt={member.name}
          onLoad={e => { if (e.target.naturalWidth > e.target.naturalHeight) setLandscape(true) }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .65s cubic-bezier(.22,1,.36,1)' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 68, fontWeight: 900, color: 'var(--color-gold)', opacity: 0.15 }}>{member.name[0]}</span>
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 40%,rgba(0,0,0,0.68) 100%)', zIndex: 2 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '11px 13px 13px', zIndex: 3 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.35)' }}>{member.name}</div>
        {member.bio && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.60)', marginTop: 1 }}>{member.bio}</div>}
      </div>
      <div style={{ position: 'absolute', top: 9, right: 9, zIndex: 5, background: 'rgba(255,255,255,0.92)', color: 'var(--color-gold)', fontWeight: 600, fontSize: 10.5, padding: '5px 12px', borderRadius: 9999, boxShadow: '0 2px 10px rgba(0,0,0,0.14)' }}>
        קבע תור
      </div>
    </div>
  )
}

export function HomePage() {
  const { services, loading: servicesLoading } = useServices({ activeOnly: true })
  const { staff, loading: staffLoading } = useStaff({ activeOnly: true })
  const { reviews } = useReviews()
  const { products: featuredProducts } = useProducts({ activeOnly: true, featuredOnly: true })
  const { settings } = useBusinessSettings()
  const { items: galleryItems } = useBusinessGallery()
  const { user, profile } = useAuth()
  const { theme, layout, isDark } = useTheme()
  const showToast = useToast()
  const confirm = useConfirm()

  // Upcoming appointment — direct query so it's always fresh and never blocked by hook re-fetch timing
  const [nextAppointment, setNextAppointment] = useState(undefined) // undefined = loading, null = none
  const [calAdded, setCalAdded] = useState(false)
  const [cancellingAppt, setCancellingAppt] = useState(false)

  useEffect(() => {
    if (!user) { setNextAppointment(null); return }
    setNextAppointment(undefined) // loading
    supabase
      .from('appointments')
      .select('*, services ( id, name, duration_minutes, price ), staff ( id, name, photo_url )')
      .eq('customer_id', user.id)
      .in('status', ['confirmed', 'pending_reschedule'])
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(1)
      .then(({ data, error }) => {
        console.log('[HomePage] next appt query →', { data, error, userId: user.id })
        setNextAppointment(data?.[0] ?? null)
      })
  }, [user?.id])

  // ── Add to calendar ────────────────────────────────────────────────
  function buildICS(appt) {
    const start = new Date(appt.start_at)
    const end   = appt.end_at
      ? new Date(appt.end_at)
      : new Date(start.getTime() + (appt.services?.duration_minutes || 60) * 60_000)
    const fmt   = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const service = appt.services?.name || 'תור'
    const staff   = appt.staff?.name ? ` עם ${appt.staff.name}` : ''
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//HAJAJ Hair Design//Booking//HE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:appt-${appt.id}@hajaj`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${service}${staff} — ${BUSINESS.name}`,
      `DESCRIPTION:${service}${staff}`,
      BUSINESS.address ? `LOCATION:${BUSINESS.address}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n')
  }

  function handleAddToCalendar() {
    const blob = new Blob([buildICS(nextAppointment)], { type: 'text/calendar;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'תור.ics'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setCalAdded(true)
    showToast({ message: 'תזכורת נוספה ליומן', type: 'success', duration: 3000 })
    setTimeout(() => setCalAdded(false), 3000)
  }

  async function handleCancelAppointment() {
    if (!nextAppointment) return
    if (!await confirm({ title: 'ביטול תור', description: 'האם אתה בטוח שברצונך לבטל את התור?', variant: 'destructive', confirmLabel: 'בטל תור' })) return
    setCancellingAppt(true)
    try {
      await supabase
        .from('appointments')
        .update({ status: 'cancelled', cancelled_by: 'customer' })
        .eq('id', nextAppointment.id)
      setNextAppointment(null)
      showToast({ message: 'התור בוטל בהצלחה', type: 'success' })
    } catch {
      showToast({ message: 'שגיאה בביטול התור', type: 'error' })
    }
    setCancellingAppt(false)
  }

  const [portfolioMember, setPortfolioMember] = useState(null)
  const heroVideoRef = useRef(null)

  // Hero parallax — fade + slide up as page scrolls
  useEffect(() => {
    const root = document.getElementById('root')
    const target = root ?? window
    const handle = () => {
      const y = root ? root.scrollTop : window.scrollY
      const brand = document.getElementById('v6-hero-brand')
      if (brand) {
        brand.style.opacity = Math.max(0, 1 - y / 190)
        brand.style.transform = `translateY(${y * -0.12}px)`
      }
    }
    target.addEventListener('scroll', handle, { passive: true })
    return () => target.removeEventListener('scroll', handle)
  }, [])

  // hero source: prefer DB → localStorage → BUSINESS config → gradient
  const heroType = settings?.hero_type
    || localStorage.getItem('hero_type')
    || BUSINESS.heroType
    || 'gradient'
  const heroSrc  = settings?.hero_image_url
    || localStorage.getItem('hero_image_url')
    || BUSINESS.heroSrc
    || null
  const logoUrl  = settings?.logo_url || null

  // Force hero video play on mobile (some browsers block autoplay)
  useEffect(() => {
    const v = heroVideoRef.current
    if (!v || heroType !== 'video') return
    v.muted = true // ensure muted (required for autoplay)
    const tryPlay = () => v.play().catch(() => {})
    tryPlay()
    // Also retry on user first interaction (covers strict browsers)
    const handler = () => { tryPlay(); window.removeEventListener('touchstart', handler) }
    window.addEventListener('touchstart', handler, { once: true, passive: true })
    return () => window.removeEventListener('touchstart', handler)
  }, [heroType, heroSrc])

  // portfolio display mode: 'grid' | 'story'
  const portfolioMode = settings?.portfolio_view_mode
    || localStorage.getItem('portfolio_view_mode')
    || 'grid'

  // booking flow: 'multistep' | 'all-in-one'
  const bookingFlow = settings?.booking_flow
    || localStorage.getItem('booking_flow')
    || 'multistep'
  // Always start at branch selection — SelectBranch auto-skips if only 1 branch
  const bookHref = bookingFlow === 'all-in-one' ? '/book/all' : '/book/branch'

  // (layout / floating vars kept for potential future use — not used in v6 layout)
  // eslint-disable-next-line no-unused-vars
  const isGlass = layout === 'glass'

  // Service card link — always start at branch, pass serviceId via branch → service nav
  function serviceHref(serviceId) {
    return bookingFlow === 'all-in-one'
      ? `/book/all?service=${serviceId}`
      : `/book/branch?service=${serviceId}`
  }

  // ── v6 glass panel style ──────────────────────────────────────────
  const glassPanel = isDark
    ? {
        position: 'relative', zIndex: 10, marginTop: -32,
        borderRadius: '26px 26px 0 0',
        background: 'rgba(18,14,10,0.92)',
        backdropFilter: 'blur(36px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(36px) saturate(1.8)',
        borderTop: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 -2px 0 rgba(255,255,255,0.06), 0 -12px 40px rgba(0,0,0,0.40)',
        minHeight: '60vh',
      }
    : {
        position: 'relative', zIndex: 10, marginTop: -32,
        borderRadius: '26px 26px 0 0',
        background: 'rgba(243,240,234,1)',
        backdropFilter: 'blur(36px) saturate(2.0)',
        WebkitBackdropFilter: 'blur(36px) saturate(2.0)',
        borderTop: 'none',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.06)',
        minHeight: '60vh',
      }

  return (
    <div style={{ position: 'relative' }}>
      {/* ── HERO — always sticky, v6 style ────────────────────────── */}
      <section
        className="hero-section"
        style={{
          position: 'sticky', top: 0, zIndex: 0,
          height: '60vh', minHeight: 320, maxHeight: 440,
          overflow: 'hidden',
          background: '#0a0806',
        }}
      >
        {/* Media background */}
        <div className="absolute inset-0">
          {heroType === 'video' && heroSrc ? (
            <video
              ref={heroVideoRef}
              className="absolute inset-0 w-full h-full object-cover"
              src={heroSrc}
              style={{ filter: 'brightness(.52) saturate(1.3)' }}
              autoPlay muted loop playsInline controls={false} preload="auto"
              onCanPlay={e => e.target.play().catch(() => {})}
            />
          ) : heroType === 'image' && heroSrc ? (
            <img className="absolute inset-0 w-full h-full object-cover" src={heroSrc} alt="hero"
              style={{ filter: 'brightness(.65) saturate(1.2)' }} />
          ) : (
            <div className="absolute inset-0" style={{
              background: 'radial-gradient(ellipse 75% 55% at 60% 18%,rgba(255,95,0,.38) 0%,transparent 58%),' +
                'radial-gradient(ellipse 50% 70% at 22% 84%,rgba(180,40,0,.18) 0%,transparent 58%),' +
                'linear-gradient(168deg,#1c0d00 0%,#0f0904 50%,#190900 100%)'
            }} />
          )}
          {/* Top dark bar only — no bottom darkening so the surface fade is clean */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'linear-gradient(180deg,rgba(0,0,0,.52) 0%,transparent 26%)'
          }} />
          {/* Surface fade — grows from transparent to solid surface color over 72px,
              matching the glass panel exactly so there is zero visible seam */}
          <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{
            height: 72,
            background: isDark
              ? 'linear-gradient(to top, rgba(18,14,10,1) 0%, rgba(18,14,10,0.55) 45%, transparent 100%)'
              : 'linear-gradient(to top, rgba(243,240,234,1) 0%, rgba(243,240,234,0.55) 45%, transparent 100%)',
            zIndex: 3,
          }} />
        </div>

        {/* Scroll indicator */}
        <div className="v6-scroll-ind">
          <div className="v6-scroll-ind-line" />
          <span>גלול</span>
        </div>

        {/* Hero brand */}
        <div id="v6-hero-brand" className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ zIndex: 5, paddingBottom: 24 }}>
          {/* Eyebrow */}
          <motion.p
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.5 }}
            style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.50)', marginBottom: 12 }}
          >
            HAIR DESIGN STUDIO
          </motion.p>

          {/* Business name */}
          <motion.h1
            initial={{ opacity: 0, y: 12, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: 0.32, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontSize: 'clamp(1.9rem, 8vw, 2.8rem)', fontWeight: 900,
              lineHeight: 1.05, letterSpacing: '-0.03em',
              color: '#fff', textAlign: 'center',
              textShadow: '0 2px 20px rgba(0,0,0,0.45)',
            }}
          >
            {settings?.hero_title || BUSINESS.name}
          </motion.h1>

          {/* Gold rule */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 1.0, duration: 0.5 }}
            style={{ width: 32, height: 1.5, borderRadius: 1, background: 'var(--color-gold)', marginTop: 14, boxShadow: '0 0 8px rgba(255,122,0,0.35)' }}
          />

          {/* Tagline */}
          {(settings?.hero_tagline || 'Look Sharp · Feel Sharp') && (
            <motion.p
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.25, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em', marginTop: 14, textAlign: 'center' }}
            >
              {settings?.hero_tagline || 'Look Sharp · Feel Sharp'}
            </motion.p>
          )}
        </div>
      </section>

      {/* ── GLASS PANEL — slides over hero ────────────────────────── */}
      <div style={glassPanel}>
        {/* Drag handle */}
        <div style={{ width: 32, height: 3.5, background: 'rgba(0,0,0,0.10)', borderRadius: 2, margin: '13px auto 0' }} />

        {/* ── GREETING ─────────────────────────────────────────── */}
        <motion.section
          className="px-5 pt-5 pb-0"
          initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-muted)', letterSpacing: '0.01em', marginBottom: 4 }}>
            שלום,
          </p>
          <p style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.025em', color: 'var(--color-text)', lineHeight: 1 }}>
            <em style={{ fontStyle: 'normal', color: 'var(--color-gold)' }}>
              {user ? (profile?.name ?? 'אורח') : 'אורח'}
            </em>
          </p>
        </motion.section>

        {/* ── CTA BUTTON ───────────────────────────────────────── */}
        <section className="px-5 pt-5 pb-6">
          <Link
            to={bookHref}
            className="v6-cta-btn"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%',
              background: 'var(--color-gold)', color: '#fff',
              fontWeight: 600, fontSize: 14, letterSpacing: '0.02em',
              padding: '16px 28px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              boxShadow: '0 8px 32px var(--color-accent-glow), 0 1px 0 rgba(255,255,255,0.20) inset',
              textDecoration: 'none',
            }}
          >
            <span style={{ position: 'relative', zIndex: 1 }}>קבע תור עכשיו</span>
            <span style={{
              position: 'relative', zIndex: 1,
              width: 22, height: 22, background: 'rgba(255,255,255,0.18)', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="8,3 5,6 8,9" />
              </svg>
            </span>
            <span className="v6-cta-shimmer" aria-hidden="true" />
          </Link>
          {!user && (
            <Link to="/login" style={{
              display: 'block', textAlign: 'center', marginTop: 10,
              fontSize: 12.5, fontWeight: 600, color: 'var(--color-muted)',
              textDecoration: 'none', letterSpacing: '0.01em',
            }}>
              כניסה / הרשמה
            </Link>
          )}
        </section>

        {/* separator */}
        <div style={{ height: 1, background: 'var(--color-border)', margin: '0 20px' }} />

        {/* ── NEXT APPOINTMENT ─────────────────────────────────── */}
        <section className="px-5 py-6">

          {/* Skeleton while loading next appointment */}
          {user && nextAppointment === undefined && (
            <div className="rounded-3xl h-44 animate-pulse" style={{ background: 'var(--color-card)' }} />
          )}

          {/* Show upcoming appointment card when user has one */}
          {user && nextAppointment && (
            <motion.div initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.3 }} transition={{ type: 'spring', stiffness: 300, damping: 22, mass: 0.8 }}>
              <div
                className="rounded-3xl p-5"
                style={
                  isDark
                    ? {
                        background: 'rgba(255,255,255,0.07)',
                        backdropFilter: 'blur(28px) saturate(1.5)',
                        WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
                        border: '1px solid rgba(255,255,255,0.11)',
                        boxShadow: '0 8px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                      }
                    : {
                        background: 'rgba(255,255,255,0.78)',
                        backdropFilter: 'blur(24px) saturate(1.6)',
                        WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
                        border: '1px solid rgba(255,255,255,0.92)',
                        boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,1)',
                      }
                }
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-1 h-4 rounded-full" style={{ background: 'var(--color-gold)' }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>התור הקרוב</span>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  {nextAppointment.staff?.photo_url ? (
                    <img src={nextAppointment.staff.photo_url} alt={nextAppointment.staff.name}
                      className="w-14 h-14 rounded-2xl object-cover flex-shrink-0"
                      style={{ border: '1px solid var(--color-border)' }} />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black flex-shrink-0"
                      style={{ background: 'rgba(201,169,110,0.12)', color: 'var(--color-gold)', border: '1px solid rgba(201,169,110,0.2)' }}>
                      ✂
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {nextAppointment.services?.name && (
                      <h3 className="text-base font-black truncate" style={{ color: 'var(--color-text)' }}>{nextAppointment.services.name}</h3>
                    )}
                    {nextAppointment.staff?.name && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>עם {nextAppointment.staff.name}</p>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl p-3 mb-4 flex items-center gap-3"
                  style={isDark
                    ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
                    : { background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-muted)' }}>
                      {format(new Date(nextAppointment.start_at), 'EEEE', { locale: he })}
                    </div>
                    <div className="text-base font-black" style={{ color: 'var(--color-text)' }}>
                      {format(new Date(nextAppointment.start_at), 'd בMMMM', { locale: he })}
                    </div>
                  </div>
                  <div style={{ width: 1, height: 30, background: 'var(--color-border)' }} />
                  <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-muted)' }}>שעה</div>
                    <div className="text-base font-black" style={{ color: 'var(--color-gold)' }}>
                      {format(new Date(nextAppointment.start_at), 'HH:mm')}
                      {nextAppointment.end_at && (
                        <span className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>
                          {' – '}{format(new Date(nextAppointment.end_at), 'HH:mm')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to={bookHref} className="flex-1 text-center text-sm font-bold py-3 rounded-2xl transition-all"
                    style={{ background: 'var(--color-gold-btn, var(--color-gold))', color: '#fff', textDecoration: 'none' }}>
                    + תור נוסף
                  </Link>
                  <Link to="/my-appointments" className="flex-1 text-center text-sm font-bold py-3 rounded-2xl transition-all"
                    style={isDark
                      ? { background: 'rgba(255,255,255,0.07)', color: 'var(--color-text)', border: '1px solid rgba(255,255,255,0.1)', textDecoration: 'none' }
                      : { background: 'rgba(0,0,0,0.05)', color: 'var(--color-text)', border: '1px solid rgba(0,0,0,0.07)', textDecoration: 'none' }}>
                    לכל התורים
                  </Link>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={handleAddToCalendar}
                    className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-2xl transition-all"
                    style={calAdded
                      ? { background: 'rgba(34,197,94,0.13)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.28)' }
                      : isDark
                        ? { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.09)' }
                        : { background: 'rgba(0,0,0,0.04)', color: 'var(--color-muted)', border: '1px solid rgba(0,0,0,0.07)' }}>
                    {calAdded ? (
                      <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>נוסף ליומן</>
                    ) : (
                      <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="10" y1="17" x2="14" y2="17"/></svg>הוסף ליומן</>
                    )}
                  </button>
                  <button onClick={handleCancelAppointment} disabled={cancellingAppt}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-2xl transition-all"
                    style={{ background: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.06)', color: '#ef4444', border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.15)'}` }}>
                    {cancellingAppt ? '...' : 'ביטול תור'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </section>

        {/* separator */}
        <div style={{ height: 1, background: 'var(--color-border)', margin: '0 20px' }} />

        {/* ── SERVICES ─────────────────────────────────────────── */}
        <section id="services" className="px-5 py-8">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>השירותים שלנו</span>
            <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            <Link to={bookHref} style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-gold)', textDecoration: 'none', letterSpacing: '0.01em' }}>כל השירותים ←</Link>
          </div>
          <motion.h2 initial={{ opacity: 0, scale: 0.82, y: 40 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }} style={{ fontSize: 'clamp(1.45rem,4.5vw,1.8rem)', fontWeight: 900, letterSpacing: '-.025em', lineHeight: 1.1, color: 'var(--color-text)', marginTop: 8 }}>מה תרצה לעשות?</motion.h2>

          {servicesLoading ? (
            <div className="space-y-3 mt-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'var(--color-card)' }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {services.map((service, i) => (
                <motion.div key={service.id} initial={{ opacity: 0, scale: 0.82, y: 40 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1], delay: i * 0.12 }}>
                  <Link
                    to={serviceHref(service.id)}
                    className="group v6-svc-row"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      background: isDark ? 'rgba(255,255,255,0.04)' : 'var(--color-card)',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.82)'}`,
                      borderRadius: 18, padding: '15px 16px',
                      boxShadow: 'var(--sh-sm)',
                      cursor: 'pointer', textDecoration: 'none',
                    }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                      background: 'rgba(255,122,0,0.10)', border: '1px solid rgba(255,122,0,0.16)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--color-gold)',
                    }}>
                      {getServiceIcon(service.name)}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-text)' }}>{service.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 2 }}>{minutesToDisplay(service.duration_minutes)}</div>
                    </div>
                    {/* Price */}
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-gold)', flexShrink: 0, marginLeft: 4 }}>
                      {priceDisplay(service.price)}
                    </div>
                    {/* Arrow */}
                    <div style={{ flexShrink: 0, opacity: 0.25 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text)" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* separator */}
        <div style={{ height: 1, background: 'var(--color-border)', margin: '0 20px' }} />

        {/* ── TEAM ─────────────────────────────────────────────── */}
        {!staffLoading && staff.length > 0 && (
          <section id="team" className="py-8">
            <div className="px-5" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>הצוות</span>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            </div>
            <motion.h2 className="px-5" initial={{ opacity: 0, scale: 0.82, y: 40 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }} style={{ fontSize: 'clamp(1.45rem,4.5vw,1.8rem)', fontWeight: 900, letterSpacing: '-.025em', lineHeight: 1.1, color: 'var(--color-text)', marginTop: 8 }}>הצוות שלנו</motion.h2>
            <p className="px-5" style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 7, marginBottom: 6, lineHeight: 1.6 }}>לחץ על כרטיס לצפייה בעבודות</p>
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '14px 20px 4px' }}
              role="region" aria-label="הצוות שלנו"
            >
              {staff.map((member, i) => (
                <motion.div
                  key={member.id}
                  className="v6-team-card"
                  initial={{ opacity: 0, scale: 0.82, y: 40 }}
                  whileInView={{ opacity: 1, scale: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1], delay: i * 0.12 }}
                  style={{
                    borderRadius: 18, overflow: 'hidden', cursor: 'pointer',
                    background: '#f0e8d8',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.80)'}`,
                    boxShadow: '0 3px 12px rgba(0,0,0,0.07), 0 1px 0 rgba(255,255,255,0.80)',
                    position: 'relative',
                  }}
                  onClick={() => setPortfolioMember(member)}
                >
                  <TeamCardMedia member={member} />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* separator */}
        {featuredProducts.length > 0 && <div style={{ height: 1, background: 'var(--color-border)', margin: '0 20px' }} />}

        {/* ── FEATURED PRODUCTS ────────────────────────────────── */}
        {featuredProducts.length > 0 && (
          <section className="py-8">
            <div className="px-5" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>מוצרים</span>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            </div>
            <motion.h2 className="px-5" initial={{ opacity: 0, scale: 0.82, y: 40 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }} style={{ fontSize: 'clamp(1.45rem,4.5vw,1.8rem)', fontWeight: 900, letterSpacing: '-.025em', lineHeight: 1.1, color: 'var(--color-text)', marginTop: 8 }}>מוצרים לרכישה</motion.h2>
            <div
              style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', display: 'flex', gap: 12, padding: '14px 20px 8px', margin: '0 -0px' }}
              tabIndex={0} role="region" aria-label="מוצרים מומלצים"
            >
              {featuredProducts.map((product, i) => (
                <motion.div
                  key={product.id}
                  className="v6-prod-card"
                  initial={{ opacity: 0, scale: 0.82, y: 40 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1], delay: i * 0.12 }}
                  style={{
                    flexShrink: 0, width: 136,
                    background: isDark ? 'rgba(255,255,255,0.06)' : 'var(--color-card)',
                    borderRadius: 18, overflow: 'hidden',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.88)'}`,
                    boxShadow: 'var(--sh-sm)', cursor: 'pointer',
                  }}
                >
                  {/* Image */}
                  <div style={{ width: '100%', height: 160, overflow: 'hidden', background: 'linear-gradient(145deg,#f0e4cc,#d4c0a0)', position: 'relative' }}>
                    <div className="v6-prod-badge">{priceDisplay(product.price)}</div>
                    {product.image_url
                      ? <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .7s cubic-bezier(.22,1,.36,1)', display: 'block' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 42, fontWeight: 900, color: 'var(--color-gold)', opacity: 0.12 }}>H</span>
                        </div>
                    }
                  </div>
                  {/* Caption */}
                  <div style={{ padding: '10px 12px 14px' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.3, color: 'var(--color-text)', marginBottom: 4 }}>{product.name}</div>
                    <div style={{ fontSize: 14.5, fontWeight: 900, color: 'var(--color-gold)', letterSpacing: '-0.01em' }}>{priceDisplay(product.price)}</div>
                  </div>
                </motion.div>
              ))}
              <div style={{ flexShrink: 0, width: 8 }} />
            </div>
          </section>
        )}

        {/* separator */}
        <div style={{ height: 1, background: 'var(--color-border)', margin: '0 20px' }} />

        {/* ── REVIEWS ──────────────────────────────────────────── */}
        {reviews.length > 0 && (
          <section className="py-8">
            <div className="px-5" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>לקוחות אומרים</span>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            </div>
            <div
              style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 20px 8px' }}
              tabIndex={0} role="region" aria-label="ביקורות לקוחות"
            >
              {reviews.slice(0, 10).map((review, i) => (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, scale: 0.82, y: 40 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1], delay: i * 0.12 }}
                  style={{
                    flexShrink: 0, borderRadius: 16, padding: 16, width: 240,
                    background: isDark ? 'rgba(255,255,255,0.05)' : 'var(--color-card)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'var(--color-border)'}`,
                    boxShadow: 'var(--sh-sm)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
                    {[1,2,3,4,5].map(s => (
                      <span key={s} style={{ color: s <= review.rating ? '#FBBF24' : 'rgba(0,0,0,0.15)', fontSize: 13 }}>★</span>
                    ))}
                  </div>
                  {review.comment && <p style={{ fontSize: 12.5, marginBottom: 10, color: 'var(--color-text)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>"{review.comment}"</p>}
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)' }}>
                    {review.profiles?.name ?? 'לקוח'}
                    {review.staff?.name && <span> · {review.staff.name}</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* separator */}
        <div style={{ height: 1, background: 'var(--color-border)', margin: '0 20px' }} />

        {/* ── FIND US ───────────────────────────────────────────── */}
        <section id="contact" className="py-8 px-5">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>מצאו אותנו</span>
            <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          </div>
          <motion.h2 initial={{ opacity: 0, scale: 0.82, y: 40 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }} style={{ fontSize: 'clamp(1.45rem,4.5vw,1.8rem)', fontWeight: 900, letterSpacing: '-.025em', lineHeight: 1.1, color: 'var(--color-text)', marginTop: 8, marginBottom: 18 }}>{BUSINESS.address}</motion.h2>

          {/* Fan gallery */}
          {galleryItems.filter(g => g.type === 'image').length > 0 && (
            <FanGallery items={galleryItems.filter(g => g.type === 'image')} />
          )}

          {/* v6 location card */}
          <motion.div className="v6-loc-card" initial={{ opacity: 0, scale: 0.82, y: 40 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}>
            <div className="v6-map-placeholder">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-text)" strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                <line x1="8" y1="2" x2="8" y2="18"/>
                <line x1="16" y1="6" x2="16" y2="22"/>
              </svg>
              <button className="v6-map-btn" onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(BUSINESS.address)}`, '_blank')}>פתח במפות</button>
            </div>

            {/* Address row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                background: 'rgba(255,122,0,0.10)', border: '1px solid rgba(255,122,0,0.16)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{BUSINESS.address}</div>
                <div style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>המיקום שלנו</div>
              </div>
            </div>

            {/* Hours row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                background: 'rgba(255,122,0,0.10)', border: '1px solid rgba(255,122,0,0.16)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>א׳–ה׳ 09:00–20:00</div>
                <div style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>ו׳ 09:00–14:00</div>
              </div>
            </div>

            {/* Phone row */}
            {BUSINESS.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                  background: 'rgba(255,122,0,0.10)', border: '1px solid rgba(255,122,0,0.16)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.7A2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.56-.56a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
                  </svg>
                </div>
                <div>
                  <a href={`tel:${BUSINESS.phone}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', textDecoration: 'none' }}>{BUSINESS.phone}</a>
                  <div style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 1 }}>התקשרו לייעוץ</div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Social buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {BUSINESS.whatsapp && (
              <a href={`https://wa.me/${BUSINESS.whatsapp}`} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 14, background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = '#128C7E'}
                onMouseLeave={e => e.currentTarget.style.background = '#25D366'}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
            )}
            {BUSINESS.instagram && (
              <a href={`https://instagram.com/${BUSINESS.instagram}`} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 14, background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                Instagram
              </a>
            )}
            {BUSINESS.googleReviewUrl && (
              <a href={BUSINESS.googleReviewUrl} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 14, background: '#4285F4', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                Google
              </a>
            )}
          </div>

          {/* Final CTA */}
          <motion.div initial={{ opacity: 0, scale: 0.82, y: 40 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}>
            <Link to={bookHref} className="v6-cta-btn" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', marginTop: 16,
              background: 'var(--color-gold)', color: '#fff',
              fontWeight: 600, fontSize: 14, padding: '16px 28px', borderRadius: 9999,
              textDecoration: 'none',
            }}>
              קבע תור עכשיו
            </Link>
          </motion.div>
        </section>

        {/* bottom padding for toolbar */}
        <div style={{ height: 100 }} />
      </div>{/* end glass panel */}

      {/* ── PORTFOLIO VIEWER ─────────────────────────────────────── */}
      <AnimatePresence>
        {portfolioMember && (
          <PortfolioViewer
            member={portfolioMember}
            mode={portfolioMode}
            onClose={() => setPortfolioMember(null)}
            bookHref={bookHref}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Unified portfolio viewer — fetches photos, renders grid or story ──
function PortfolioViewer({ member, mode, onClose, bookHref }) {
  const { photos, loading } = useStaffPortfolio(member.id)

  if (mode === 'story') {
    return <StoryViewer member={member} photos={photos} loading={loading} onClose={onClose} bookHref={bookHref} />
  }
  return <GridModal member={member} photos={photos} loading={loading} onClose={onClose} bookHref={bookHref} />
}

// ── Story viewer (Instagram-style) ──────────────────────────────────
function StoryViewer({ member, photos, loading, onClose, bookHref }) {
  const [idx, setIdx] = useState(0)
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)

  const total = photos.length
  const photo = photos[idx] ?? null

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function handleTouchStart(e) {
    if (e.target.closest('button') || e.target.closest('a')) return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e) {
    if (e.target.closest('button') || e.target.closest('a')) return
    if (touchStartX.current === null) return
    const dx = Math.abs(e.changedTouches[0].clientX - touchStartX.current)
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current)
    if (dx > 18 || dy > 18) { touchStartX.current = null; return }
    const x = touchStartX.current
    touchStartX.current = null
    if (total === 0) return
    if (x > window.innerWidth * 0.4) {
      if (idx < total - 1) setIdx(i => i + 1); else onClose()
    } else {
      if (idx > 0) setIdx(i => i - 1)
    }
  }

  return createPortal(
    <>
      {/* Blurred overlay */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0"
        style={{ zIndex: 9998, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
        onClick={onClose}
      />

      {/* Floating glass card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.88, y: 40 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="fixed flex flex-col select-none overflow-hidden"
        style={{
          zIndex: 9999,
          inset: '5dvh 14px',          // floats with margin on all sides
          maxWidth: 480,
          margin: '0 auto',
          borderRadius: 32,
          background: 'rgba(15,15,15,0.72)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          border: '1px solid rgba(255,255,255,0.13)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.06) inset',
          touchAction: 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Avatar with gold ring */}
            <div className="relative flex-shrink-0">
              <div className="w-11 h-11 rounded-full overflow-hidden"
                style={{ border: '2px solid var(--color-gold)', background: 'rgba(255,255,255,0.08)' }}>
                {member.photo_url
                  ? <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" />
                  : <span className="w-full h-full flex items-center justify-center font-black text-white text-base">{member.name[0]}</span>}
              </div>
            </div>
            <div>
              <p className="font-black text-[15px] text-white leading-tight">{member.name}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {total > 0 ? `${idx + 1} / ${total} תמונות` : 'תיק עבודות'}
              </p>
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onClose() }}
            onTouchEnd={e => { e.stopPropagation(); onClose() }}
            className="w-9 h-9 flex items-center justify-center rounded-full text-xl leading-none"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', touchAction: 'auto', border: '1px solid rgba(255,255,255,0.1)' }}
          >×</button>
        </div>

        {/* Progress dots */}
        {total > 1 && (
          <div className="flex gap-1.5 px-5 pb-3 flex-shrink-0">
            {photos.map((_, i) => (
              <motion.div
                key={i}
                className="h-[3px] rounded-full flex-1"
                animate={{
                  background: i < idx ? 'var(--color-gold)' : i === idx ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                  scaleX: i === idx ? 1 : 1,
                }}
                transition={{ duration: 0.25 }}
              />
            ))}
          </div>
        )}

        {/* Photo — rounded, with subtle inner shadow */}
        <div className="flex-1 mx-4 overflow-hidden relative" style={{ minHeight: 0, borderRadius: 20, background: 'rgba(0,0,0,0.3)' }}>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-9 h-9 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: 'var(--color-gold)', borderTopColor: 'transparent' }} />
            </div>
          ) : total === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="text-5xl">📷</span>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>עדיין אין תמונות</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.img
                key={photo?.id ?? idx}
                src={photo?.image_url}
                alt={photo?.caption || ''}
                className="absolute inset-0 w-full h-full object-cover"
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.22 }}
                draggable={false}
              />
            </AnimatePresence>
          )}

          {/* Caption pill */}
          {photo?.caption && (
            <div className="absolute bottom-3 inset-x-3 pointer-events-none flex justify-center">
              <p className="text-white text-xs px-4 py-1.5 rounded-full"
                style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)' }}>
                {photo.caption}
              </p>
            </div>
          )}

          {/* Tap zones */}
          {total > 1 && (
            <>
              <div className="absolute inset-y-0 left-0 w-2/5" />
              <div className="absolute inset-y-0 right-0 w-3/5" />
            </>
          )}
        </div>

        {/* CTA */}
        <div className="px-4 pt-4 pb-5 flex-shrink-0">
          <Link
            to={`/book/service?staff=${member.id}`}
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full py-4 font-black text-[15px]"
            style={{
              background: 'var(--color-gold)',
              color: '#fff',
              borderRadius: 18,
              touchAction: 'auto',
              boxShadow: '0 4px 24px rgba(201,169,110,0.35)',
            }}
          >
            ✂ קבע תור עם {member.name}
          </Link>
        </div>
      </motion.div>
    </>,
    document.body
  )
}

// ── Grid modal (sheet from bottom) ──────────────────────────────────
function GridModal({ member, photos, loading, onClose, bookHref }) {
  const [lightbox, setLightbox] = useState(null)

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="w-full sm:max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'var(--color-card)', maxHeight: 'calc(100dvh - 100px - env(safe-area-inset-bottom, 0px))', marginBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5"
          style={{ background: 'var(--color-card)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'rgba(0,0,0,0.08)' }}>
              {member.photo_url
                ? <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" />
                : <span className="w-full h-full flex items-center justify-center font-black text-lg" style={{ color: 'var(--color-muted)' }}>{member.name[0]}</span>}
            </div>
            <div>
              <h2 className="font-black text-base" style={{ color: 'var(--color-text)' }}>{member.name}</h2>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>עבודות</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-xl"
            style={{ color: 'var(--color-muted)', background: 'rgba(0,0,0,0.06)' }}>×</button>
        </div>

        {member.bio && (
          <div className="px-5 pt-4 pb-2">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{member.bio}</p>
          </div>
        )}

        {/* Photos grid */}
        <div className="p-4">
          {loading ? (
            <div className="grid grid-cols-3 gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="aspect-square rounded-xl animate-pulse" style={{ background: 'rgba(0,0,0,0.08)' }} />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📷</div>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>עדיין אין תמונות עבודות</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, i) => (
                <motion.button
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => setLightbox(i)}
                  className="aspect-square rounded-xl overflow-hidden"
                  style={{ background: 'rgba(0,0,0,0.06)' }}
                >
                  <img src={photo.image_url} alt={photo.caption || ''} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {/* Book CTA */}
        <div className="sticky bottom-0 p-4" style={{ background: 'var(--color-card)', borderTop: '1px solid var(--color-border)' }}>
          <Link to={`/book/service?staff=${member.id}`} onClick={onClose} className="btn-primary w-full justify-center py-3">
            ✂ קבע תור עם {member.name}
          </Link>
        </div>
      </motion.div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox !== null && (
          <LightboxViewer
            photos={photos}
            startIdx={lightbox}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>,
    document.body
  )
}

// ── Lightbox with prev/next ──────────────────────────────────────────
function LightboxViewer({ photos, startIdx, onClose }) {
  const [idx, setIdx] = useState(startIdx)
  const photo = photos[idx]

  function handleClick(e) {
    if (e.target.closest('button')) return
    const x = e.clientX
    const w = window.innerWidth
    if (x > w * 0.5) {
      if (idx < photos.length - 1) setIdx(i => i + 1)
      else onClose()
    } else {
      if (idx > 0) setIdx(i => i - 1)
      else onClose()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 250, background: 'rgba(0,0,0,0.95)' }}
      onClick={handleClick}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={idx}
          initial={{ opacity: 0, scale: 0.93 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          src={photo.image_url} alt={photo.caption || ''}
          className="max-w-full max-h-full rounded-2xl object-contain"
          style={{ maxHeight: '85vh' }}
          draggable={false}
        />
      </AnimatePresence>

      <button onClick={e => { e.stopPropagation(); onClose() }}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full text-2xl text-white"
        style={{ background: 'rgba(255,255,255,0.15)' }}>×</button>

      {idx > 0 && (
        <button onClick={e => { e.stopPropagation(); setIdx(i => i - 1) }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full text-white text-xl"
          style={{ background: 'rgba(255,255,255,0.15)' }}>›</button>
      )}
      {idx < photos.length - 1 && (
        <button onClick={e => { e.stopPropagation(); setIdx(i => i + 1) }}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full text-white text-xl"
          style={{ background: 'rgba(255,255,255,0.15)' }}>‹</button>
      )}

      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">{idx + 1} / {photos.length}</p>
      {photo.caption && (
        <p className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white text-sm bg-black/60 px-4 py-2 rounded-full whitespace-nowrap">{photo.caption}</p>
      )}
    </motion.div>
  )
}
