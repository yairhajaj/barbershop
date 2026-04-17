import { useReducedMotion } from 'framer-motion'
import * as variants from '../lib/motion-variants'

/**
 * Returns motion variants that respect `prefers-reduced-motion`.
 *
 * When the user has requested reduced motion, all transforms (y/x/scale)
 * are stripped — only opacity fades remain. Opacity-only fades are WCAG 2.3.3 safe.
 *
 * Usage:
 *   const v = useMotion()
 *   <motion.div variants={v.fadeUp} initial="hidden" animate="visible" />
 *
 * @returns {typeof variants}
 */
export function useMotion() {
  const reduced = useReducedMotion()
  if (!reduced) return variants

  const opacityOnly = () => ({
    hidden:  { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.12 } },
    exit:    { opacity: 0, transition: { duration: 0.10 } },
  })

  return {
    ...variants,
    fadeIn:     opacityOnly(),
    fadeUp:     opacityOnly(),
    fadeDown:   opacityOnly(),
    scaleIn:    opacityOnly(),
    modalEnter: opacityOnly(),
    sheetEnter: opacityOnly(),
    pagePush:   opacityOnly(),
    collapse:   opacityOnly(),
    // keep non-transform helpers as-is
    backdrop:    variants.backdrop,
    listStagger: variants.listStagger,
    // disable tap/hover transforms
    tapScale:   {},
    hoverScale: {},
    // springs become instant
    sheetSpring:  { duration: 0 },
    dialogSpring: { duration: 0 },
  }
}

/**
 * For components that need a single transition object.
 * Example: `transition={useMotionTransition()}`
 *
 * @returns {{ duration: number, ease?: number[] }}
 */
export function useMotionTransition() {
  const reduced = useReducedMotion()
  return reduced
    ? { duration: 0.12 }
    : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
}
