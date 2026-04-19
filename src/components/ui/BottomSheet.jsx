/**
 * BottomSheet — responsive sheet / modal primitive.
 *
 * On mobile  (<640px): anchored to the bottom of the screen, slides up,
 *                      stays above the app toolbar (booking + admin),
 *                      inner content scrolls without bleeding to the page.
 * On desktop (≥640px): centred modal with backdrop blur.
 *
 * API:
 *   <BottomSheet open onClose title? size?>
 *     {children}
 *   </BottomSheet>
 */

import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useAndroidBack } from '../../hooks/useAndroidBack'
import { useMotion } from '../../hooks/useMotion'

const FOCUSABLE_SEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

// Height of the fixed bottom toolbar (booking + admin).
// Used to keep the sheet above the nav bar on every page.
const TOOLBAR_H = '72px'

export function BottomSheet({ open, onClose, title, size = 'md', children }) {
  const panelRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 640px)')
  const m = useMotion()

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
    const first = panelRef.current.querySelector(FOCUSABLE_SEL)
    first?.focus()
    const trap = (e) => {
      if (e.key !== 'Tab' || !panelRef.current) return
      const els  = [...panelRef.current.querySelectorAll(FOCUSABLE_SEL)]
      if (!els.length) return
      const head = els[0], tail = els[els.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === head) { e.preventDefault(); tail.focus() }
      } else {
        if (document.activeElement === tail) { e.preventDefault(); head.focus() }
      }
    }
    window.addEventListener('keydown', trap)
    return () => window.removeEventListener('keydown', trap)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        isMobile
          ? <MobileSheet panelRef={panelRef} title={title} onClose={onClose} m={m}>{children}</MobileSheet>
          : <DesktopModal panelRef={panelRef} title={title} size={size} onClose={onClose} m={m}>{children}</DesktopModal>
      )}
    </AnimatePresence>
  )
}

/* ── Mobile bottom sheet ─────────────────────────────────────────────── */
function MobileSheet({ panelRef, title, onClose, m, children }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop */}
      <motion.div
        variants={m.backdrop}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet panel — sits above the bottom toolbar */}
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'תפריט'}
        variants={m.sheetEnter}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="relative z-10 w-full card rounded-t-3xl flex flex-col"
        style={{
          // Max height: leave ~80px at top for status bar breathing room
          maxHeight: `calc(100dvh - 80px - ${TOOLBAR_H})`,
          // Push content above the app toolbar + iOS home indicator
          marginBottom: `calc(${TOOLBAR_H} + env(safe-area-inset-bottom, 0px))`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-border)' }} />
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 flex-shrink-0">
          {title
            ? <h3 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
            : <span />
          }
          <button
            onClick={onClose}
            aria-label="סגור"
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none min-w-11 min-h-11 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            ×
          </button>
        </div>

        {/* Scrollable content — scroll stays inside the sheet */}
        <div
          className="overflow-y-auto flex-1 px-5 pb-6"
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
  )
}

/* ── Desktop centred modal ───────────────────────────────────────────── */
function DesktopModal({ panelRef, title, size, onClose, m, children }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ padding: '16px' }}
    >
      {/* Backdrop */}
      <motion.div
        variants={m.backdrop}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'תפריט'}
        variants={m.modalEnter}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={`relative w-full ${SIZES[size]} card flex flex-col z-10 p-6`}
        style={{ maxHeight: 'min(88vh, calc(100dvh - 2rem))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          {title
            ? <h3 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
            : <span />
          }
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
          className="overflow-y-auto flex-1"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {children}
        </div>
      </motion.div>
    </div>
  )
}
