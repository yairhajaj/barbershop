const STEPS = [
  { key: 'selection', label: 'בחירה'  },
  { key: 'details',   label: 'פרטים'  },
  { key: 'תשלום',    label: 'תשלום'  },
  { key: 'confirm',   label: 'אישור'  },
]

const KEY_TO_INDEX = {
  branch:  0,
  service: 0,
  staff:   0,
  time:    0,
  details: 1,
  payment: 2,
  confirm: 3,
}

export function BookingProgress({ currentStep }) {
  let activeIndex
  if (typeof currentStep === 'string') {
    activeIndex = KEY_TO_INDEX[currentStep] ?? 0
  } else {
    activeIndex = Math.min((currentStep ?? 1) - 1, STEPS.length - 1)
  }

  return (
    <div className="flex items-center justify-center mb-8 gap-0">
      {STEPS.map((step, i) => {
        const done   = i < activeIndex
        const active = i === activeIndex

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300"
                style={
                  done
                    ? { background: 'var(--color-gold)', color: '#fff', boxShadow: '0 2px 8px rgba(255,133,0,0.35)' }
                    : active
                      ? {
                          background: 'var(--color-text)',
                          color: 'var(--color-surface)',
                          boxShadow: '0 0 0 3px rgba(255,133,0,0.25)',
                        }
                      : {
                          background: 'var(--color-border)',
                          color: 'var(--color-muted)',
                        }
                }
              >
                {done
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : i + 1
                }
              </div>
              <span
                className="text-[11px] mt-1 font-bold transition-colors"
                style={
                  active ? { color: 'var(--color-text)' } :
                  done   ? { color: 'var(--color-gold)' } :
                           { color: 'var(--color-muted)' }
                }
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="mb-4 mx-1.5 rounded-full transition-all duration-500"
                style={{
                  height: 2,
                  width: 36,
                  background: i < activeIndex
                    ? 'var(--color-gold)'
                    : 'var(--color-border)',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
