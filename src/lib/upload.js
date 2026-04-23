import imageCompression from 'browser-image-compression'
import { supabase } from './supabase'

async function compressIfImage(file) {
  if (!file.type.startsWith('image/')) return file
  return imageCompression(file, {
    maxSizeMB: 0.4,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
  })
}

export async function uploadFile(file, folder = 'misc') {
  if (file.type.startsWith('video/') && file.size > 50 * 1024 * 1024) {
    throw new Error('הסרטון גדול מ-50MB — דחוס אותו לפני ההעלאה (למשל עם HandBrake)')
  }

  const compressed = await compressIfImage(file)

  const form = new FormData()
  form.append('file', compressed, file.name)
  form.append('folder', folder)

  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-to-r2`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: form,
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'שגיאה בהעלאת הקובץ')
  }

  const { url } = await res.json()
  return url
}
