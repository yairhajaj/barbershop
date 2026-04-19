/**
 * quarterly-backup — BOOKX edge function.
 *
 * Records the timestamp of a quarterly backup in business_settings.
 * The actual backup file is downloaded locally by the user via the browser UI.
 *
 * Invoke from the browser after the user downloads the ZIP:
 *   supabase.functions.invoke('quarterly-backup')
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
    const month   = now.getMonth() + 1
    const year    = now.getFullYear()
    const quarter = Math.ceil(month / 3)

    const { data: settings, error } = await supabase
      .from('business_settings').select('id').single()

    if (error) throw new Error(error.message)

    await supabase.from('business_settings')
      .update({ last_quarterly_backup_at: now.toISOString() })
      .eq('id', settings.id)

    return new Response(
      JSON.stringify({ success: true, quarter: `${year}-Q${quarter}`, recorded_at: now.toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
