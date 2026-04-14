import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { useBranch } from '../contexts/BranchContext'
import { useBusinessSettings } from '../hooks/useBusinessSettings'
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
  { to: '/admin/invoices',     label: 'חשבוניות',    icon: '🧾' },
  { to: '/admin/messages',     label: 'הודעות',      icon: '📨' },
  { to: '/admin/appearance',   label: 'עיצוב',       icon: '🎨' },
  { to: '/admin/settings',     label: 'הגדרות',      icon: '⚙' },
]

const PAYMENT_LINK = { to: '/admin/payments', label: 'תשלומים', icon: '💳' }

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
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Build nav links — inject Payments only when payment is enabled
  const NAV_LINKS = settings?.payment_enabled
    ? [...BASE_NAV_LINKS.slice(0, 7), PAYMENT_LINK, ...BASE_NAV_LINKS.slice(7)]
    : BASE_NAV_LINKS

  // Scroll to top on every route change
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [location.pathname])

  if (loading) return <PageSpinner />
  if (!user || profile?.role !== 'admin') return <Navigate to="/login" replace />

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <div dir="rtl" className="flex min-h-screen bg-gray-50" data-admin="true">
      {/* Sidebar — desktop */}
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

        {/* Branch Switcher */}
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
            style={{ background: 'rgba(201,169,110,0.15)', color: 'var(--color-gold)', border: '1px solid rgba(201,169,110,0.3)' }}
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

      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed top-0 right-0 bottom-0 z-40 w-64 bg-[var(--color-primary)] text-white flex flex-col lg:hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <span className="font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{BUSINESS.name}</span>
              <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <nav className="flex-1 p-3 flex flex-col gap-1">
              {NAV_LINKS.map(link => {
                const active = location.pathname === link.to
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active ? 'bg-[var(--color-gold)] text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'
                    }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className="text-base w-5 text-center">{link.icon}</span>
                    {link.label}
                  </Link>
                )
              })}
            </nav>
            {/* Mobile branch switcher */}
            <BranchSwitcher />

            {/* Mobile sidebar bottom */}
            <div className="p-4 border-t border-white/10">
              <Link
                to="/"
                onClick={() => setSidebarOpen(false)}
                className="w-full text-sm font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 px-3 mb-2"
                style={{ background: 'rgba(201,169,110,0.15)', color: 'var(--color-gold)', border: '1px solid rgba(201,169,110,0.3)' }}
              >
                🌐 צפה באתר
              </Link>
              <button
                onClick={() => { handleSignOut(); setSidebarOpen(false) }}
                className="w-full text-sm text-gray-400 hover:text-white py-2 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2 px-3"
              >
                ↩ יציאה
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 lg:mr-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
          <button
            className="lg:hidden text-gray-600 hover:text-gray-900"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div className="hidden sm:block text-sm text-gray-500">
            {new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-sm font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
              style={{ background: 'rgba(201,169,110,0.1)', color: 'var(--color-gold)', border: '1px solid rgba(201,169,110,0.25)' }}
            >
              🌐 צפה באתר
            </Link>
            <div className="w-8 h-8 rounded-full bg-[var(--color-gold)]/10 flex items-center justify-center text-[var(--color-gold)] font-semibold text-sm">
              {profile?.name?.[0] ?? 'A'}
            </div>
            <span className="text-sm font-medium text-gray-700 hidden sm:block">{profile?.name}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
