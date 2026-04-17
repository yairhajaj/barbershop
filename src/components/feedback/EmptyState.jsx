import { motion } from 'framer-motion'
import { fadeUp } from '../../lib/motion-variants'

export function EmptyState({ icon, title, description, cta }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center text-center py-16 px-6 gap-4"
    >
      {icon && (
        <div className="text-5xl mb-1" style={{ color: 'var(--color-muted)' }}>
          {icon}
        </div>
      )}
      <p className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
        {title}
      </p>
      {description && (
        <p className="text-sm max-w-xs" style={{ color: 'var(--color-muted)' }}>
          {description}
        </p>
      )}
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="btn-primary text-sm mt-2"
        >
          {cta.label}
        </button>
      )}
    </motion.div>
  )
}
