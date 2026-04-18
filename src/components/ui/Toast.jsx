import { createContext, useContext, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { buzzNotification } from '../../lib/native'

const ToastContext = createContext(null)

let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const show = useCallback(({ message, type = 'info', duration = 4000 }) => {
    const id = ++toastId
    setToasts(t => [...t, { id, message, type }])
    // Haptic feedback for destructive actions
    if (type === 'error')   buzzNotification('error')
    if (type === 'warning') buzzNotification('warning')
    if (type === 'success') buzzNotification('success')
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
  }, [])

  const remove = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-sm px-4">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium cursor-pointer ${
                toast.type === 'success' ? 'bg-green-500 text-white' :
                toast.type === 'error'   ? 'bg-red-500 text-white' :
                toast.type === 'warning' ? 'bg-amber-500 text-white' :
                'bg-gray-900 text-white'
              }`}
              onClick={() => remove(toast.id)}
            >
              <span className="text-lg">
                {toast.type === 'success' ? '✓' :
                 toast.type === 'error'   ? '✕' :
                 toast.type === 'warning' ? '!' : 'ℹ'}
              </span>
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx.show
}
