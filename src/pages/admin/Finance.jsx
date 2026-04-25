import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { DashboardTab } from './finance/DashboardTab'
import { IncomeTab } from './finance/IncomeTab'
import { ExpensesTab } from './finance/ExpensesTab'
import { InvoicesTab } from './finance/InvoicesTab'
import { TaxReportTab } from './finance/TaxReportTab'
import { SettingsTab } from './finance/SettingsTab'
import { DebtsTab } from './finance/DebtsTab'
import { AccountantTab } from './finance/AccountantTab'
import { IncomeTaxTab } from './finance/IncomeTaxTab'

const ALL_TABS = [
  { key: 'dashboard',  icon: '\u{1F4CA}', label: '\u05E1\u05D9\u05DB\u05D5\u05DD' },
  { key: 'expenses',   icon: '\u{1F4B8}', label: '\u05D4\u05D5\u05E6\u05D0\u05D5\u05EA' },
  { key: 'invoices',   icon: '\u{1F9FE}', label: '\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05D5\u05EA', invoicingOnly: true },
  { key: 'debts',      icon: '💳', label: 'חובות' },
  { key: 'income_tax', icon: '🏛', label: 'מס הכנסה', invoicingOnly: true },
  { key: 'tax',        icon: '📊', label: 'דוח תקבולים', invoicingOnly: true },
  { key: 'accountant', icon: '👨‍💼', label: 'רואה חשבון', invoicingOnly: true },
  { key: 'settings',   icon: '\u2699\uFE0F', label: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA' },
]

export function Finance() {
  const location = useLocation()
  const { settings } = useBusinessSettings()
  const invoicingEnabled = settings?.invoicing_enabled !== false
  const TABS = invoicingEnabled ? ALL_TABS : ALL_TABS.filter(t => !t.invoicingOnly)
  const initialTab = location.state?.tab || 'dashboard'
  const [tab, setTab] = useState(initialTab)
  const activeTab = TABS.find(t => t.key === tab) ? tab : 'dashboard'

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

      {/* Tab bar — grid on mobile, horizontal on desktop */}
      <div className="grid grid-cols-3 gap-2 mb-6 lg:flex lg:gap-1 lg:p-1 lg:rounded-2xl"
        style={{ '--lg-bg': 'var(--color-card)' }}
      >
        {TABS.map(t => {
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex flex-col lg:flex-row items-center justify-center gap-1 lg:gap-1.5 py-3 lg:py-2 lg:px-3 rounded-2xl lg:rounded-xl text-xs lg:text-sm font-semibold transition-all"
              style={{
                background: active ? 'var(--color-gold)' : 'var(--color-card)',
                color: active ? '#fff' : 'var(--color-muted)',
                border: active ? 'none' : '1px solid var(--color-border)',
              }}
            >
              <span className="text-xl lg:text-base leading-none">{t.icon}</span>
              <span className="leading-tight text-center">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Active tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'income' && <IncomeTab />}
        {activeTab === 'expenses' && <ExpensesTab />}
        {activeTab === 'invoices' && <InvoicesTab />}
        {activeTab === 'debts' && <DebtsTab />}
        {activeTab === 'income_tax' && <IncomeTaxTab />}
        {activeTab === 'tax' && <TaxReportTab />}
        {activeTab === 'accountant' && <AccountantTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </motion.div>
    </div>
  )
}
