/**
 * Priority-based KPI grid — fits the viewport (no horizontal scroll).
 * Layout is driven by each stat's `size`:
 *   'hero' — col-span-2 everywhere, larger type (primary metric)
 *   'wide' — col-span-2 on mobile, col-span-1 on sm+ (secondary)
 *   'sm'   — col-span-1 everywhere (tertiary/alerts)
 *
 * Props:
 *   stats: [{ label, value, accent?, sub?, size? }]
 */
export function KpiStrip({ stats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
      {stats.map((s, i) => {
        const size = s.size || 'wide'
        const spanClass =
          size === 'hero' ? 'col-span-2 sm:col-span-4'
          : size === 'wide' ? 'col-span-2 sm:col-span-2'
          : 'col-span-1'

        const valueSize =
          size === 'hero' ? 'text-3xl sm:text-4xl'
          : size === 'wide' ? 'text-xl sm:text-2xl'
          : 'text-base sm:text-lg'

        const labelSize = size === 'hero' ? 'text-xs' : 'text-[10px]'
        const pad       = size === 'hero' ? 'p-4 sm:p-5' : 'px-3 py-2.5'

        return (
          <div key={i}
            className={`${spanClass} ${pad} rounded-2xl min-w-0`}
            style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-card)',
            }}>
            <div className={`${labelSize} font-bold uppercase tracking-wider truncate`}
              style={{ color: 'var(--color-muted)' }}>
              {s.label}
            </div>
            <div className={`${valueSize} font-black mt-0.5 truncate`}
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
  )
}
