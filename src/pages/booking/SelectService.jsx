import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookingProgress } from '../../components/booking/BookingProgress'
import { Spinner } from '../../components/ui/Spinner'
import { useServices } from '../../hooks/useServices'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { minutesToDisplay, priceDisplay } from '../../lib/utils'
import { useTheme } from '../../contexts/ThemeContext'

function getServiceIcon(name = '') {
  const n = name
  if (n.includes('ילד') || n.includes('קטן') || n.includes('נוער')) return '👦'
  if (n.includes('זקן') || n.includes('גילוח') || n.includes('ריש')) return '🪒'
  if (n.includes('צבע') || n.includes('צביעה') || n.includes('בלונד')) return '🎨'
  if (n.includes('שמן') || n.includes('טיפול') || n.includes('מסכ')) return '💆'
  if (n.includes('פייד') || n.includes('מוהוק') || n.includes('דגרד')) return '💈'
  if (n.includes('תספורת') || n.includes('שיער') || n.includes('קיצור')) return '✂️'
  return '✂️'
}

export function SelectService() {
  const { services, loading } = useServices({ activeOnly: true })
  const { settings } = useBusinessSettings()
  const { isDark } = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedStaff = searchParams.get('staff')

  const [groupSize, setGroupSize] = useState(() => {
    const s = JSON.parse(sessionStorage.getItem('booking_state') ?? '{}')
    return s.groupSize ?? 1
  })

  function selectService(service) {
    const state = {
      serviceId:          service.id,
      serviceName:        service.name,
      serviceDuration:    service.duration_minutes,
      servicePrice:       service.price,
      servicePaymentMode: service.payment_mode ?? 'inherit',
      groupSize,
    }
    if (preselectedStaff) state.staffId = preselectedStaff
    sessionStorage.setItem('booking_state', JSON.stringify(state))
    navigate(preselectedStaff ? '/book/datetime' : '/book/staff')
  }

  const businessPhone = settings?.phone || ''

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: 'var(--color-surface)' }}>
      <div className="container px-4 sm:px-6 max-w-xl mx-auto">
        <BookingProgress currentStep="service" />

        <div className="text-center mb-7">
          <h1 className="text-3xl font-black mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            בחר שירות
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>איזה שירות תרצה לקבל?</p>
        </div>

        {/* ── Group size selector ─────────────────────────────────────── */}
        <div
          className="mb-6 rounded-2xl p-4"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
        >
          <p className="text-xs font-bold mb-3 tracking-wide" style={{ color: 'var(--color-muted)' }}>
            מזמין עבור:
          </p>
          <div className="flex gap-2">
            {[
              { n: 1, label: 'רק אני' },
              { n: 2, label: '2 אנשים' },
              { n: 3, label: '3 אנשים' },
              { n: 4, label: '4 אנשים' },
            ].map(({ n, label }) => (
              <button
                key={n}
                onClick={() => setGroupSize(n)}
                aria-pressed={groupSize === n}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border-2"
                style={{
                  background:  groupSize === n ? 'var(--color-gold-btn, var(--color-gold))' : 'var(--color-surface)',
                  borderColor: groupSize === n ? 'var(--color-gold-btn, var(--color-gold))' : 'var(--color-border)',
                  color:       groupSize === n ? '#fff' : 'var(--color-text)',
                  boxShadow:   groupSize === n ? '0 2px 12px rgba(255,122,0,0.22)' : 'none',
                }}
              >
                {n === 1 ? '👤 ' : '👥 '}{label}
              </button>
            ))}
          </div>
          {groupSize > 1 && (
            <p className="text-xs mt-2.5 font-medium" style={{ color: 'var(--color-gold)' }}>
              ייקבעו {groupSize} תורים צמודים לאותו ספר
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <div className="flex flex-col gap-3">
            {services.map((service, i) => {
              const isByRequest = service.booking_type === 'by_request'

              if (isByRequest) {
                return (
                  <motion.div
                    key={service.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="w-full rounded-2xl overflow-hidden text-right"
                    style={{
                      background: isDark ? 'rgba(255,255,255,0.04)' : 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                      opacity: 0.9,
                    }}
                  >
                    <div className="flex items-center gap-4 px-5 py-4">
                      {/* Icon */}
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                        style={{ background: 'rgba(255,133,0,0.08)' }}
                      >
                        {getServiceIcon(service.name)}
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-[16px] leading-tight mb-1" style={{ color: 'var(--color-text)' }}>
                          {service.name}
                        </div>
                        {service.description && (
                          <div className="text-xs leading-relaxed mb-2 line-clamp-1" style={{ color: 'var(--color-muted)' }}>
                            {service.description}
                          </div>
                        )}
                        <span
                          className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
                          style={{ background: 'rgba(255,133,0,0.1)', color: 'var(--color-primary)' }}
                        >
                          📞 בתיאום מראש
                        </span>
                      </div>
                      {/* Price + CTA */}
                      <div className="flex flex-col items-center gap-2 flex-shrink-0">
                        <span className="text-xl font-black" style={{ color: 'var(--color-gold)' }}>
                          {priceDisplay(service.price)}
                        </span>
                        {businessPhone ? (
                          <a
                            href={`tel:${businessPhone}`}
                            onClick={e => e.stopPropagation()}
                            className="text-xs font-bold px-3 py-1.5 rounded-xl"
                            style={{ background: 'var(--color-gold)', color: '#fff' }}
                          >
                            צור קשר
                          </a>
                        ) : (
                          <span className="text-xs font-bold px-3 py-1.5 rounded-xl" style={{ background: 'var(--color-border)', color: 'var(--color-muted)' }}>
                            צור קשר
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              }

              return (
                <motion.button
                  key={service.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => selectService(service)}
                  className="w-full text-right rounded-2xl overflow-hidden transition-all cursor-pointer group"
                  style={{
                    background: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 10px 32px rgba(255,133,0,0.15)'
                    e.currentTarget.style.borderColor = 'rgba(255,133,0,0.4)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.05)'
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                  }}
                >
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                      style={{ background: 'rgba(255,133,0,0.08)' }}
                    >
                      {getServiceIcon(service.name)}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-[16px] leading-tight mb-1" style={{ color: 'var(--color-text)' }}>
                        {service.name}
                      </div>
                      {service.description && (
                        <div className="text-xs leading-relaxed mb-2 line-clamp-1" style={{ color: 'var(--color-muted)' }}>
                          {service.description}
                        </div>
                      )}
                      <span
                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{ background: 'rgba(255,133,0,0.1)', color: 'var(--color-gold)' }}
                      >
                        ⏱ {minutesToDisplay(service.duration_minutes)}
                      </span>
                    </div>
                    {/* Price + Arrow */}
                    <div className="flex flex-col items-center gap-2 flex-shrink-0">
                      <span className="text-xl font-black" style={{ color: 'var(--color-gold)' }}>
                        {priceDisplay(service.price)}
                      </span>
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-transform duration-300 group-hover:scale-110"
                        style={{ background: 'var(--color-gold)', color: '#fff' }}
                      >
                        ←
                      </div>
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
