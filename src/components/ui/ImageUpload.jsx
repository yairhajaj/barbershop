import { useRef, useState } from 'react'
import { uploadFile } from '../../lib/upload'

/**
 * Reusable image/video upload button.
 * Props:
 *   value      – current URL (shows preview)
 *   onUrl      – called with one URL after single upload
 *   onUrls     – called with array of URLs after multi-upload
 *   folder     – storage sub-folder ('staff', 'gallery', 'hero', …)
 *   label      – button label
 *   multiple   – allow selecting multiple files
 *   accept     – file accept string (default: 'image/*')
 */
export function ImageUpload({
  value,
  onUrl,
  onUrls,
  folder = 'misc',
  label = 'העלאת תמונה',
  multiple = false,
  accept = 'image/*',
  className = '',
}) {
  const ref = useRef()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  async function handleChange(e) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    // Size check
    const oversize = files.find(f => f.size > 50 * 1024 * 1024)
    if (oversize) { setError(`הקובץ "${oversize.name}" גדול מ-50MB`); return }

    setError('')
    setLoading(true)
    setProgress(0)

    try {
      const urls = []
      for (let i = 0; i < files.length; i++) {
        const url = await uploadFile(files[i], folder)
        urls.push(url)
        setProgress(Math.round(((i + 1) / files.length) * 100))
      }

      if (onUrls) onUrls(urls)
      if (onUrl)  onUrl(urls[0])
      setError('')
    } catch (err) {
      setError(err.message || 'שגיאה בהעלאה')
    } finally {
      setLoading(false)
      setProgress(0)
      e.target.value = ''
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Preview — only for single mode */}
      {!multiple && value && (
        <div className="relative w-20 h-20 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
          {accept.includes('video') && !accept.includes('image')
            ? <video src={value} className="w-full h-full object-cover" muted />
            : <img src={value} alt="preview" className="w-full h-full object-cover" />
          }
        </div>
      )}

      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={handleChange}
      />

      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={loading}
        className="btn-outline text-sm px-4 py-2 inline-flex items-center gap-2"
        style={{ width: 'fit-content' }}
      >
        {loading ? (
          <span className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : accept.includes('video') ? '🎬' : '📷'}
        {loading
          ? (multiple && progress > 0 ? `מעלה… ${progress}%` : 'מעלה…')
          : label}
      </button>

      {/* Prominent Storage error */}
      {error && (
        <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }}>
          <p className="font-bold mb-1">⚠️ שגיאת העלאה</p>
          <p className="whitespace-pre-line">{error}</p>
          {(error.includes('Storage') || error.includes('Bucket') || error.includes('bucket')) && (
            <p className="mt-2 font-semibold">
              פתח Supabase → Storage → New bucket → שם: <code className="bg-red-100 px-1 rounded">uploads</code> → Public ✓ → Create
            </p>
          )}
        </div>
      )}
    </div>
  )
}
