/**
 * Single source of truth for all Framer Motion variants.
 * Every component that uses framer-motion MUST import from here.
 * Do NOT inline `initial={{ opacity: 0, y: N }}` — use these variants instead.
 */

/** @typedef {import('framer-motion').Variants} Variants */

// ─── Base durations ────────────────────────────────────────────────────────
export const DURATION = {
  fast:   0.12,  // hover/tap feedback
  normal: 0.20,  // micro-interactions
  slow:   0.28,  // modal/sheet enter
  crawl:  0.35,  // maximum allowed for non-celebration
}

// ─── Easing ────────────────────────────────────────────────────────────────
export const EASE = {
  out:   [0.22, 1, 0.36, 1],   // almost everything
  in:    [0.55, 0, 1, 0.45],   // exit animations
  inOut: [0.65, 0, 0.35, 1],   // page transitions
}

// ─── Springs ───────────────────────────────────────────────────────────────
export const sheetSpring  = { type: 'spring', damping: 30, stiffness: 320 }
export const dialogSpring = { type: 'spring', damping: 28, stiffness: 340 }

// ─── Fade primitives ───────────────────────────────────────────────────────
/** @type {Variants} */
export const fadeIn = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.normal, ease: EASE.out } },
  exit:    { opacity: 0, transition: { duration: DURATION.fast,   ease: EASE.in  } },
}

/** @type {Variants} */
export const fadeUp = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE.out } },
  exit:    { opacity: 0, y: 4, transition: { duration: 0.15, ease: EASE.in  } },
}

/** @type {Variants} */
export const fadeDown = {
  hidden:  { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.normal, ease: EASE.out } },
  exit:    { opacity: 0, y: -6, transition: { duration: DURATION.fast, ease: EASE.in } },
}

/** @type {Variants} */
export const scaleIn = {
  hidden:  { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.18, ease: EASE.out } },
  exit:    { opacity: 0, scale: 0.98, transition: { duration: 0.14, ease: EASE.in } },
}

// ─── Modal & sheet ─────────────────────────────────────────────────────────
/** @type {Variants} */
export const modalEnter = {
  hidden:  { opacity: 0, scale: 0.97, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.20, ease: EASE.out } },
  exit:    { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.15, ease: EASE.in } },
}

/** @type {Variants} */
export const sheetEnter = {
  hidden:  { y: '100%' },
  visible: { y: 0,      transition: sheetSpring },
  exit:    { y: '100%', transition: { duration: 0.22, ease: EASE.in } },
}

/** @type {Variants} */
export const backdrop = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.normal, ease: EASE.out } },
  exit:    { opacity: 0, transition: { duration: DURATION.fast, ease: EASE.in } },
}

// ─── Page transition ───────────────────────────────────────────────────────
/** @type {Variants} */
export const pagePush = {
  hidden:  { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.22, ease: EASE.out } },
  exit:    { opacity: 0, x: -12, transition: { duration: 0.18, ease: EASE.in } },
}

// ─── Collapse (cheaper than height:auto) ──────────────────────────────────
/** @type {Variants} */
export const collapse = {
  hidden:  { opacity: 0, scaleY: 0, transformOrigin: 'top' },
  visible: { opacity: 1, scaleY: 1, transition: { duration: 0.18, ease: EASE.out } },
  exit:    { opacity: 0, scaleY: 0, transition: { duration: 0.14, ease: EASE.in } },
}

// ─── List stagger ──────────────────────────────────────────────────────────
/** @type {Variants} */
export const listStagger = {
  hidden:  {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0 },
  },
}

// ─── Tap/press ─────────────────────────────────────────────────────────────
export const tapScale   = { scale: 0.97 }
export const hoverScale = { scale: 1.02 }

// ─── Drag overlay ──────────────────────────────────────────────────────────
export const dragPickedUp = {
  scale: 1.04,
  boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
  transition: { duration: 0.12, ease: EASE.out },
}
