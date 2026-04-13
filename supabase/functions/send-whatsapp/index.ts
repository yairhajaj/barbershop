const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { recipients, message } = await req.json() as {
      recipients: { name: string; phone: string }[]
      message: string
    }

    const sid  = Deno.env.get('TWILIO_ACCOUNT_SID')
    const auth = Deno.env.get('TWILIO_AUTH_TOKEN')
    const from = Deno.env.get('TWILIO_WHATSAPP_FROM') // e.g. 'whatsapp:+14155238886'

    if (!sid || !auth || !from) {
      return new Response(
        JSON.stringify({ error: 'Twilio credentials not configured in Supabase secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    function formatPhone(phone: string): string {
      const digits = phone.replace(/[^0-9]/g, '')
      if (digits.startsWith('0')) return 'whatsapp:+972' + digits.slice(1)
      if (digits.startsWith('972')) return 'whatsapp:+' + digits
      return 'whatsapp:+' + digits
    }

    const results = await Promise.allSettled(
      recipients
        .filter(r => r.phone?.trim())
        .map(async (r) => {
          const personalizedMsg = message.replace(/\{שם\}/g, r.name || 'לקוח')
          const to = formatPhone(r.phone)

          const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: 'Basic ' + btoa(`${sid}:${auth}`),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ From: from, To: to, Body: personalizedMsg }).toString(),
            }
          )

          if (!res.ok) {
            const errText = await res.text()
            throw new Error(`Twilio error for ${to}: ${errText}`)
          }
          return res.json()
        })
    )

    const sent   = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    const errors = results
      .filter(r => r.status === 'rejected')
      .map(r => (r as PromiseRejectedResult).reason?.message)

    return new Response(
      JSON.stringify({ sent, failed, total: recipients.length, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
