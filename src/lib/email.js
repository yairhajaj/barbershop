import { supabase } from './supabase'

/**
 * Convert a Blob to a base64 string (no data: prefix).
 */
export async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Fetch a URL and return a base64 string + MIME type.
 */
export async function urlToBase64(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const blob = await res.blob()
  return {
    base64: await blobToBase64(blob),
    contentType: blob.type || 'application/octet-stream',
  }
}

/**
 * Send an email via the `send-email` Supabase Edge Function (Resend).
 *
 * @param {Object} params
 * @param {string|string[]} params.to
 * @param {string} params.subject
 * @param {string} [params.html]
 * @param {string} [params.text]
 * @param {Array<{filename: string, content: string, contentType?: string}>} [params.attachments]
 *        - content must be base64-encoded.
 * @param {string} [params.replyTo]
 */
export async function sendEmail({ to, subject, html, text, attachments, replyTo }) {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { to, subject, html, text, attachments, replyTo },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}
