import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { token, action } = await req.json()
    if (!token || !action) return json({ error: 'missing params' }, 400)
    if (!['accept', 'decline'].includes(action)) return json({ error: 'invalid action' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch offer by token
    const { data: offer, error } = await supabase
      .from('reschedule_offers')
      .select('*, appointments(id, start_at, end_at, customer_id, services(name), staff(name), profiles(name, phone, push_token))')
      .eq('token', token)
      .single()

    if (error || !offer) return json({ error: 'קישור לא תקין' }, 404)

    if (offer.status !== 'pending') {
      return json({ error: 'ההצעה כבר טופלה', status: offer.status }, 410)
    }

    if (new Date(offer.token_expires_at) < new Date()) {
      await supabase.from('reschedule_offers').update({ status: 'expired' }).eq('id', offer.id)
      return json({ error: 'ההצעה פגה' }, 410)
    }

    if (action === 'accept') {
      // Update appointment times
      const { error: updateErr } = await supabase
        .from('appointments')
        .update({
          start_at: offer.offered_start_at,
          end_at: offer.offered_end_at,
        })
        .eq('id', offer.appointment_id)

      if (updateErr) {
        console.error('Failed to update appointment:', updateErr)
        return json({ error: 'שגיאה בעדכון התור' }, 500)
      }

      // Mark offer accepted
      await supabase.from('reschedule_offers').update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
      }).eq('id', offer.id)

      // Send push to admin(s) — fire-and-forget
      try {
        const { data: admins } = await supabase
          .from('profiles')
          .select('push_token')
          .eq('role', 'admin')
          .not('push_token', 'is', null)

        if (admins && admins.length > 0) {
          const tokens = admins.map(a => a.push_token).filter(Boolean)
          if (tokens.length > 0) {
            const customerName = offer.appointments?.profiles?.name || 'לקוח'
            const time = new Date(offer.offered_start_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                title: '✅ Gap Closer — תור הוזז!',
                body: `${customerName} אישר/ה הקדמת תור ל-${time}`,
                tokens,
              }),
            })
          }
        }
      } catch (pushErr) {
        console.error('Push notification error (non-critical):', pushErr)
      }

      return json({
        action: 'accepted',
        newStart: offer.offered_start_at,
        serviceName: offer.appointments?.services?.name,
        staffName: offer.appointments?.staff?.name,
      })
    }

    if (action === 'decline') {
      await supabase.from('reschedule_offers').update({
        status: 'declined',
        responded_at: new Date().toISOString(),
      }).eq('id', offer.id)

      return json({ action: 'declined' })
    }

    return json({ error: 'invalid action' }, 400)
  } catch (err) {
    console.error('handle-reschedule error:', err)
    return json({ error: err.message }, 500)
  }
})
