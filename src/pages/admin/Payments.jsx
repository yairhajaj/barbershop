import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'
import { Spinner } from '../../components/ui/Spinner'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

const STATUS_LABELS = {
  paid:     { label: 'שולם',    color: '#16a34a', bg: 'rgba(22,163,74,0.08)',   border: 'rgba(22,163,74,0.2)' },
  pending:  { label: 'ממתין',   color: '#d97706', bg: 'rgba(217,119,6,0.08)',   border: 'rgba(217,119,6,0.2)' },
  failed:   { label: 'נכשל',    color: '#dc2626', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.2)' },
  refunded: { label: 'הוחזר',   color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.2)' },
}

export function Payments() {
  const showToast = useToast()
  const [payments, setPayments]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [refunding, setRefunding] = useState(null) // payment id being refunded
  const [filter, setFilter]       = useState('all') // all | paid | pending | refunded

  useEffect(() => { loadPayments() }, [])

  async function loadPayments() {
    setLoading(true)
    const { data } = await supabase
      .from('payments')
      .select(`
        *,
        appointments (
          start_at,
          services ( name, price ),
          profiles:customer_id ( name, phone )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    setPayments(data ?? [])
    setLoading(false)
  }

  async function handleRefund(payment) {
    if (!window.confirm(`להחזיר ₪${payment.amount} ל${payment.appointments?.profiles?.name}?`)) return
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
  const todayTotal   = paidPayments.filter(p => new Date(p.created_at).toDateString() === today).reduce((s, p) => s + Number(p.amount), 0)
  const monthTotal   = paidPayments.filter(p => {
    const d = new Date(p.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((s, p) => s + Number(p.amount), 0)
  const allTotal = paidPayments.reduce((s, p) => s + Number(p.amount), 0)

  const filtered = filter === 'all' ? payments : payments.filter(p => p.status === filter)

  if (loading) return <div className="flex justify-center py-32"><Spinner size="lg" /></div>

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)' }}>💳 תשלומים</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
          מעקב אחר עסקאות ותשלומים
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'היום',    value: todayTotal },
          { label: 'החודש',   value: monthTotal },
          { label: 'סה"כ',    value: allTotal },
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
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="px-3 py-1.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: filter === tab.key ? 'var(--color-gold)' : 'var(--color-card)',
              color:      filter === tab.key ? '#fff' : 'var(--color-muted)',
              border:     filter === tab.key ? 'none' : '1px solid var(--color-border)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-20 rounded-2xl" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
          <div className="text-5xl mb-4">💳</div>
          <p className="font-bold text-lg mb-1" style={{ color: 'var(--color-text)' }}>אין תשלומים עדיין</p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {filter === 'all'
              ? 'כאשר לקוחות ישלמו, העסקאות יופיעו כאן'
              : 'אין עסקאות בסטטוס זה'}
          </p>
        </div>
      )}

      {/* Payments list */}
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
                    style={{ border: '1px solid rgba(124,58,237,0.3)', color: '#7c3aed' }}
                  >
                    {refunding === payment.id ? <Spinner size="xs" /> : 'החזר'}
                  </button>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* No PayPlus configured hint */}
      <div className="mt-6 rounded-2xl p-4 text-sm" style={{ background: 'rgba(201,169,110,0.07)', border: '1px solid rgba(201,169,110,0.2)' }}>
        <p className="font-medium mb-1" style={{ color: 'var(--color-gold)' }}>💡 טיפ</p>
        <p style={{ color: 'var(--color-muted)' }}>
          להפעלת סליקה עבור לעמוד{' '}
          <a href="/admin/settings" className="underline font-medium" style={{ color: 'var(--color-gold)' }}>
            הגדרות → תשלום אונליין
          </a>
        </p>
      </div>
    </div>
  )
}
