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

  // ── Load reminder settings ──────────────────────────────────────────
  const { data: settingsRow } = await supabase
    .from('business_settings')
    .select('reminder_enabled, reminder_channel, reminder_1_hours, reminder_2_enabled, reminder_2_hours, reminder_3_enabled, reminder_3_hours')
    .single()

  if (!settingsRow?.reminder_enabled) {
    return new Response(JSON.stringify({ skipped: 'reminders disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const channel = settingsRow.reminder_channel ?? 'whatsapp' // 'push' | 'whatsapp' | 'both'

  // ── Build list of active reminder configs ───────────────────────────
  const reminderConfigs = [
    { num: 1, hours: settingsRow.reminder_1_hours ?? 24, enabled: true },
    { num: 2, hours: settingsRow.reminder_2_hours ?? 2,  enabled: !!settingsRow.reminder_2_enabled },
    { num: 3, hours: settingsRow.reminder_3_hours ?? 1,  enabled: !!settingsRow.reminder_3_enabled },
  ].filter(r => r.enabled && r.hours > 0)

  const now = new Date()
  const WINDOW_MINUTES = 30 // ±30 min window around target time
  const totalSent: number[] = []
  const totalErrors: string[] = []

  // ── Setup push if needed ────────────────────────────────────────────
  if (channel === 'push' || channel === 'both') {
    const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject    = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@barbershop.com'
    if (vapidPublicKey && vapidPrivateKey) {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    }
  }

  // ── Twilio helpers ──────────────────────────────────────────────────
  const twilioSid  = Deno.env.get('TWILIO_ACCOUNT_SID')
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN')
  const twilioFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')

  function formatPhone(phone: string): string {
    const digits = phone.replace(/[^0-9]/g, '')
    if (digits.startsWith('0')) return 'whatsapp:+972' + digits.slice(1)
    if (digits.startsWith('972')) return 'whatsapp:+' + digits
    return 'whatsapp:+' + digits
  }

  function relativeTime(apptDate: Date): string {
    const diffMs = apptDate.getTime() - now.getTime()
    const diffH  = Math.round(diffMs / 3600000)
    if (diffH <= 2)  return 'בעוד מעט'
    if (diffH <= 5)  return 'היום'
    if (diffH <= 26) return 'מחר'
    return `בתאריך ${apptDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}`
  }

  function timeStr(apptDate: Date): string {
    return apptDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  }

  // ── Process each reminder config ────────────────────────────────────
  for (const cfg of reminderConfigs) {
    const windowStart = new Date(now.getTime() + (cfg.hours * 60 - WINDOW_MINUTES) * 60000)
    const windowEnd   = new Date(now.getTime() + (cfg.hours * 60 + WINDOW_MINUTES) * 60000)

    // Find appointments that:
    // - start in the target window
    // - are confirmed
    // - customer opted in
    // - haven't received this reminder number yet
    const { data: appointments, error: apptErr } = await supabase
      .from('appointments')
      .select(`
        id, start_at,
        profiles ( id, name, phone, push_token ),
        services ( name ),
        staff ( name )
      `)
      .eq('status', 'confirmed')
      .eq('reminder_opted_in', true)
      .not('customer_id', 'is', null)
      .gte('start_at', windowStart.toISOString())
      .lte('start_at', windowEnd.toISOString())

    if (apptErr) {
      totalErrors.push(`Query error: ${apptErr.message}`)
      continue
    }
    if (!appointments || appointments.length === 0) continue

    // Filter out already-sent reminders
    const apptIds = appointments.map((a: any) => a.id)
    const { data: alreadySent } = await supabase
      .from('reminder_logs')
      .select('appointment_id')
      .in('appointment_id', apptIds)
      .eq('reminder_num', cfg.num)

    const sentSet = new Set((alreadySent ?? []).map((r: any) => r.appointment_id))
    const pending = appointments.filter((a: any) => !sentSet.has(a.id))

    for (const appt of pending) {
      const profile  = (appt as any).profiles
      if (!profile) continue

      const apptDate = new Date(appt.start_at)
      const when     = relativeTime(apptDate)
      const time     = timeStr(apptDate)
      const name     = profile.name ?? 'לקוח'

      let success = false

      try {
        // ── WhatsApp ──
        if ((channel === 'whatsapp' || channel === 'both') && profile.phone?.trim() && twilioSid && twilioAuth && twilioFrom) {
          const to  = formatPhone(profile.phone)
          const msg = `שלום ${name}! 👋\nתזכורת: יש לך תור ${when} בשעה ${time}.\nנתראה! ✂️`

          const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ From: twilioFrom, To: to, Body: msg }).toString(),
            }
          )
          success = res.ok
          if (!res.ok) {
            const errText = await res.text()
            totalErrors.push(`WhatsApp to ${to}: ${errText}`)
          }
        }

        // ── Push ──
        if ((channel === 'push' || channel === 'both') && profile.push_token) {
          try {
            const serviceName = (appt as any).services?.name ?? ''
            const staffName   = (appt as any).staff?.name   ?? ''
            const dateStr     = apptDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
            let titleWhen: string
            if (cfg.hours <= 1)      titleWhen = 'בעוד שעה'
            else if (cfg.hours <= 2) titleWhen = 'בעוד שעתיים'
            else                     titleWhen = 'מחר'
            await webpush.sendNotification(
              JSON.parse(profile.push_token),
              JSON.stringify({
                title: `✂️ תזכורת תור — ${titleWhen} בשעה ${time}`,
                body:  `${serviceName}${staffName ? ` אצל ${staffName}` : ''} ב-${dateStr} בשעה ${time}`,
              })
            )
            success = true
          } catch (pushErr: any) {
            totalErrors.push(`Push to ${name}: ${pushErr.message}`)
          }
        }

        // ── Log ──
        await supabase.from('reminder_logs').upsert({
          appointment_id: appt.id,
          reminder_num: cfg.num,
          channel,
          success,
        }, { onConflict: 'appointment_id,reminder_num', ignoreDuplicates: true })

        if (success) totalSent.push(appt.id)

      } catch (err: any) {
        totalErrors.push(`Error for appt ${appt.id}: ${err.message}`)
      }
    }
  }

  return new Response(
    JSON.stringify({ sent: totalSent.length, errors: totalErrors }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
