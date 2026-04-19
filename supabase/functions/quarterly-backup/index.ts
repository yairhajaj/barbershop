/**
 * quarterly-backup — BOOKX edge function.
 *
 * Stores a quarterly snapshot of all financial data to Supabase Storage.
 * Required by Israeli tax law (הוראת מקצוע 24/2004 §8):
 *   - Backup in week 1 of: January, April, July, October
 *   - Stored separately from the primary data
 *   - Retained for 7 years
 *
 * Invoke via Supabase Dashboard → Edge Functions, or curl:
 *   curl -X POST https://<project>.supabase.co/functions/v1/quarterly-backup \
 *     -H "Authorization: Bearer <service_role_key>"
 *
 * Storage bucket: bookx-backups (create in Supabase Dashboard → Storage)
 * Files saved: backups/<vatId>/<YYYY-Qn>.json
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const now     = new Date()
    const month   = now.getMonth() + 1  // 1-12
    const year    = now.getFullYear()
    const quarter = Math.ceil(month / 3)
    const qLabel  = `${year}-Q${quarter}`

    // Warn if not in the first week of a quarter-start month (Jan/Apr/Jul/Oct)
    const isQuarterStart = [1, 4, 7, 10].includes(month)
    const dayOfMonth     = now.getDate()
    const isFirstWeek    = dayOfMonth <= 7
    const onSchedule     = isQuarterStart && isFirstWeek

    // Fetch all financial data for the quarter
    const quarterStart = new Date(year, (quarter - 1) * 3, 1).toISOString()
    const quarterEnd   = now.toISOString()

    const [
      { data: invoices,     error: invErr  },
      { data: payments,     error: payErr  },
      { data: invoiceItems, error: itmErr  },
      { data: settings,     error: setErr  },
    ] = await Promise.all([
      supabase.from('invoices').select('*').gte('created_at', quarterStart).lte('created_at', quarterEnd).order('created_at'),
      supabase.from('payments').select('*').gte('created_at', quarterStart).lte('created_at', quarterEnd).order('created_at'),
      supabase.from('invoice_items').select('*').order('created_at'),
      supabase.from('business_settings').select('*').single(),
    ])

    if (invErr) throw new Error(`invoices: ${invErr.message}`)
    if (payErr) throw new Error(`payments: ${payErr.message}`)
    if (setErr) throw new Error(`settings: ${setErr.message}`)

    const vatId = String(settings?.business_tax_id || 'unknown').replace(/\D/g, '')

    const backup = {
      schema_version:  '1.0',
      software:        'BOOKX',
      quarter:         qLabel,
      created_at:      now.toISOString(),
      on_schedule:     onSchedule,
      business: {
        tax_id:        vatId,
        name:          settings?.business_name,
        address:       settings?.business_address_street,
        city:          settings?.business_address_city,
        business_type: settings?.business_type,
      },
      period: {
        from: quarterStart,
        to:   quarterEnd,
      },
      counts: {
        invoices:     invoices?.length      ?? 0,
        invoice_items: invoiceItems?.length ?? 0,
        payments:     payments?.length      ?? 0,
      },
      data: {
        invoices,
        invoice_items: invoiceItems,
        payments,
      },
    }

    const json     = JSON.stringify(backup, null, 2)
    const filename = `backups/${vatId}/${qLabel}.json`

    const { error: uploadError } = await supabase.storage
      .from('bookx-backups')
      .upload(filename, json, {
        contentType: 'application/json',
        upsert: true,
      })

    if (uploadError) throw new Error(`storage upload: ${uploadError.message}`)

    // Record the backup timestamp
    await supabase.from('business_settings')
      .update({ last_quarterly_backup_at: now.toISOString() })
      .eq('id', settings?.id)

    return new Response(
      JSON.stringify({
        success:    true,
        quarter:    qLabel,
        filename,
        on_schedule: onSchedule,
        counts:     backup.counts,
        note:       onSchedule
          ? 'גיבוי רבעוני בוצע בזמן המתוכנן'
          : `גיבוי בוצע מחוץ לחלון הרבעוני (${qLabel}) — מומלץ לבצע בשבוע הראשון של ינואר/אפריל/יולי/אוקטובר`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
