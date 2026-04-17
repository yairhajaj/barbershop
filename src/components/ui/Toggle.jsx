export function Toggle({ label, checked, onChange, size = 'md', disabled }) {
  const sizes = {
    sm: { track: 'w-9 h-5',  thumb: 'w-4 h-4', off: '18px' },
    md: { track: 'w-11 h-6', thumb: 'w-5 h-5', off: '22px' },
  }
  const s = sizes[size] ?? sizes.md

  const btn = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={`relative inline-flex ${s.track} rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-gold)] focus:ring-offset-2 shrink-0${disabled ? ' opacity-50 cursor-not-allowed' : ' cursor-pointer'}`}
      style={{ background: checked ? 'var(--color-gold)' : 'var(--color-border)' }}
    >
      <span
        className={`absolute top-0.5 ${s.thumb} bg-white rounded-full shadow transition-all duration-200`}
        style={{ right: checked ? '2px' : `calc(100% - ${s.off})` }}
      />
    </button>
  )

  if (!label) return btn

  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
      <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</span>
      {btn}
    </label>
  )
}
