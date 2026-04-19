import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export function KpiStrip({ stats, className = '' }) {
  const [openIdx, setOpenIdx] = useState(null)

  function toggle(i) {
    if (!stats[i].detail?.length) return
    setOpenIdx(prev => prev === i ? null : i)
  }

  const selected = openIdx !== null ? stats[openIdx] : null

  return (
    <div className={`mb-5 ${className}`}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map((s, i) => {
          const isOpen = openIdx === i
          const hasDetail = s.detail?.length > 0
          return (
            <div key={i}
              onClick={() => toggle(i)}
              className={`rounded-2xl px-3.5 py-3 min-w-0 transition-all ${hasDetail ? 'cursor-pointer active:scale-[0.97]' : ''}`}
              style={{
                background: s.tint || 'var(--color-card)',
                border: `1px solid ${isOpen ? (s.accent || 'var(--color-border)') : 'var(--color-border)'}`,
                boxShadow: 'var(--shadow-card)',
              }}>
              <div className="flex items-center gap-1 mb-0.5">
                {s.icon && <span className="text-sm leading-none">{s.icon}</span>}
                <div className="text-[10px] font-bold uppercase tracking-wider truncate flex-1"
                  style={{ color: 'var(--color-muted)' }}>
                  {s.label}
                </div>
                {hasDetail && (
                  <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-muted)' }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                )}
              </div>
              <div className="text-xl font-black truncate"
                style={{ color: s.accent || 'var(--color-text)' }}>
                {s.value}
              </div>
              {s.sub && (
                <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>
                  {s.sub}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key={openIdx}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden">
            <div className="mt-2 rounded-2xl p-3.5"
              style={{
                background: 'var(--color-card)',
                border: `1.5px solid ${selected.accent || 'var(--color-border)'}`,
                boxShadow: 'var(--shadow-card)',
              }}>
              <div className="text-xs font-black mb-2 flex items-center gap-1.5"
                style={{ color: selected.accent || 'var(--color-text)' }}>
                <span>{selected.icon}</span>
                <span>{selected.label}</span>
              </div>
              <div className="space-y-0">
                {selected.detail.map((row, j) => (
                  <div key={j}
                    className="flex items-center justify-between py-2"
                    style={{ borderTop: j > 0 ? '1px solid var(--color-border)' : 'none' }}>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                        {row.label}
                      </span>
                      {row.sub && (
                        <span className="text-[10px] mr-1.5" style={{ color: 'var(--color-muted)' }}>
                          · {row.sub}
                        </span>
                      )}
                    </div>
                    {row.value && (
                      <span className="text-xs font-black flex-shrink-0 mr-3"
                        style={{ color: selected.accent || 'var(--color-text)' }}>
                        {row.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
