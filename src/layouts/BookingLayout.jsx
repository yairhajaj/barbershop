import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BUSINESS } from '../config/business'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useLang } from '../contexts/LangContext'
import { useBusinessSettings } from '../hooks/useBusinessSettings'
import { supabase } from '../lib/supabase'
import { Modal } from '../components/ui/Modal'

export function BookingLayout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [announcement, setAnnouncement] = useState(null)
  const [annOpen, setAnnOpen] = useState(false)
  const { user, profile, isAdmin, signOut } = useAuth()
  const { layout, theme } = useTheme()
  const { settings } = useBusinessSettings()
  const logoUrl = settings?.logo_url
  const bookingFlow = settings?.booking_flow || localStorage.getItem('booking_flow') || 'multistep'
  const bookHref = bookingFlow === 'all-in-one' ? '/book/all' : '/book/service'
  const { lang, toggleLang, t } = useLang()
  const location = useLocation()
  const navigate = useNavigate()

  const isHome = location.pathname === '/'

  // Fetch & show announcement once per session
  useEffect(() => {
    async function fetchAnnouncement() {
      try {
        const { data } = await supabase
          .from('business_settings')
          .select('announcement_enabled,announcement_title,announcement_body,announcement_expires_at,announcement_color')
          .single()
        if (!data?.announcement_enabled) return
        if (!data.announcement_title?.trim() && !data.announcement_body?.trim()) return
        const expiresAt = data.announcement_expires_at
        if (expiresAt && new Date() >= new Date(expiresAt)) return
        if (sessionStorage.getItem('announcement_seen')) return
        setAnnouncement(data)
        setAnnOpen(true)
      } catch (_) {
        // silently ignore — non-critical feature
      }
    }
    fetchAnnouncement()
  }, [])

  function handleAnnouncementClose() {
    sessionStorage.setItem('announcement_seen', '1')
    setAnnOpen(false)
  }

  // Scroll to top on every route change
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [location.pathname])

  // Track scroll — only matters on homepage
  useEffect(() => {
    if (!isHome) { setScrolled(false); return }
    const onScroll = () => setScrolled(window.scrollY > 72)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isHome])

  // On homepage: navbar hidden at top, minimal when scrolled
  // On other pages: always full navbar
  const navVisible = !isHome || scrolled

  // Bottom bar — computed once per render, never inside JSX (avoids stale-closure on auth/theme change)
  const barIsDark = theme === 'midnight' || layout === 'luxury'
  const barIsGlass = layout === 'glass'
  // Glass bar: light theme → white-glass bar + DARK text. Dark theme → dark-glass bar + LIGHT text.
  // Never mix light text with light/transparent background — that's the "invisible icon" bug.
  const barNavBg = barIsGlass
    ? (barIsDark ? 'rgba(10,11,30,0.80)' : 'rgba(255,255,255,0.85)')
    : barIsDark ? 'rgba(12,12,12,0.90)' : 'rgba(255,255,255,0.92)'
  const barNavBorder = barIsGlass
    ? (barIsDark ? 'rgba(129,140,248,0.25)' : 'rgba(0,0,0,0.08)')
    : barIsDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)'
  const barNavBlur = 'blur(32px) saturate(1.8)'
  const barNavShadow = barIsDark
    ? '0 -1px 0 rgba(255,255,255,0.05), 0 8px 48px rgba(0,0,0,0.55), 0 24px 56px rgba(0,0,0,0.28)'
    : '0 8px 40px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.95)'
  // Text color follows ONLY the dark/light axis — never white text on a glass/transparent bar
  const barText = barIsDark ? '#e8e8e8' : '#1a1a1a'
  const barBgActive = barIsDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)'

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  // All 3 layout styles (flat/cards/premium) use the same HTML structure
  // Visual differences are handled purely by CSS variables and [data-layout] selectors
  // Mobile menu drawer (used when navbar is hidden at top of homepage)
  return (
    <div dir={lang === 'he' ? 'rtl' : 'ltr'} className="booking-root min-h-screen" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>

      {/* ── Floating hamburger — only when navbar is hidden (top of homepage), desktop only ── */}
      {isHome && !scrolled && (
        <div className="hidden md:block">
        <button
          onClick={() => setMenuOpen(true)}
          className="fixed top-4 right-4 z-50 w-11 h-11 flex flex-col justify-center items-center gap-1.5 rounded-xl"
          style={{
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <span className="block w-5 h-0.5 bg-white rounded-full" />
          <span className="block w-5 h-0.5 bg-white rounded-full" />
          <span className="block w-3.5 h-0.5 bg-white rounded-full self-end" />
        </button>
        </div>
      )}

      {/* ── Slide-in drawer (shared) ── */}
      {isHome && (
        <>
          {/* Slide-in drawer */}
          <AnimatePresence>
            {menuOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 bg-black/60"
                  onClick={() => setMenuOpen(false)}
                />
                <motion.div
                  initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                  className="fixed top-0 right-0 bottom-0 z-50 w-72 flex flex-col"
                  style={{ background: '#0e0e0e' }}
                >
                  {/* Drawer header */}
                  <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold overflow-hidden flex-shrink-0"
                        style={{ background: 'var(--color-gold)', color: '#fff' }}>
                        {logoUrl ? <img src={logoUrl} alt="logo" className="w-full h-full object-cover" /> : BUSINESS.logoText}
                      </div>
                      <span className="font-bold text-white text-sm whitespace-nowrap">{BUSINESS.name}</span>
                    </div>
                    <button onClick={() => setMenuOpen(false)} className="text-white/50 hover:text-white text-2xl w-8 h-8 flex items-center justify-center">×</button>
                  </div>

                  {/* Drawer links */}
                  <nav className="flex-1 p-4 flex flex-col gap-1">
                    {[
                      { label: 'שירותים',   href: '/#services', icon: '✂' },
                      { label: 'הצוות',     href: '/#team',     icon: '👤' },
                      { label: 'צור קשר',   href: '/#contact',  icon: '📍' },
                    ].map(link => (
                      <a
                        key={link.href}
                        href={link.href}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                        style={{ color: 'rgba(255,255,255,0.8)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span className="w-5 text-center">{link.icon}</span>
                        {link.label}
                      </a>
                    ))}

                    {user && (
                      <Link to="/my-appointments" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium"
                        style={{ color: 'rgba(255,255,255,0.8)' }}>
                        <span className="w-5 text-center">📅</span>
                        {t.myAppointments}
                      </Link>
                    )}

                    {profile?.role === 'admin' && (
                      <Link to="/admin" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium"
                        style={{ color: 'var(--color-gold)' }}>
                        <span className="w-5 text-center">⚙</span>
                        {t.admin}
                      </Link>
                    )}
                  </nav>

                  {/* Drawer bottom */}
                  <div className="p-4 border-t flex flex-col gap-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                    <Link to={bookHref} onClick={() => setMenuOpen(false)} className="btn-primary justify-center py-3">
                      ✂ {t.bookNow}
                    </Link>
                    {user ? (
                      <button onClick={() => { handleSignOut(); setMenuOpen(false) }}
                        className="text-sm py-2 text-center"
                        style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {t.logout}
                      </button>
                    ) : (
                      <Link to="/login" onClick={() => setMenuOpen(false)}
                        className="text-sm py-2 text-center"
                        style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {t.login}
                      </Link>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Navbar — desktop only; mobile uses bottom bar */}
      <motion.header
        className="booking-navbar fixed top-0 right-0 left-0 z-40 hidden md:block"
        animate={{ opacity: navVisible ? 1 : 0, y: navVisible ? 0 : -8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{
          background: 'rgba(10,10,10,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          pointerEvents: navVisible ? 'auto' : 'none',
          borderBottom: navVisible ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}
      >
        {isHome ? (
          /* ── MINIMAL: homepage scrolled — logo + book + hamburger (mobile) ── */
          <nav className="flex items-center justify-between h-14 px-5">
            <Link to="/" className="flex items-center">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm overflow-hidden flex-shrink-0"
                style={{ background: 'var(--color-gold)', color: '#fff' }}
              >
                {logoUrl
                  ? <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
                  : BUSINESS.logoText}
              </div>
            </Link>

            <div className="flex items-center gap-3">
              {/* Desktop links */}
              {user && profile?.role === 'admin' && (
                <Link to="/admin" className="hidden md:flex text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(201,169,110,0.15)', color: 'var(--color-gold)' }}>
                  {t.admin}
                </Link>
              )}
              {user ? (
                <Link to="/my-appointments" className="hidden md:flex text-sm font-medium"
                  style={{ color: 'rgba(255,255,255,0.65)' }}>
                  {t.myAppointments}
                </Link>
              ) : (
                <Link to="/login" className="hidden md:flex text-sm font-medium"
                  style={{ color: 'rgba(255,255,255,0.65)' }}>
                  {t.login}
                </Link>
              )}
              <Link to={bookHref} className="btn-primary text-sm px-4 py-2">
                {t.bookNow}
              </Link>
              {/* Mobile hamburger — inside navbar when scrolled */}
              <button
                onClick={() => setMenuOpen(true)}
                className="md:hidden flex flex-col justify-center items-center gap-1.5 w-9 h-9 rounded-lg"
                style={{ color: 'white' }}
              >
                <span className="block w-4.5 h-0.5 bg-white rounded-full" />
                <span className="block w-4.5 h-0.5 bg-white rounded-full" />
                <span className="block w-3 h-0.5 bg-white rounded-full self-end" />
              </button>
            </div>
          </nav>
        ) : (
          /* ── FULL: other pages ── */
          <>
            <nav className="container flex items-center justify-between h-16 px-4 sm:px-6">
              {/* Logo */}
              <Link to="/" className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base overflow-hidden"
                  style={{ background: 'var(--color-gold)', color: '#fff' }}
                >
                  {logoUrl
                    ? <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
                    : BUSINESS.logoText}
                </div>
                <span className="font-bold text-base tracking-tight whitespace-nowrap" style={{ color: '#fff', letterSpacing: '-0.01em' }}>
                  {BUSINESS.name}
                </span>
              </Link>

              {/* Desktop nav */}
              <div className="hidden md:flex items-center gap-5">
                <button
                  onClick={toggleLang}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full border transition-all"
                  style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)' }}
                >
                  {lang === 'he' ? 'EN' : 'עב'}
                </button>

                {user ? (
                  <div className="flex items-center gap-3">
                    <Link to="/my-appointments" className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>{t.myAppointments}</Link>
                    {profile?.role === 'admin' && (
                      <Link to="/admin" className="text-sm font-semibold" style={{ color: 'var(--color-gold)' }}>{t.admin}</Link>
                    )}
                    <button onClick={handleSignOut} className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>{t.logout}</button>
                  </div>
                ) : (
                  <Link to="/login" className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>{t.login}</Link>
                )}

                <Link to={bookHref} className="btn-primary text-sm px-5 py-2.5">
                  {t.bookNow}
                </Link>
              </div>

              {/* Mobile hamburger */}
              <div className="md:hidden flex items-center gap-3">
                <button
                  className="w-9 h-9 flex flex-col justify-center gap-1.5"
                  style={{ color: 'rgba(255,255,255,0.8)' }}
                  onClick={() => setMenuOpen(o => !o)}
                >
                  <span className={`block h-0.5 bg-current transition-all origin-center ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                  <span className={`block h-0.5 bg-current transition-all ${menuOpen ? 'opacity-0' : ''}`} />
                  <span className={`block h-0.5 bg-current transition-all origin-center ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                </button>
              </div>
            </nav>

            {/* Mobile menu */}
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="md:hidden overflow-hidden border-t"
                  style={{ background: 'rgba(10,10,10,0.96)', borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  <div className="flex flex-col gap-1 p-4">
                    {user ? (
                      <>
                        <Link to="/my-appointments" className="py-3 px-3 rounded-xl font-medium text-sm" style={{ color: 'rgba(255,255,255,0.8)' }} onClick={() => setMenuOpen(false)}>{t.myAppointments}</Link>
                        {profile?.role === 'admin' && (
                          <Link to="/admin" className="py-3 px-3 rounded-xl font-medium text-sm" style={{ color: 'var(--color-gold)' }} onClick={() => setMenuOpen(false)}>{t.admin}</Link>
                        )}
                        <button onClick={() => { handleSignOut(); setMenuOpen(false) }} className="py-3 px-3 rounded-xl font-medium text-sm text-right" style={{ color: 'rgba(255,255,255,0.5)' }}>{t.logout}</button>
                      </>
                    ) : (
                      <Link to="/login" className="py-3 px-3 rounded-xl font-medium text-sm" style={{ color: 'rgba(255,255,255,0.8)' }} onClick={() => setMenuOpen(false)}>{t.login}</Link>
                    )}
                    <Link to={bookHref} className="btn-primary mt-3 justify-center" onClick={() => setMenuOpen(false)}>
                      {t.bookNow}
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.header>

      {/* ── Announcement modal ── */}
      {announcement && annOpen && (() => {
        const colorMap = { gold: 'var(--color-gold)', red: '#ef4444', blue: '#3b82f6' }
        const iconMap  = { gold: '📢', red: '⚠️', blue: 'ℹ️' }
        const color    = colorMap[announcement.announcement_color] ?? colorMap.gold
        const icon     = iconMap[announcement.announcement_color]  ?? iconMap.gold
        return (
          <Modal open={annOpen} onClose={handleAnnouncementClose}>
            {/* Colored accent strip at top */}
            <div className="rounded-t-xl -mx-6 -mt-6 mb-5 px-6 pt-5 pb-4 text-center"
              style={{ background: `${color}18`, borderBottom: `3px solid ${color}` }}>
              <div className="text-3xl mb-2">{icon}</div>
              <h2 className="text-lg font-bold leading-snug" style={{ color }}>
                {announcement.announcement_title}
              </h2>
            </div>

            {/* Body */}
            <p className="text-sm leading-relaxed text-center mb-6"
              style={{ color: 'var(--color-text)', whiteSpace: 'pre-wrap', opacity: 0.85 }}>
              {announcement.announcement_body}
            </p>

            {/* Button */}
            <button
              onClick={handleAnnouncementClose}
              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: color }}
            >
              הבנתי ✓
            </button>
          </Modal>
        )
      })()}

      <main>{children}</main>

      {/* Footer — extra bottom padding on mobile to clear the floating bottom bar */}
      <footer
        className="border-t pt-10 pb-32 md:pb-10 mt-8"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}
      >
        <div className="container px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: 'var(--color-gold)', color: '#fff' }}>
                  {BUSINESS.logoText}
                </div>
                <span className="font-bold text-base" style={{ color: 'var(--color-text)' }}>{BUSINESS.name}</span>
              </div>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{BUSINESS.tagline}</p>
            </div>
            <div>
              <h4 className="font-bold mb-3 text-sm" style={{ color: 'var(--color-text)' }}>{t.contact}</h4>
              {[BUSINESS.address, BUSINESS.phone, BUSINESS.email].filter(Boolean).map(v => (
                <p key={v} className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>{v}</p>
              ))}
            </div>
            <div>
              <h4 className="font-bold mb-3 text-sm" style={{ color: 'var(--color-text)' }}>ניווט</h4>
              <div className="flex flex-col gap-1">
                <Link to={bookHref} className="text-sm hover:underline" style={{ color: 'var(--color-muted)' }}>{t.bookNow}</Link>
                <Link to="/login" className="text-sm hover:underline" style={{ color: 'var(--color-muted)' }}>{t.login}</Link>
              </div>
            </div>
          </div>
          <div className="border-t mt-8 pt-6 text-center text-xs flex items-center justify-center gap-3" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
            <span>© {new Date().getFullYear()} {BUSINESS.name}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <a href="/privacy" className="hover:underline" style={{ color: 'var(--color-muted)' }}>מדיניות פרטיות</a>
          </div>
        </div>
      </footer>

      {/* ── Mobile floating bottom bar ── */}
      <div
        className="mobile-bottom-bar md:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{ padding: '0 10px calc(10px + env(safe-area-inset-bottom, 0px))' }}
      >
        <nav style={{
          background: barNavBg,
          backdropFilter: barNavBlur,
          WebkitBackdropFilter: barNavBlur,
          border: `1px solid ${barNavBorder}`,
          borderRadius: '26px',
          boxShadow: barNavShadow,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '10px 6px',
        }}>
          <BottomBarButton to="/" icon="home" label="בית" active={location.pathname === '/'} barText={barText} barBgActive={barBgActive} />
          {/* Central book button — elevated pill */}
          <Link
            to={bookHref}
            className="flex flex-col items-center gap-1 px-5 py-2.5 rounded-2xl"
            style={{
              background: 'var(--color-gold-btn, var(--color-gold))',
              color: '#fff',
              boxShadow: '0 10px 36px var(--color-accent-glow), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.22)',
              transform: 'translateY(-8px)',
              minWidth: 64,
              textAlign: 'center',
            }}
          >
            <BarIcon name="scissors" size={24} color="#fff" />
            <span className="text-[10px] font-bold leading-none">הזמן תור</span>
          </Link>
          {user
            ? <BottomBarButton to="/my-appointments" icon="calendar" label="התורים שלי" active={location.pathname === '/my-appointments'} barText={barText} barBgActive={barBgActive} />
            : <BottomBarButton to="/login" icon="person" label="כניסה" active={location.pathname.startsWith('/login')} barText={barText} barBgActive={barBgActive} />
          }
          {isAdmin && (
            <BottomBarButton to="/admin" icon="settings" label="ניהול" active={location.pathname.startsWith('/admin')} barText={barText} barBgActive={barBgActive} />
          )}
        </nav>
      </div>
    </div>
  )
}

// SVG icon set — color passed directly to stroke (not via currentColor, avoids CSS overrides)
function BarIcon({ name, size = 26, color = '#222' }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (name === 'home') return (
    <svg {...p}>
      <path d="M3 11L12 3l9 8v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9z" />
      <path d="M9 22V13h6v9" />
    </svg>
  )
  if (name === 'calendar') return (
    <svg {...p}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <circle cx="8" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="15" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
  if (name === 'person') return (
    <svg {...p}>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21v-1a8 8 0 0116 0v1" />
    </svg>
  )
  if (name === 'settings') return (
    <svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
  if (name === 'scissors') return (
    <svg {...p} strokeWidth={2.2}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  )
  return null
}

function BottomBarButton({ to, icon, label, active, barText, barBgActive }) {
  const iconColor = active ? 'var(--color-gold)' : barText
  // Use a darker gold for the small label text to meet WCAG AA contrast
  const labelColor = active ? 'var(--color-gold-text, var(--color-gold))' : barText
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-2xl relative"
      style={{ minWidth: 58, background: active ? barBgActive : 'transparent' }}
    >
      {active && (
        <span
          className="absolute left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
          style={{ background: 'var(--color-gold)', top: '-1px' }}
        />
      )}
      {/* Color passed directly to SVG stroke — bypasses any CSS color inheritance issues */}
      <BarIcon name={icon} size={26} color={iconColor} />
      <span className="text-[10px] font-semibold leading-none text-center" style={{ color: labelColor }}>{label}</span>
    </Link>
  )
}

