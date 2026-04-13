const STEPS = [
  { num: 1, label: 'שירות' },
  { num: 2, label: 'ספר'   },
  { num: 3, label: 'שעה'   },
  { num: 4, label: 'אישור' },
]

export function BookingProgress({ currentStep }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((step, i) => {
        const done   = step.num < currentStep
        const active = step.num === currentStep

        return (
          <div key={step.num} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all"
                style={
                  done   ? { background: 'var(--color-gold)', color: '#fff' } :
                  active ? { background: '#111', color: '#fff', boxShadow: '0 0 0 4px rgba(255,122,0,0.2)' } :
                           { background: '#f0f0f0', color: '#bbb' }
                }
              >
                {done ? '✓' : step.num}
              </div>
              <span
                className="text-xs mt-1 font-semibold"
                style={
                  active ? { color: '#111' } :
                  done   ? { color: 'var(--color-gold)' } :
                  { color: '#bbb' }
                }
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="h-0.5 w-10 sm:w-16 mb-4 mx-1 transition-colors"
                style={{ background: step.num < currentStep ? 'var(--color-gold)' : '#e5e7eb' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
