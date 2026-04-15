import { useState } from 'react'
import { motion } from 'framer-motion'
import { useServices } from '../../hooks/useServices'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { minutesToDisplay, priceDisplay } from '../../lib/utils'

const EMPTY = { name: '', description: '', duration_minutes: 30, price: '', is_active: true, display_order: 0, booking_type: 'online', payment_mode: 'inherit' }

const PAYMENT_MODE_LABELS = {
  inherit:  null,           // don't show badge
  required: { label: '🔒 תשלום חובה',    color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
  optional: { label: '🤝 תשלום אופציונלי', color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
  disabled: { label: '🚫 ללא תשלום',      color: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
}

export function Services() {
  const { services, loading, upsertService, deleteService } = useServices()
  const { settings } = useBusinessSettings()
  const toast = useToast()
  const paymentEnabled = !!settings?.payment_enabled
  const [editService, setEditService] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!editService.name.trim()) { toast({ message: 'שם חובה', type: 'error' }); return }
    if (!editService.duration_minutes) { toast({ message: 'משך חובה', type: 'error' }); return }
    setSaving(true)
    try {
      await upsertService({
        ...editService,
        price: editService.price ? Number(editService.price) : null,
        duration_minutes: Number(editService.duration_minutes),
      })
      toast({ message: 'נשמר בהצלחה', type: 'success' })
      setEditService(null)
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('למחוק שירות זה?')) return
    await deleteService(id)
    toast({ message: 'שירות נמחק', type: 'success' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>שירותים</h1>
        <button onClick={() => setEditService(EMPTY)} className="btn-primary text-sm">+ הוסף שירות</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <div className="flex flex-col gap-3">
          {services.map((service, i) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`card p-5 flex items-center gap-4 ${!service.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{service.name}</h3>
                  {!service.is_active && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">לא פעיל</span>
                  )}
                  {paymentEnabled && PAYMENT_MODE_LABELS[service.payment_mode ?? 'inherit'] && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: PAYMENT_MODE_LABELS[service.payment_mode].bg, color: PAYMENT_MODE_LABELS[service.payment_mode].color }}>
                      {PAYMENT_MODE_LABELS[service.payment_mode].label}
                    </span>
                  )}
                  {service.booking_type === 'by_request' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(255,133,0,0.12)', color: 'var(--color-primary)' }}>
                      📞 בתיאום בלבד
                    </span>
                  )}
                </div>
                {service.description && (
                  <p className="text-sm text-muted">{service.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="text-muted">⏱ {minutesToDisplay(service.duration_minutes)}</span>
                  <span className="font-semibold text-[var(--color-gold)]">{priceDisplay(service.price)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditService({ ...service })} className="btn-ghost text-sm border border-gray-200">
                  עריכה
                </button>
                <button onClick={() => handleDelete(service.id)} className="px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  מחק
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={!!editService} onClose={() => setEditService(null)} title={editService?.id ? 'עריכת שירות' : 'שירות חדש'}>
        {editService && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">שם *</label>
              <input
                className="input"
                value={editService.name}
                onChange={e => setEditService(s => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">תיאור</label>
              <textarea
                className="input resize-none h-16"
                value={editService.description || ''}
                onChange={e => setEditService(s => ({ ...s, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">משך (דקות) *</label>
                <input
                  className="input"
                  type="number"
                  min="5"
                  max="300"
                  value={editService.duration_minutes}
                  onChange={e => setEditService(s => ({ ...s, duration_minutes: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">מחיר (₪)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="ריק = חינם"
                  value={editService.price || ''}
                  onChange={e => setEditService(s => ({ ...s, price: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">סדר תצוגה</label>
                <input
                  className="input"
                  type="number"
                  value={editService.display_order}
                  onChange={e => setEditService(s => ({ ...s, display_order: Number(e.target.value) }))}
                />
              </div>
              {/* Booking type */}
              <div>
                <label className="block text-sm font-medium mb-2">סוג הזמנה</label>
                <div className="flex gap-2">
                  {[
                    { value: 'online', label: '🌐 הזמנה אונליין' },
                    { value: 'by_request', label: '📞 בתיאום בלבד' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditService(s => ({ ...s, booking_type: opt.value }))}
                      className="flex-1 py-2 px-3 text-sm rounded-lg border-2 font-medium transition-colors"
                      style={{
                        borderColor: editService.booking_type === opt.value ? 'var(--color-primary)' : 'var(--color-border)',
                        background: editService.booking_type === opt.value ? 'rgba(255,133,0,0.08)' : 'transparent',
                        color: editService.booking_type === opt.value ? 'var(--color-primary)' : 'var(--color-muted)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active_svc"
                  checked={editService.is_active}
                  onChange={e => setEditService(s => ({ ...s, is_active: e.target.checked }))}
                />
                <label htmlFor="active_svc" className="text-sm font-medium">פעיל</label>
              </div>
            </div>
            {/* Payment mode — only when payment is enabled */}
            {paymentEnabled && (
              <div>
                <label className="block text-sm font-medium mb-2">💳 דרישת תשלום</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'inherit',  label: 'לפי הגדרות ראשיות' },
                    { value: 'required', label: '🔒 חובה לשלם' },
                    { value: 'optional', label: '🤝 אופציונלי' },
                    { value: 'disabled', label: '🚫 ללא תשלום' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditService(s => ({ ...s, payment_mode: opt.value }))}
                      className="py-2 px-3 text-xs rounded-lg border-2 font-medium transition-colors text-right"
                      style={{
                        borderColor: (editService.payment_mode ?? 'inherit') === opt.value ? 'var(--color-gold)' : 'var(--color-border)',
                        background:  (editService.payment_mode ?? 'inherit') === opt.value ? 'rgba(201,169,110,0.1)' : 'transparent',
                        color:       (editService.payment_mode ?? 'inherit') === opt.value ? 'var(--color-gold)' : 'var(--color-muted)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? 'שומר...' : 'שמור'}
              </button>
              <button onClick={() => setEditService(null)} className="btn-outline flex-1 justify-center">ביטול</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
