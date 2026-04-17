// BookingProgress auto-detects whether the booking is in multi-branch mode
// by checking sessionStorage (branchName is set only when >1 branch chosen).
// Each page passes its own step KEY so the component figures out the number.

function buildSteps(hasBranch, hasPayment) {
  const steps = []
  if (hasBranch)  steps.push({ key: 'branch',  label: 'סניף'   })
  steps.push({ key: 'service', label: 'שירות' })
  steps.push({ key: 'staff',   label: 'ספר'   })
  steps.push({ key: 'time',    label: 'שעה'   })
  if (hasPayment) steps.push({ key: 'payment', label: 'תשלום'  })
  steps.push({ key: 'confirm', label: 'אישור'  })
  return steps
}

// Accept either a numeric step (legacy) or a string key
// Pages can pass currentStep="service" or currentStep={2} (old style)
export function BookingProgress({ currentStep }) {
  // Detect multi-branch + payment from booking state
  let hasBranch = false
  let hasPayment = false
  try {
    const bs = JSON.parse(sessionStorage.getItem('booking_state') ?? '{}')
    hasBranch  = !!bs.branchName
    hasPayment = !!bs.paymentEnabled
  } catch { /* noop */ }
  // If we're on the payment step itself, always show payment step
  if (currentStep === 'payment') hasPayment = true

  const STEPS = buildSteps(hasBranch, hasPayment)

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
