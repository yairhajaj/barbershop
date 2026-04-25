import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase    = createClient(supabaseUrl, serviceKey)

  // Setup VAPID
  const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@barbershop.com'
  const appUrl       = Deno.env.get('APP_URL') ?? 'https://localhost:5173'

  if (!vapidPublic || !vapidPrivate) {
    return new Response(JSON.stringify({ skipped: 'VAPID keys not configured' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  // Find profiles with birthday today (match month-day using LIKE '____-MM-DD')
  const today    = new Date()
  const monthStr = String(today.getMonth() + 1).padStart(2, '0')
  const dayStr   = String(today.getDate()).padStart(2, '0')

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, push_token')
    .not('push_token', 'is', null)
    .not('birth_date', 'is', null)
    .like('birth_date', `%${monthStr}-${dayStr}`)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sent: string[] = []
  const errors: string[] = []

  for (const profile of profiles ?? []) {
    if (!profile.push_token) continue
    try {
      await webpush.sendNotification(
        JSON.parse(profile.push_token),
        JSON.stringify({
          title: '🎂 יום הולדת שמח!',
          body:  'המספרה מאחלת לך יום הולדת שמח! 🎉 תפנק את עצמך — קבע תור מיוחד',
          url:   appUrl,
        })
      )
      sent.push(profile.id)
    } catch (err: any) {
      errors.push(`Push to ${profile.name ?? profile.id}: ${err.message}`)
    }
  }

  return new Response(
    JSON.stringify({ sent: sent.length, errors }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
