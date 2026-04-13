import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BUSINESS } from '../config/business'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useLang } from '../contexts/LangContext'
import { useBusinessSettings } from '../hooks/useBusinessSettings'

export function BookingLayout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { user, profile, signOut } = useAuth()
  const { layout, theme } = useTheme()
  const { settings } = useBusinessSettings()
  const logoUrl = settings?.logo_url
  const bookHref = (theme === 'orange' || theme === 'app-copy') ? '/book/all' : '/book/service'
  const { lang, toggleLang, t } = useLang()
  const location = useLocation()
  const navigate = useNavigate()

  const isHome = location.pathname === '/'

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

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  if (layout === 'app') {
    return <AppLayout children={children} user={user} profile={profile} handleSignOut={handleSignOut} t={t} lang={lang} toggleLang={toggleLang} location={location} />
  }

  if (layout === 'minimal') {
    return <MinimalLayout children={children} user={user} profile={profile} handleSignOut={handleSignOut} t={t} lang={lang} toggleLang={toggleLang} location={location} navigate={navigate} />
  }

  // Default layout
  return (
    <div dir={lang === 'he' ? 'rtl' : 'ltr'} className="min-h-screen" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>

      {/* Navbar — hides at top of homepage, appears on scroll */}
      <motion.header
        className="fixed top-0 right-0 left-0 z-40"
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
          /* ── MINIMAL: homepage scrolled — just logo icon + book button ── */
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
              {user && profile?.role === 'admin' && (
                <Link to="/admin" className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(201,169,110,0.15)', color: 'var(--color-gold)' }}>
                  {t.admin}
                </Link>
              )}
              {user ? (
                <Link to="/my-appointments" className="text-sm font-medium"
                  style={{ color: 'rgba(255,255,255,0.65)' }}>
                  {t.myAppointments}
                </Link>
              ) : (
                <Link to="/login" className="text-sm font-medium"
                  style={{ color: 'rgba(255,255,255,0.65)' }}>
                  {t.login}
                </Link>
              )}
              <Link to={bookHref} className="btn-primary text-sm px-5 py-2">
                {t.bookNow}
              </Link>
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
                <span className="font-bold text-base tracking-tight" style={{ color: '#fff', letterSpacing: '-0.01em' }}>
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

      <main>{children}</main>

      {/* Footer */}
      <footer className="border-t py-10 mt-8" style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}>
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
                <Link to="/book/service" className="text-sm hover:underline" style={{ color: 'var(--color-muted)' }}>{t.bookNow}</Link>
                <Link to="/login" className="text-sm hover:underline" style={{ color: 'var(--color-muted)' }}>{t.login}</Link>
              </div>
            </div>
          </div>
          <div className="border-t mt-8 pt-6 text-center text-xs" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
            © {new Date().getFullYear()} {BUSINESS.name}
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── APP LAYOUT ────────────────────────────────────────────────────
function AppLayout({ children, user, profile, handleSignOut, t, lang, toggleLang, location }) {
  const tabs = [
    { to: '/',                   icon: '⌂', label: 'בית' },
    { to: '/book/service',       icon: '✂', label: t.bookNow },
    { to: '/my-appointments',    icon: '📅', label: lang === 'he' ? 'התורים' : 'Appts' },
    { to: user ? '#' : '/login', icon: user ? '↩' : '⎗', label: user ? t.logout : t.login, action: user ? handleSignOut : null },
  ]

  return (
    <div dir={lang === 'he' ? 'rtl' : 'ltr'} className="min-h-screen pb-20" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>
      <header className="fixed top-0 right-0 left-0 z-40 h-14 flex items-center justify-between px-4 border-b"
        style={{ background: '#111', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm"
            style={{ background: 'var(--color-gold)', color: '#fff' }}>
            {BUSINESS.logoText}
          </div>
          <span className="font-bold text-sm" style={{ color: '#fff' }}>
            {BUSINESS.name}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={toggleLang} className="text-xs font-semibold px-2 py-1 rounded-full border"
            style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)' }}>
            {lang === 'he' ? 'EN' : 'עב'}
          </button>
          {profile?.role === 'admin' && (
            <Link to="/admin" className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(255,122,0,0.15)', color: 'var(--color-gold)' }}>
              {t.admin}
            </Link>
          )}
        </div>
      </header>

      <main className="pt-14">{children}</main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 right-0 left-0 z-40 border-t flex"
        style={{ background: '#111', borderColor: 'rgba(255,255,255,0.08)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map(tab => {
          const active = location.pathname === tab.to
          return (
            <Link
              key={tab.to}
              to={tab.action ? '#' : tab.to}
              onClick={tab.action || undefined}
              className="flex-1 flex flex-col items-center gap-1 py-3 text-center transition-all"
              style={{ color: active ? 'var(--color-gold)' : 'rgba(255,255,255,0.5)' }}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

// ── MINIMAL LAYOUT ────────────────────────────────────────────────
function MinimalLayout({ children, user, profile, handleSignOut, t, lang, toggleLang, location, navigate }) {
  return (
    <div dir={lang === 'he' ? 'rtl' : 'ltr'} className="min-h-screen" style={{ background: '#fff', color: '#111' }}>
      <header className="sticky top-0 z-40 h-14 border-b flex items-center px-6" style={{ background: '#fff', borderColor: '#f0f0f0' }}>
        <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
          <Link to="/" className="font-bold text-base" style={{ letterSpacing: '-0.02em', color: '#111' }}>
            {BUSINESS.name}
          </Link>
          <div className="flex items-center gap-4">
            <button onClick={toggleLang} className="text-xs font-medium px-2 py-1 rounded border" style={{ borderColor: '#e5e5e5', color: '#666' }}>
              {lang === 'he' ? 'EN' : 'עב'}
            </button>
            {user ? (
              <>
                <Link to="/my-appointments" className="text-sm" style={{ color: '#666' }}>{t.myAppointments}</Link>
                {profile?.role === 'admin' && <Link to="/admin" className="text-sm font-semibold" style={{ color: '#111' }}>{t.admin}</Link>}
                <button onClick={handleSignOut} className="text-sm" style={{ color: '#999' }}>{t.logout}</button>
              </>
            ) : (
              <Link to="/login" className="text-sm" style={{ color: '#666' }}>{t.login}</Link>
            )}
            <Link to="/book/service" className="text-sm font-bold px-4 py-2 rounded-full"
              style={{ background: '#111', color: '#fff' }}>
              {t.bookNow}
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t py-8 mt-16" style={{ borderColor: '#f0f0f0' }}>
        <div className="max-w-2xl mx-auto px-6 text-center text-sm" style={{ color: '#999' }}>
          {BUSINESS.address} · {BUSINESS.phone}
          <br />
          © {new Date().getFullYear()} {BUSINESS.name}
        </div>
      </footer>
    </div>
  )
}
