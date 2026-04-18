/**
 * Compact horizontal strip of KPIs — dashboard summary at a glance.
 * Scrolls horizontally on mobile.
 *
 * Props:
 *   stats: [{ label, value, accent?, sub? }]
 */
export function KpiStrip({ stats }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-1 px-1 scrollbar-hide">
      {stats.map((s, i) => (
        <div key={i}
          className="flex-shrink-0 rounded-2xl px-3 py-2.5 min-w-[110px]"
          style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-card)',
          }}>
          <div className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
            style={{ color: 'var(--color-muted)' }}>
            {s.label}
          </div>
          <div className="text-lg font-black mt-0.5 whitespace-nowrap"
            style={{ color: s.accent || 'var(--color-text)' }}>
            {s.value}
          </div>
          {s.sub && (
            <div className="text-[10px] whitespace-nowrap" style={{ color: 'var(--color-muted)' }}>
              {s.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
