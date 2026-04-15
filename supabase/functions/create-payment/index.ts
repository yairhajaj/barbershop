import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROW_API = 'https://secure.meshulam.co.il/api/light/server/1.0'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { appointment_id, amount, success_url, failure_url } = await req.json()

    if (!appointment_id || !amount || !success_url || !failure_url) {
      return new Response(
        JSON.stringify({ error: 'חסרים פרמטרים נדרשים' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get business Grow credentials
    const { data: settings } = await supabase
      .from('business_settings')
      .select('grow_api_key, grow_user_id, grow_page_code, payment_enabled')
      .single()

    if (!settings?.payment_enabled) {
      return new Response(
        JSON.stringify({ error: 'תשלום לא מופעל' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!settings.grow_api_key || !settings.grow_user_id || !settings.grow_page_code) {
      return new Response(
        JSON.stringify({ error: 'פרטי Grow לא מוגדרים' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create pending payment record in DB
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        appointment_id,
        amount,
        currency: 'ILS',
        status: 'pending',
      })
      .select()
      .single()

    if (paymentError) throw paymentError

    // Call Grow (Meshulam) createPaymentProcess API
    const growPayload = {
      apiKey:      settings.grow_api_key,
      userId:      settings.grow_user_id,
      pageCode:    settings.grow_page_code,
      sum:         amount,
      description: 'תשלום תור',
      successUrl:  `${success_url}&payment_id=${payment.id}`,
      cancelUrl:   `${failure_url}&payment_id=${payment.id}`,
      notifyUrl:   '',   // אופציונלי — להגדיר אם רוצים webhook
      cField1:     payment.id,  // מזהה פנימי שחוזר ב-redirect
    }

    const growResponse = await fetch(
      `${GROW_API}/createPaymentProcess`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(growPayload),
      }
    )

    const growData = await growResponse.json()

    if (!growResponse.ok || growData.err !== 0) {
      throw new Error(growData.errMsg || 'שגיאה ביצירת דף תשלום Grow')
    }

    const paymentUrl = growData.data?.url

    if (!paymentUrl) {
      throw new Error('לא התקבל URL לתשלום מ-Grow')
    }

    return new Response(
      JSON.stringify({ payment_url: paymentUrl, payment_id: payment.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('create-payment error:', err)
    return new Response(
      JSON.stringify({ error: err.message ?? 'שגיאה ביצירת תשלום' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
