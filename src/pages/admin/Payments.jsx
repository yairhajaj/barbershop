import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { Spinner } from '../../components/ui/Spinner'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useServices } from '../../hooks/useServices'
import { format } from 'date-fns'
import { he } from 'date-fns/locale/he'

const STATUS_LABELS = {
  paid:     { label: 'שולם',  color: '#16a34a', bg: 'var(--color-success-tint)',   border: 'var(--color-success-ring)' },
  pending:  { label: 'ממתין', color: '#d97706', bg: 'var(--color-warning-tint)',   border: 'var(--color-warning-ring)' },
  failed:   { label: 'נכשל',  color: '#dc2626', bg: 'var(--color-danger-tint)',   border: 'var(--color-danger-ring)' },
  refunded: { label: 'הוחזר', color: '#7c3aed', bg: 'var(--color-purple-tint)', border: 'var(--color-purple-ring)' },
}

const GLOBAL_MODE_OPTS = [
  { value: 'required',   icon: '🔒', label: 'חובה לשלם',  desc: 'הלקוח חייב לשלם כדי לסיים הזמנה — מונע no-shows' },
  { value: 'optional',   icon: '🤝', label: 'אופציונלי',  desc: 'הלקוח יכול לשלם עכשיו או לשלם בעסק' },
  { value: 'per_service',icon: '✂️', label: 'לפי שירות',  desc: 'כל שירות קובע את מצב התשלום שלו בנפרד' },
]

const ENTITY_MODE_OPTS = [
  { value: 'inherit',  label: 'לפי הגדרות ראשיות' },
  { value: 'required', label: '🔒 חובה' },
  { value: 'optional', label: '🤝 אופציונלי' },
  { value: 'disabled', label: '🚫 ללא תשלום' },
]

// Small inline pill selector for per-row overrides
function ModePill({ value, onChange }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {ENTITY_MODE_OPTS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="px-2 py-1 rounded-lg text-xs font-medium transition-all"
          style={{
            background: value === opt.value ? 'var(--color-gold)' : 'var(--color-surface)',
            color:      value === opt.value ? '#fff' : 'var(--color-muted)',
            border:     `1px solid ${value === opt.value ? 'var(--color-gold)' : 'var(--color-border)'}`,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function Payments() {
  const showToast = useToast()
  const confirm = useConfirm()
  const { settings, saveSettings } = useBusinessSettings()
  const { services, loading: servicesLoading } = useServices()

  // ── Tabs ──
  const [tab, setTab] = useState('settings')

  // ── Settings state ──
  const [globalMode, setGlobalMode] = useState('required')
  const [servicesModes, setServicesModes] = useState({})   // { [id]: string }
  const [branchesModes, setBranchesModes] = useState({})   // { [id]: string }
  const [branches, setBranches] = useState([])
  const [settingsSaving, setSettingsSaving] = useState(false)

  // ── Transactions state ──
  const [payments, setPayments]   = useState([])
  const [txLoading, setTxLoading] = useState(true)
  const [refunding, setRefunding] = useState(null)
  const [filter, setFilter]       = useState('all')

  // Sync settings → local state
  useEffect(() => {
    if (settings) setGlobalMode(settings.payment_mode ?? 'required')
  }, [settings])

  // Sync services payment_mode
  useEffect(() => {
    const map = {}
    services.forEach(s => { map[s.id] = s.payment_mode ?? 'inherit' })
    setServicesModes(map)
  }, [services])

  // Load branches
  useEffect(() => {
    supabase.from('branches').select('id, name, payment_mode').eq('is_active', true).order('name').then(({ data }) => {
      const list = data ?? []
      setBranches(list)
      const map = {}
      list.forEach(b => { map[b.id] = b.payment_mode ?? 'inherit' })
      setBranchesModes(map)
    })
  }, [])

  // Load transactions
  useEffect(() => { loadPayments() }, [])

  async function loadPayments() {
    setTxLoading(true)
    const { data } = await supabase
      .from('payments')
      .select(`*, appointments ( start_at, services ( name, price ), profiles:customer_id ( name, phone ) )`)
      .order('created_at', { ascending: false })
      .limit(200)
    setPayments(data ?? [])
    setTxLoading(false)
  }

  async function handleSaveSettings() {
    setSettingsSaving(true)
    try {
      // 1. Save global mode
      await saveSettings({ payment_mode: globalMode })

      // 2. Save per-service overrides
      const serviceUpdates = services.map(s =>
        supabase.from('services').update({ payment_mode: servicesModes[s.id] ?? 'inherit' }).eq('id', s.id)
      )

      // 3. Save per-branch overrides
      const branchUpdates = branches.map(b =>
        supabase.from('branches').update({ payment_mode: branchesModes[b.id] ?? 'inherit' }).eq('id', b.id)
      )

      await Promise.all([...serviceUpdates, ...branchUpdates])
      showToast({ message: 'הגדרות תשלום נשמרו', type: 'success' })
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    } finally {
      setSettingsSaving(false)
    }
  }

  async function handleRefund(payment) {
    if (!await confirm({ title: 'החזר תשלום', description: `האם להחזיר ₪${payment.amount} ל${payment.appointments?.profiles?.name}? פעולה זו אינה הפיכה.`, variant: 'destructive', confirmLabel: 'בצע החזר' })) return
    setRefunding(payment.id)
    try {
      const { data, error } = await supabase.functions.invoke('verify-payment', {
        body: { payment_id: payment.id, action: 'refund' },
      })
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'שגיאה בהחזר')
      showToast({ message: 'ההחזר בוצע בהצלחה', type: 'success' })
      await loadPayments()
    } catch (err) {
      showToast({ message: 'שגיאה: ' + err.message, type: 'error' })
    } finally {
      setRefunding(null)
    }
  }

  // Stats
  const paidPayments = payments.filter(p => p.status === 'paid')
  const today = new Date().toDateString()
  const todayTotal = paidPayments.filter(p => new Date(p.created_at).toDateString() === today).reduce((s, p) => s + Number(p.amount), 0)
  const monthTotal = paidPayments.filter(p => {
    const d = new Date(p.created_at); const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((s, p) => s + Number(p.amount), 0)
  const allTotal = paidPayments.reduce((s, p) => s + Number(p.amount), 0)
  const filtered = filter === 'all' ? payments : payments.filter(p => p.status === filter)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)' }}>💳 תשלומים</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>הגדרות סליקה ומעקב עסקאות</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-2xl" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', width: 'fit-content' }}>
        {[
          { key: 'settings',     label: '⚙️ הגדרות' },
          { key: 'transactions', label: '📊 עסקאות' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: tab === t.key ? 'var(--color-gold)' : 'transparent',
              color:      tab === t.key ? '#fff' : 'var(--color-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════ SETTINGS TAB ══════════ */}
      {tab === 'settings' && (
        <div className="space-y-5 max-w-2xl">

          {/* Global payment mode */}
          <div className="card p-5">
            <p className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>מצב תשלום גלובלי</p>
            <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>ברירת המחדל לכל ההזמנות — ניתן לדרוס לפי שירות או סניף</p>
            <div className="space-y-2">
              {GLOBAL_MODE_OPTS.map(opt => {
                const active = globalMode === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGlobalMode(opt.value)}
                    className="w-full flex items-start gap-3 p-3 rounded-xl text-right transition-all"
                    style={{
                      background: active ? 'var(--color-gold-tint)' : 'transparent',
                      border: `1.5px solid ${active ? 'var(--color-gold)' : 'var(--color-border)'}`,
                    }}
                  >
                    <div
                      className="w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center"
                      style={{ borderColor: active ? 'var(--color-gold)' : '#ccc' }}
                    >
                      {active && <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-gold)' }} />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span>{opt.icon}</span>
                        <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{opt.label}</span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{opt.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Per-service overrides — only when per_service mode */}
          {globalMode === 'per_service' && (
          <div className="card p-5">
            <p className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>הגדרה לפי שירות</p>
            <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
              קבע מצב תשלום נפרד לכל שירות
            </p>
            {servicesLoading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : services.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--color-muted)' }}>אין שירותים</p>
            ) : (
              <div className="space-y-3">
                {services.map(service => (
                  <div
                    key={service.id}
                    className="flex flex-col gap-2 p-3 rounded-xl"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{service.name}</span>
                      {service.price && (
                        <span className="text-xs font-bold" style={{ color: 'var(--color-gold)' }}>₪{service.price}</span>
                      )}
                    </div>
                    <ModePill
                      value={servicesModes[service.id] ?? 'inherit'}
                      onChange={val => setServicesModes(m => ({ ...m, [service.id]: val }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Per-branch overrides */}
          {branches.length > 0 && (
            <div className="card p-5">
              <p className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>הגדרה לפי סניף</p>
              <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
                קבע מצב תשלום שונה לכל סניף — מנצח את ההגדרה הגלובלית
              </p>
              <div className="space-y-3">
                {branches.map(branch => (
                  <div
                    key={branch.id}
                    className="flex flex-col gap-2 p-3 rounded-xl"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>📍 {branch.name}</span>
                    <ModePill
                      value={branchesModes[branch.id] ?? 'inherit'}
                      onChange={val => setBranchesModes(m => ({ ...m, [branch.id]: val }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Priority legend */}
          <div className="rounded-2xl p-4 text-xs" style={{ background: 'var(--color-gold-tint)', border: '1px solid var(--color-gold-ring)' }}>
            <p className="font-bold mb-2" style={{ color: 'var(--color-gold)' }}>💡 סדר עדיפויות</p>
            <p style={{ color: 'var(--color-muted)' }}>
              <strong>שירות</strong> &gt; <strong>סניף</strong> &gt; <strong>גלובלי</strong> — הספציפי תמיד מנצח
            </p>
          </div>

          {/* Save button */}
          <button
            onClick={handleSaveSettings}
            disabled={settingsSaving}
            className="btn-primary px-8 py-3 text-base"
          >
            {settingsSaving ? 'שומר...' : 'שמור הגדרות תשלום'}
          </button>
        </div>
      )}

      {/* ══════════ TRANSACTIONS TAB ══════════ */}
      {tab === 'transactions' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'היום',  value: todayTotal },
              { label: 'החודש', value: monthTotal },
              { label: 'סה"כ', value: allTotal },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl p-4 text-center"
                style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
              >
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>{stat.label}</p>
                <p className="text-xl font-black" style={{ color: 'var(--color-gold)' }}>
                  ₪{stat.value.toFixed(0)}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {[
              { key: 'all',      label: 'הכל' },
              { key: 'paid',     label: 'שולם' },
              { key: 'pending',  label: 'ממתין' },
              { key: 'refunded', label: 'הוחזר' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className="px-3 py-1.5 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: filter === t.key ? 'var(--color-gold)' : 'var(--color-card)',
                  color:      filter === t.key ? '#fff' : 'var(--color-muted)',
                  border:     filter === t.key ? 'none' : '1px solid var(--color-border)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {txLoading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 rounded-2xl" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
              <div className="text-5xl mb-4">💳</div>
              <p className="font-bold text-lg mb-1" style={{ color: 'var(--color-text)' }}>אין תשלומים עדיין</p>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                {filter === 'all' ? 'כאשר לקוחות ישלמו, העסקאות יופיעו כאן' : 'אין עסקאות בסטטוס זה'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((payment, i) => {
                const appt     = payment.appointments
                const customer = appt?.profiles
                const service  = appt?.services
                const st       = STATUS_LABELS[payment.status] ?? STATUS_LABELS.pending
                const date     = appt?.start_at ? format(new Date(appt.start_at), 'dd/MM/yy HH:mm', { locale: he }) : '—'

                return (
                  <motion.div
                    key={payment.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="rounded-2xl p-4 flex items-center justify-between gap-3"
                    style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                          {customer?.name ?? 'לקוח'}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}
                        >
                          {st.label}
                        </span>
                      </div>
                      <div className="text-xs mt-0.5 flex gap-x-3 flex-wrap" style={{ color: 'var(--color-muted)' }}>
                        {service?.name && <span>{service.name}</span>}
                        <span>{date}</span>
                        {customer?.phone && <span>{customer.phone}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-black text-lg" style={{ color: 'var(--color-gold)' }}>
                        ₪{Number(payment.amount).toFixed(0)}
                      </span>
                      {payment.status === 'paid' && (
                        <button
                          onClick={() => handleRefund(payment)}
                          disabled={refunding === payment.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                          style={{ border: '1px solid var(--color-purple-ring)', color: '#7c3aed' }}
                        >
                          {refunding === payment.id ? <Spinner size="xs" /> : 'החזר'}
                        </button>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
