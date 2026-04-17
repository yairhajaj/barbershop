export function Skeleton({ className = '' }) {
  return (
    <div
      className={`skeleton-shimmer rounded-xl ${className}`}
      style={{
        background: 'var(--color-border)',
        backgroundImage: 'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--color-card) 40%, transparent) 50%, transparent 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s linear infinite',
      }}
    />
  )
}

export function SkeletonList({ count = 4 }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: 'var(--color-card)' }}
        >
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
    >
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}
