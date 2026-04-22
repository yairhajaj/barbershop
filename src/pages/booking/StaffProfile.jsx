import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useStaff } from '../../hooks/useStaff'
import { useStaffPortfolio } from '../../hooks/useStaffPortfolio'

export default function StaffProfile() {
  const { staffId } = useParams()
  const navigate = useNavigate()
  const { staff, loading: staffLoading } = useStaff({ activeOnly: false })
  const { photos, loading: portfolioLoading } = useStaffPortfolio(staffId)
  const [lightbox, setLightbox] = useState(null) // index or null

  const member = staff.find(s => s.id === staffId)

  if (staffLoading) return <LoadingScreen />
  if (!member) return <NotFound navigate={navigate} />

  return (
    <div dir="rtl" style={{ minHeight: '100dvh', background: '#0d0a07', paddingBottom: 100 }}>

      {/* Back button */}
      <motion.button
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0, transition: { delay: 0.1 } }}
        onClick={() => navigate('/team')}
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 50,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" style={{ transform: 'scaleX(-1)', transformOrigin: 'center' }} />
        </svg>
      </motion.button>

      {/* Hero */}
      <div style={{ position: 'relative', height: '45vh', overflow: 'hidden' }}>
        {member.photo_url ? (
          <motion.img
            src={member.photo_url}
            alt={member.name}
            initial={{ scale: 1.12 }}
            animate={{ scale: 1, transition: { duration: 1.1, ease: [0.22, 1, 0.36, 1] } }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(145deg, #2a1f0e, #1a1108)' }} />
        )}
        {/* gradient */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, #0d0a07 0%, rgba(13,10,7,0.5) 40%, transparent 100%)',
        }} />
      </div>

      {/* Name + bio */}
      <div style={{ padding: '0 24px', marginTop: -32, position: 'relative' }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.25, duration: 0.6, ease: 'easeOut' } }}
        >
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{member.name}</h1>
          <div style={{ width: 32, height: 2, background: 'var(--color-gold)', borderRadius: 2, margin: '10px 0 14px', opacity: 0.8 }} />
          {member.bio && (
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65 }}>{member.bio}</p>
          )}
        </motion.div>
      </div>

      {/* Portfolio */}
      {!portfolioLoading && photos.length > 0 && (
        <div style={{ padding: '32px 20px 0' }}>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.4 } }}
            style={{ margin: '0 0 16px 4px', fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--color-gold)', textTransform: 'uppercase' }}
          >
            עבודות
          </motion.h2>
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.45 } } }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}
          >
            {photos.map((photo, idx) => (
              <motion.div
                key={photo.id}
                variants={{
                  hidden: { opacity: 0, scale: 0.88 },
                  show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
                }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setLightbox(idx)}
                style={{ aspectRatio: '1', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: '#1a1108' }}
              >
                <img
                  src={photo.image_url}
                  alt={photo.caption || `עבודה ${idx + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.55 } }}
        style={{ padding: '32px 20px 0' }}
      >
        <button
          onClick={() => navigate(`/book/all?staff=${staffId}`)}
          style={{
            width: '100%', padding: '16px 0', borderRadius: 16, border: 'none',
            background: 'linear-gradient(135deg, var(--color-gold-light, #d4af37), var(--color-gold-dark, #b8860b))',
            color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer',
            letterSpacing: '0.03em', boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
          }}
        >
          קבע תור עם {member.name}
        </button>
      </motion.div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20,
            }}
          >
            <motion.img
              key={lightbox}
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } }}
              src={photos[lightbox]?.image_url}
              alt=""
              style={{ maxWidth: '100%', maxHeight: '80dvh', borderRadius: 16, objectFit: 'contain' }}
              onClick={e => e.stopPropagation()}
            />
            {/* Prev / Next */}
            {lightbox > 0 && (
              <button onClick={e => { e.stopPropagation(); setLightbox(lightbox - 1) }}
                style={navBtnStyle('right')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            )}
            {lightbox < photos.length - 1 && (
              <button onClick={e => { e.stopPropagation(); setLightbox(lightbox + 1) }}
                style={navBtnStyle('left')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
            )}
            {photos[lightbox]?.caption && (
              <p style={{ position: 'absolute', bottom: 32, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                {photos[lightbox].caption}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const navBtnStyle = (side) => ({
  position: 'absolute', [side]: 16, top: '50%', transform: 'translateY(-50%)',
  width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(0,0,0,0.5)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
})

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100dvh', background: '#0d0a07', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--color-gold)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}

function NotFound({ navigate }) {
  return (
    <div dir="rtl" style={{ minHeight: '100dvh', background: '#0d0a07', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>הספר לא נמצא</p>
      <button onClick={() => navigate('/team')} style={{ color: 'var(--color-gold)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>← חזרה לצוות</button>
    </div>
  )
}
