import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useCustomerDebts({ customerId } = {}) {
  const [debts, setDebts] = useState([])
  const [loading, setLoading] = useState(true)
  const fetchRef = useRef(null)

  useEffect(() => { if (customerId) fetchDebts() }, [customerId])

  async function fetchDebts() {
    if (!customerId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('customer_debts')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
    if (!error) setDebts(data ?? [])
    setLoading(false)
  }
  fetchRef.current = fetchDebts

  // Realtime subscription — refetch whenever any row changes
  useEffect(() => {
    if (!customerId) return
    const channelName = `debts-realtime-${customerId}-${Date.now()}`
    let channel = null
    try {
      channel = supabase
        .channel(channelName)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'customer_debts', filter: `customer_id=eq.${customerId}` },
          () => { fetchRef.current?.() })
        .subscribe()
    } catch (err) {
      console.warn('[useCustomerDebts] realtime setup failed:', err)
    }
    return () => { if (channel) { try { supabase.removeChannel(channel) } catch {} } }
  }, [customerId])

  // Get total pending debt for a customer (no customerId filter — for batch use)
  async function fetchDebtSummary(customerIds) {
    const { data } = await supabase
      .from('customer_debts')
      .select('customer_id, amount')
      .eq('status', 'pending')
      .in('customer_id', customerIds)
    return data ?? []
  }

  async function createDebt(entry) {
    const { data, error } = await supabase.from('customer_debts').insert(entry).select().single()
    if (error) throw error
    await fetchDebts()
    return data
  }

  async function markPaid(id) {
    const { error } = await supabase
      .from('customer_debts')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await fetchDebts()
  }

  async function deleteDebt(id) {
    const { error } = await supabase.from('customer_debts').delete().eq('id', id)
    if (error) throw error
    await fetchDebts()
  }

  const totalPending = debts.filter(d => d.status === 'pending').reduce((s, d) => s + Number(d.amount), 0)

  return { debts, loading, totalPending, fetchDebts, fetchDebtSummary, createDebt, markPaid, deleteDebt }
}
