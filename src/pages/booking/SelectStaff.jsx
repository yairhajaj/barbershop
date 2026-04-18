import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookingProgress } from '../../components/booking/BookingProgress'
import { Spinner } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { useStaff } from '../../hooks/useStaff'
import { useStaffPortfolio } from '../../hooks/useStaffPortfolio'
import { useTheme } from '../../contexts/ThemeContext'

export function SelectStaff() {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const [portfolioStaff, setPortfolioStaff] = useState(null)

  const bookingState = JSON.parse(sessionStorage.getItem('booking_state') ?? '{}')
  const { staff, loading } = useStaff({ activeOnly: true, branchId: bookingState.branchId ?? null })

  useEffect(() => {
    if (!bookingState.serviceId) navigate('/book/service', { replace: true })
  }, [])

  function selectStaff(staffId, staffName) {
    const updated = { ...bookingState, staffId, staffName }
    sessionStorage.setItem('booking_state', JSON.stringify(updated))
    navigate('/book/datetime')
  }

  function selectAny() {
    selectStaff(null, 'כל ספר פנוי')
  }

  const eligible = staff.filter(s =>
    !bookingState.serviceId ||
    s.staff_services?.some(ss => ss.service_id === bookingState.serviceId)
  )

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: 'var(--color-surface)' }}>
      <div className="container px-4 sm:px-6 max-w-xl mx-auto">
        <BookingProgress currentStep="staff" />

        <div className="text-center mb-7">
          <h1 className="text-3xl font-black mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            בחר ספר
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>עם מי תרצה לקבוע?</p>
        </div>

        <button onClick={() => navigate('/book/service')} className="btn-ghost mb-6 text-sm">
          ← חזרה
        </button>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Any staff — featured card */}
            <motion.button
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={selectAny}
              className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all cursor-pointer text-right group"
              style={{
                background: isDark
                  ? 'linear-gradient(135deg, rgba(255,133,0,0.14), rgba(255,133,0,0.06))'
                  : 'linear-gradient(135deg, rgba(255,133,0,0.09), rgba(255,133,0,0.03))',
                border: '1px solid rgba(255,133,0,0.25)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 10px 28px rgba(255,133,0,0.18)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.05)'
              }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                style={{ background: 'var(--color-gold)', color: '#fff' }}
              >
                ✂
              </div>
              <div className="flex-1">
                <div className="font-black text-base" style={{ color: 'var(--color-text)' }}>כל ספר פנוי</div>
                <div className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>הזמן המוקדם ביותר הזמין</div>
              </div>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-transform duration-300 group-hover:scale-110"
                style={{ background: 'var(--color-gold)', color: '#fff' }}
              >←</div>
            </motion.button>

            {/* Individual staff */}
            {eligible.map((member, i) => (
              <StaffCard
                key={member.id}
                member={member}
                index={i + 1}
                isDark={isDark}
                onSelect={() => selectStaff(member.id, member.name)}
                onPortfolio={() => setPortfolioStaff(member)}
              />
            ))}
          </div>
        )}
      </div>

      {portfolioStaff && (
        <PortfolioLightbox
          member={portfolioStaff}
          onClose={() => setPortfolioStaff(null)}
          onSelect={() => {
            selectStaff(portfolioStaff.id, portfolioStaff.name)
            setPortfolioStaff(null)
          }}
        />
      )}
    </div>
  )
}

function StaffCard({ member, index, isDark, onSelect, onPortfolio }) {
  const { photos } = useStaffPortfolio(member.id)
  const preview = photos.slice(0, 3)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 10px 32px rgba(255,133,0,0.13)'
        e.currentTarget.style.borderColor = 'rgba(255,133,0,0.35)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    >
      {/* Photo banner */}
      <button onClick={onSelect} className="w-full block group cursor-pointer text-right">
        <div
          className="relative h-36 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(255,133,0,0.12), rgba(255,133,0,0.04))' }}
        >
          {member.photo_url ? (
            <img
              src={member.photo_url}
              alt={member.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-6xl font-black" style={{ color: 'var(--color-gold)', opacity: 0.2 }}>
                {member.name[0]}
              </span>
            </div>
          )}
          {/* Gradient overlay */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)' }}
          />
          {/* Name + bio on photo */}
          <div className="absolute bottom-3 right-4 left-14 text-right">
            <div className="font-black text-white text-lg leading-tight">{member.name}</div>
            {member.bio && (
              <div className="text-xs mt-0.5 line-clamp-1" style={{ color: 'rgba(255,255,255,0.65)' }}>{member.bio}</div>
            )}
          </div>
          {/* Arrow button */}
          <div
            className="absolute bottom-3 left-4 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-transform duration-300 group-hover:scale-110"
            style={{ background: 'var(--color-gold)', color: '#fff' }}
          >
            ←
          </div>
        </div>
      </button>

      {/* Portfolio thumbnails */}
      {preview.length > 0 && (
        <div
          className="px-4 py-3 flex gap-2 items-center"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <div className="flex gap-1.5">
            {preview.map(p => (
              <img
                key={p.id}
                src={p.image_url}
                alt={p.caption || ''}
                className="w-12 h-12 rounded-xl object-cover"
                style={{ border: '1px solid var(--color-border)' }}
              />
            ))}
          </div>
          <button
            onClick={onPortfolio}
            className="text-xs font-bold hover:underline mr-1"
            style={{ color: 'var(--color-gold)' }}
          >
            ראה עבודות →
          </button>
        </div>
      )}
    </motion.div>
  )
}

function PortfolioLightbox({ member, onClose, onSelect }) {
  const { isDark } = useTheme()
  const { photos, loading } = useStaffPortfolio(member.id)

  return (
    <Modal open={true} onClose={onClose} title={`עבודות של ${member.name}`} size="xl">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : photos.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--color-muted)' }}>
            <div className="text-4xl mb-3">📷</div>
            <p>אין תמונות בפורטפוליו עדיין</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((photo, i) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-xl overflow-hidden aspect-square relative"
                style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
              >
                <img src={photo.image_url} alt={photo.caption || ''} className="w-full h-full object-cover" />
                {photo.caption && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs p-2 truncate">
                    {photo.caption}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        <button onClick={onSelect} className="btn-primary w-full justify-center text-base py-3 mt-2">
          בחר את {member.name} ←
        </button>
      </div>
    </Modal>
  )
}
