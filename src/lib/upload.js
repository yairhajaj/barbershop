import { supabase } from './supabase'

const BUCKET = 'uploads'

async function ensureBucket() {
  await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 50 * 1024 * 1024,   // 50 MB
    allowedMimeTypes: [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
      'video/mp4', 'video/webm', 'video/quicktime',
    ],
  }).catch(() => { /* bucket probably already exists */ })
}

/**
 * Upload a single file to Supabase Storage.
 * @param {File}   file   — File object from <input type="file">
 * @param {string} folder — Sub-folder: 'staff' | 'gallery' | 'hero' | 'logo' | 'products'
 * @returns {Promise<string>} Public URL
 */
export async function uploadFile(file, folder = 'misc') {
  await ensureBucket()

  const ext  = file.name.split('.').pop().toLowerCase()
  const name = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(name, file, { upsert: false, cacheControl: '3600' })

  if (error) {
    const msg = error.message ?? ''
    if (
      msg.includes('Bucket not found') ||
      msg.includes('bucket') ||
      (error.statusCode ?? error.status) === 404 ||
      (error.statusCode ?? error.status) === '404'
    ) {
      throw new Error(
        'Storage לא מוגדר.\n' +
        'עבור ל-Supabase → Storage → New bucket\n' +
        'שם: uploads | Public bucket: ✓ | לחץ Create'
      )
    }
    throw new Error(msg || 'שגיאה בהעלאת הקובץ')
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(name)
  return data.publicUrl
}
