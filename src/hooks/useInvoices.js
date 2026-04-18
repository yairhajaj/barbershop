import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useInvoices({ status, startDate, endDate, includeCancelled = false } = {}) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)
  const fetchRef = useRef(null)

  useEffect(() => { fetchInvoices() }, [status, startDate, endDate, includeCancelled])

  async function fetchInvoices() {
    setLoading(true)
    let query = supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })

    if (status)    query = query.eq('status', status)
    if (startDate) query = query.gte('created_at', startDate)
    if (endDate)   query = query.lte('created_at', endDate)
    if (!includeCancelled) query = query.eq('is_cancelled', false)

    const { data, error } = await query
    if (!error) setInvoices(data ?? [])
    setLoading(false)
  }
  fetchRef.current = fetchInvoices

  // Realtime subscription
  useEffect(() => {
    const channelName = `invoices-realtime-${Date.now()}`
    let channel = null
    try {
      channel = supabase
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' },
          () => { fetchRef.current?.() })
        .subscribe()
    } catch (err) {
      console.warn('[useInvoices] realtime setup failed:', err)
    }
    return () => { if (channel) { try { supabase.removeChannel(channel) } catch {} } }
  }, [])

  /** Generate next invoice number atomically via Postgres function */
  async function getNextInvoiceNumber() {
    const { data, error } = await supabase.rpc('next_invoice_number')
    if (error) throw error
    return data
  }

  async function createInvoice(invoice) {
    const invoiceNumber = await getNextInvoiceNumber()
    const { data, error } = await supabase
      .from('invoices')
      .insert({ ...invoice, invoice_number: invoiceNumber })
      .select()
      .single()
    if (error) throw error
    await fetchInvoices()
    return data
  }

  async function updateInvoice(id, updates) {
    const { error } = await supabase.from('invoices').update(updates).eq('id', id)
    if (error) throw error
    await fetchInvoices()
  }

  /**
   * Cancel an invoice (soft-delete) — required by Israeli tax law (הוראות ניהול ספרים).
   * Automatically creates a matching credit-note invoice with negative amounts if
   * the original was already sent/paid.
   */
  async function cancelInvoice(id, reason = '') {
    const { data: original, error: fetchErr } = await supabase
      .from('invoices').select('*').eq('id', id).single()
    if (fetchErr) throw fetchErr
    if (original.is_cancelled) throw new Error('החשבונית כבר מבוטלת')

    const nowIso = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from('invoices')
      .update({ is_cancelled: true, cancelled_at: nowIso, cancellation_reason: reason || null })
      .eq('id', id)
    if (updateErr) throw updateErr

    let creditNote = null
    if (original.status !== 'draft') {
      const invoiceNumber = await getNextInvoiceNumber()
      const { data: cn, error: cnErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          appointment_id: original.appointment_id,
          customer_name: original.customer_name,
          customer_phone: original.customer_phone,
          service_name: original.service_name,
          staff_name: original.staff_name,
          service_date: original.service_date,
          amount_before_vat: -Number(original.amount_before_vat || 0),
          vat_rate: original.vat_rate,
          vat_amount: -Number(original.vat_amount || 0),
          total_amount: -Number(original.total_amount || 0),
          status: 'sent',
          sent_at: nowIso,
          notes: original.notes,
          credit_note_for: id,
        })
        .select().single()
      if (cnErr) throw cnErr
      creditNote = cn
    }

    await fetchInvoices()
    return { cancelled: { ...original, is_cancelled: true }, creditNote }
  }

  /** @deprecated Now performs soft-delete (cancellation). */
  async function deleteInvoice(id) {
    return cancelInvoice(id, 'מחיקה')
  }

  async function markSent(id) {
    await updateInvoice(id, { status: 'sent', sent_at: new Date().toISOString() })
  }

  async function markPaid(id) {
    await updateInvoice(id, { status: 'paid', paid_at: new Date().toISOString() })
  }

  return {
    invoices, loading, refetch: fetchInvoices,
    createInvoice, updateInvoice,
    cancelInvoice, deleteInvoice,
    markSent, markPaid,
  }
}
