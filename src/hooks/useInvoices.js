import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useInvoices({ status, startDate, endDate, includeCancelled = false, branchId = null } = {}) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['invoices', { status, startDate, endDate, includeCancelled, branchId }],
    queryFn: async () => {
      let q = supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
      if (status)               q = q.eq('status', status)
      if (startDate)            q = q.gte('created_at', startDate)
      if (endDate)              q = q.lte('created_at', endDate)
      if (!includeCancelled)    q = q.eq('is_cancelled', false)
      if (branchId)             q = q.or(`branch_id.eq.${branchId},branch_id.is.null`)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })

  // Realtime → invalidate
  useEffect(() => {
    const channelName = `invoices-realtime-${Date.now()}`
    let channel = null
    try {
      channel = supabase
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' },
          () => qc.invalidateQueries({ queryKey: ['invoices'] }))
        .subscribe()
    } catch (err) {
      console.warn('[useInvoices] realtime setup failed:', err)
    }
    return () => { if (channel) { try { supabase.removeChannel(channel) } catch {} } }
  }, [qc])

  async function getNextInvoiceNumber() {
    const { data, error } = await supabase.rpc('next_invoice_number')
    if (error) throw error
    return data
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['invoices'] })
    qc.invalidateQueries({ queryKey: ['finance'] })
  }

  const createMut = useMutation({
    mutationFn: async (invoice) => {
      const invoiceNumber = await getNextInvoiceNumber()
      const { data, error } = await supabase
        .from('invoices')
        .insert({ ...invoice, invoice_number: invoiceNumber })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const updateMut = useMutation({
    mutationFn: async ({ id, updates }) => {
      const { error } = await supabase.from('invoices').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  /**
   * Cancel an invoice (soft-delete) — required by Israeli tax law (הוראות ניהול ספרים).
   * Automatically creates a matching credit-note invoice with negative amounts if
   * the original was already sent/paid.
   */
  const cancelMut = useMutation({
    mutationFn: async ({ id, reason = '' }) => {
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

        // Deduct from income: insert negative manual_income so dashboard totals decrease
        const creditAmount = Math.abs(Number(original.total_amount || 0))
        if (creditAmount > 0) {
          await supabase.from('manual_income').insert({
            description: `זיכוי לחשבונית ${original.invoice_number}`,
            amount: -creditAmount,
            vat_amount: -Math.abs(Number(original.vat_amount || 0)),
            date: nowIso.slice(0, 10),
            payment_method: original.notes || 'credit',
            customer_name: original.customer_name || null,
            appointment_id: original.appointment_id || null,
            notes: `חשבונית זיכוי ${invoiceNumber}`,
          })
        }
      }

      return { cancelled: { ...original, is_cancelled: true }, creditNote }
    },
    onSuccess: invalidate,
  })

  async function markSent(id) {
    return updateMut.mutateAsync({ id, updates: { status: 'sent', sent_at: new Date().toISOString() } })
  }

  async function markPaid(id) {
    return updateMut.mutateAsync({ id, updates: { status: 'paid', paid_at: new Date().toISOString() } })
  }

  return {
    invoices: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
    createInvoice: createMut.mutateAsync,
    updateInvoice: (id, updates) => updateMut.mutateAsync({ id, updates }),
    cancelInvoice: (id, reason) => cancelMut.mutateAsync({ id, reason }),
    /** @deprecated Now performs soft-delete (cancellation). */
    deleteInvoice: (id) => cancelMut.mutateAsync({ id, reason: 'מחיקה' }),
    markSent,
    markPaid,
  }
}
