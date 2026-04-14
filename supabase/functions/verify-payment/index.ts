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
    const { payment_id, action } = await req.json()
    // action: 'verify' (default) | 'refund'

    if (!payment_id) {
      return new Response(
        JSON.stringify({ error: 'חסר payment_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get payment + credentials
    const { data: payment } = await supabase
      .from('payments')
      .select('*, appointments(customer_id, service_id)')
      .eq('id', payment_id)
      .single()

    const { data: settings } = await supabase
      .from('business_settings')
      .select('payplus_api_key, payplus_secret_key')
      .single()

    if (!payment || !settings?.payplus_api_key) {
      return new Response(
        JSON.stringify({ error: 'לא נמצא' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authHeader = JSON.stringify({
      api_key: settings.payplus_api_key,
      secret_key: settings.payplus_secret_key,
    })

    if (action === 'refund') {
      // Refund via PayPlus
      const refundRes = await fetch(
        'https://reapi.payplus.co.il/api/v1.0/PaymentPages/RefundCharge',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({
            payment_page_uid: settings.payplus_api_key,
            transaction_uid: payment.payplus_transaction_id,
            amount: payment.amount,
          }),
        }
      )
      const refundData = await refundRes.json()

      if (refundData.results?.status !== '1') {
        throw new Error(refundData.results?.description || 'שגיאה בביצוע החזר')
      }

      // Update payment + appointment
      await supabase.from('payments').update({ status: 'refunded' }).eq('id', payment_id)
      await supabase
        .from('appointments')
        .update({ payment_status: 'refunded' })
        .eq('id', payment.appointment_id)

      return new Response(
        JSON.stringify({ success: true, status: 'refunded' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Default: verify payment status via PayPlus
    const verifyRes = await fetch(
      `https://reapi.payplus.co.il/api/v1.0/PaymentPages/GetPageRequestDetails/${payment.payplus_page_request_uid}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      }
    )
    const verifyData = await verifyRes.json()
    const isPaid = verifyData.data?.status === 'CHARGED'

    if (isPaid) {
      const transactionId = verifyData.data?.transactions?.[0]?.transaction_uid
      await supabase
        .from('payments')
        .update({ status: 'paid', payplus_transaction_id: transactionId })
        .eq('id', payment_id)
      await supabase
        .from('appointments')
        .update({ payment_status: 'paid' })
        .eq('id', payment.appointment_id)
    }

    return new Response(
      JSON.stringify({ success: true, paid: isPaid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('verify-payment error:', err)
    return new Response(
      JSON.stringify({ error: err.message ?? 'שגיאה באימות תשלום' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
