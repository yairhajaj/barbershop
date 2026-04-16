import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useInvoices({ status, startDate, endDate } = {}) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { fetchInvoices() }, [status, startDate, endDate])

  async function fetchInvoices() {
    setLoading(true)
    let query = supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })

    if (status)    query = query.eq('status', status)
    if (startDate) query = query.gte('created_at', startDate)
    if (endDate)   query = query.lte('created_at', endDate)

    const { data, error } = await query
    if (!error) setInvoices(data ?? [])
    setLoading(false)
  }

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

  async function deleteInvoice(id) {
    const { error } = await supabase.from('invoices').delete().eq('id', id)
    if (error) throw error
    await fetchInvoices()
  }

  async function markSent(id) {
    await updateInvoice(id, { status: 'sent', sent_at: new Date().toISOString() })
  }

  async function markPaid(id) {
    await updateInvoice(id, { status: 'paid', paid_at: new Date().toISOString() })
  }

  return {
    invoices, loading, refetch: fetchInvoices,
    createInvoice, updateInvoice, deleteInvoice,
    markSent, markPaid,
  }
}
