import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { useBranch } from '../contexts/BranchContext'
import { useBusinessSettings } from '../hooks/useBusinessSettings'
import { useTheme } from '../contexts/ThemeContext'
import { useAndroidBack } from '../hooks/useAndroidBack'
import { useKeyboardAware } from '../hooks/useKeyboardAware'
import { useOnline } from '../hooks/useOnline'
import { BUSINESS } from '../config/business'
import { PageSpinner } from '../components/ui/Spinner'

const BASE_NAV_LINKS = [
  { to: '/admin',              label: 'לוח בקרה',    icon: '⊞' },
  { to: '/admin/appointments', label: 'יומן תורים',  icon: '📅' },
  { to: '/admin/customers',    label: 'לקוחות',      icon: '👥' },
  { to: '/admin/waitlist',     label: 'רשימת המתנה', icon: '📋' },
  { to: '/admin/staff',        label: 'ספרים',       icon: '✂' },
  { to: '/admin/services',     label: 'שירותים',     icon: '📋' },
  { to: '/admin/products',     label: 'מוצרים',      icon: '🛍️' },
  { to: '/admin/finance',      label: 'פיננסים',     icon: '💰' },
  { to: '/admin/messages',     label: 'הודעות',      icon: '📨' },
  { to: '/admin/appearance',   label: 'עיצוב',       icon: '🎨' },
  { to: '/admin/settings',     label: 'הגדרות',      icon: '⚙' },
]

// Payment link removed — merged into /admin/finance

// Bottom toolbar: 2 left + center (elevated) + 2 right + more
const BOTTOM_LEFT  = [
  { to: '/admin',           label: 'בקרה',   svgIcon: 'dashboard' },
  { to: '/admin/customers', label: 'לקוחות', svgIcon: 'people'    },
]
const BOTTOM_CENTER = { to: '/admin/appointments', label: 'יומן', svgIcon: 'calendar' }
const BOTTOM_RIGHT  = [
  { to: '/admin/messages',  label: 'הודעות', svgIcon: 'message'   },
]

// "More" sheet — remaining items
const BOTTOM_MORE = [
  { to: '/admin/staff',        label: 'ספרים',   icon: '✂️' },
  { to: '/admin/services',     label: 'שירותים', icon: '📋' },
  { to: '/admin/products',     label: 'מוצרים',  icon: '🛍️' },
  { to: '/admin/finance',      label: 'פיננסים', icon: '💰' },
  { to: '/admin/waitlist',     label: 'המתנה',   icon: '⏳' },
  { to: '/admin/appearance',   label: 'עיצוב',   icon: '🎨' },
  { to: '/admin/settings',     label: 'הגדרות',  icon: '⚙️' },
]

// SVG icon set — matches the style of BookingLayout BarIcon
function AdminBarIcon({ name, size = 24, color = '#fff', strokeWidth = 2 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (name === 'calendar') return (
    <svg {...p}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <circle cx="8" cy="15" r="1" fill={color} stroke="none" />
      <circle cx="12" cy="15" r="1" fill={color} stroke="none" />
      <circle cx="16" cy="15" r="1" fill={color} stroke="none" />
    </svg>
  )
  if (name === 'dashboard') return (
    <svg {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
  if (name === 'people') return (
    <svg {...p}>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-1a6 6 0 0112 0v1" />
      <path d="M16 3.13a4 4 0 010 7.75" />
      <path d="M21 21v-1a4 4 0 00-3-3.87" />
    </svg>
  )
  if (name === 'message') return (
    <svg {...p}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )
  if (name === 'menu') return (
    <svg {...p}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
  return null
}

function AdminV6Btn({ link, active, isDark, onClick, asButton }) {
  const gold  = 'var(--color-gold)'
  const muted = isDark ? 'rgba(255,255,255,0.45)' : '#8c8280'
  const color = active ? gold : muted
  const style = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    padding: '6px 12px', borderRadius: 14, minWidth: 54, textDecoration: 'none',
    background: active ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(201,169,110,0.10)') : 'transparent',
    transition: 'all .24s cubic-bezier(.34,1.56,.64,1)',
    border: 'none', cursor: 'pointer',
  }
  const content = (
    <>
      <AdminBarIcon name={link.svgIcon} size={22} color={color} strokeWidth={active ? 2.1 : 1.65} />
      <span style={{ fontSize: 9, fontWeight: active ? 700 : 600, color, letterSpacing: '.03em' }}>{link.label}</span>
    </>
  )
  if (asButton) return <button onClick={onClick} style={style}>{content}</button>
  return <Link to={link.to} style={style}>{content}</Link>
}

function BranchSwitcher() {
  const { branches, currentBranch, selectBranch } = useBranch()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (branches.length === 0) return null

  return (
    <div className="px-3 pb-3 relative" ref={ref}>
      <div className="text-[10px] font-semibold text-gray-500 mb-1 px-1">📍 סניף נוכחי</div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-white"
        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
      >
        <span className="truncate">{currentBranch?.name ?? 'בחר סניף'}</span>
        <span className="text-gray-400 text-xs flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute left-3 right-3 bottom-full mb-1 rounded-xl overflow-hidden shadow-xl z-50"
            style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            {branches.map(branch => (
              <button
                key={branch.id}
                onClick={() => { selectBranch(branch); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-right hover:bg-white/10 transition-colors"
                style={{ color: branch.id === currentBranch?.id ? 'var(--color-gold)' : '#ccc' }}
              >
                <span className="text-xs">{branch.id === currentBranch?.id ? '✦' : '○'}</span>
                <span className="truncate">{branch.name}</span>
              </button>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                onClick={() => { navigate('/admin/branches'); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-right"
              >
                <span className="text-xs">⚙</span>
                <span>ניהול סניפים</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function AdminLayout({ children }) {
  const { user, profile, loading, signOut } = useAuth()
  const { settings } = useBusinessSettings()
  const { isDark } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)

  const invEnabled = settings?.invoicing_enabled !== false
  const NAV_LINKS = invEnabled ? BASE_NAV_LINKS : BASE_NAV_LINKS.filter(l => l.to !== '/admin/finance')
  const moreLinks = invEnabled ? BOTTOM_MORE : BOTTOM_MORE.filter(l => l.to !== '/admin/finance')

  const online = useOnline()

  // Scroll to top on every route change
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [location.pathname])

  // Close sheet on route change
  useEffect(() => { setSheetOpen(false) }, [location.pathname])

  // Android back button: close the "More" sheet instead of leaving the screen
  const handleAndroidBack = useCallback(() => { setSheetOpen(false) }, [])
  useAndroidBack(handleAndroidBack, sheetOpen)

  // Scroll focused input into view when soft keyboard appears (iOS / Android)
  useKeyboardAware()

  const gold = 'var(--color-gold)'

  if (loading) return <PageSpinner />
  if (!user || profile?.role !== 'admin') return <Navigate to="/login" replace />

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <div dir="rtl" className="flex min-h-screen" style={{ background: 'var(--color-surface)' }} data-admin="true">

      {/* ── Desktop Sidebar ───────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 bg-[var(--color-primary)] text-white fixed top-0 bottom-0 right-0">
        {/* Logo */}
        <div className="flex items-center gap-2 p-5 border-b border-white/10">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-gold)] flex items-center justify-center font-bold text-white text-lg">
            {BUSINESS.logoText}
          </div>
          <div>
            <div className="font-semibold text-sm" style={{ fontFamily: 'var(--font-display)' }}>{BUSINESS.name}</div>
            <div className="text-xs text-gray-400">ניהול</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 flex flex-col gap-1">
          {NAV_LINKS.map(link => {
            const active = location.pathname === link.to
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[var(--color-gold)] text-white'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="text-base w-5 text-center">{link.icon}</span>
                {link.label}
              </Link>
            )
          })}
        </nav>

        <BranchSwitcher />

        {/* Profile + Sign Out */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-[var(--color-gold)]/20 flex items-center justify-center text-[var(--color-gold)] font-semibold text-sm">
              {profile?.name?.[0] ?? 'A'}
            </div>
            <div className="text-sm">
              <div className="font-medium text-white">{profile?.name}</div>
              <div className="text-xs text-gray-400">מנהל</div>
            </div>
          </div>
          <Link
            to="/"
            className="w-full text-sm font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 px-3 mb-2"
            style={{ background: 'rgba(201,169,110,0.15)', color: gold, border: '1px solid rgba(201,169,110,0.3)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,169,110,0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(201,169,110,0.15)'}
          >
            🌐 צפה באתר
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full text-sm text-gray-400 hover:text-white py-2 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2 px-3"
          >
            ↩ יציאה
          </button>
        </div>
      </aside>

      {/* ── Mobile: "More" Sheet backdrop ────────────────────────────── */}
      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setSheetOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Mobile: "More" Slide-up Sheet ────────────────────────────── */}
      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 lg:hidden rounded-t-3xl overflow-hidden"
            style={{
              background: 'rgba(10,10,10,0.97)',
              backdropFilter: 'blur(32px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderBottom: 'none',
              boxShadow: '0 -8px 48px rgba(0,0,0,0.5)',
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
            </div>

            {/* Section title */}
            <div className="px-5 pb-3">
              <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>תפריט ניהול</p>
            </div>

            {/* Grid of items */}
            <div className="grid grid-cols-4 gap-2 px-4 pb-3">
              {moreLinks.map(link => {
                const active = location.pathname === link.to
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setSheetOpen(false)}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all"
                    style={{
                      background: active ? 'rgba(201,169,110,0.18)' : 'rgba(255,255,255,0.06)',
                      border: active ? '1px solid rgba(201,169,110,0.3)' : '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <span className="text-xl leading-none">{link.icon}</span>
                    <span className="text-[10px] font-semibold text-center leading-tight px-1"
                      style={{ color: active ? gold : 'rgba(255,255,255,0.6)' }}>
                      {link.label}
                    </span>
                  </Link>
                )
              })}
            </div>

            {/* Divider + action buttons */}
            <div className="mx-4 mb-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
            <div className="flex gap-3 px-4 py-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
              <Link
                to="/"
                onClick={() => setSheetOpen(false)}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-2xl transition-all"
                style={{ background: 'rgba(201,169,110,0.15)', color: gold, border: '1px solid rgba(201,169,110,0.25)' }}
              >
                🌐 צפה באתר
              </Link>
              <button
                onClick={() => { setSheetOpen(false); handleSignOut() }}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-medium py-3 rounded-2xl transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                ↩ יציאה
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <div className="flex-1 lg:mr-64 flex flex-col min-h-screen min-w-0 max-w-full">
        {/* Offline banner — sits above the top bar, slides in when offline */}
        <AnimatePresence>
          {!online && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="sticky top-0 z-30 overflow-hidden"
            >
              <div className="bg-yellow-400 text-yellow-900 text-xs text-center font-semibold py-2 px-4">
                ⚠️ אין חיבור לאינטרנט — שינויים ישמרו כשהחיבור יחזור
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20"
          style={{ background: 'var(--color-card)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="text-sm hidden sm:block" style={{ color: 'var(--color-muted)' }}>
            {new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="sm:hidden text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
            {BUSINESS.name}
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-sm font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
              style={{ background: 'rgba(201,169,110,0.1)', color: gold, border: '1px solid rgba(201,169,110,0.25)' }}
            >
              🌐 צפה באתר
            </Link>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm"
              style={{ background: 'rgba(201,169,110,0.12)', color: 'var(--color-gold)' }}>
              {profile?.name?.[0] ?? 'A'}
            </div>
            <span className="text-sm font-medium hidden sm:block" style={{ color: 'var(--color-text)' }}>{profile?.name}</span>
          </div>
        </header>

        {/* Page content — extra bottom padding on mobile for floating toolbar + safe area */}
        <main
          className="flex-1 p-4 sm:p-6 lg:pb-6 overflow-x-hidden"
          style={{ paddingBottom: 'calc(112px + env(safe-area-inset-bottom, 0px))', maxWidth: '100%' }}
        >
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Bar — v6 style (matches BookingLayout customer bar) ── */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40"
        style={{
          background: isDark ? 'rgba(12,12,12,0.92)' : 'rgba(255,255,255,0.94)',
          backdropFilter: 'blur(36px) saturate(2)',
          WebkitBackdropFilter: 'blur(36px) saturate(2)',
          borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)',
          boxShadow: isDark
            ? '0 -1px 0 rgba(255,255,255,0.05), 0 -8px 40px rgba(0,0,0,0.55)'
            : '0 -1px 0 rgba(0,0,0,0.05), 0 -4px 20px rgba(0,0,0,0.07)',
          borderRadius: '22px 22px 0 0',
          padding: `10px 6px calc(10px + env(safe-area-inset-bottom, 0px))`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
        }}
      >
        {/* Left items */}
        {BOTTOM_LEFT.map(link => (
          <AdminV6Btn key={link.to} link={link} active={location.pathname === link.to} isDark={isDark} />
        ))}

        {/* Center — FAB circle (calendar) */}
        {(() => {
          const active = location.pathname === BOTTOM_CENTER.to
          return (
            <Link
              to={BOTTOM_CENTER.to}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: -24, textDecoration: 'none' }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: `linear-gradient(145deg, var(--color-gold-light, #c9a96e), var(--color-gold-dark, #a07840))`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `3px solid ${isDark ? 'rgba(12,12,12,0.92)' : 'rgba(255,255,255,0.94)'}`,
                boxShadow: active
                  ? '0 4px 24px rgba(201,169,110,0.55), 0 2px 8px rgba(0,0,0,0.3)'
                  : '0 4px 20px rgba(201,169,110,0.35), 0 2px 8px rgba(0,0,0,0.2)',
              }}>
                <AdminBarIcon name="calendar" size={22} color="#fff" />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', color: isDark ? 'rgba(255,255,255,0.5)' : 'var(--color-gold)' }}>
                {BOTTOM_CENTER.label}
              </span>
            </Link>
          )
        })()}

        {/* Right items */}
        {BOTTOM_RIGHT.map(link => (
          <AdminV6Btn key={link.to} link={link} active={location.pathname === link.to} isDark={isDark} />
        ))}

        {/* "More" button */}
        <AdminV6Btn
          link={{ svgIcon: 'menu', label: 'עוד' }}
          active={sheetOpen}
          isDark={isDark}
          onClick={() => setSheetOpen(true)}
          asButton
        />
      </div>
    </div>
  )
}
