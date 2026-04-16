import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useCustomerDebts({ customerId } = {}) {
  const [debts, setDebts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (customerId) fetchDebts() }, [customerId])

  async function fetchDebts() {
    setLoading(true)
    const { data, error } = await supabase
      .from('customer_debts')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
    if (!error) setDebts(data ?? [])
    setLoading(false)
  }

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
