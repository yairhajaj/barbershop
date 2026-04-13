import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const THEMES = [
  {
    id: 'app-copy',
    name: 'העתק אפליקציה',
    desc: 'הזמנה בעמוד אחד — העתק מדויק של הדוגמה',
    preview: ['#ffffff', '#FF8500', '#f2f2f2'],
  },
  {
    id: 'orange',
    name: 'כתום מינימלי',
    desc: 'בהיר + כתום — כל ההזמנה בעמוד אחד, pills נוחים',
    preview: ['#f5f5f5', '#FF7A00', '#ffffff'],
  },
  {
    id: 'dark-gold',
    name: 'פרימיום כהה',
    desc: 'כהה עם זהב — אשף שלבים יוקרתי קלאסי',
    preview: ['#111111', '#c9a96e', '#1a1a1a'],
  },
  {
    id: 'cosmic',
    name: 'קוסמי',
    desc: 'זכוכית + סגול — עיצוב עתידני חדשני',
    preview: ['#060914', '#A78BFA', '#0D0B26'],
  },
  {
    id: 'navy-gold',
    name: 'כחול מלכותי',
    desc: 'כחול עמוק עם זהב — יוקרה מלכותית',
    preview: ['#0a0e1a', '#c9a96e', '#111827'],
  },
  {
    id: 'charcoal',
    name: 'אפור כהה',
    desc: 'אפור פחם עם כסף — מודרני ועדין',
    preview: ['#1c1c1e', '#a8a8b3', '#2c2c2e'],
  },
]

export const LAYOUTS = [
  {
    id: 'flat',
    name: 'מינימלי',
    desc: 'שטוח ונקי — ללא צללים, קצוות חדים, אוורירי',
    icon: '▭',
    preview: { radius: 4, shadow: false, pill: false },
  },
  {
    id: 'cards',
    name: 'כרטיסים',
    desc: 'פינות מעוגלות, צללים עדינים, מבנה מסודר',
    icon: '⬭',
    preview: { radius: 14, shadow: true, pill: false },
  },
  {
    id: 'premium',
    name: 'פרימיום',
    desc: 'כפתורי pill, אנימציות חלקות, חוויית יוקרה',
    icon: '◯',
    preview: { radius: 999, shadow: true, pill: true },
  },
]

const ThemeContext = createContext(null)

async function getSettingsId() {
  const { data } = await supabase.from('business_settings').select('id').single()
  return data?.id
}

export function ThemeProvider({ children }) {
  const [theme,  setThemeState]  = useState('orange')
  const [layout, setLayoutState] = useState('cards')
  const [loaded, setLoaded] = useState(false)

  // Load from Supabase on mount (syncs all devices)
  useEffect(() => {
    supabase.from('business_settings').select('theme, layout').single().then(({ data }) => {
      const t = data?.theme  || 'orange'
      const l = data?.layout || 'cards'
      setThemeState(t)
      setLayoutState(l)
      applyToDOM(t, l)
      setLoaded(true)
    })
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
    applyToDOM(t, layout)
    const id = await getSettingsId()
    if (id) await supabase.from('business_settings').update({ theme: t }).eq('id', id)
  }

  async function saveLayout(l) {
    setLayoutState(l)
    applyToDOM(theme, l)
    const id = await getSettingsId()
    if (id) await supabase.from('business_settings').update({ layout: l }).eq('id', id)
  }

  return (
    <ThemeContext.Provider value={{
      theme, layout, loaded,
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
