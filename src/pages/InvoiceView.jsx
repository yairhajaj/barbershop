import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateInvoiceHTML } from '../lib/invoice'
import { BUSINESS } from '../config/business'

export function InvoiceView() {
  const { id } = useParams()
  const [html, setHtml] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: inv, error: e } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (e || !inv) { setError('חשבונית לא נמצאה'); return }

      // Build appointment object from invoice's own stored columns
      const apptObj = {
        id: inv.appointment_id || id,
        start_at: inv.service_date,
        profiles: { name: inv.customer_name, phone: inv.customer_phone },
        services: { name: inv.service_name, price: inv.total_amount },
        staff: { name: inv.staff_name },
      }

      setHtml(generateInvoiceHTML({
        appointment: apptObj,
        business: BUSINESS,
        invoiceNumber: inv.invoice_number,
        vatRate: inv.vat_rate ?? 18,
        businessType: inv.business_type || 'osek_morsheh',
        paymentMethod: inv.notes,
        invoiceDate: inv.created_at,
      }))
    }
    load()
  }, [id])

  if (error) return (
    <div dir="rtl" style={{ textAlign: 'center', padding: '60px', fontFamily: 'Arial', color: '#666' }}>
      <div style={{ fontSize: 48 }}>🧾</div>
      <p style={{ marginTop: 16 }}>{error}</p>
    </div>
  )

  if (!html) return (
    <div dir="rtl" style={{ textAlign: 'center', padding: '60px', fontFamily: 'Arial', color: '#999' }}>
      <div style={{ fontSize: 48 }}>⏳</div>
      <p style={{ marginTop: 16 }}>טוען חשבונית...</p>
    </div>
  )

  return (
    <iframe
      srcDoc={html}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="חשבונית"
    />
  )
}
