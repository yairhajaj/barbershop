import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    // Get business PayPlus credentials from Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: settings } = await supabase
      .from('business_settings')
      .select('payplus_api_key, payplus_secret_key, payment_enabled')
      .single()

    if (!settings?.payment_enabled) {
      return new Response(
        JSON.stringify({ error: 'תשלום לא מופעל' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!settings.payplus_api_key || !settings.payplus_secret_key) {
      return new Response(
        JSON.stringify({ error: 'מפתחות PayPlus לא מוגדרים' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create payment record in DB
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

    // Call PayPlus GenerateLink API
    const payplusPayload = {
      payment_page_uid: settings.payplus_api_key,
      charge_method: 1, // Regular charge
      more_info: appointment_id,
      more_info_1: payment.id,
      refURL_success: `${success_url}&payment_id=${payment.id}`,
      refURL_failure: `${failure_url}&payment_id=${payment.id}`,
      refURL_cancel:  `${failure_url}&payment_id=${payment.id}&cancelled=true`,
      items: [
        {
          name: 'תשלום תור',
          quantity: 1,
          price: amount,
          currency_code: 'ILS',
          vat_type: 0,
        },
      ],
    }

    const payplusResponse = await fetch(
      'https://reapi.payplus.co.il/api/v1.0/PaymentPages/generateLink',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: JSON.stringify({
            api_key: settings.payplus_api_key,
            secret_key: settings.payplus_secret_key,
          }),
        },
        body: JSON.stringify(payplusPayload),
      }
    )

    const payplusData = await payplusResponse.json()

    if (!payplusResponse.ok || payplusData.results?.status !== '1') {
      throw new Error(payplusData.results?.description || 'שגיאה ביצירת דף תשלום')
    }

    const pageRequestUid = payplusData.data?.page_request_uid
    const paymentUrl = payplusData.data?.payment_page_link

    // Save page_request_uid to payment record
    await supabase
      .from('payments')
      .update({ payplus_page_request_uid: pageRequestUid })
      .eq('id', payment.id)

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
