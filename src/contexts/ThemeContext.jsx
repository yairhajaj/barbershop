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
    id: 'luxury',
    name: 'יוקרה',
    desc: 'Dark mode מלא — כמו אפליקציית יוקרה',
    icon: '✦',
  },
  {
    id: 'app',
    name: 'מובייל נייטיב',
    desc: 'ניווט תחתי — כמו אפליקציית iOS',
    icon: '⬡',
  },
  {
    id: 'minimal',
    name: 'מינימלי',
    desc: 'לבן ונקי — עיצוב סקנדינבי',
    icon: '○',
  },
]

const ThemeContext = createContext(null)

async function getSettingsId() {
  const { data } = await supabase.from('business_settings').select('id').single()
  return data?.id
}

export function ThemeProvider({ children }) {
  const [theme,  setThemeState]  = useState('orange')
  const [layout, setLayoutState] = useState('luxury')
  const [loaded, setLoaded] = useState(false)

  // Load from Supabase on mount (syncs all devices)
  useEffect(() => {
    supabase.from('business_settings').select('theme, layout').single().then(({ data }) => {
      const t = data?.theme  || 'orange'
      const l = data?.layout || 'luxury'
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
