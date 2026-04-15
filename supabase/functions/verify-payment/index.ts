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
    const { payment_id, transaction_code, action } = await req.json()
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

    // Get payment record + business credentials
    const { data: payment } = await supabase
      .from('payments')
      .select('*, appointments(customer_id, service_id)')
      .eq('id', payment_id)
      .single()

    const { data: settings } = await supabase
      .from('business_settings')
      .select('grow_api_key')
      .single()

    if (!payment || !settings?.grow_api_key) {
      return new Response(
        JSON.stringify({ error: 'לא נמצא' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = settings.grow_api_key

    // ── Refund ─────────────────────────────────────────────────────────────
    if (action === 'refund') {
      const txCode = payment.grow_transaction_code
      if (!txCode) {
        return new Response(
          JSON.stringify({ error: 'אין מזהה עסקה להחזר' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const refundRes = await fetch(`${GROW_API}/refundTransaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, transactionCode: txCode, sum: payment.amount }),
      })
      const refundData = await refundRes.json()

      if (refundData.err !== 0) {
        throw new Error(refundData.errMsg || 'שגיאה בביצוע החזר')
      }

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

    // ── Verify ─────────────────────────────────────────────────────────────
    // transaction_code comes from Grow redirect URL (?transactionCode=XXX)
    const txCode = transaction_code || payment.grow_transaction_code
    if (!txCode) {
      return new Response(
        JSON.stringify({ paid: false, error: 'חסר מזהה עסקה' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const verifyRes = await fetch(
      `${GROW_API}/getTransactionInfo?apiKey=${encodeURIComponent(apiKey)}&transactionCode=${encodeURIComponent(txCode)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    )
    const verifyData = await verifyRes.json()

    // transactionStatusCode === 0 means success in Grow/Meshulam
    const isPaid = verifyData.err === 0 && verifyData.data?.transactionStatusCode === 0

    if (isPaid) {
      await supabase
        .from('payments')
        .update({ status: 'paid', grow_transaction_code: txCode })
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
