import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useFinanceDashboard } from '../../../hooks/useFinanceDashboard'
import { useBranch } from '../../../contexts/BranchContext'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { useStaffCommissions } from '../../../hooks/useStaffCommissions'
import { formatILS } from '../../../lib/finance'
import { Spinner } from '../../../components/ui/Spinner'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { he } from 'date-fns/locale/he'
import { supabase } from '../../../lib/supabase'

function StaffPaymentsSection({ settings }) {
  const now = new Date()
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(now), 'yyyy-MM-dd')

  const { currentBranch } = useBranch()
  const branchId = currentBranch?.id ?? null
  const { markAllPaid } = useStaffCommissions({ startDate: monthStart, endDate: monthEnd, branchId })

  const [staffList, setStaffList]   = useState([])
  const [appts, setAppts]           = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [paying, setPaying]         = useState(null)

  useEffect(() => {
    async function load() {
      setLoadingData(true)
      const [{ data: staffData }, { data: apptData }] = await Promise.all([
        supabase
          .from('staff')
          .select('id, name, photo_url, commission_type, commission_rate, monthly_salary')
          .eq('is_active', true),
        supabase
          .from('appointments')
          .select('staff_id, services(price)')
          .eq('status', 'completed')
          .gte('start_at', monthStart + 'T00:00:00')
          .lte('start_at', monthEnd + 'T23:59:59'),
      ])
      setStaffList(staffData ?? [])
      setAppts(apptData ?? [])
      setLoadingData(false)
    }
    load()
  }, [monthStart, monthEnd])

  function calcStaff(member) {
    const effectiveType = member.commission_type === 'inherit'
      ? (settings?.commission_type ?? 'percentage')
      : member.commission_type
    const effectiveRate = member.commission_type === 'inherit'
      ? (settings?.commission_default_rate ?? 0)
      : (member.commission_rate ?? 0)

    const memberAppts = appts.filter(a => a.staff_id === member.id)
    const count = memberAppts.length
    const revenue = memberAppts.reduce((sum, a) => sum + (a.services?.price ?? 0), 0)

    let amount = 0
    if (effectiveType === 'salary') {
      amount = member.monthly_salary ?? 0
    } else if (effectiveType === 'percentage') {
      amount = revenue * (effectiveRate / 100)
    } else if (effectiveType === 'fixed') {
      amount = count * effectiveRate
    }

    return { count, revenue, amount, effectiveType }
  }

  async function handleMarkAllPaid(staffId) {
    setPaying(staffId)
    try {
      await markAllPaid(staffId)
    } finally {
      setPaying(null)
    }
  }

  const rows = staffList.map(m => ({ ...m, ...calcStaff(m) }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="card p-5"
    >
      <h2 className="font-bold text-base mb-4" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        💈 תשלומי ספרים החודש
      </h2>

      {loadingData ? (
        <div className="flex justify-center py-6"><Spinner size="md" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--color-muted)' }}>אין ספרים פעילים</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                {['ספר', 'תורים', 'הכנסות', 'עמלה/משכורת', 'לתשלום', ''].map(h => (
                  <th key={h} className="text-right py-2 px-2 text-xs font-semibold" style={{ color: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((member, i) => (
                <tr
                  key={member.id}
                  style={{ background: i % 2 === 0 ? 'transparent' : 'var(--color-surface)' }}
                >
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden bg-[var(--color-gold)]/10 flex items-center justify-center text-xs font-bold" style={{ color: 'var(--color-gold)' }}>
                        {member.photo_url
                          ? <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" />
                          : member.name[0]}
                      </div>
                      <span className="font-medium" style={{ color: 'var(--color-text)' }}>{member.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center" style={{ color: 'var(--color-text)' }}>{member.count}</td>
                  <td className="py-2.5 px-2" style={{ color: 'var(--color-text)' }}>{formatILS(member.revenue)}</td>
                  <td className="py-2.5 px-2 text-xs" style={{ color: 'var(--color-muted)' }}>
                    {member.effectiveType === 'salary' && 'משכורת'}
                    {member.effectiveType === 'percentage' && `${member.commission_type === 'inherit' ? settings?.commission_default_rate : member.commission_rate}%`}
                    {member.effectiveType === 'fixed' && `₪${member.commission_type === 'inherit' ? settings?.commission_default_rate : member.commission_rate} לתור`}
                  </td>
                  <td className="py-2.5 px-2 font-bold" style={{ color: 'var(--color-gold)' }}>
                    {formatILS(member.amount)}
                  </td>
                  <td className="py-2.5 px-2">
                    <button
                      onClick={() => handleMarkAllPaid(member.id)}
                      disabled={paying === member.id}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors"
                      style={{ background: 'rgba(201,169,110,0.12)', color: 'var(--color-gold)', border: '1px solid var(--color-gold)' }}
                    >
                      {paying === member.id ? '...' : '💳 שולם'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  )
}

export function DashboardTab() {
  const { currentBranch } = useBranch()
  const { stats, monthly, recent, loading } = useFinanceDashboard({ branchId: currentBranch?.id ?? null })
  const { settings } = useBusinessSettings()
  const isOsekPatur = settings?.business_type === 'osek_patur'

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  const statCards = [
    {
      icon: '\u{1F4B0}',
      label: '\u05D4\u05DB\u05E0\u05E1\u05D5\u05EA \u05D4\u05D7\u05D5\u05D3\u05E9',
      value: stats?.income ?? 0,
      color: 'var(--color-gold)',
    },
    {
      icon: '\u{1F4B8}',
      label: '\u05D4\u05D5\u05E6\u05D0\u05D5\u05EA \u05D4\u05D7\u05D5\u05D3\u05E9',
      value: stats?.expenses ?? 0,
      color: '#dc2626',
    },
    {
      icon: (stats?.profit ?? 0) >= 0 ? '\u{1F4C8}' : '\u{1F4C9}',
      label: '\u05E8\u05D5\u05D5\u05D7',
      value: stats?.profit ?? 0,
      color: (stats?.profit ?? 0) >= 0 ? '#16a34a' : '#dc2626',
    },
    ...(!isOsekPatur
      ? [
          {
            icon: '\u{1F3E6}',
            label: '\u05DE\u05D0\u05D6\u05DF \u05DE\u05E2"\u05DE',
            value: stats?.vatBalance ?? 0,
            color: '#2563eb',
          },
        ]
      : []),
  ]

  // Bar chart calculations
  const maxValue = Math.max(
    ...monthly.map(m => Math.max(m.income, m.expenses)),
    1
  )
  const chartHeight = 200
  const barWidth = 28
  const gap = 16

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div
        className={`grid gap-4 ${
          isOsekPatur ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'
        }`}
      >
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="card p-4"
          >
            <div className="text-2xl mb-1">{card.icon}</div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>
              {card.label}
            </p>
            <p className="text-xl font-black" style={{ color: card.color }}>
              {formatILS(card.value)}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Bar chart */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card p-5"
      >
        <h2
          className="font-bold text-base mb-4"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          {'\u05D4\u05DB\u05E0\u05E1\u05D5\u05EA vs \u05D4\u05D5\u05E6\u05D0\u05D5\u05EA'}
        </h2>

        {monthly.length > 0 ? (
          <div className="w-full">
            <svg
              viewBox={`0 0 ${monthly.length * (barWidth * 2 + gap) + gap} ${chartHeight + 40}`}
              width="100%"
              height={chartHeight + 40}
              dir="ltr"
            >
              {monthly.map((m, i) => {
                const x = gap + i * (barWidth * 2 + gap)
                const incomeH = maxValue > 0 ? (m.income / maxValue) * chartHeight : 0
                const expenseH = maxValue > 0 ? (m.expenses / maxValue) * chartHeight : 0

                return (
                  <g key={m.month}>
                    {/* Income bar */}
                    <rect
                      x={x}
                      y={chartHeight - incomeH}
                      width={barWidth}
                      height={incomeH}
                      rx={4}
                      fill="var(--color-gold)"
                      opacity={0.9}
                    />
                    {/* Expense bar */}
                    <rect
                      x={x + barWidth + 2}
                      y={chartHeight - expenseH}
                      width={barWidth}
                      height={expenseH}
                      rx={4}
                      fill="#dc2626"
                      opacity={0.5}
                    />
                    {/* Month label */}
                    <text
                      x={x + barWidth}
                      y={chartHeight + 20}
                      textAnchor="middle"
                      fontSize={11}
                      fill="var(--color-muted)"
                    >
                      {m.month}
                    </text>
                  </g>
                )
              })}
            </svg>

            {/* Legend */}
            <div className="flex gap-4 justify-center mt-2">
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                <span
                  className="inline-block w-3 h-3 rounded"
                  style={{ background: 'var(--color-gold)' }}
                />
                {'\u05D4\u05DB\u05E0\u05E1\u05D5\u05EA'}
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                <span
                  className="inline-block w-3 h-3 rounded"
                  style={{ background: '#dc2626', opacity: 0.5 }}
                />
                {'\u05D4\u05D5\u05E6\u05D0\u05D5\u05EA'}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-center py-8" style={{ color: 'var(--color-muted)' }}>
            {'\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05D4\u05E6\u05D2\u05D4'}
          </p>
        )}
      </motion.div>

      {/* Staff payments */}
      <StaffPaymentsSection settings={settings} />

      {/* Recent activity */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card p-5"
      >
        <h2
          className="font-bold text-base mb-4"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          {'\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA \u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA'}
        </h2>

        {recent.length > 0 ? (
          <div className="flex flex-col gap-2">
            {recent.map((item, i) => {
              const isPositive = item.amount >= 0
              const icon =
                item.type === 'expense'
                  ? item.icon || '\u{1F4B8}'
                  : item.type === 'manual'
                    ? '\u{1F4B0}'
                    : '\u{1F4B3}'

              let formattedDate = ''
              try {
                formattedDate = format(new Date(item.date), 'dd/MM HH:mm', { locale: he })
              } catch {
                formattedDate = ''
              }

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--color-surface)' }}
                >
                  <span className="text-xl flex-shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {item.label}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      {formattedDate}
                    </p>
                  </div>
                  <span
                    className="text-sm font-bold flex-shrink-0"
                    style={{ color: isPositive ? '#16a34a' : '#dc2626' }}
                  >
                    {isPositive ? '+' : ''}{formatILS(item.amount)}
                  </span>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-center py-8" style={{ color: 'var(--color-muted)' }}>
            {'\u05D0\u05D9\u05DF \u05E4\u05E2\u05D5\u05DC\u05D5\u05EA \u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA'}
          </p>
        )}
      </motion.div>
    </div>
  )
}
