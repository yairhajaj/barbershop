import { useState } from 'react'
import { startOfMonth, endOfMonth } from 'date-fns'
import { useAllAppointments } from '../../hooks/useAppointments'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { Spinner } from '../../components/ui/Spinner'
import { printInvoice } from '../../lib/invoice'
import { formatDate, formatTime, priceDisplay } from '../../lib/utils'
import { BUSINESS } from '../../config/business'

export function Invoices() {
  const [month, setMonth] = useState(new Date())
  const { settings } = useBusinessSettings()

  const { appointments, loading } = useAllAppointments({
    startDate: startOfMonth(month),
    endDate: endOfMonth(month),
    status: 'completed',
  })

  const total = appointments.reduce((sum, a) => sum + (Number(a.services?.price) || 0), 0)

  function handlePrint(appt) {
    printInvoice({
      appointment: appt,
      business: BUSINESS,
      footerText: settings.invoice_footer_text,
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>חשבוניות</h1>
        <input
          type="month"
          className="input w-44 py-2"
          value={`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`}
          onChange={e => setMonth(new Date(e.target.value + '-01'))}
        />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-muted text-sm">תורים שהושלמו</p>
          <p className="text-2xl font-bold">{appointments.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-muted text-sm">הכנסה חודשית</p>
          <p className="text-2xl font-bold text-[var(--color-gold)]">₪{total}</p>
        </div>
        <div className="card p-4">
          <p className="text-muted text-sm">ממוצע לתור</p>
          <p className="text-2xl font-bold">₪{appointments.length ? Math.round(total / appointments.length) : 0}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : appointments.length === 0 ? (
        <div className="card p-12 text-center text-muted">
          <div className="text-4xl mb-3">🧾</div>
          <p>אין תורים שהושלמו בחודש זה</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {appointments.map(appt => (
            <div key={appt.id} className="card p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{appt.profiles?.name}</p>
                <p className="text-sm text-muted truncate">
                  {appt.services?.name} · {appt.staff?.name} · {formatDate(appt.start_at)} {formatTime(appt.start_at)}
                </p>
              </div>
              <div className="font-bold text-[var(--color-gold)] shrink-0">{priceDisplay(appt.services?.price)}</div>
              <button
                onClick={() => handlePrint(appt)}
                className="btn-ghost text-sm border border-gray-200 px-3 py-1.5 shrink-0 hover:bg-gray-50"
              >
                🧾 הפק חשבונית
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs mt-6 text-center" style={{ color: 'var(--color-muted)' }}>
        לחץ "הפק חשבונית" → ייפתח חלון עם החשבונית → לחץ "הדפס / שמור PDF"
      </p>
    </div>
  )
}
