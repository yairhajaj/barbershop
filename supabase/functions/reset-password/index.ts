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
    const { phone, code, newPassword } = await req.json()
    if (!phone || !code || !newPassword) {
      return new Response(JSON.stringify({ error: 'missing params' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify OTP
    const selectRes = await fetch(
      `${supabaseUrl}/rest/v1/otp_codes?phone=eq.${encodeURIComponent(phone)}&purpose=eq.forgot_password&used=eq.false&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc&limit=1`,
      { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
    )
    const rows = await selectRes.json()
    if (!Array.isArray(rows) || rows.length === 0 || rows[0].code !== code) {
      return new Response(JSON.stringify({ error: 'קוד שגוי או פג תוקף' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Mark used
    await fetch(`${supabaseUrl}/rest/v1/otp_codes?id=eq.${rows[0].id}`, {
      method: 'PATCH',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ used: true }),
    })

    // Find user by email
    const admin = createClient(supabaseUrl, serviceKey)
    const email = phoneToEmail(phone)

    const { data: { users }, error: listErr } = await admin.auth.admin.listUsers()
    if (listErr) throw listErr

    const targetUser = users.find(u => u.email === email)
    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'משתמש לא נמצא' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Update password
    const { error: updateErr } = await admin.auth.admin.updateUserById(targetUser.id, { password: newPassword })
    if (updateErr) throw updateErr

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
