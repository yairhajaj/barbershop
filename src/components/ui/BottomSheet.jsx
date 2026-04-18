/**
 * BottomSheet — responsive sheet / modal primitive.
 *
 * On mobile  (<640px): slides up from the bottom with a drag handle,
 *                      safe-area-inset-bottom padding, native-feel spring.
 * On desktop (≥640px): centred modal with backdrop blur — identical UX to Modal.jsx.
 *
 * API:
 *   <BottomSheet open onClose title? size?>
 *     {children}
 *   </BottomSheet>
 *
 * Backward-compat note:
 *   Modal.jsx is untouched. Pages can adopt BottomSheet incrementally.
 *   If you want Modal to delegate to BottomSheet add the one-line adapter shown
 *   at the bottom of this file.
 *
 * Included behaviours:
 *   • iOS-safe body-scroll-lock (position:fixed trick, same as Modal.jsx)
 *   • Escape key → close
 *   • Android hardware back-button → close (via useAndroidBack)
 *   • Focus trap (Tab / Shift-Tab loops within the panel)
 *   • Backdrop click → close
 */

import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useAndroidBack } from '../../hooks/useAndroidBack'

const FOCUSABLE_SEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

export function BottomSheet({ open, onClose, title, size = 'md', children }) {
  const panelRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 640px)')

  /* ── Android back button ─────────────────────────────────────────── */
  const handleBack = useCallback(() => { if (open) onClose() }, [open, onClose])
  useAndroidBack(handleBack, open)

  /* ── iOS-safe body scroll lock ───────────────────────────────────── */
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    const body    = document.body
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

  /* ── Escape key ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /* ── Focus trap ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open || !panelRef.current) return

    // Move focus inside on open
    const first = panelRef.current.querySelector(FOCUSABLE_SEL)
    first?.focus()

    const trap = (e) => {
      if (e.key !== 'Tab' || !panelRef.current) return
      const els   = [...panelRef.current.querySelectorAll(FOCUSABLE_SEL)]
      if (!els.length) return
      const head = els[0]
      const tail = els[els.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === head) { e.preventDefault(); tail.focus() }
      } else {
        if (document.activeElement === tail) { e.preventDefault(); head.focus() }
      }
    }
    window.addEventListener('keydown', trap)
    return () => window.removeEventListener('keydown', trap)
  }, [open])

  /* ── Animations ──────────────────────────────────────────────────── */
  const anim = {
    initial: { opacity: 0, scale: 0.96, y: 12 },
    animate: { opacity: 1, scale: 1,    y: 0  },
    exit:    { opacity: 0, scale: 0.96, y: 12 },
  }

  /* Mobile bottom-bar (both layouts) ≈ 60-72px + safe-area. Reserve
     a generous pad at both ends so the modal is centred between the
     top of the viewport and the floating nav. */
  const mobileEdgePad = 'max(16px, env(safe-area-inset-bottom, 0px))'
  const mobileBottomClearance = '92px'  // bottom bar + breathing room

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{
            padding: isMobile
              ? `${mobileEdgePad} 12px ${mobileBottomClearance}`
              : '16px',
            touchAction: 'none',
          }}
          onTouchMove={(e) => {
            // Prevent iOS rubber-banding the page behind the modal
            if (e.target === e.currentTarget) e.preventDefault()
          }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title || 'תפריט'}
            {...anim}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className={`relative w-full ${SIZES[size]} card flex flex-col z-10 ${isMobile ? 'rounded-3xl' : 'p-6'}`}
            style={{
              maxHeight: isMobile
                ? `calc(100dvh - ${mobileBottomClearance} - 32px)`
                : 'min(88vh, calc(100dvh - 2rem))',
              touchAction: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header row (title + close button) */}
            <div
              className={`flex items-center justify-between flex-shrink-0 ${
                isMobile ? 'px-5 pt-5 pb-3' : 'mb-5'
              }`}
            >
              {title ? (
                <h3
                  className="text-xl font-semibold"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {title}
                </h3>
              ) : (
                <span />
              )}

              <button
                onClick={onClose}
                aria-label="סגור"
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none min-w-11 min-h-11 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                ×
              </button>
            </div>

            {/* Scrollable content */}
            <div
              className={`overflow-y-auto flex-1 ${isMobile ? 'px-5 pb-5' : ''}`}
              style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                touchAction: 'pan-y',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
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

/* ─────────────────────────────────────────────────────────────────────────────
 * Optional one-line adapter for Modal.jsx (if you want Modal to use BottomSheet
 * under the hood without touching any call-sites):
 *
 *   // In Modal.jsx, replace the entire return with:
 *   return <BottomSheet open={open} onClose={onClose} title={title} size={size}>{children}</BottomSheet>
 *
 * This is NOT done automatically — apply it per-component once QA is satisfied.
 * ─────────────────────────────────────────────────────────────────────────────
 */
