import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BUSINESS } from '../../config/business'
import { useServices } from '../../hooks/useServices'
import { useStaff } from '../../hooks/useStaff'
import { useReviews } from '../../hooks/useReviews'
import { useProducts } from '../../hooks/useProducts'
import { useStaffPortfolio } from '../../hooks/useStaffPortfolio'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { minutesToDisplay, priceDisplay } from '../../lib/utils'

export function HomePage() {
  const { services, loading: servicesLoading } = useServices({ activeOnly: true })
  const { staff, loading: staffLoading } = useStaff({ activeOnly: true })
  const { reviews } = useReviews()
  const { products: featuredProducts } = useProducts({ activeOnly: true, featuredOnly: true })
  const { settings } = useBusinessSettings()
  const { user, profile } = useAuth()
  const { theme } = useTheme()

  const [portfolioMember, setPortfolioMember] = useState(null)

  // hero source: prefer DB → localStorage → BUSINESS config → gradient
  const heroType = settings?.hero_type
    || localStorage.getItem('hero_type')
    || BUSINESS.heroType
    || 'gradient'
  const heroSrc  = settings?.hero_image_url
    || localStorage.getItem('hero_image_url')
    || BUSINESS.heroSrc
    || null
  const logoUrl  = settings?.logo_url || null

  // portfolio display mode: 'grid' | 'story'
  const portfolioMode = settings?.portfolio_view_mode
    || localStorage.getItem('portfolio_view_mode')
    || 'grid'

  // booking flow: 'multistep' | 'all-in-one'
  const bookingFlow = settings?.booking_flow
    || localStorage.getItem('booking_flow')
    || 'multistep'
  const bookHref = bookingFlow === 'all-in-one' ? '/book/all' : '/book/service'

  // Service card link — skip service step if multistep, pre-select if all-in-one
  function serviceHref(serviceId) {
    return bookingFlow === 'all-in-one'
      ? `/book/all?service=${serviceId}`
      : `/book/staff?service=${serviceId}`
  }

  return (
    <>
      {/* ── HERO ──────────────────────────────────────────────────── */}
      <section className="relative min-h-[70vh] flex flex-col items-center justify-center overflow-hidden">
        {heroType === 'video' && heroSrc ? (
          <video className="absolute inset-0 w-full h-full object-cover" src={heroSrc} autoPlay muted loop playsInline />
        ) : heroType === 'image' && heroSrc ? (
          <img className="absolute inset-0 w-full h-full object-cover" src={heroSrc} alt="hero" />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #111 0%, #222 100%)' }} />
        )}
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} />

        <div className="relative z-10 text-center text-white px-6 w-full max-w-lg mx-auto">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center text-2xl font-black shadow-xl overflow-hidden"
            style={{ background: 'var(--color-gold)', color: '#fff' }}
          >
            {logoUrl
              ? <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
              : BUSINESS.logoText}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="text-4xl sm:text-5xl font-black mb-3 leading-tight"
            style={{ letterSpacing: '-0.03em' }}
          >
            {BUSINESS.name}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-base mb-8"
            style={{ color: 'rgba(255,255,255,0.75)' }}
          >
            הזמינו תור בקלות ובמהירות
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-3 justify-center items-center"
          >
            <Link to={bookHref} className="btn-primary text-base px-8 py-3.5">✂ קבע תור עכשיו</Link>
            {!user && (
              <Link to="/login" className="text-sm font-semibold px-6 py-3 rounded-full border border-white/30 text-white/80 hover:bg-white/10 transition-all">
                כניסה / הרשמה
              </Link>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── WELCOME CARD ──────────────────────────────────────────── */}
      <section className="py-6 px-4" style={{ background: 'var(--color-surface)' }}>
        <div className="max-w-xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="rounded-3xl p-6 text-center"
            style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
          >
            <p className="text-lg font-bold mb-4" style={{ color: 'var(--color-text)' }}>
              {user ? `שלום ${profile?.name ?? ''}! ✂` : 'שלום אורח, ברוך הבא! ✂'}
            </p>
            {user ? (
              <div className="flex gap-3 justify-center">
                <Link to={bookHref} className="btn-primary text-sm px-6 py-2.5">קבע תור</Link>
                <Link to="/my-appointments" className="btn-outline text-sm px-6 py-2.5">התורים שלי</Link>
              </div>
            ) : (
              <Link to="/login" className="inline-flex items-center gap-2 text-sm font-bold px-6 py-2.5 rounded-full" style={{ background: '#111', color: '#fff' }}>
                לחץ להתחברות או הרשמה ←
              </Link>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── SERVICES ──────────────────────────────────────────────── */}
      <section id="services" className="py-10 px-4" style={{ background: 'var(--color-surface)' }}>
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-black" style={{ color: 'var(--color-text)', letterSpacing: '-0.01em' }}>השירותים שלנו</h2>
            <Link to={bookHref} className="text-sm font-bold" style={{ color: 'var(--color-gold)' }}>הכל ←</Link>
          </div>

          {servicesLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'var(--color-card)' }} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {services.map((service, i) => (
                <motion.div key={service.id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                  <Link
                    to={serviceHref(service.id)}
                    className="flex items-center justify-between p-4 rounded-2xl border-2 transition-all group"
                    style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-gold)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(255,122,0,0.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div>
                      <div className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{service.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>⏱ {minutesToDisplay(service.duration_minutes)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-base font-black" style={{ color: 'var(--color-gold)' }}>{priceDisplay(service.price)}</span>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--color-gold)', color: '#fff' }}>←</div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── TEAM — horizontal carousel ────────────────────────────── */}
      {!staffLoading && staff.length > 0 && (
        <section id="team" className="py-10" style={{ background: 'var(--color-card)', borderTop: '1px solid var(--color-border)' }}>
          <div className="px-4 max-w-xl mx-auto mb-4">
            <h2 className="text-xl font-black" style={{ color: 'var(--color-text)', letterSpacing: '-0.01em' }}>הצוות שלנו</h2>
          </div>

          {/* Horizontal scroll strip */}
          <div
            className="flex gap-4 overflow-x-auto pb-4 px-4"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {staff.map((member, i) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="flex-shrink-0 w-52 rounded-3xl overflow-hidden cursor-pointer"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={() => setPortfolioMember(member)}
              >
                {/* Photo */}
                <div className="relative h-64 bg-gray-100 overflow-hidden">
                  {member.photo_url ? (
                    <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(201,169,110,0.15), rgba(201,169,110,0.05))' }}>
                      <span className="text-7xl font-black" style={{ color: 'var(--color-gold)', opacity: 0.4 }}>{member.name[0]}</span>
                    </div>
                  )}
                  {/* Gradient overlay */}
                  <div className="absolute inset-x-0 bottom-0 h-20" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }} />
                  <div className="absolute bottom-3 right-3 left-3">
                    <h3 className="text-base font-black text-white leading-tight">{member.name}</h3>
                    {member.bio && <p className="text-xs text-white/70 mt-0.5 line-clamp-1">{member.bio}</p>}
                  </div>

                  {/* Story indicator dots (if story mode) */}
                  {portfolioMode === 'story' && (
                    <div className="absolute top-3 right-3 left-3 flex gap-0.5">
                      {[...Array(Math.min(5, 3))].map((_, i) => (
                        <div key={i} className="flex-1 h-0.5 rounded-full bg-white/50" />
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="p-3 flex gap-2">
                  <Link
                    to={bookingFlow === 'all-in-one'
                      ? `/book/all?staff=${member.id}`
                      : `/book/service?staff=${member.id}`}
                    onClick={e => e.stopPropagation()}
                    className="btn-primary flex-1 justify-center text-xs py-2 px-2"
                  >
                    ✂ קבע תור
                  </Link>
                  <button
                    onClick={e => { e.stopPropagation(); setPortfolioMember(member) }}
                    className="text-xs font-bold py-2 px-3 rounded-xl border-2 transition-all"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-gold)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                  >
                    עבודות
                  </button>
                </div>
              </motion.div>
            ))}

            {/* Spacer at end */}
            <div className="flex-shrink-0 w-2" />
          </div>
        </section>
      )}

      {/* ── FEATURED PRODUCTS ────────────────────────────────────── */}
      {featuredProducts.length > 0 && (
        <section className="py-10 px-4" style={{ background: 'var(--color-card)', borderTop: '1px solid var(--color-border)' }}>
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-black" style={{ color: 'var(--color-text)', letterSpacing: '-0.01em' }}>🛍️ מוצרים מומלצים</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {featuredProducts.map((product, i) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                  className="flex-shrink-0 w-44 rounded-2xl overflow-hidden"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  <div className="h-36 bg-gray-100 flex items-center justify-center overflow-hidden">
                    {product.image_url
                      ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                      : <span className="text-4xl opacity-30">🛍️</span>}
                  </div>
                  <div className="p-3">
                    <div className="font-bold text-sm leading-tight mb-1" style={{ color: 'var(--color-text)' }}>{product.name}</div>
                    {product.description && <div className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--color-muted)' }}>{product.description}</div>}
                    <div className="font-black text-sm" style={{ color: 'var(--color-gold)' }}>₪{product.price}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── REVIEWS ──────────────────────────────────────────────── */}
      {reviews.length > 0 && (
        <section className="py-10 px-4" style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}>
          <div className="max-w-xl mx-auto">
            <h2 className="text-xl font-black mb-5" style={{ color: 'var(--color-text)', letterSpacing: '-0.01em' }}>מה אומרים הלקוחות ✨</h2>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {reviews.slice(0, 10).map((review, i) => (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                  className="flex-shrink-0 rounded-2xl p-4 w-64"
                  style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
                >
                  <div className="flex items-center gap-1 mb-2">
                    {[1,2,3,4,5].map(s => (
                      <span key={s} style={{ color: s <= review.rating ? '#FBBF24' : 'rgba(0,0,0,0.15)' }}>★</span>
                    ))}
                  </div>
                  {review.comment && <p className="text-sm mb-3 line-clamp-3" style={{ color: 'var(--color-text)' }}>"{review.comment}"</p>}
                  <div className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>
                    {review.profiles?.name ?? 'לקוח'}
                    {review.staff?.name && <span> · {review.staff.name}</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CONTACT ───────────────────────────────────────────────── */}
      <section id="contact" className="py-10 px-4" style={{ background: 'var(--color-surface)' }}>
        <div className="max-w-xl mx-auto">
          <h2 className="text-xl font-black mb-5" style={{ color: 'var(--color-text)', letterSpacing: '-0.01em' }}>מצאו אותנו</h2>

          <div className="rounded-2xl p-5 mb-5 space-y-3" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
            {[
              { icon: '📍', label: BUSINESS.address },
              { icon: '📞', label: BUSINESS.phone },
              { icon: '✉️', label: BUSINESS.email },
            ].filter(i => i.label).map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <span className="text-lg w-7 text-center">{icon}</span>
                <span style={{ color: 'var(--color-text)' }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Quick access buttons */}
          <div className="flex gap-3 mb-4">
            {BUSINESS.whatsapp && (
              <a href={`https://wa.me/${BUSINESS.whatsapp}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm"
                style={{ background: '#25D366', color: '#fff' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
            )}
            {BUSINESS.instagram && (
              <a href={`https://instagram.com/${BUSINESS.instagram}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm"
                style={{ background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', color: '#fff' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                Instagram
              </a>
            )}
            {BUSINESS.googleReviewUrl && (
              <a href={BUSINESS.googleReviewUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm"
                style={{ background: '#4285F4', color: '#fff' }}>
                ⭐ דירוג Google
              </a>
            )}
          </div>

          <Link to={bookHref} className="btn-primary w-full justify-center text-base py-4">✂ קבע תור עכשיו</Link>
        </div>
      </section>

      {/* ── PORTFOLIO VIEWER ─────────────────────────────────────── */}
      <AnimatePresence>
        {portfolioMember && (
          <PortfolioViewer
            member={portfolioMember}
            mode={portfolioMode}
            onClose={() => setPortfolioMember(null)}
            bookHref={bookHref}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ── Unified portfolio viewer — fetches photos, renders grid or story ──
function PortfolioViewer({ member, mode, onClose, bookHref }) {
  const { photos, loading } = useStaffPortfolio(member.id)

  if (mode === 'story') {
    return <StoryViewer member={member} photos={photos} loading={loading} onClose={onClose} bookHref={bookHref} />
  }
  return <GridModal member={member} photos={photos} loading={loading} onClose={onClose} bookHref={bookHref} />
}

// ── Story viewer (Instagram-style) ──────────────────────────────────
function StoryViewer({ member, photos, loading, onClose, bookHref }) {
  const [idx, setIdx] = useState(0)
  // Store pointer-down X so we can decide on pointer-up (works on both mouse & touch)
  const pointerX = useState(null)

  const total = photos.length
  const photo = photos[idx] ?? null

  function handlePointerDown(e) {
    if (e.target.closest('button') || e.target.closest('a')) return
    pointerX[1](e.clientX)
  }

  function handlePointerUp(e) {
    if (e.target.closest('button') || e.target.closest('a')) return
    const downX = pointerX[0]
    if (downX === null) return
    pointerX[1](null)
    const x = downX
    const w = window.innerWidth
    if (total === 0) return
    if (x > w * 0.4) {
      if (idx < total - 1) setIdx(i => i + 1)
      else onClose()
    } else {
      if (idx > 0) setIdx(i => i - 1)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex flex-col select-none"
      style={{
        height: '100dvh',          // fills real viewport on mobile (accounts for browser chrome)
        touchAction: 'manipulation', // prevents double-tap zoom on mobile
        overscrollBehavior: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Progress bars */}
      {total > 0 && (
        <div className="absolute top-0 inset-x-0 z-20 flex gap-1 px-3 pt-3">
          {photos.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.3)' }}>
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  background: '#fff',
                  width: i < idx ? '100%' : i === idx ? '50%' : '0%',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="absolute top-5 inset-x-0 z-20 flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }}>
            {member.photo_url
              ? <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" />
              : <span className="w-full h-full flex items-center justify-center font-black text-white text-base">{member.name[0]}</span>}
          </div>
          <div>
            <p className="text-white font-black text-sm leading-tight">{member.name}</p>
            {total > 0 && <p className="text-white/60 text-xs">{idx + 1} / {total}</p>}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onClose() }}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white text-2xl"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          ×
        </button>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {loading ? (
          <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
        ) : total === 0 ? (
          <div className="text-center">
            <div className="text-5xl mb-3">📷</div>
            <p className="text-white/60 text-sm">עדיין אין תמונות עבודות</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.img
              key={photo?.id ?? idx}
              src={photo?.image_url}
              alt={photo?.caption || ''}
              className="max-w-full max-h-full object-contain"
              style={{ maxHeight: '80vh' }}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.15 }}
              draggable={false}
            />
          </AnimatePresence>
        )}
      </div>

      {/* Caption */}
      {photo?.caption && (
        <div className="absolute bottom-20 inset-x-0 px-6 text-center pointer-events-none">
          <p className="text-white text-sm bg-black/50 inline-block px-4 py-1.5 rounded-full">{photo.caption}</p>
        </div>
      )}

      {/* Tap hints (shown briefly) */}
      {total > 1 && (
        <>
          <div className="absolute left-0 top-16 bottom-16 w-1/3 flex items-center justify-start pl-4 pointer-events-none opacity-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-lg">→</div>
          </div>
          <div className="absolute right-0 top-16 bottom-16 w-1/3 flex items-center justify-end pr-4 pointer-events-none opacity-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-lg">←</div>
          </div>
        </>
      )}

      {/* Book CTA */}
      <div
        className="p-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        onPointerDown={e => e.stopPropagation()}
        onPointerUp={e => e.stopPropagation()}
      >
        <Link
          to={`/book/service?staff=${member.id}`}
          onClick={onClose}
          className="btn-primary w-full justify-center py-3"
        >
          ✂ קבע תור עם {member.name}
        </Link>
      </div>
    </motion.div>
  )
}

// ── Grid modal (sheet from bottom) ──────────────────────────────────
function GridModal({ member, photos, loading, onClose, bookHref }) {
  const [lightbox, setLightbox] = useState(null)

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'var(--color-card)' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5"
          style={{ background: 'var(--color-card)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'rgba(0,0,0,0.08)' }}>
              {member.photo_url
                ? <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" />
                : <span className="w-full h-full flex items-center justify-center font-black text-lg" style={{ color: 'var(--color-muted)' }}>{member.name[0]}</span>}
            </div>
            <div>
              <h2 className="font-black text-base" style={{ color: 'var(--color-text)' }}>{member.name}</h2>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>עבודות</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-xl"
            style={{ color: 'var(--color-muted)', background: 'rgba(0,0,0,0.06)' }}>×</button>
        </div>

        {member.bio && (
          <div className="px-5 pt-4 pb-2">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{member.bio}</p>
          </div>
        )}

        {/* Photos grid */}
        <div className="p-4">
          {loading ? (
            <div className="grid grid-cols-3 gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="aspect-square rounded-xl animate-pulse" style={{ background: 'rgba(0,0,0,0.08)' }} />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📷</div>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>עדיין אין תמונות עבודות</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, i) => (
                <motion.button
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => setLightbox(i)}
                  className="aspect-square rounded-xl overflow-hidden"
                  style={{ background: 'rgba(0,0,0,0.06)' }}
                >
                  <img src={photo.image_url} alt={photo.caption || ''} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {/* Book CTA */}
        <div className="sticky bottom-0 p-4" style={{ background: 'var(--color-card)', borderTop: '1px solid var(--color-border)' }}>
          <Link to={`/book/service?staff=${member.id}`} onClick={onClose} className="btn-primary w-full justify-center py-3">
            ✂ קבע תור עם {member.name}
          </Link>
        </div>
      </motion.div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox !== null && (
          <LightboxViewer
            photos={photos}
            startIdx={lightbox}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Lightbox with prev/next ──────────────────────────────────────────
function LightboxViewer({ photos, startIdx, onClose }) {
  const [idx, setIdx] = useState(startIdx)
  const photo = photos[idx]

  function handleClick(e) {
    if (e.target.closest('button')) return
    const x = e.clientX
    const w = window.innerWidth
    if (x > w * 0.5) {
      if (idx < photos.length - 1) setIdx(i => i + 1)
      else onClose()
    } else {
      if (idx > 0) setIdx(i => i - 1)
      else onClose()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.95)' }}
      onClick={handleClick}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={idx}
          initial={{ opacity: 0, scale: 0.93 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          src={photo.image_url} alt={photo.caption || ''}
          className="max-w-full max-h-full rounded-2xl object-contain"
          style={{ maxHeight: '85vh' }}
          draggable={false}
        />
      </AnimatePresence>

      <button onClick={e => { e.stopPropagation(); onClose() }}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full text-2xl text-white"
        style={{ background: 'rgba(255,255,255,0.15)' }}>×</button>

      {idx > 0 && (
        <button onClick={e => { e.stopPropagation(); setIdx(i => i - 1) }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full text-white text-xl"
          style={{ background: 'rgba(255,255,255,0.15)' }}>›</button>
      )}
      {idx < photos.length - 1 && (
        <button onClick={e => { e.stopPropagation(); setIdx(i => i + 1) }}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full text-white text-xl"
          style={{ background: 'rgba(255,255,255,0.15)' }}>‹</button>
      )}

      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">{idx + 1} / {photos.length}</p>
      {photo.caption && (
        <p className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white text-sm bg-black/60 px-4 py-2 rounded-full whitespace-nowrap">{photo.caption}</p>
      )}
    </motion.div>
  )
}
