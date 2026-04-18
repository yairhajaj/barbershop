// send-email edge function — uses Resend API.
// Requires Supabase secret: RESEND_API_KEY
// Optional secrets: RESEND_FROM (defaults to "onboarding@resend.dev")

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Attachment {
  filename: string
  content: string     // base64-encoded
  contentType?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, subject, html, text, attachments = [], replyTo } = await req.json() as {
      to: string | string[]
      subject: string
      html?: string
      text?: string
      attachments?: Attachment[]
      replyTo?: string
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const from   = Deno.env.get('RESEND_FROM') || 'HAJAJ <onboarding@resend.dev>'

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured in Supabase secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!to || !subject || (!html && !text)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, html|text' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: Record<string, unknown> = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
    }
    if (html) body.html = html
    if (text) body.text = text
    if (replyTo) body.reply_to = replyTo
    if (attachments.length > 0) {
      body.attachments = attachments.map(a => ({
        filename: a.filename,
        content: a.content,             // Resend accepts base64 string
        content_type: a.contentType,
      }))
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: data?.message || 'Resend error', details: data }),
        { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
