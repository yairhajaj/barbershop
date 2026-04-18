/**
 * Equal-sized KPI grid — 2 cols on mobile, 3 on sm+.
 * No hero; each tile is the same shape. Optional `tint` gives a soft
 * semantic background (e.g. green for revenue, red for alerts).
 *
 * Props:
 *   stats: [{ label, value, accent?, sub?, tint? }]
 *   className: extra classes on the grid wrapper (e.g. responsive ordering)
 */
export function KpiStrip({ stats, className = '' }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${className}`}>
      {stats.map((s, i) => (
        <div key={i}
          className="rounded-2xl px-3 py-2.5 min-w-0"
          style={{
            background: s.tint || 'var(--color-card)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-card)',
          }}>
          <div className="text-[10px] font-bold uppercase tracking-wider truncate"
            style={{ color: 'var(--color-muted)' }}>
            {s.label}
          </div>
          <div className="text-lg font-black mt-0.5 truncate"
            style={{ color: s.accent || 'var(--color-text)' }}>
            {s.value}
          </div>
          {s.sub && (
            <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>
              {s.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
