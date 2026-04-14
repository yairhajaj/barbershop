// BookingProgress auto-detects whether the booking is in multi-branch mode
// by checking sessionStorage (branchName is set only when >1 branch chosen).
// Each page passes its own step KEY so the component figures out the number.

const SINGLE_STEPS = [
  { key: 'service', label: 'שירות' },
  { key: 'staff',   label: 'ספר'   },
  { key: 'time',    label: 'שעה'   },
  { key: 'confirm', label: 'אישור' },
]

const MULTI_STEPS = [
  { key: 'branch',  label: 'סניף'  },
  { key: 'service', label: 'שירות' },
  { key: 'staff',   label: 'ספר'   },
  { key: 'time',    label: 'שעה'   },
  { key: 'confirm', label: 'אישור' },
]

// Accept either a numeric step (legacy) or a string key
// Pages can pass currentStep="service" or currentStep={2} (old style)
export function BookingProgress({ currentStep }) {
  // Detect multi-branch from booking state
  let hasBranch = false
  try {
    const bs = JSON.parse(sessionStorage.getItem('booking_state') ?? '{}')
    hasBranch = !!bs.branchName
  } catch { /* noop */ }

  const STEPS = hasBranch ? MULTI_STEPS : SINGLE_STEPS

  // Map step to index
  let activeIndex
  if (typeof currentStep === 'string') {
    activeIndex = STEPS.findIndex(s => s.key === currentStep)
    if (activeIndex === -1) activeIndex = 0
  } else {
    // Legacy numeric: 1-based index into the STEPS array
    activeIndex = (currentStep ?? 1) - 1
  }

  return (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((step, i) => {
        const done   = i < activeIndex
        const active = i === activeIndex

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all"
                style={
                  done   ? { background: 'var(--color-gold)', color: '#fff' } :
                  active ? { background: '#111', color: '#fff', boxShadow: '0 0 0 4px rgba(255,122,0,0.2)' } :
                           { background: '#f0f0f0', color: '#bbb' }
                }
              >
                {done ? '✓' : i + 1}
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
                className="h-0.5 w-10 sm:w-14 mb-4 mx-1 transition-colors"
                style={{ background: i < activeIndex ? 'var(--color-gold)' : '#e5e7eb' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
