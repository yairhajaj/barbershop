// BookingProgress shows 4 logical steps matching the actual booking flow:
// בחירה (branch/service/staff/datetime) → פרטים → תשלום → אישור
// Each page passes its own step KEY so the component highlights the right group.

const STEPS = [
  { key: 'selection', label: 'בחירה'  },
  { key: 'details',   label: 'פרטים'  },
  { key: 'payment',   label: 'תשלום'  },
  { key: 'confirm',   label: 'אישור'  },
]

// Map each page key to the logical step index (0-based)
const KEY_TO_INDEX = {
  branch:  0,
  service: 0,
  staff:   0,
  time:    0,
  details: 1,
  payment: 2,
  confirm: 3,
}

// Accept either a numeric step (legacy) or a string key
// Pages can pass currentStep="service" or currentStep={2} (old style)
export function BookingProgress({ currentStep }) {
  // Map step to index
  let activeIndex
  if (typeof currentStep === 'string') {
    activeIndex = KEY_TO_INDEX[currentStep] ?? 0
  } else {
    // Legacy numeric: map old 1-based to new 4-step (best effort)
    activeIndex = Math.min((currentStep ?? 1) - 1, STEPS.length - 1)
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
                           { background: '#f0f0f0', color: 'var(--color-muted)' }
                }
              >
                {done ? '✓' : i + 1}
              </div>
              <span
                className="text-xs mt-1 font-semibold"
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
