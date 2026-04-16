import { motion } from 'framer-motion'
import { useFinanceDashboard } from '../../../hooks/useFinanceDashboard'
import { useBusinessSettings } from '../../../hooks/useBusinessSettings'
import { formatILS } from '../../../lib/finance'
import { Spinner } from '../../../components/ui/Spinner'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

export function DashboardTab() {
  const { stats, monthly, recent, loading } = useFinanceDashboard()
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
          <div className="overflow-x-auto">
            <svg
              width={monthly.length * (barWidth * 2 + gap) + gap}
              height={chartHeight + 40}
              className="mx-auto"
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
