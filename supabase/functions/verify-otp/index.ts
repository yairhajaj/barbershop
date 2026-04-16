const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phone, code, purpose = 'register' } = await req.json()
    if (!phone || !code) return new Response(JSON.stringify({ valid: false, error: 'missing params' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Find latest unused, non-expired code for this phone+purpose
    const selectRes = await fetch(
      `${supabaseUrl}/rest/v1/otp_codes?phone=eq.${encodeURIComponent(phone)}&purpose=eq.${purpose}&used=eq.false&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc&limit=1`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }
    )

    const rows = await selectRes.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ valid: false, error: 'קוד לא נמצא או פג תוקף' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const row = rows[0]
    if (row.code !== code) {
      return new Response(JSON.stringify({ valid: false, error: 'קוד שגוי' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Mark as used
    await fetch(`${supabaseUrl}/rest/v1/otp_codes?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ used: true }),
    })

    return new Response(JSON.stringify({ valid: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ valid: false, error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
