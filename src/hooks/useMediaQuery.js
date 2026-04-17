import { useState, useEffect } from 'react'

/**
 * Reactive wrapper around window.matchMedia.
 *
 * Usage:
 *   const isMobile = useMediaQuery('(max-width: 640px)')
 *   const isDark   = useMediaQuery('(prefers-color-scheme: dark)')
 *
 * @param {string} query — a valid CSS media query string
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const getMatch = () =>
    typeof window !== 'undefined' && window.matchMedia(query).matches

  const [matches, setMatches] = useState(getMatch)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)

    const handler = (e) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

/** Convenience shortcuts */
export const useIsMobile  = () => useMediaQuery('(max-width: 640px)')
export const useIsTablet  = () => useMediaQuery('(max-width: 1024px)')
export const useIsDesktop = () => useMediaQuery('(min-width: 1025px)')
