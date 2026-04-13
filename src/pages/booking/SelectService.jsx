import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookingProgress } from '../../components/booking/BookingProgress'
import { Spinner } from '../../components/ui/Spinner'
import { useServices } from '../../hooks/useServices'
import { minutesToDisplay, priceDisplay } from '../../lib/utils'

export function SelectService() {
  const { services, loading } = useServices({ activeOnly: true })
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedStaff = searchParams.get('staff')

  function selectService(service) {
    const state = {
      serviceId:       service.id,
      serviceName:     service.name,
      serviceDuration: service.duration_minutes,
      servicePrice:    service.price,
    }
    if (preselectedStaff) state.staffId = preselectedStaff
    sessionStorage.setItem('booking_state', JSON.stringify(state))
    navigate(preselectedStaff ? '/book/datetime' : '/book/staff')
  }

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: 'var(--color-surface)' }}>
      <div className="container px-4 sm:px-6 max-w-xl mx-auto">
        <BookingProgress currentStep={1} />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-black mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            בחר שירות
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>איזה שירות תרצה לקבל?</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <div className="flex flex-col gap-3">
            {services.map((service, i) => (
              <motion.button
                key={service.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => selectService(service)}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 transition-all text-right group cursor-pointer"
                style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--color-gold)'
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(255,122,0,0.12)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div className="flex-1">
                  <div className="font-bold text-base mb-0.5" style={{ color: 'var(--color-text)' }}>
                    {service.name}
                  </div>
                  {service.description && (
                    <div className="text-xs mb-1.5 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                      {service.description}
                    </div>
                  )}
                  <span
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--color-muted)' }}
                  >
                    ⏱ {minutesToDisplay(service.duration_minutes)}
                  </span>
                </div>
                <div className="flex items-center gap-3 mr-4">
                  <span className="text-xl font-black" style={{ color: 'var(--color-gold)' }}>
                    {priceDisplay(service.price)}
                  </span>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                    style={{ background: 'var(--color-gold)', color: '#fff' }}
                  >
                    ←
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
