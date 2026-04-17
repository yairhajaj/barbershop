import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { Modal } from './Modal'
import { buzz } from '../../lib/native'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolveRef = useRef(null)

  const confirm = useCallback(({ title, description, variant = 'destructive', confirmLabel = 'אישור', cancelLabel = 'ביטול' }) => {
    buzz('warning')
    return new Promise(resolve => {
      resolveRef.current = resolve
      setState({ title, description, variant, confirmLabel, cancelLabel })
    })
  }, [])

  function handleConfirm() {
    setState(null)
    resolveRef.current?.(true)
  }

  function handleClose() {
    setState(null)
    resolveRef.current?.(false)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={handleClose} title={state?.title ?? ''} size="sm">
        {state && (
          <>
            <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>{state.description}</p>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-ghost text-sm" onClick={handleClose}>
                {state.cancelLabel}
              </button>
              <button
                type="button"
                className="text-sm font-bold px-4 py-2 rounded-full"
                style={{
                  background: state.variant === 'warn' ? 'var(--color-warning)' : 'var(--color-danger)',
                  color: '#fff',
                }}
                onClick={handleConfirm}
              >
                {state.confirmLabel}
              </button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx
}
