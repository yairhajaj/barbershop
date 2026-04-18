import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
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

  // floating / parallax effect
  const floating = settings?.floating ?? (localStorage.getItem('floating') === 'true')
  // glass layout auto-enables floating so video is always visible through frosted content
  const isGlass = layout === 'glass'
  const effectiveFloating = floating || isGlass
  const heroH = typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600
  const { scrollY } = useScroll()
  // Background stays perfectly still — elegance through restraint.
  // Only the overlay darkens slowly (cinematic, not gimmicky).
  const overlayOpacity = useTransform(scrollY, [0, heroH * 0.65], [0.55, 0.82])
  // Hero text: clean fade + very gentle lift
  const heroContentOpacity = useTransform(scrollY, [0, heroH * 0.38], [1, 0])
  const heroContentY       = useTransform(scrollY, [0, heroH * 0.38], ['0px', '-18px'])

  // Service card link — always start at branch, pass serviceId via branch → service nav
  function serviceHref(serviceId) {
    return bookingFlow === 'all-in-one'
      ? `/book/all?service=${serviceId}`
      : `/book/branch?service=${serviceId}`
  }

  return (
    <div className={effectiveFloating ? 'relative' : undefined}>
      {/* ── HERO ──────────────────────────────────────────────────── */}
      <section className={`hero-section min-h-[70vh] flex flex-col items-center justify-center ${effectiveFloating ? 'sticky top-0 z-0' : 'relative overflow-hidden'}`}>
        {/* Background — completely still, acts as a stage */}
        <div className="absolute inset-0 overflow-hidden">
          {heroType === 'video' && heroSrc ? (
            <video
              ref={heroVideoRef}
              className="absolute inset-0 w-full h-full object-cover"
              src={heroSrc}
              autoPlay
              muted
              loop
              playsInline
              controls={false}
              preload="auto"
              onCanPlay={e => e.target.play().catch(() => {})}
            />
          ) : heroType === 'image' && heroSrc ? (
            <img className="absolute inset-0 w-full h-full object-cover" src={heroSrc} alt="hero" />
          ) : (
            <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #111 0%, #222 100%)' }} />
          )}
          {/* Overlay darkens as you scroll — cinematic, no blur needed */}
          <motion.div
            className="absolute inset-0"
            style={effectiveFloating ? { opacity: overlayOpacity } : { opacity: 0.55 }}
            initial={false}
          >
            <div className="w-full h-full" style={{ background: '#000' }} />
          </motion.div>
          {/* Thin gradient at bottom — seamless content entry, not a blur effect */}
          {effectiveFloating && (
            <div
              className="absolute bottom-0 left-0 right-0 pointer-events-none"
              style={{ height: '56px', background: isGlass ? 'transparent' : 'linear-gradient(to top, var(--color-surface), transparent)' }}
            />
          )}
        </div>

        {/* Content — fades + lifts cleanly */}
        <motion.div
          className="relative z-10 text-center text-white px-6 w-full max-w-lg mx-auto"
          style={effectiveFloating ? { opacity: heroContentOpacity, y: heroContentY } : {}}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center text-2xl font-black shadow-xl overflow-hidden"
            style={{ background: 'var(--color-gold)', color: '#fff' }}
          >
            {logoUrl
              ? <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
              : BUSINESS.logoText}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="text-4xl sm:text-5xl font-black mb-3 leading-tight"
            style={{ letterSpacing: '-0.03em' }}
          >
            {BUSINESS.name}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-base mb-8"
            style={{ color: 'rgba(255,255,255,0.95)' }}
          >
            הזמינו תור בקלות ובמהירות
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-3 justify-center items-center"
          >
            <Link to={bookHref} className="btn-primary text-base px-8 py-3.5">קבע תור עכשיו</Link>
            {!user && (
              <Link to="/login" className="text-sm font-semibold px-6 py-3 rounded-full border border-white/30 text-white/80 hover:bg-white/10 transition-all">
                כניסה / הרשמה
              </Link>
            )}
          </motion.div>
        </motion.div>
      </section>

      {/* ── CONTENT (scrolls over hero when floating) ─────────────── */}
      <div className={`floating-content-wrapper${effectiveFloating ? ' relative z-10' : ''}`}>

      {/* ── WELCOME ──────────────────────────────────────────────── */}
      <section className="pt-8 pb-2 px-4" style={{ background: 'var(--color-surface)' }}>
        <div className="max-w-xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          >
            {user ? (
              <>
                <p className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)' }}>
                  {`שלום, ${profile?.name ?? ''}`}
                </p>
                <p className="text-sm mb-5" style={{ color: 'var(--color-muted)' }}>מה נעשה היום?</p>
                <div className="flex gap-3">
                  <Link to={bookHref}
                    className="flex-1 text-center text-sm font-bold py-3 rounded-2xl transition-all"
                    style={{ background: 'var(--color-gold-btn, var(--color-gold))', color: '#fff' }}>
                    קבע תור
                  </Link>
                  <Link to="/my-appointments"
                    className="flex-1 text-center text-sm font-bold py-3 rounded-2xl transition-all"
                    style={{
                      background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                      color: 'var(--color-text)',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)'}`
                    }}>
                    התורים שלי
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)' }}>ברוכים הבאים</p>
                <p className="text-sm mb-5" style={{ color: 'var(--color-muted)' }}>הזמינו תור בקלות</p>
                <Link to="/login"
                  className="inline-flex items-center gap-2 text-sm font-bold px-6 py-3 rounded-2xl transition-all"
                  style={{ background: 'var(--color-gold-btn, var(--color-gold))', color: '#fff' }}>
                  התחברות או הרשמה
                </Link>
              </>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── NEXT APPOINTMENT or SERVICES ─────────────────────────── */}
      <section id="services" className="py-10 px-4" style={{ background: 'var(--color-surface)' }}>
        <div className="max-w-xl mx-auto">

          {/* Skeleton while loading next appointment */}
          {user && nextAppointment === undefined && (
            <div className="rounded-3xl h-44 animate-pulse" style={{ background: 'var(--color-card)' }} />
          )}

          {/* Show upcoming appointment card when user has one */}
          {user && nextAppointment ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}>
              {/* Card — glassmorphism: dark glass for midnight/luxury, light frosted for other themes */}
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
                {/* Card-internal header */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-1 h-4 rounded-full" style={{ background: 'var(--color-gold)' }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                    התור הקרוב
                  </span>
                </div>

                {/* Top row: avatar + service info */}
                <div className="flex items-center gap-3 mb-4">
                  {/* Staff avatar */}
                  {nextAppointment.staff?.photo_url ? (
                    <img
                      src={nextAppointment.staff.photo_url}
                      alt={nextAppointment.staff.name}
                      className="w-14 h-14 rounded-2xl object-cover flex-shrink-0"
                      style={{ border: '1px solid var(--color-border)' }}
                    />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black flex-shrink-0"
                      style={{ background: 'rgba(201,169,110,0.12)', color: 'var(--color-gold)', border: '1px solid rgba(201,169,110,0.2)' }}
                    >
                      ✂
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {nextAppointment.services?.name && (
                      <h3 className="text-base font-black truncate" style={{ color: 'var(--color-text)' }}>
                        {nextAppointment.services.name}
                      </h3>
                    )}
                    {nextAppointment.staff?.name && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                        עם {nextAppointment.staff.name}
                      </p>
                    )}
                  </div>
                </div>

                {/* Date + time row — separated by subtle divider */}
                <div
                  className="rounded-2xl p-3 mb-4 flex items-center gap-3"
                  style={
                    isDark
                      ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
                      : { background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }
                  }
                >
                  {/* Date block */}
                  <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-muted)' }}>
                      {format(new Date(nextAppointment.start_at), 'EEEE', { locale: he })}
                    </div>
                    <div className="text-base font-black" style={{ color: 'var(--color-text)' }}>
                      {format(new Date(nextAppointment.start_at), 'd בMMMM', { locale: he })}
                    </div>
                  </div>
                  {/* Vertical divider */}
                  <div style={{ width: 1, height: 30, background: 'var(--color-border)' }} />
                  {/* Time block */}
                  <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-muted)' }}>
                      שעה
                    </div>
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

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Link
                    to={bookHref}
                    className="flex-1 text-center text-sm font-bold py-3 rounded-2xl transition-all"
                    style={{ background: 'var(--color-gold-btn, var(--color-gold))', color: '#fff' }}
                  >
                    + תור נוסף
                  </Link>
                  <Link
                    to="/my-appointments"
                    className="flex-1 text-center text-sm font-bold py-3 rounded-2xl transition-all"
                    style={
                      isDark
                        ? { background: 'rgba(255,255,255,0.07)', color: 'var(--color-text)', border: '1px solid rgba(255,255,255,0.1)' }
                        : { background: 'rgba(0,0,0,0.05)', color: 'var(--color-text)', border: '1px solid rgba(0,0,0,0.07)' }
                    }
                  >
                    לכל התורים
                  </Link>
                </div>

                {/* Calendar + Cancel row */}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleAddToCalendar}
                    className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-2xl transition-all"
                    style={
                      calAdded
                        ? { background: 'rgba(34,197,94,0.13)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.28)' }
                        : isDark
                          ? { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.09)' }
                          : { background: 'rgba(0,0,0,0.04)', color: 'var(--color-muted)', border: '1px solid rgba(0,0,0,0.07)' }
                    }
                  >
                    {calAdded ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        נוסף ליומן
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="10" y1="17" x2="14" y2="17"/>
                        </svg>
                        הוסף ליומן
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleCancelAppointment}
                    disabled={cancellingAppt}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-2xl transition-all"
                    style={{
                      background: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.06)',
                      color: '#ef4444',
                      border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.15)'}`,
                    }}
                  >
                    {cancellingAppt ? '...' : 'ביטול תור'}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : nextAppointment === null && (
            <>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[22px] font-black flex items-center gap-2.5" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
                  <span className="w-[3.5px] h-5 rounded-full flex-shrink-0" style={{ background: 'var(--color-gold)' }} />
                  השירותים שלנו
                </h2>
                <Link to={bookHref} className="text-sm font-bold underline underline-offset-2" style={{ color: 'var(--color-gold-text, var(--color-gold))' }}>הכל ←</Link>
              </div>

              {servicesLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'var(--color-card)' }} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {services.map((service, i) => (
                    <motion.div key={service.id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                      <Link
                        to={serviceHref(service.id)}
                        className="flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all group"
                        style={{
                          background: 'var(--color-card)',
                          border: '1px solid var(--color-border)',
                          boxShadow: 'var(--sh-sm)',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'translateY(-2px)'
                          e.currentTarget.style.boxShadow = '0 8px 24px rgba(255,133,0,0.13)'
                          e.currentTarget.style.borderColor = 'rgba(255,133,0,0.35)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.04)'
                          e.currentTarget.style.borderColor = 'var(--color-border)'
                        }}
                      >
                        {/* Icon */}
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                          style={{ background: 'rgba(255,133,0,0.08)', color: 'var(--color-gold)', border: '1px solid rgba(255,133,0,0.14)' }}
                        >
                          {getServiceIcon(service.name)}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-sm leading-tight" style={{ color: 'var(--color-text)' }}>{service.name}</div>
                          <div className="text-xs mt-0.5 font-medium" style={{ color: 'var(--color-muted)' }}>⏱ {minutesToDisplay(service.duration_minutes)}</div>
                        </div>
                        {/* Price + arrow */}
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          <span className="text-base font-black" style={{ color: 'var(--color-gold-text, var(--color-gold))' }}>{priceDisplay(service.price)}</span>
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-transform duration-300 group-hover:scale-110"
                            style={{ background: 'var(--color-gold-btn, var(--color-gold))', color: '#fff' }}
                          >←</div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>


      {/* ── TEAM — horizontal carousel ────────────────────────────── */}
      {!staffLoading && staff.length > 0 && (
        <section id="team" className="py-10" style={{ background: 'var(--color-surface)' }}>
          <div className="px-4 max-w-xl mx-auto mb-4">
            <h2 className="text-[22px] font-black flex items-center gap-2.5" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
              <span className="w-[3.5px] h-5 rounded-full flex-shrink-0" style={{ background: 'var(--color-gold)' }} />
              הצוות שלנו
            </h2>
          </div>

          <div
            className="flex gap-3 overflow-x-auto pb-4 px-4"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
            tabIndex={0}
            role="region"
            aria-label="הצוות שלנו"
          >
            {staff.map((member, i) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="flex-shrink-0 w-48 rounded-2xl overflow-hidden cursor-pointer group"
                style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
                onClick={() => setPortfolioMember(member)}
              >
                <StaffVideoCard member={member} portfolioMode={portfolioMode} />
              </motion.div>
            ))}
            <div className="flex-shrink-0 w-2" />
          </div>
        </section>
      )}

      {/* ── FEATURED PRODUCTS ────────────────────────────────────── */}
      {featuredProducts.length > 0 && (
        <section className="py-10" style={{ background: 'var(--color-surface)' }}>
          <div className="px-4 max-w-xl mx-auto mb-5">
            <h2 className="text-[22px] font-black flex items-center gap-2.5" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
              <span className="w-[3.5px] h-5 rounded-full flex-shrink-0" style={{ background: 'var(--color-gold)' }} />
              מוצרים מומלצים
            </h2>
          </div>
          <div
            className="flex gap-3 overflow-x-auto pb-4 px-4"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
            tabIndex={0}
            role="region"
            aria-label="מוצרים מומלצים"
          >
            {featuredProducts.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                className="flex-shrink-0 w-44 rounded-2xl overflow-hidden relative group"
                style={{
                  boxShadow: 'var(--sh-sm)',
                  background: 'var(--color-card)',
                  border: '1px solid rgba(0,0,0,0.04)',
                  transition: 'transform .38s cubic-bezier(.22,1,.36,1), box-shadow .38s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = 'var(--sh-lg)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--sh-sm)'; }}
              >
                {/* Image */}
                <div className="h-52 overflow-hidden relative" style={{ background: 'linear-gradient(145deg,rgba(201,169,110,0.15),rgba(201,169,110,0.04))' }}>
                  {product.image_url
                    ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    : <div className="w-full h-full flex items-center justify-center">
                        <span className="text-5xl font-black" style={{ color: 'var(--color-gold)', opacity: 0.12 }}>H</span>
                      </div>
                  }
                  {/* Bottom scrim */}
                  <div className="absolute inset-x-0 bottom-0 h-10 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.18) 0%, transparent 100%)' }} />
                </div>
                {/* Caption — below image, clean */}
                <div className="px-3 py-3">
                  <div className="font-bold text-sm leading-tight mb-1" style={{ color: 'var(--color-text)' }}>{product.name}</div>
                  <div className="font-black text-sm" style={{ color: 'var(--color-gold)' }}>{priceDisplay(product.price)}</div>
                </div>
              </motion.div>
            ))}
            <div className="flex-shrink-0 w-2" />
          </div>
        </section>
      )}

      {/* ── REVIEWS ──────────────────────────────────────────────── */}
      {reviews.length > 0 && (
        <section className="py-10 px-4" style={{ background: 'var(--color-surface)' }}>
          <div className="max-w-xl mx-auto">
            <h2 className="text-[22px] font-black flex items-center gap-2.5 mb-5" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
              <span className="w-[3.5px] h-5 rounded-full flex-shrink-0" style={{ background: 'var(--color-gold)' }} />
              מה אומרים הלקוחות
            </h2>
            <div
              className="flex gap-3 overflow-x-auto pb-2"
              style={{ scrollbarWidth: 'none' }}
              tabIndex={0}
              role="region"
              aria-label="מה אומרים הלקוחות"
            >
              {reviews.slice(0, 10).map((review, i) => (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                  className="flex-shrink-0 rounded-2xl p-4 w-64"
                  style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
                >
                  <div className="flex items-center gap-1 mb-2">
                    {[1,2,3,4,5].map(s => (
                      <span key={s} style={{ color: s <= review.rating ? '#FBBF24' : 'rgba(0,0,0,0.15)' }}>★</span>
                    ))}
                  </div>
                  {review.comment && <p className="text-sm mb-3 line-clamp-3" style={{ color: 'var(--color-text)' }}>"{review.comment}"</p>}
                  <div className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>
                    {review.profiles?.name ?? 'לקוח'}
                    {review.staff?.name && <span> · {review.staff.name}</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CONTACT ───────────────────────────────────────────────── */}
      <section id="contact" className="py-10" style={{ background: 'var(--color-surface)' }}>
        <div className="px-4 max-w-xl mx-auto mb-5">
          <h2 className="text-[22px] font-black flex items-center gap-2.5" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            <span className="w-[3.5px] h-5 rounded-full flex-shrink-0" style={{ background: 'var(--color-gold)' }} />
            מצאו אותנו
          </h2>
        </div>

        {/* Gallery carousel */}
        {galleryItems.filter(g => g.type === 'image').length > 0 && (
          <div
            className="flex gap-2 overflow-x-auto pb-4 px-4"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
            tabIndex={0}
            role="region"
            aria-label="גלריית תמונות"
          >
            {galleryItems.filter(g => g.type === 'image').map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="flex-shrink-0 w-64 h-44 rounded-2xl overflow-hidden"
                style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.10)' }}
              >
                <img src={item.url} alt={item.caption || 'המספרה'} className="w-full h-full object-cover" />
              </motion.div>
            ))}
            <div className="flex-shrink-0 w-2" />
          </div>
        )}

        {/* Address + contact */}
        <div className="max-w-xl mx-auto px-4 mt-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(201,169,110,0.12)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="2" strokeLinecap="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{BUSINESS.address}</div>
              {BUSINESS.phone && (
                <a href={`tel:${BUSINESS.phone}`} className="text-xs" style={{ color: 'var(--color-muted)' }}>{BUSINESS.phone}</a>
              )}
            </div>
          </div>

          {/* Quick access buttons */}
          <div className="flex gap-3 mt-5 mb-4">
            {BUSINESS.whatsapp && (
              <a href={`https://wa.me/${BUSINESS.whatsapp}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm"
                style={{ background: '#128C7E', color: '#fff', fontWeight: 700, fontSize: '1.2rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
            )}
            {BUSINESS.instagram && (
              <a href={`https://instagram.com/${BUSINESS.instagram}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm"
                style={{ background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', color: '#fff' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                Instagram
              </a>
            )}
            {BUSINESS.googleReviewUrl && (
              <a href={BUSINESS.googleReviewUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm"
                style={{ background: '#4285F4', color: '#fff' }}>
                דירוג Google
              </a>
            )}
          </div>

          <Link to={bookHref} className="btn-primary w-full justify-center text-base py-4">קבע תור עכשיו</Link>
        </div>
      </section>

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

</div>{/* end floating content wrapper */}
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
      className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'var(--color-card)' }}
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
