import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAndroidBack } from '../../hooks/useAndroidBack'

export function Modal({ open, onClose, title, children, size = 'md' }) {
  // Android hardware back button closes the modal
  const handleBack = useCallback(() => { if (open) onClose() }, [open, onClose])
  useAndroidBack(handleBack, open)

  // iOS-safe body scroll lock using position:fixed
  // overflow:hidden alone does NOT prevent touch scrolling on mobile Safari
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    const body = document.body
    body.style.position = 'fixed'
    body.style.top      = `-${scrollY}px`
    body.style.left     = '0'
    body.style.right    = '0'
    body.style.width    = '100%'
    return () => {
      body.style.position = ''
      body.style.top      = ''
      body.style.left     = ''
      body.style.right    = ''
      body.style.width    = ''
      window.scrollTo(0, scrollY)
    }
  }, [open])

  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  // Prevent touch events on backdrop from scrolling background on iOS
  function handleBackdropTouch(e) {
    if (e.target === e.currentTarget) e.preventDefault()
  }

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ touchAction: 'none' }}
          onTouchMove={handleBackdropTouch}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`relative w-full ${sizes[size]} card p-6 z-10 flex flex-col`}
            style={{
              maxHeight: 'min(88vh, calc(100dvh - 2rem))',
              touchAction: 'auto',
            }}
          >
            <div className="flex items-center justify-between mb-5 flex-shrink-0">
              <h3 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                {title}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                ×
              </button>
            </div>
            {/* overflow-y-auto with hidden scrollbar */}
            <div
              className="overflow-y-auto flex-1 modal-scroll"
              style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                touchAction: 'pan-y',
                scrollbarWidth: 'none',       /* Firefox */
                msOverflowStyle: 'none',      /* IE/Edge */
              }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
