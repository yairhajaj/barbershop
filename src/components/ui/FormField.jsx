import { useId } from 'react'

export function FormField({ label, value, onChange, type = 'text', error, helper, required, inputMode, autoComplete, placeholder, min, max, step, disabled, className = '' }) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {label}
          {required && <span style={{ color: 'var(--color-danger)' }} className="mr-1">*</span>}
        </label>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={`input focus:outline-none focus:ring-2 focus:ring-[var(--color-gold)] focus:ring-offset-0${error ? ' border-[var(--color-danger)]' : ''}${disabled ? ' opacity-50 cursor-not-allowed' : ''}`}
      />
      {(error || helper) && (
        <p className="text-xs mt-0.5" style={{ color: error ? 'var(--color-danger)' : 'var(--color-muted)' }}>
          {error || helper}
        </p>
      )}
    </div>
  )
}
