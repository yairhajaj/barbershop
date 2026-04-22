import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStaff } from '../../hooks/useStaff'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

const item = {
  hidden: { opacity: 0, y: 48, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}

const heading = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
}

export default function Team() {
  const navigate = useNavigate()
  const { staff, loading } = useStaff({ activeOnly: true })

  return (
    <div dir="rtl" style={{
      minHeight: '100dvh',
      background: 'linear-gradient(160deg, #0d0a07 0%, #1a1108 60%, #0a0804 100%)',
      paddingBottom: 100,
    }}>
      {/* Header */}
      <div style={{ padding: '60px 24px 32px', textAlign: 'center' }}>
        <motion.div variants={heading} initial="hidden" animate="show">
          <p style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.25em',
            color: 'var(--color-gold)', textTransform: 'uppercase', marginBottom: 12, opacity: 0.8,
          }}>HAJAJ HAIR DESIGN</p>
          <h1 style={{
            fontSize: 36, fontWeight: 800, letterSpacing: '-0.01em',
            color: '#fff', margin: 0, lineHeight: 1.15,
          }}>הצוות שלנו</h1>
          <div style={{
            width: 40, height: 2, background: 'var(--color-gold)',
            margin: '16px auto 0', borderRadius: 2, opacity: 0.7,
          }} />
        </motion.div>
      </div>

      {/* Grid */}
      <div style={{ padding: '0 16px' }}>
        {loading ? (
          <SkeletonGrid />
        ) : (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
              maxWidth: 680,
              margin: '0 auto',
            }}
          >
            {staff.map((member) => (
              <StaffCard key={member.id} member={member} onClick={() => navigate(`/team/${member.id}`)} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}

function StaffCard({ member, onClick }) {
  return (
    <motion.div
      variants={item}
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
        aspectRatio: '3/4',
        background: '#1a1108',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
      }}
    >
      {/* Photo */}
      {member.photo_url ? (
        <img
          src={member.photo_url}
          alt={member.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          background: 'linear-gradient(145deg, #2a1f0e, #1a1108)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="7" r="4" />
            <path d="M4 21v-1a8 8 0 0116 0v1" />
          </svg>
        </div>
      )}

      {/* Gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
      }} />

      {/* Gold shimmer on hover */}
      <motion.div
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(145deg, rgba(212,175,55,0.12) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      {/* Name + bio */}
      <div style={{ position: 'absolute', bottom: 0, right: 0, left: 0, padding: '16px 14px 18px' }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{member.name}</p>
        {member.bio && (
          <p style={{
            margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{member.bio}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-gold)', letterSpacing: '0.05em' }}>ראה פרופיל</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'scaleX(-1)' }}>
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </motion.div>
  )
}

function SkeletonGrid() {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxWidth: 680, margin: '0 auto',
    }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{
          borderRadius: 18, aspectRatio: '3/4',
          background: 'linear-gradient(90deg, #1a1108 25%, #2a1f0e 50%, #1a1108 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
        }} />
      ))}
    </div>
  )
}
