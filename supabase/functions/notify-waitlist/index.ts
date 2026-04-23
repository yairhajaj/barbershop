import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ISRAEL_OFFSET_HOURS = 2 // UTC+2 (simplified, good enough for matching)

function toIsraelTime(isoString: string): string {
  const d = new Date(isoString)
  const h = (d.getUTCHours() + ISRAEL_OFFSET_HOURS) % 24
  const m = d.getUTCMinutes()
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function toIsraelDate(isoString: string): string {
  const d = new Date(isoString)
  const shifted = new Date(d.getTime() + ISRAEL_OFFSET_HOURS * 60 * 60 * 1000)
  return shifted.toISOString().split('T')[0] // "YYYY-MM-DD"
}

function formatDisplayDate(isoString: string): string {
  const d = new Date(isoString)
  const shifted = new Date(d.getTime() + ISRAEL_OFFSET_HOURS * 60 * 60 * 1000)
  const day   = String(shifted.getUTCDate()).padStart(2, '0')
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const year  = shifted.getUTCFullYear()
  return `${day}.${month}.${year}`
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '')
  if (digits.startsWith('0'))   return 'whatsapp:+972' + digits.slice(1)
  if (digits.startsWith('972')) return 'whatsapp:+' + digits
  return 'whatsapp:+' + digits
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase    = createClient(supabaseUrl, serviceKey)

    // ── MODE: respond (accept / decline from confirm page) ──────────────────
    if (body.mode === 'respond') {
      const { token, action } = body as { token: string; action: 'accept' | 'decline' }

      // Fetch the waitlist entry
      const { data: entry, error: fetchErr } = await supabase
        .from('waitlist')
        .select('*, services(name), staff:offered_staff_id(name)')
        .eq('token', token)
        .single()

      if (fetchErr || !entry) {
        return json({ error: 'קישור לא תקין' }, 404)
      }
      if (entry.status !== 'notified') {
        return json({ error: 'ההצעה כבר טופלה', status: entry.status }, 410)
      }
      if (new Date(entry.token_expires_at) < new Date()) {
        await supabase.from('waitlist').update({ status: 'expired', token: null }).eq('id', entry.id)
        return json({ error: 'ההצעה פגה', status: 'expired' }, 410)
      }

      if (action === 'accept') {
        // Check if slot is already taken (another person from the list got there first)
        const { data: conflict } = await supabase
          .from('appointments')
          .select('id')
          .eq('start_at', entry.offered_slot_start)
          .eq('staff_id', entry.offered_staff_id ?? null)
          .neq('status', 'cancelled')
          .limit(1)

        if (conflict && conflict.length > 0) {
          // Reset entry back to pending — they stay on the waitlist for future slots
          await supabase.from('waitlist').update({
            status:             'pending',
            token:              null,
            offered_slot_start: null,
            offered_slot_end:   null,
            offered_staff_id:   null,
            token_expires_at:   null,
            notified_at:        null,
          }).eq('id', entry.id)
          return json({ ok: false, action: 'slot_taken' })
        }

        // Create the appointment
        const { error: apptErr } = await supabase.from('appointments').insert({
          customer_id:       entry.customer_id,
          service_id:        entry.service_id,
          staff_id:          entry.offered_staff_id ?? null,
          branch_id:         entry.branch_id ?? null,
          start_at:          entry.offered_slot_start,
          end_at:            entry.offered_slot_end,
          status:            'confirmed',
          reminder_opted_in: true,
          notes:             entry.notes ?? '',
        })
        if (apptErr) {
          return json({ error: 'שגיאה ביצירת התור: ' + apptErr.message }, 500)
        }
        // Mark as booked
        await supabase.from('waitlist').update({ status: 'booked', token: null }).eq('id', entry.id)
        return json({
          ok:            true,
          action:        'booked',
          serviceName:   entry.services?.name ?? '',
          slotStart:     entry.offered_slot_start,
        })
      }

      if (action === 'decline') {
        await supabase.from('waitlist').update({ status: 'declined', token: null }).eq('id', entry.id)
        // Try to notify the next person in queue (same slot)
        if (entry.offered_slot_start && entry.service_id) {
          await notifyNextInQueue(supabase, {
            serviceId:  entry.service_id,
            branchId:   entry.branch_id,
            staffId:    entry.offered_staff_id,
            slotStart:  entry.offered_slot_start,
            slotEnd:    entry.offered_slot_end,
            serviceName: entry.services?.name ?? '',
          })
        }
        return json({ ok: true, action: 'declined' })
      }

      return json({ error: 'פעולה לא מוכרת' }, 400)
    }

    // ── MODE: notify (called when appointment is cancelled) ─────────────────
    const { serviceId, branchId, staffId, staffName, slotStart, slotEnd, serviceName: svcNameParam, notificationChannel = 'push' } = body

    // Fetch service name if not provided
    let serviceName = svcNameParam ?? ''
    if (!serviceName && serviceId) {
      const { data: svc } = await supabase.from('services').select('name').eq('id', serviceId).single()
      serviceName = svc?.name ?? ''
    }

    const notified = await notifyNextInQueue(supabase, {
      serviceId, branchId, staffId, slotStart, slotEnd, serviceName, notificationChannel,
    })

    return json({ ok: true, notified })

  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

// ── Core: find + notify first matching waitlist entry ─────────────────────────
async function notifyNextInQueue(
  supabase: ReturnType<typeof createClient>,
  params: {
    serviceId:           string | null
    branchId:            string | null
    staffId:             string | null
    slotStart:           string
    slotEnd:             string
    serviceName:         string
    notificationChannel: string
  }
): Promise<boolean> {
  const { serviceId, branchId, slotStart, slotEnd, serviceName, notificationChannel } = params

  const slotDate      = toIsraelDate(slotStart)   // "YYYY-MM-DD"
  const slotLocalTime = toIsraelTime(slotStart)    // "HH:MM"

  // Build query — find first pending entry that matches date + service + branch + time window
  let query = supabase
    .from('waitlist')
    .select('*, profiles(name, phone, push_token)')
    .eq('preferred_date', slotDate)
    .eq('status', 'pending')
    .lte('time_from', slotLocalTime)
    .gte('time_to',   slotLocalTime)
    .order('created_at', { ascending: true })
    .limit(1)

  if (serviceId) {
    query = query.or(`service_id.eq.${serviceId},service_id.is.null`)
  }
  if (branchId) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
  }

  const { data: entries } = await query
  const entry = entries?.[0]
  if (!entry) return false

  const profile = entry.profiles

  // Token valid until the slot starts — first to confirm gets it
  const token   = crypto.randomUUID()
  const expires = slotStart

  // Update waitlist entry with slot details + token
  await supabase.from('waitlist').update({
    status:             'notified',
    offered_slot_start: slotStart,
    offered_slot_end:   slotEnd,
    offered_staff_id:   params.staffId ?? null,
    token,
    token_expires_at:   expires,
    notified_at:        new Date().toISOString(),
  }).eq('id', entry.id)

  // Build notification message
  const appUrl     = Deno.env.get('APP_URL') ?? 'https://localhost:5173'
  const acceptUrl  = `${appUrl}/waitlist/confirm?token=${token}&action=accept`
  const declineUrl = `${appUrl}/waitlist/confirm?token=${token}&action=decline`
  const dateStr    = formatDisplayDate(slotStart)
  const timeStr    = toIsraelTime(slotStart)
  const name       = profile?.name ?? 'לקוח'

  const message =
    `שלום ${name}! 🗓\n` +
    `התפנה תור ב-${dateStr} בשעה ${timeStr}` +
    (serviceName ? ` לשירות ${serviceName}` : '') + `.\n\n` +
    `✅ כן, הזמן עבורי:\n${acceptUrl}\n\n` +
    `❌ לא, תודה:\n${declineUrl}\n\n` +
    `הראשון שמאשר מקבל את התור — המקום פנוי עד שעת התור.`

  // Send WhatsApp via Twilio (only when channel = 'whatsapp')
  if (notificationChannel === 'whatsapp') {
    const twilioSid  = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN')
    const twilioFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')

    if (twilioSid && twilioAuth && twilioFrom && profile?.phone) {
      try {
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              From: twilioFrom,
              To:   formatPhone(profile.phone),
              Body: message,
            }).toString(),
          }
        )
      } catch (_) {
        // Non-fatal
      }
    }
  }

  // Send Push notification (only when channel = 'push')
  if (notificationChannel === 'push') {
    const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@barbershop.com'

    if (vapidPublic && vapidPrivate && profile?.push_token) {
      try {
        webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
        await webpush.sendNotification(
          JSON.parse(profile.push_token),
          JSON.stringify({
            title: '🗓 התפנה תור!',
            body:  `${serviceName} ב-${dateStr} ${timeStr}`,
            url:   `${appUrl}/waitlist/confirm?token=${token}`,
          })
        )
      } catch (_) {
        // Non-fatal
      }
    }
  }

  return true
}

// ── Util ──────────────────────────────────────────────────────────────────────
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...{ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }, 'Content-Type': 'application/json' },
  })
}
