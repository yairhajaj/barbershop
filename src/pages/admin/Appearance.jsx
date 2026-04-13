import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme, THEMES, LAYOUTS } from '../../contexts/ThemeContext'
import { useBusinessGallery } from '../../hooks/useBusinessGallery'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { ImageUpload } from '../../components/ui/ImageUpload'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { supabase } from '../../lib/supabase'

export function Appearance() {
  const { theme, layout, previewTheme, previewLayout, cancelPreview, saveTheme, saveLayout } = useTheme()
  const { items, loading, addItem, deleteItem } = useBusinessGallery()
  const { settings, saveSettings } = useBusinessSettings()
  const toast = useToast()

  // Theme/layout
  const [pendingTheme,  setPendingTheme]  = useState(null)
  const [pendingLayout, setPendingLayout] = useState(null)
  const [saving, setSaving] = useState(false)

  // ── Storage bucket status ──────────────────────────────────────
  const [bucketOk, setBucketOk] = useState(null) // null=checking, true=ok, false=missing

  useEffect(() => {
    supabase.storage.from('uploads').list('', { limit: 1 })
      .then(({ error }) => setBucketOk(!error))
  }, [])

  // ── Hero — local state, independent of DB ──────────────────────
  // Tabs work immediately in the UI; we only save to DB when a URL is chosen
  const [localHeroType, setLocalHeroType] = useState('gradient')
  const [heroUrlInput,  setHeroUrlInput]  = useState('')
  const [heroSaving,    setHeroSaving]    = useState(false)

  // Sync from DB (preferred) or localStorage (fallback)
  useEffect(() => {
    const dbType = settings?.hero_type
    const dbUrl  = settings?.hero_image_url
    const lsType = localStorage.getItem('hero_type')
    const lsUrl  = localStorage.getItem('hero_image_url')
    if (dbType) setLocalHeroType(dbType)
    else if (lsType) setLocalHeroType(lsType)
    if (dbUrl) setHeroUrlInput(dbUrl)
    else if (lsUrl) setHeroUrlInput(lsUrl)
  }, [settings?.hero_type, settings?.hero_image_url])

  async function handleSaveHeroUrl(url) {
    setHeroSaving(true)
    // Always save to localStorage — works even without DB migration
    localStorage.setItem('hero_type', localHeroType)
    localStorage.setItem('hero_image_url', url || '')
    setHeroUrlInput(url || '')
    try {
      await saveSettings({ hero_type: localHeroType, hero_image_url: url })
      toast({ message: 'תמונת רקע עודכנה ✓', type: 'success' })
    } catch {
      // DB columns may not exist yet — localStorage is enough for now
      toast({ message: 'נשמר באופן מקומי ✓ (הרץ migration 006 לשמירה קבועה)', type: 'success' })
    } finally {
      setHeroSaving(false)
    }
  }

  async function handleSaveHeroType(type) {
    setLocalHeroType(type)
    localStorage.setItem('hero_type', type)
    saveSettings({ hero_type: type }).catch(() => {})
  }

  // ── Booking flow ───────────────────────────────────────────────
  const [bookingFlow, setBookingFlow] = useState(
    localStorage.getItem('booking_flow') || 'multistep'
  )

  useEffect(() => {
    if (settings?.booking_flow) setBookingFlow(settings.booking_flow)
  }, [settings?.booking_flow])

  async function handleSaveBookingFlow(flow) {
    setBookingFlow(flow)
    localStorage.setItem('booking_flow', flow)
    saveSettings({ booking_flow: flow }).catch(() => {})
    toast({ message: flow === 'multistep' ? 'מצב רב-שלבי פעיל ✓' : 'מצב עמוד אחד פעיל ✓', type: 'success' })
  }

  // ── Portfolio mode ─────────────────────────────────────────────
  const [portfolioMode, setPortfolioMode] = useState(
    localStorage.getItem('portfolio_view_mode') || 'grid'
  )

  useEffect(() => {
    if (settings?.portfolio_view_mode) setPortfolioMode(settings.portfolio_view_mode)
  }, [settings?.portfolio_view_mode])

  async function handleSavePortfolioMode(mode) {
    setPortfolioMode(mode)
    localStorage.setItem('portfolio_view_mode', mode)
    saveSettings({ portfolio_view_mode: mode }).catch(() => {})
    toast({ message: mode === 'story' ? 'מצב סטורי פעיל ✓' : 'מצב גריד פעיל ✓', type: 'success' })
  }

  // ── Logo ───────────────────────────────────────────────────────
  async function handleSaveLogo(url) {
    try {
      await saveSettings({ logo_url: url })
      toast({ message: url ? 'לוגו עודכן ✓' : 'לוגו הוסר', type: 'success' })
    } catch {
      toast({ message: 'שגיאה בשמירת הלוגו', type: 'error' })
    }
  }

  // ── Theme / Layout ─────────────────────────────────────────────
  const hasChanges = pendingTheme !== null || pendingLayout !== null
  const activeTheme  = pendingTheme  ?? theme
  const activeLayout = pendingLayout ?? layout

  function selectTheme(t)  { setPendingTheme(t);  previewTheme(t) }
  function selectLayout(l) { setPendingLayout(l); previewLayout(l) }
  function handleCancel()  { cancelPreview(); setPendingTheme(null); setPendingLayout(null) }

  async function handleSave() {
    setSaving(true)
    try {
      if (pendingTheme  !== null) await saveTheme(pendingTheme)
      if (pendingLayout !== null) await saveLayout(pendingLayout)
      setPendingTheme(null); setPendingLayout(null)
      toast({ message: 'עיצוב נשמר — יעודכן בכל המכשירים', type: 'success' })
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // ── Gallery ────────────────────────────────────────────────────
  const [galleryUrl,     setGalleryUrl]     = useState('')
  const [newCaption,     setNewCaption]     = useState('')
  const [newType,        setNewType]        = useState('image')
  const [adding,         setAdding]         = useState(false)

  async function handleAddItem() {
    if (!galleryUrl.trim()) return
    setAdding(true)
    try {
      await addItem(galleryUrl.trim(), newCaption.trim(), newType)
      setGalleryUrl(''); setNewCaption(''); setNewType('image')
      toast({ message: 'פריט נוסף לגלריה', type: 'success' })
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">עיצוב</h1>
      </div>

      {/* Storage setup banner */}
      {bucketOk === false && (
        <div className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.4)' }}>
          <p className="font-bold text-sm mb-2" style={{ color: '#dc2626' }}>⚠️ העלאת תמונות לא מוגדרת</p>
          <p className="text-sm mb-3" style={{ color: '#dc2626' }}>
            כדי להעלות תמונות מהמחשב, צריך ליצור Storage bucket ב-Supabase:
          </p>
          <ol className="text-sm space-y-1 mb-3 list-decimal list-inside" style={{ color: '#7f1d1d' }}>
            <li>פתח <strong>Supabase → Storage</strong> (בצד שמאל)</li>
            <li>לחץ <strong>New bucket</strong></li>
            <li>שם: <code className="bg-red-100 px-1.5 py-0.5 rounded font-mono">uploads</code></li>
            <li>סמן <strong>Public bucket ✓</strong></li>
            <li>לחץ <strong>Save</strong></li>
            <li>רענן עמוד זה</li>
          </ol>
          <p className="text-xs" style={{ color: '#991b1b' }}>
            💡 לחלופין — הדבק קישור URL לתמונה ישירות (ללא העלאה)
          </p>
        </div>
      )}
      {bucketOk === true && (
        <div className="rounded-xl px-4 py-2.5 text-sm font-medium" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', color: '#16a34a' }}>
          ✓ Storage מוגדר — העלאת תמונות פעילה
        </div>
      )}

      {/* Preview banner */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="flex items-center justify-between p-4 rounded-2xl border"
            style={{ background: 'rgba(201,169,110,0.1)', borderColor: 'var(--color-gold)' }}
          >
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--color-gold)' }}>תצוגה מוקדמת פעילה</p>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>צופה בשינויים — שמור כדי שייראו בכל המכשירים</p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCancel} className="btn-outline text-sm px-4 py-2">ביטול</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-4 py-2">
                {saving ? 'שומר...' : 'שמור עיצוב'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BOOKING FLOW ────────────────────────────────────────── */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
        <h2 className="font-semibold text-lg mb-1">סגנון תהליך הזמנה</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--color-muted)' }}>איך הלקוח יקבע תור — בכל כפתורי ההזמנה</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              id: 'multistep',
              icon: '📋',
              title: 'רב-שלבי',
              desc: 'שלב אחר שלב עם סרגל התקדמות',
              steps: ['שירות', 'ספר', 'תאריך', 'פרטים'],
            },
            {
              id: 'all-in-one',
              icon: '⚡',
              title: 'עמוד אחד',
              desc: 'הכל על דף אחד — מהיר וגולל',
              steps: ['ספר → תאריך → שירות → שעה'],
            },
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSaveBookingFlow(opt.id)}
              className="p-4 rounded-2xl border-2 text-right transition-all"
              style={{
                borderColor: bookingFlow === opt.id ? 'var(--color-gold)' : 'var(--color-border)',
                background:  bookingFlow === opt.id ? 'rgba(201,169,110,0.1)' : 'var(--color-card)',
              }}
            >
              <div className="text-2xl mb-2">{opt.icon}</div>
              <div className="font-bold text-sm mb-1" style={{ color: 'var(--color-text)' }}>{opt.title}</div>
              <div className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>{opt.desc}</div>
              <div className="flex flex-wrap gap-1">
                {opt.steps.map((s, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--color-muted)' }}>
                    {s}
                  </span>
                ))}
              </div>
              {bookingFlow === opt.id && (
                <div className="text-xs font-bold mt-2" style={{ color: 'var(--color-gold)' }}>✓ פעיל</div>
              )}
            </button>
          ))}
        </div>
      </motion.section>

      {/* ── HERO IMAGE ──────────────────────────────────────────── */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
        <h2 className="font-semibold text-lg mb-1">תמונת רקע לדף הבית</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>ה-hero שמוצג בראש דף הבית</p>

        {/* Tabs — local state, work immediately */}
        <div className="flex gap-2 mb-5">
          {[
            { id: 'gradient', label: '🎨 גרדיאנט' },
            { id: 'image',    label: '🖼️ תמונה'   },
            { id: 'video',    label: '🎬 סרטון'    },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSaveHeroType(tab.id)}
              className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all"
              style={{
                borderColor: localHeroType === tab.id ? 'var(--color-gold)' : 'var(--color-border)',
                background:  localHeroType === tab.id ? 'rgba(201,169,110,0.12)' : 'transparent',
                color: 'var(--color-text)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {localHeroType !== 'gradient' && (
          <div className="space-y-3">
            {/* Upload or paste URL */}
            <div className="space-y-2">
              <p className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>
                {localHeroType === 'image' ? 'תמונת רקע' : 'סרטון רקע'} — העלה קובץ או הדבק קישור:
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  className="input flex-1 text-sm"
                  placeholder={localHeroType === 'image' ? 'https://... (קישור לתמונה)' : 'https://... (קישור לסרטון)'}
                  value={heroUrlInput}
                  onChange={e => setHeroUrlInput(e.target.value)}
                />
                <button
                  type="button"
                  disabled={!heroUrlInput.trim() || heroSaving}
                  onClick={() => handleSaveHeroUrl(heroUrlInput.trim())}
                  className="btn-primary text-sm px-4 py-2 shrink-0"
                >
                  {heroSaving ? '...' : 'שמור'}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
                <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
                <span>או</span>
                <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
              </div>
              <ImageUpload
                value={null}
                onUrl={url => handleSaveHeroUrl(url)}
                folder="hero"
                label={localHeroType === 'image' ? 'העלאת תמונה מהמחשב' : 'העלאת סרטון מהמחשב'}
                accept={localHeroType === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/*'}
              />
            </div>

            {/* Preview */}
            {heroUrlInput && (
              <div className="rounded-xl overflow-hidden h-32 bg-gray-100 mt-2">
                {localHeroType === 'video'
                  ? <video src={heroUrlInput} className="w-full h-full object-cover" muted autoPlay loop playsInline />
                  : <img src={heroUrlInput} alt="hero preview" className="w-full h-full object-cover" onError={e => e.target.style.display='none'} />
                }
              </div>
            )}

            {heroUrlInput && (
              <button
                onClick={() => { setHeroUrlInput(''); handleSaveHeroUrl('') }}
                className="text-xs text-red-500 hover:underline"
              >
                הסר תמונת רקע
              </button>
            )}
          </div>
        )}

        {localHeroType === 'gradient' && (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>גרדיאנט כהה — ברירת מחדל יפה ומקצועית</p>
        )}
      </motion.section>

      {/* ── LOGO ────────────────────────────────────────────────── */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
        <h2 className="font-semibold text-lg mb-1">לוגו העסק</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>מוצג בניווט ובדף הבית</p>

        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="url"
              className="input flex-1 text-sm"
              placeholder="https://... (קישור לתמונת לוגו)"
              value={settings?.logo_url || ''}
              onChange={e => {/* controlled via save only */}}
              readOnly
            />
          </div>
          <div className="flex gap-3 items-center">
            <ImageUpload
              value={settings?.logo_url}
              onUrl={handleSaveLogo}
              folder="logo"
              label="העלאת לוגו"
            />
            {settings?.logo_url && (
              <button onClick={() => handleSaveLogo(null)} className="text-xs text-red-500 hover:underline">הסר</button>
            )}
          </div>
        </div>
      </motion.section>

      {/* ── PORTFOLIO MODE ──────────────────────────────────────── */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
        <h2 className="font-semibold text-lg mb-1">תצוגת עבודות ספרים</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--color-muted)' }}>כשלקוח לוחץ על ספר בדף הבית — איך להציג את תמונות העבודות?</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: 'grid',  icon: '⊞', title: 'גריד', desc: 'רשת תמונות — לחיצה פותחת מסך מלא' },
            { id: 'story', icon: '◉', title: 'סטורי', desc: 'תמונה אחת בכל פעם — כמו אינסטגרם' },
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSavePortfolioMode(opt.id)}
              className="p-4 rounded-2xl border-2 text-right transition-all hover:scale-[1.02]"
              style={{
                borderColor: portfolioMode === opt.id ? 'var(--color-gold)' : 'var(--color-border)',
                background:  portfolioMode === opt.id ? 'rgba(201,169,110,0.1)' : 'var(--color-card)',
              }}
            >
              <div className="text-3xl mb-2">{opt.icon}</div>
              <div className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{opt.title}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{opt.desc}</div>
              {portfolioMode === opt.id && (
                <div className="text-xs font-bold mt-2" style={{ color: 'var(--color-gold)' }}>✓ פעיל</div>
              )}
            </button>
          ))}
        </div>
      </motion.section>

      {/* ── THEME ───────────────────────────────────────────────── */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
        <h2 className="font-semibold text-lg mb-1">ערכת צבעים</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--color-muted)' }}>לחץ לתצוגה מוקדמת — השינוי יופיע מיד</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {THEMES.map(th => {
            const active = activeTheme === th.id
            return (
              <button key={th.id} type="button" onClick={() => selectTheme(th.id)}
                className="p-4 rounded-2xl border-2 text-right transition-all hover:scale-[1.02]"
                style={{ borderColor: active ? 'var(--color-gold)' : 'var(--color-border)', background: active ? 'rgba(201,169,110,0.08)' : 'var(--color-card)' }}
              >
                <div className="flex gap-2 mb-3">
                  {th.preview.map((c, i) => (
                    <div key={i} className="w-7 h-7 rounded-full shadow-inner" style={{ background: c, border: '2px solid rgba(255,255,255,0.1)' }} />
                  ))}
                </div>
                <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>{th.name}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{th.desc}</div>
                {active && <div className="text-xs font-bold mt-2" style={{ color: 'var(--color-gold)' }}>✓ נבחר</div>}
              </button>
            )
          })}
        </div>
      </motion.section>

      {/* ── LAYOUT ──────────────────────────────────────────────── */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card p-6">
        <h2 className="font-semibold text-lg mb-1">סגנון תצוגה</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--color-muted)' }}>3 חוויות UI/UX שונות לגמרי — לחץ כדי לראות הבדל</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {LAYOUTS.map(lay => {
            const active = activeLayout === lay.id
            return (
              <button key={lay.id} type="button" onClick={() => selectLayout(lay.id)}
                className="p-5 rounded-2xl border-2 text-right transition-all hover:scale-[1.02]"
                style={{ borderColor: active ? 'var(--color-gold)' : 'var(--color-border)', background: active ? 'rgba(201,169,110,0.08)' : 'var(--color-card)' }}
              >
                <div className="w-full h-24 rounded-xl overflow-hidden mb-3 border" style={{ borderColor: 'var(--color-border)' }}>
                  <LayoutPreviewMini id={lay.id} />
                </div>
                <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>{lay.name}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{lay.desc}</div>
                {active && <div className="text-xs font-bold mt-2" style={{ color: 'var(--color-gold)' }}>✓ פעיל</div>}
              </button>
            )
          })}
        </div>
      </motion.section>

      {/* ── GALLERY ─────────────────────────────────────────────── */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-6">
        <h2 className="font-semibold text-lg mb-1">גלריית העסק</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--color-muted)' }}>תמונות וסרטונים שמוצגים בדף הבית</p>

        <div className="rounded-2xl p-4 mb-5 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm font-semibold">הוסף פריט חדש</p>

          {/* Option 1: paste URL */}
          <div>
            <p className="text-xs mb-1.5" style={{ color: 'var(--color-muted)' }}>הדבק קישור לתמונה/סרטון:</p>
            <input
              type="url"
              className="input text-sm"
              placeholder="https://images.unsplash.com/..."
              value={galleryUrl}
              onChange={e => setGalleryUrl(e.target.value)}
            />
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
            <span>או העלה קובץ מהמחשב</span>
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
          </div>

          {/* Option 2: upload one or more files */}
          <ImageUpload
            value={null}
            onUrls={async (urls) => {
              // Add each uploaded URL directly to gallery
              for (const url of urls) {
                await addItem(url, '', 'image').catch(() => {})
              }
              toast({ message: `${urls.length} תמונות נוספו לגלריה`, type: 'success' })
            }}
            folder="gallery"
            label="העלאת תמונות (ניתן לבחור כמה)"
            multiple={true}
          />

          {/* Caption / type */}
          {galleryUrl && (
            <>
              <img src={galleryUrl} alt="" className="h-20 rounded-xl object-cover w-full" onError={e => e.target.style.display='none'} />
              <div className="flex gap-3">
                <input type="text" className="input flex-1 text-sm" placeholder="כיתוב (אופציונלי)" value={newCaption} onChange={e => setNewCaption(e.target.value)} />
                <select className="input w-28 text-sm" value={newType} onChange={e => setNewType(e.target.value)}>
                  <option value="image">תמונה</option>
                  <option value="video">סרטון</option>
                </select>
              </div>
            </>
          )}

          <button
            onClick={handleAddItem}
            disabled={adding || !galleryUrl.trim()}
            className="btn-primary text-sm w-full justify-center"
          >
            {adding ? 'מוסיף...' : '+ הוסף לגלריה'}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-10" style={{ color: 'var(--color-muted)' }}>
            <div className="text-4xl mb-3">🖼️</div>
            <p>הגלריה ריקה — הוסף את התמונות הראשונות</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}
                className="relative group rounded-xl overflow-hidden aspect-square"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                {item.type === 'video'
                  ? <video src={item.url} className="w-full h-full object-cover" muted />
                  : <img src={item.url} alt={item.caption || ''} className="w-full h-full object-cover" onError={e => { e.target.style.display='none' }} />
                }
                {item.caption && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-xs p-2 truncate">{item.caption}</div>
                )}
                <button
                  onClick={() => { if (confirm('למחוק?')) deleteItem(item.id) }}
                  className="absolute top-2 left-2 w-7 h-7 bg-red-500 text-white rounded-full text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >×</button>
              </motion.div>
            ))}
          </div>
        )}
      </motion.section>
    </div>
  )
}

// Mini previews for each layout
function LayoutPreviewMini({ id }) {
  if (id === 'luxury') return (
    <div className="w-full h-full bg-black flex flex-col">
      <div className="h-4 bg-black border-b border-white/10 flex items-center px-2 gap-1">
        <div className="w-8 h-1.5 rounded-full bg-yellow-500/80" />
        <div className="flex-1" />
        <div className="w-6 h-1.5 rounded-full bg-white/20" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-1">
        <div className="w-16 h-2 rounded-full bg-white/30" />
        <div className="w-10 h-1.5 rounded-full bg-yellow-500/50" />
        <div className="w-12 h-4 rounded-lg bg-yellow-600/70 mt-1" />
      </div>
    </div>
  )
  if (id === 'app') return (
    <div className="w-full h-full bg-neutral-900 flex flex-col">
      <div className="h-4 bg-neutral-900 border-b border-white/10 flex items-center px-2 gap-1">
        <div className="w-6 h-1.5 rounded-full bg-yellow-500/80" />
        <div className="flex-1" />
      </div>
      <div className="flex-1 flex flex-col gap-1 p-2">
        <div className="w-full h-3 rounded-lg bg-white/10" />
        <div className="w-full h-3 rounded-lg bg-white/10" />
        <div className="w-3/4 h-3 rounded-lg bg-white/10" />
      </div>
      <div className="h-7 bg-black border-t border-white/10 flex items-center justify-around px-2">
        {['⌂','✂','📅','⎗'].map(icon => (
          <span key={icon} className="text-[8px] opacity-60">{icon}</span>
        ))}
      </div>
    </div>
  )
  return (
    <div className="w-full h-full bg-white flex flex-col">
      <div className="h-4 bg-white border-b border-gray-200 flex items-center px-2">
        <div className="w-8 h-1.5 rounded-full bg-gray-900" />
        <div className="flex-1" />
        <div className="w-10 h-2 rounded-md bg-gray-900" />
      </div>
      <div className="flex-1 flex flex-col gap-1.5 p-2">
        <div className="w-24 h-3 rounded bg-gray-900" />
        <div className="w-16 h-2 rounded bg-gray-400" />
        {[1,2,3].map(i => (
          <div key={i} className="w-full h-2.5 rounded border border-gray-200" />
        ))}
      </div>
    </div>
  )
}
