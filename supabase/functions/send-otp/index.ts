const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phone, purpose = 'register' } = await req.json()
    if (!phone) return new Response(JSON.stringify({ error: 'phone required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000))

    // Store in otp_codes via Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/otp_codes`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ phone, code, purpose }),
    })

    if (!insertRes.ok) {
      const e = await insertRes.text()
      throw new Error('DB insert failed: ' + e)
    }

    // Send via WhatsApp (Twilio)
    const sid  = Deno.env.get('TWILIO_ACCOUNT_SID')
    const auth = Deno.env.get('TWILIO_AUTH_TOKEN')
    const from = Deno.env.get('TWILIO_WHATSAPP_FROM')

    if (!sid || !auth || !from) throw new Error('Twilio not configured')

    function formatPhone(p: string): string {
      const digits = p.replace(/[^0-9]/g, '')
      if (digits.startsWith('0')) return 'whatsapp:+972' + digits.slice(1)
      if (digits.startsWith('972')) return 'whatsapp:+' + digits
      return 'whatsapp:+' + digits
    }

    const purposeText = purpose === 'forgot_password' ? 'איפוס סיסמה' : 'אימות הרשמה'
    const msgBody = `HAJAJ Hair Design\nקוד ${purposeText}: *${code}*\nהקוד תקף ל-10 דקות.`

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${sid}:${auth}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: from, To: formatPhone(phone), Body: msgBody }).toString(),
      }
    )

    if (!twilioRes.ok) {
      const errText = await twilioRes.text()
      throw new Error('WhatsApp send failed: ' + errText)
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
