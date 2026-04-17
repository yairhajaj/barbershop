export function ErrorState({ title = 'משהו השתבש', description, onRetry }) {
  return (
    <div
      className="flex flex-col items-center text-center py-12 px-6 rounded-2xl gap-3"
      style={{
        background: 'var(--color-danger-bg)',
        border: '1px solid var(--color-danger-border)',
      }}
    >
      <div className="text-4xl">⚠️</div>
      <p className="font-bold text-base" style={{ color: 'var(--color-danger)' }}>
        {title}
      </p>
      {description && (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {description}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-bold px-5 py-2 rounded-full mt-1"
          style={{ background: 'var(--color-danger)', color: '#fff' }}
        >
          נסה שוב
        </button>
      )}
    </div>
  )
}
