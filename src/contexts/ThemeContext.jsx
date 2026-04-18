import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { applyStatusBarForTheme } from '../lib/native'

export const THEMES = [
  {
    id: 'orange',
    name: 'כתום',
    desc: 'בהיר ואנרגטי — קלאסי ומוכח',
    preview: ['#ffffff', '#FF8500', '#f5f5f5'],
  },
  {
    id: 'rose',
    name: 'ורוד',
    desc: 'ורוד אלגנטי — נשי ומתוחכם',
    preview: ['#fdf4f0', '#d4627a', '#ffffff'],
  },
  {
    id: 'sage',
    name: 'ירוק',
    desc: 'ירוק טבעי — ספא ובריאות',
    preview: ['#f0f5f1', '#4a8c6a', '#ffffff'],
  },
  {
    id: 'midnight',
    name: 'לילה',
    desc: 'כחול עמוק — מסתורי ומודרני',
    preview: ['#0f1025', '#818cf8', '#1a1b3a'],
  },
  {
    id: 'obsidian',
    name: 'אובסידיאן',
    desc: 'שחור עמוק עם זהב חם — פרימיום וגלאס',
    preview: ['#06080F', '#F59E0B', '#0f1219'],
  },
]

export const LAYOUTS = [
  {
    id: 'modern',
    name: 'מודרני',
    desc: 'כרטיסים צפים עם פינות עגולות — סגנון אפליקציה',
    icon: '⬭',
  },
  {
    id: 'luxury',
    name: 'כהה',
    desc: 'כהה, דרמטי, גלאס מורפיזם — חוויה קולנועית',
    icon: '◈',
  },
  {
    id: 'glass',
    name: 'זכוכית צפה',
    desc: 'זכוכית מקפיאה — iOS, שקיפות ו-blur קינמטי',
    icon: '◻',
  },
  {
    id: 'noir',
    name: 'נואר',
    desc: 'כהה פרימיום — זכוכית זוהרת, אנימציות מדורגות, glow חם',
    icon: '✦',
  },
]

const ThemeContext = createContext(null)

async function getSettingsId() {
  const { data } = await supabase.from('business_settings').select('id').single()
  return data?.id
}

export function ThemeProvider({ children }) {
  const [theme,  setThemeState]  = useState('orange')
  const [layout, setLayoutState] = useState('modern')
  const [loaded, setLoaded] = useState(false)

  // Load on mount — DB first, localStorage fallback
  useEffect(() => {
    // Apply localStorage immediately (instant, no flicker)
    const lsTheme  = localStorage.getItem('app_theme')
    const lsLayout = localStorage.getItem('app_layout')
    if (lsTheme || lsLayout) {
      applyToDOM(lsTheme || 'orange', lsLayout || 'modern')
      applyStatusBarForTheme(lsTheme || 'orange')
    }

    // Then load from Supabase (authoritative — syncs all devices)
    supabase.from('business_settings').select('theme, layout').single().then(({ data, error }) => {
      if (error) { setLoaded(true); return }
      const t = data?.theme  || lsTheme  || 'orange'
      const l = data?.layout || lsLayout || 'modern'
      setThemeState(t)
      setLayoutState(l)
      localStorage.setItem('app_theme',  t)
      localStorage.setItem('app_layout', l)
      applyToDOM(t, l)
      applyStatusBarForTheme(t)
      setLoaded(true)
    })

    // Real-time — any DB change applies immediately on all open devices
    const channel = supabase
      .channel('business_settings_theme')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'business_settings',
      }, async ({ new: row }) => {
        if (row.theme)  {
          setThemeState(row.theme)
          localStorage.setItem('app_theme',  row.theme)
          document.documentElement.setAttribute('data-theme',  row.theme)
          await applyStatusBarForTheme(row.theme)
        }
        if (row.layout) { setLayoutState(row.layout); localStorage.setItem('app_layout', row.layout); document.documentElement.setAttribute('data-layout', row.layout) }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function applyToDOM(t, l) {
    document.documentElement.setAttribute('data-theme',  t)
    document.documentElement.setAttribute('data-layout', l)
  }

  // Preview without saving
  function previewTheme(t)  { document.documentElement.setAttribute('data-theme',  t) }
  function previewLayout(l) { document.documentElement.setAttribute('data-layout', l) }
  function cancelPreview()  { applyToDOM(theme, layout) }

  async function saveTheme(t) {
    setThemeState(t)
    const currentLayout = localStorage.getItem('app_layout') || layout
    applyToDOM(t, currentLayout)
    localStorage.setItem('app_theme', t)
    await applyStatusBarForTheme(t)
    const id = await getSettingsId()
    if (id) await supabase.from('business_settings').update({ theme: t }).eq('id', id)
  }

  async function saveLayout(l) {
    setLayoutState(l)
    const currentTheme = localStorage.getItem('app_theme') || theme
    applyToDOM(currentTheme, l)
    localStorage.setItem('app_layout', l)
    const id = await getSettingsId()
    if (id) await supabase.from('business_settings').update({ layout: l }).eq('id', id)
  }

  const isDark = ['midnight', 'obsidian'].includes(theme) || ['luxury', 'noir'].includes(layout)

  return (
    <ThemeContext.Provider value={{
      theme, layout, loaded, isDark,
      previewTheme, previewLayout, cancelPreview,
      saveTheme, saveLayout,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
