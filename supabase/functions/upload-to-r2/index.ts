import { AwsClient } from 'npm:aws4fetch'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const accountId  = Deno.env.get('R2_ACCOUNT_ID')!
    const accessKey  = Deno.env.get('R2_ACCESS_KEY_ID')!
    const secretKey  = Deno.env.get('R2_SECRET_ACCESS_KEY')!
    const bucket     = Deno.env.get('R2_BUCKET_NAME')!
    const publicUrl  = Deno.env.get('R2_PUBLIC_URL')!

    const form   = await req.formData()
    const file   = form.get('file') as File
    const folder = (form.get('folder') as string) || 'misc'

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const key      = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`

    const r2 = new AwsClient({
      accessKeyId:     accessKey,
      secretAccessKey: secretKey,
      service:         's3',
      region:          'auto',
    })

    const body = await file.arrayBuffer()

    const r2Res = await r2.fetch(`${endpoint}/${bucket}/${key}`, {
      method:  'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body,
    })

    if (!r2Res.ok) {
      const text = await r2Res.text()
      return new Response(JSON.stringify({ error: text }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = `${publicUrl.replace(/\/$/, '')}/${key}`
    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
