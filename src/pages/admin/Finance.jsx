import { useState } from 'react'
import { motion } from 'framer-motion'
import { DashboardTab } from './finance/DashboardTab'
import { IncomeTab } from './finance/IncomeTab'
import { ExpensesTab } from './finance/ExpensesTab'
import { InvoicesTab } from './finance/InvoicesTab'
import { TaxReportTab } from './finance/TaxReportTab'
import { SettingsTab } from './finance/SettingsTab'

const TABS = [
  { key: 'dashboard', icon: '\u{1F4CA}', label: '\u05E1\u05D9\u05DB\u05D5\u05DD' },
  { key: 'income',    icon: '\u{1F4B0}', label: '\u05D4\u05DB\u05E0\u05E1\u05D5\u05EA' },
  { key: 'expenses',  icon: '\u{1F4B8}', label: '\u05D4\u05D5\u05E6\u05D0\u05D5\u05EA' },
  { key: 'invoices',  icon: '\u{1F9FE}', label: '\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05D5\u05EA' },
  { key: 'tax',       icon: '📊', label: 'דוח & רו״ח' },
  { key: 'settings',  icon: '\u2699\uFE0F', label: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA' },
]

export function Finance() {
  const [tab, setTab] = useState('dashboard')

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-black"
            style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
          >
            {'\u{1F4B3}'} {'\u05E0\u05D9\u05D4\u05D5\u05DC \u05E4\u05D9\u05E0\u05E0\u05E1\u05D9'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {'\u05D4\u05DB\u05E0\u05E1\u05D5\u05EA, \u05D4\u05D5\u05E6\u05D0\u05D5\u05EA, \u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05D5\u05EA \u05D5\u05D3\u05D5\u05D7\u05D5\u05EA'}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-2xl overflow-x-auto"
        style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          width: 'fit-content',
          maxWidth: '100%',
        }}
      >
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-3 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap"
            style={{
              background: tab === t.key ? 'var(--color-gold)' : 'transparent',
              color: tab === t.key ? '#fff' : 'var(--color-muted)',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'income' && <IncomeTab />}
        {tab === 'expenses' && <ExpensesTab />}
        {tab === 'invoices' && <InvoicesTab />}
        {tab === 'tax' && <TaxReportTab />}
        {tab === 'settings' && <SettingsTab />}
      </motion.div>
    </div>
  )
}
