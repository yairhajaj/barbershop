import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

import { UpcomingAppointmentsList } from '../../components/admin/dashboard/UpcomingAppointmentsList'
import { KpiStrip } from '../../components/admin/dashboard/KpiStrip'
import { WalkInModal } from '../../components/admin/dashboard/WalkInModal'
import { ActionInbox } from '../../components/admin/dashboard/ActionInbox'
import { Modal } from '../../components/ui/Modal'
import { GapCloserHelpBody } from '../../components/admin/GapCloserHelpBody'
import { AppointmentDetailModal } from '../../components/admin/dashboard/AppointmentDetailModal'

export function Dashboard() {
  const today = new Date()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { currentBranch } = useBranch()
  const { staff } = useStaff({ activeOnly: true, branchId: currentBranch?.id ?? null })
  const { settings, saveSettings } = useBusinessSettings()

  // Today's appointments — for KPI stats
  const { appointments: todayAppts, loading: loadingToday, refetch: refetchAppts } = useAllAppointments({
    startDate: startOfDay(today),
    endDate: endOfDay(today),
    branchId: currentBranch?.id ?? null,
  })

  // Next 4 upcoming from any date (for the appointments list)
  const { appointments: futureAppts, refetch: refetchFuture } = useAllAppointments({
    startDate: startOfDay(today),
    endDate: endOfDay(addDays(today, 60)),
    branchId: currentBranch?.id ?? null,
  })

  // ── State ──
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [selectedAppt, setSelectedAppt] = useState(null)
  const [openDebts, setOpenDebts] = useState([])
  const [waitlistActive, setWaitlistActive] = useState([])
  const [nowTick, setNowTick] = useState(Date.now())
  const [manualIncomeToday, setManualIncomeToday] = useState(0)
  const [manualIncomeBreakdown, setManualIncomeBreakdown] = useState({})

  // Tick every minute to re-filter waitlist expirations in-place
  useEffect(() => {
    const i = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(i)
  }, [])

  const invEnabled = settings?.invoicing_enabled !== false
  const branchId   = currentBranch?.id ?? null

  // ── Inbox appointments — React Query (auto-invalidated by useAllAppointments realtime) ──
  const { data: uninvoiced = [] } = useQuery({
    queryKey: ['appointments', 'inbox', { invEnabled, branchId }],
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select('id, start_at, services(name, price), profiles(name), cash_paid, payment_status')
        .eq('status', 'confirmed')
        .lt('start_at', new Date().toISOString())
        .order('start_at', { ascending: false })
        .limit(50)
      if (branchId) q = q.or(`branch_id.eq.${branchId},branch_id.is.null`)
      const { data, error } = await q
      if (error) throw error
      return invEnabled
        ? (data ?? []).filter(a => !a.cash_paid && a.payment_status !== 'paid')
        : (data ?? [])
    },
  })

  // ── Fetch non-appointment inbox data (debts, waitlist, income) ──
  const fetchInbox = useCallback(async () => {
    // Today's manual income (walk-in receipts)
    const todayStr = new Date().toISOString().slice(0, 10)
    const { data: mi } = await supabase
      .from('manual_income')
      .select('amount, payment_method')
      .eq('date', todayStr)
    setManualIncomeToday((mi ?? []).reduce((s, r) => s + Number(r.amount || 0), 0))
    const brkd = {}
    ;(mi ?? []).forEach(r => { const m = r.payment_method || 'cash'; brkd[m] = (brkd[m] || 0) + Number(r.amount || 0) })
    setManualIncomeBreakdown(brkd)

    // Open debts
    const { data: debts } = await supabase
      .from('customer_debts')
      .select('id, amount, description, created_at, customer_id, profiles:customer_id(id, name, phone)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setOpenDebts(debts ?? [])

    // Waitlist — pending only, filter expired
    const { data: wl } = await supabase
      .from('waitlist')
      .select('*, profiles(name, phone), services(name)')
      .eq('status', 'pending')
      .order('preferred_date', { ascending: true })
      .order('created_at', { ascending: true })
    sweepExpiredWaitlist(wl || [])
    setWaitlistActive((wl || []).filter(e => !isWaitlistExpired(e)))
  }, [])

  useEffect(() => { fetchInbox() }, [fetchInbox])

  // Re-filter waitlist + full refresh every minute tick
  useEffect(() => {
    setWaitlistActive(prev => prev.filter(e => !isWaitlistExpired(e)))
    refetchAppts()
    refetchFuture()
    qc.invalidateQueries({ queryKey: ['appointments', 'inbox'] })
    fetchInbox()
  }, [nowTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime subscriptions ──
  useEffect(() => {
    const apptCh = supabase.channel(`dash-appts-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        qc.invalidateQueries({ queryKey: ['appointments'] })
        refetchAppts()
        refetchFuture()
      })
      .subscribe()
    const debtsCh = supabase.channel(`dash-debts-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_debts' }, fetchInbox)
      .subscribe()
    const wlCh = supabase.channel(`dash-waitlist-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist' }, fetchInbox)
      .subscribe()
    return () => {
      try { supabase.removeChannel(apptCh) } catch {}
      try { supabase.removeChannel(debtsCh) } catch {}
      try { supabase.removeChannel(wlCh) } catch {}
    }
  }, [fetchInbox, qc]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // Count all completed appointments as revenue (cash/card collected on the spot)
    // + add walk-in manual_income receipts
    const revenueFromAppts = completed
      .reduce((s, a) => s + (Number(a.services?.price) || 0), 0)
    const revenuePaid = revenueFromAppts + manualIncomeToday
    const revenueExpected = todayAppts
      .filter(a => a.status === 'confirmed' || a.status === 'pending_reschedule')
      .reduce((s, a) => s + (Number(a.services?.price) || 0), 0)
    const noShows = todayAppts.filter(a => a.no_show === true)
    const totalToday = todayAppts.filter(a => a.status !== 'cancelled').length
    const doneToday = completed.length

    const debtsSum = openDebts.reduce((s, d) => s + Number(d.amount || 0), 0)

    const METHOD_LABELS = { cash: '💵 מזומן', credit: '💳 אשראי', bit: '📱 ביט', paybox: '📦 Paybox', transfer: '🏦 העברה' }

    // per-staff breakdown (for צפוי + תורים היום details)
    const staffBreakdown = staff.map(m => {
      const mine = todayAppts.filter(a => a.staff_id === m.id && a.status !== 'cancelled')
      const done = mine.filter(a => a.status === 'completed').length
      const mFuture = future.filter(a => a.staff_id === m.id)
      const expectedRev = mFuture.reduce((s, a) => s + (Number(a.services?.price) || 0), 0)
      return { name: m.name, total: mine.length, done, futureCount: mFuture.length, expectedRev }
    }).filter(m => m.total > 0)

    const incomeDetail = Object.entries(manualIncomeBreakdown)
      .filter(([_, v]) => v > 0)
      .map(([k, v]) => ({ label: METHOD_LABELS[k] || k, value: `₪${v.toLocaleString('he-IL')}` }))
    if (!incomeDetail.length) incomeDetail.push({ label: 'אין תקבולים עדיין', value: '' })

    const noShowLostRev = noShows.reduce((s, a) => s + (Number(a.services?.price) || 0), 0)

    const stats = [
      {
        icon: '💰',
        label: 'הכנסה בפועל',
        value: `₪${revenuePaid.toLocaleString('he-IL')}`,
        sub: 'שולם היום',
        accent: '#16a34a',
        tint: 'var(--color-success-tint)',
        detail: incomeDetail,
      },
      {
        icon: '📈',
        label: 'צפוי היום',
        value: `₪${revenueExpected.toLocaleString('he-IL')}`,
        sub: `${future.length} תורים נותרו`,
        accent: 'var(--color-gold)',
        tint: 'var(--color-gold-tint)',
        detail: staffBreakdown.length
          ? staffBreakdown.map(m => ({ label: m.name, value: `₪${m.expectedRev.toLocaleString('he-IL')}`, sub: `${m.futureCount} תורים` }))
          : [{ label: 'כל התורים הסתיימו', value: '' }],
      },
      {
        icon: '📋',
        label: 'תורים היום',
        value: `${doneToday}/${totalToday}`,
        sub: 'הושלמו/סה"כ',
        accent: 'var(--color-text)',
        detail: staffBreakdown.length
          ? staffBreakdown.map(m => ({ label: m.name, value: `${m.done}/${m.total}`, sub: 'הושלמו/סה"כ' }))
          : [{ label: 'אין תורים היום', value: '' }],
      },
      {
        icon: '💸',
        label: 'חובות פתוחים',
        value: `₪${debtsSum.toLocaleString('he-IL')}`,
        sub: `${openDebts.length} לקוחות`,
        accent: openDebts.length > 0 ? '#dc2626' : 'var(--color-muted)',
        tint: openDebts.length > 0 ? 'var(--color-danger-tint)' : undefined,
        detail: openDebts.length
          ? openDebts.map(d => ({ label: d.profiles?.name || 'לקוח', value: `₪${Number(d.amount).toLocaleString('he-IL')}`, sub: d.description || '' }))
          : [{ label: 'אין חובות פתוחים 🎉', value: '' }],
      },
      {
        icon: '⏳',
        label: 'ממתינים',
        value: String(waitlistActive.length),
        accent: waitlistActive.length > 0 ? 'var(--color-gold)' : 'var(--color-muted)',
        tint: waitlistActive.length > 0 ? 'var(--color-gold-tint)' : undefined,
        detail: waitlistActive.length
          ? waitlistActive.map(w => ({ label: w.profiles?.name || 'לקוח', value: w.services?.name || '', sub: w.preferred_date ? new Date(w.preferred_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }) : '' }))
          : [{ label: 'אין ממתינים', value: '' }],
      },
      {
        icon: '🚫',
        label: 'לא הגיעו',
        value: String(noShows.length),
        accent: noShows.length > 0 ? '#dc2626' : 'var(--color-muted)',
        tint: noShows.length > 0 ? 'var(--color-danger-tint)' : undefined,
        detail: noShows.length
          ? [
              ...noShows.map(a => {
                const t = new Date(a.start_at)
                return { label: a.profiles?.name || 'לקוח', value: a.services?.name || '', sub: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` }
              }),
              { label: 'הכנסה שנפספסה', value: `₪${noShowLostRev.toLocaleString('he-IL')}`, sub: 'סה"כ' },
            ]
          : [{ label: 'אף לקוח לא החמיץ תור 🎉', value: '' }],
      },
    ]

    return { nextApt: next, upcoming: rest, stats }
  }, [todayAppts, openDebts, waitlistActive, manualIncomeToday, manualIncomeBreakdown, staff])

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

  // Next 4 upcoming appointments from any date
  const upcoming4 = useMemo(() =>
    futureAppts
      .filter(a => a.status === 'confirmed' || a.status === 'pending_reschedule')
      .filter(a => new Date(a.start_at).getTime() > Date.now() - 30 * 60_000)
      .slice(0, 4)
  , [futureAppts, nowTick])

  const refreshAll = () => { refetchAppts(); refetchFuture(); fetchInbox(); qc.invalidateQueries({ queryKey: ['appointments'] }) }

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
          {invEnabled && (
            <button
              onClick={() => setWalkInOpen(true)}
              className="flex-1 sm:flex-none text-xs font-black px-3 py-2.5 rounded-xl active:scale-95 transition-all whitespace-nowrap"
              style={{ background: 'var(--color-gold)', color: '#fff' }}>
              💰 תקבול מהיר
            </button>
          )}
          <Link to="/admin/appointments?book=1"
            className="flex-1 sm:flex-none text-xs font-bold px-3 py-2.5 rounded-xl text-center whitespace-nowrap"
            style={{ background: 'var(--color-card)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
            + תור
          </Link>
        </div>
      </div>

      {/* Responsive grid: single col on mobile, 3-col on lg+.
          Mobile order: KPIs → Upcoming4 → Inbox → Staff → GapCloser. */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* KPI grid — FULL WIDTH at top */}
        <div className="order-1 lg:col-span-3">
          <KpiStrip stats={stats} />
        </div>

        {/* 4 upcoming appointments — clickable → modal */}
        <div className="order-2 lg:col-span-2">
          <UpcomingAppointmentsList appointments={upcoming4} limit={4} onSelect={setSelectedAppt} />
        </div>

        {/* Action inbox */}
        <div className="order-3 lg:order-3">
          <ActionInbox
            uninvoiced={uninvoiced}
            openDebts={openDebts}
            debtsTotal={openDebts.reduce((s, d) => s + Number(d.amount || 0), 0)}
            waitlist={waitlistActive}
            onScheduleWaitlist={handleScheduleWaitlist}
            businessType={settings?.business_type}
            invoicingEnabled={invEnabled}
          />
        </div>

        {/* Gap Closer */}
        <div className="order-6 lg:order-5">
          <GapCloserCard settings={settings} saveSettings={saveSettings} />
        </div>

        {/* Staff compact row */}
        {staff.length > 0 && (
          <div className="order-5 lg:order-6 lg:col-span-3">
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
                    .filter(a => a.status === 'completed' && !a.no_show)
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
      </div>

      {/* Walk-in modal */}
      <WalkInModal open={walkInOpen} onClose={() => setWalkInOpen(false)} onSaved={refreshAll} />

      {/* Appointment detail modal */}
      <AppointmentDetailModal
        apt={selectedAppt}
        open={!!selectedAppt}
        onClose={() => setSelectedAppt(null)}
        onChange={refreshAll}
      />
    </div>
  )
}

/* ── Gap Closer Quick Card (unchanged) ─────────────────────────── */
const MODE_OPTIONS = [
  { value: 'off',      label: 'כבוי',    icon: '⭕', desc: 'לא נשלחות הודעות — רק התראה בלוח הבקרה' },
  { value: 'approval', label: 'ידני',    icon: '👆', desc: 'מציג הצעות ואתה שולח כל הצעה בלחיצה' },
  { value: 'auto',     label: 'אוטומטי', icon: '⚡', desc: 'שולח הודעות ללקוחות אוטומטית ללא אישור' },
]


function GapCloserCard({ settings, saveSettings }) {
  const mode = settings?.gap_closer_mode || 'off'
  const threshold = settings?.gap_closer_threshold_minutes || 30
  const advanceHours = settings?.gap_closer_advance_hours ?? 2
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

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
            <div className="flex items-center gap-1.5">
              <h2 className="font-black text-sm" style={{ color: 'var(--color-text)' }}>Gap Closer</h2>
              <button onClick={() => setShowHelp(true)}
                className="w-4 h-4 rounded-full text-[10px] font-black flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-border)', color: 'var(--color-muted)' }}>
                ?
              </button>
            </div>
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
                title={opt.desc}
                className="px-2.5 py-1.5 text-sm font-bold transition-all"
                style={{
                  background: mode === opt.value ? 'var(--color-gold)' : 'transparent',
                  color: mode === opt.value ? '#fff' : 'var(--color-muted)',
                }}>
                {opt.icon}
              </button>
            ))}
          </div>
          {mode !== 'off' && (
            <button onClick={() => setExpanded(!expanded)}
              className="text-sm px-2 py-1 rounded-lg"
              style={{ color: 'var(--color-muted)' }}>
              {expanded ? '▲' : '⚙️'}
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-muted)' }}>
        {currentMode.desc}
      </p>

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

      <Modal open={showHelp} onClose={() => setShowHelp(false)} title="🧩 Gap Closer — מה זה בדיוק?">
        <GapCloserHelpBody />
      </Modal>
    </section>
  )
}
