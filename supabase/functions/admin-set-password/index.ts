import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function phoneToEmail(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, '')
  return `${clean}@barbershop.users`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin       = createClient(supabaseUrl, serviceKey)

    // Verify caller is admin via their JWT
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: { user: caller }, error: callerErr } = await admin.auth.getUser(token)
    if (callerErr || !caller) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', caller.id).single()
    if (callerProfile?.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { targetPhone, newPassword } = await req.json()
    if (!targetPhone || !newPassword) return new Response(JSON.stringify({ error: 'missing params' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (newPassword.length < 6) return new Response(JSON.stringify({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const email = phoneToEmail(targetPhone)

    // Find target user in auth
    const { data: { users }, error: listErr } = await admin.auth.admin.listUsers()
    if (listErr) throw listErr

    const targetUser = users.find(u => u.email === email)
    if (!targetUser) return new Response(JSON.stringify({ error: 'משתמש לא נמצא' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Update auth password
    const { error: updateErr } = await admin.auth.admin.updateUserById(targetUser.id, { password: newPassword })
    if (updateErr) throw updateErr

    // Update password_plain in profiles
    await admin.from('profiles').update({ password_plain: newPassword }).eq('id', targetUser.id)

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
