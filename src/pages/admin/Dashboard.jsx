import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { startOfDay, endOfDay, addDays } from 'date-fns'

import { useAllAppointments } from '../../hooks/useAppointments'
import { useStaff } from '../../hooks/useStaff'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useBranch } from '../../contexts/BranchContext'
import { isWaitlistExpired, sweepExpiredWaitlist } from '../../hooks/useWaitlist'

import { supabase } from '../../lib/supabase'
import { formatDateFull } from '../../lib/utils'

import { NextAppointmentHero } from '../../components/admin/dashboard/NextAppointmentHero'
import { UpcomingAppointmentsList } from '../../components/admin/dashboard/UpcomingAppointmentsList'
import { KpiStrip } from '../../components/admin/dashboard/KpiStrip'
import { WalkInModal } from '../../components/admin/dashboard/WalkInModal'
import { ActionInbox } from '../../components/admin/dashboard/ActionInbox'

export function Dashboard() {
  const today = new Date()
  const navigate = useNavigate()
  const { currentBranch } = useBranch()
  const { staff } = useStaff({ activeOnly: true, branchId: currentBranch?.id ?? null })
  const { settings, saveSettings } = useBusinessSettings()

  // Today + week appointments (realtime built in)
  const { appointments: todayAppts, loading: loadingToday, refetch: refetchAppts } = useAllAppointments({
    startDate: startOfDay(today),
    endDate: endOfDay(today),
    branchId: currentBranch?.id ?? null,
  })

  // ── State for action inbox + walk-in ──
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [uninvoiced, setUninvoiced] = useState([])
  const [openDebts, setOpenDebts] = useState([])
  const [waitlistActive, setWaitlistActive] = useState([])
  const [nowTick, setNowTick] = useState(Date.now())

  // Tick every minute to re-filter waitlist expirations in-place
  useEffect(() => {
    const i = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(i)
  }, [])

  // ── Fetch action inbox data ──
  const fetchInbox = useCallback(async () => {
    // 1. Uninvoiced completed appointments
    const { data: uninv } = await supabase
      .from('appointments')
      .select('id, start_at, services(name, price), profiles(name)')
      .eq('status', 'completed')
      .eq('invoice_sent', false)
      .order('start_at', { ascending: false })
      .limit(20)
    setUninvoiced(uninv ?? [])

    // 2. Open debts
    const { data: debts } = await supabase
      .from('customer_debts')
      .select('id, amount, description, created_at, customer_id, profiles:customer_id(id, name, phone)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setOpenDebts(debts ?? [])

    // 3. Waitlist — pending only, filter expired
    const { data: wl } = await supabase
      .from('waitlist')
      .select('*, profiles(name, phone), services(name)')
      .eq('status', 'pending')
      .order('preferred_date', { ascending: true })
      .order('created_at', { ascending: true })
    // Fire-and-forget DB sweep
    sweepExpiredWaitlist(wl || [])
    setWaitlistActive((wl || []).filter(e => !isWaitlistExpired(e)))
  }, [])

  useEffect(() => { fetchInbox() }, [fetchInbox])

  // Re-filter waitlist as the minute ticks over
  useEffect(() => {
    setWaitlistActive(prev => prev.filter(e => !isWaitlistExpired(e)))
  }, [nowTick])

  // ── Realtime subscriptions for inbox data ──
  useEffect(() => {
    const invoicesCh = supabase.channel(`dash-invoices-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, fetchInbox)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, fetchInbox)
      .subscribe()
    const debtsCh = supabase.channel(`dash-debts-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_debts' }, fetchInbox)
      .subscribe()
    const wlCh = supabase.channel(`dash-waitlist-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist' }, fetchInbox)
      .subscribe()
    return () => {
      try { supabase.removeChannel(invoicesCh) } catch {}
      try { supabase.removeChannel(debtsCh) } catch {}
      try { supabase.removeChannel(wlCh) } catch {}
    }
  }, [fetchInbox])

  // ── Derived: the "next" appointment + upcoming ──
  const { nextApt, upcoming, stats } = useMemo(() => {
    const now = Date.now()
    const future = todayAppts
      .filter(a => a.status === 'confirmed' || a.status === 'pending_reschedule')
      .filter(a => new Date(a.start_at).getTime() > now - 30 * 60_000) // include "just started / late by 30 min"
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))

    const [next, ...rest] = future

    // Today stats
    const completed = todayAppts.filter(a => a.status === 'completed' && !a.no_show)
    const revenuePaid = completed
      .filter(a => a.payment_status === 'paid')
      .reduce((s, a) => s + (Number(a.services?.price) || 0), 0)
    const revenueExpected = todayAppts
      .filter(a => a.status === 'confirmed' || a.status === 'pending_reschedule')
      .reduce((s, a) => s + (Number(a.services?.price) || 0), 0)
    const noShows = todayAppts.filter(a => a.no_show === true)
    const totalToday = todayAppts.filter(a => a.status !== 'cancelled').length
    const doneToday = completed.length

    const debtsSum = openDebts.reduce((s, d) => s + Number(d.amount || 0), 0)

    const stats = [
      {
        label: 'תורים היום',
        value: `${doneToday}/${totalToday}`,
        sub: 'הושלמו/סה"כ',
        accent: 'var(--color-text)',
      },
      {
        label: 'הכנסה בפועל',
        value: `₪${revenuePaid.toLocaleString('he-IL')}`,
        sub: 'שולם היום',
        accent: '#16a34a',
        tint: 'var(--color-success-tint)',
      },
      {
        label: 'צפוי היום',
        value: `₪${revenueExpected.toLocaleString('he-IL')}`,
        sub: `${future.length} תורים נותרו`,
        accent: 'var(--color-gold)',
        tint: 'var(--color-gold-tint)',
      },
      {
        label: 'חובות פתוחים',
        value: `₪${debtsSum.toLocaleString('he-IL')}`,
        sub: `${openDebts.length} לקוחות`,
        accent: openDebts.length > 0 ? '#dc2626' : 'var(--color-muted)',
        tint: openDebts.length > 0 ? 'var(--color-danger-tint)' : undefined,
      },
      {
        label: 'לא הגיעו',
        value: String(noShows.length),
        accent: noShows.length > 0 ? '#dc2626' : 'var(--color-muted)',
        tint: noShows.length > 0 ? 'var(--color-danger-tint)' : undefined,
      },
      {
        label: 'ממתינים',
        value: String(waitlistActive.length),
        accent: waitlistActive.length > 0 ? 'var(--color-gold)' : 'var(--color-muted)',
        tint: waitlistActive.length > 0 ? 'var(--color-gold-tint)' : undefined,
      },
    ]

    return { nextApt: next, upcoming: rest, stats }
  }, [todayAppts, openDebts, waitlistActive])

  // ── Handle schedule from waitlist ──
  function handleScheduleWaitlist(entry) {
    sessionStorage.setItem('waitlist_prefill', JSON.stringify({
      waitlistId:    entry.id,
      customerId:    entry.customer_id,
      customerName:  entry.profiles?.name ?? '',
      customerPhone: entry.profiles?.phone ?? '',
      serviceId:     entry.service_id ?? '',
      staffId:       entry.staff_id   ?? '',
      date:          entry.preferred_date ?? '',
      startTime:     entry.time_from?.slice(0,5) ?? '',
      wlTimeFrom:    entry.time_from?.slice(0,5) ?? '',
      wlTimeTo:      entry.time_to?.slice(0,5)   ?? '',
    }))
    navigate('/admin/appointments')
  }

  const refreshAll = () => { refetchAppts(); fetchInbox() }

  return (
    <div className="max-w-full overflow-x-hidden">
      {/* Header — stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black truncate" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            🎯 לוח בקרה
          </h1>
          <p className="text-[11px] sm:text-xs mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>
            {formatDateFull(today)}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => setWalkInOpen(true)}
            className="flex-1 sm:flex-none text-xs font-black px-3 py-2.5 rounded-xl active:scale-95 transition-all whitespace-nowrap"
            style={{ background: 'var(--color-gold)', color: '#fff' }}>
            💰 תקבול מהיר
          </button>
          <Link to="/book/service"
            className="flex-1 sm:flex-none text-xs font-bold px-3 py-2.5 rounded-xl text-center whitespace-nowrap"
            style={{ background: 'var(--color-card)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
            + תור
          </Link>
        </div>
      </div>

      {/* Responsive grid: single col on mobile, 3-col (2 main + 1 sidebar) on lg+.
          Mobile order: Hero → KPIs → Inbox → Upcoming → Staff → GapCloser.
          Desktop: main content stacked on one side, sidebar on the other. */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Hero — next appointment */}
        <div className="order-1 lg:col-span-2">
          <NextAppointmentHero apt={nextApt} onChange={refreshAll} />
        </div>

        {/* KPI grid */}
        <div className="order-2 lg:order-3">
          <KpiStrip stats={stats} />
        </div>

        {/* Action inbox */}
        <div className="order-3 lg:order-5">
          <ActionInbox
            uninvoiced={uninvoiced}
            openDebts={openDebts}
            debtsTotal={openDebts.reduce((s, d) => s + Number(d.amount || 0), 0)}
            waitlist={waitlistActive}
            onScheduleWaitlist={handleScheduleWaitlist}
          />
        </div>

        {/* 3 upcoming */}
        <div className="order-4 lg:order-2 lg:col-span-2">
          <UpcomingAppointmentsList appointments={upcoming} limit={3} />
        </div>

        {/* Staff compact row */}
        {staff.length > 0 && (
          <div className="order-5 lg:order-4 lg:col-span-2">
            <section className="mb-4">
          <h2 className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>
            ✂️ הספרים היום
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {staff.map(m => {
              const mine = todayAppts.filter(a => a.staff_id === m.id)
              const done = mine.filter(a => a.status === 'completed').length
              const total = mine.filter(a => a.status !== 'cancelled').length
              const revenue = mine
                .filter(a => a.status === 'completed' && a.payment_status === 'paid')
                .reduce((s, a) => s + (Number(a.services?.price) || 0), 0)
              return (
                <div key={m.id} className="flex-shrink-0 rounded-2xl p-3 min-w-[130px]"
                  style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black"
                      style={{ background: 'var(--color-gold)', color: '#fff' }}>
                      {m.name?.[0] || '?'}
                    </div>
                    <div className="text-xs font-bold truncate" style={{ color: 'var(--color-text)' }}>
                      {m.name}
                    </div>
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                    {done}/{total} תורים · ₪{revenue.toLocaleString('he-IL')}
                  </div>
                </div>
                )
              })}
            </div>
          </section>
          </div>
        )}

        {/* Gap Closer */}
        <div className="order-6">
          <GapCloserCard settings={settings} saveSettings={saveSettings} />
        </div>
      </div>

      {/* Walk-in modal */}
      <WalkInModal open={walkInOpen} onClose={() => setWalkInOpen(false)} onSaved={refreshAll} />
    </div>
  )
}

/* ── Gap Closer Quick Card (unchanged) ─────────────────────────── */
const MODE_OPTIONS = [
  { value: 'off',      label: 'כבוי',    icon: '⭕' },
  { value: 'approval', label: 'ידני',    icon: '👆' },
  { value: 'auto',     label: 'אוטומטי', icon: '⚡' },
]

function GapCloserCard({ settings, saveSettings }) {
  const mode = settings?.gap_closer_mode || 'off'
  const threshold = settings?.gap_closer_threshold_minutes || 30
  const advanceHours = settings?.gap_closer_advance_hours ?? 2
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)

  async function updateField(field, value) {
    setSaving(true)
    try { await saveSettings({ [field]: value }) }
    finally { setSaving(false) }
  }

  const currentMode = MODE_OPTIONS.find(m => m.value === mode) || MODE_OPTIONS[0]

  return (
    <section className="rounded-2xl p-4 mb-5"
      style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">🧩</span>
          <div className="min-w-0">
            <h2 className="font-black text-sm" style={{ color: 'var(--color-text)' }}>Gap Closer</h2>
            <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              מצב: <strong style={{ color: mode !== 'off' ? 'var(--color-gold)' : 'var(--color-muted)' }}>
                {currentMode.label}
              </strong>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
            {MODE_OPTIONS.map(opt => (
              <button key={opt.value}
                onClick={() => updateField('gap_closer_mode', opt.value)}
                disabled={saving}
                className="px-2.5 py-1.5 text-sm font-bold transition-all"
                style={{
                  background: mode === opt.value ? 'var(--color-gold)' : 'transparent',
                  color: mode === opt.value ? '#fff' : 'var(--color-muted)',
                }}>
                {opt.icon}
              </button>
            ))}
          </div>
          <button onClick={() => setExpanded(!expanded)}
            className="text-sm px-2 py-1 rounded-lg"
            style={{ color: 'var(--color-muted)' }}>
            {expanded ? '▲' : '⚙️'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && mode !== 'off' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 pt-3 grid grid-cols-2 gap-3"
              style={{ borderTop: '1px solid var(--color-border)' }}>
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  סף חור (דק׳)
                </label>
                <input className="input w-full text-sm" type="number"
                  min={10} max={120} step={5}
                  value={threshold}
                  onChange={e => updateField('gap_closer_threshold_minutes', parseInt(e.target.value) || 30)} />
              </div>
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  התחל (שע׳ לפני)
                </label>
                <input className="input w-full text-sm" type="number"
                  min={0.5} max={12} step={0.5}
                  value={advanceHours}
                  onChange={e => updateField('gap_closer_advance_hours', parseFloat(e.target.value) || 2)} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
