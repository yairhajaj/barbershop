import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useCustomerDebts({ customerId } = {}) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['customer_debts', { customerId }],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_debts')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })

  // Realtime → invalidate just this customer's debts
  useEffect(() => {
    if (!customerId) return
    const channelName = `debts-realtime-${customerId}-${Date.now()}`
    let channel = null
    try {
      channel = supabase
        .channel(channelName)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'customer_debts', filter: `customer_id=eq.${customerId}` },
          () => qc.invalidateQueries({ queryKey: ['customer_debts', { customerId }] }))
        .subscribe()
    } catch (err) {
      console.warn('[useCustomerDebts] realtime setup failed:', err)
    }
    return () => { if (channel) { try { supabase.removeChannel(channel) } catch {} } }
  }, [customerId, qc])

  // Get total pending debt for a customer (no customerId filter — for batch use)
  async function fetchDebtSummary(customerIds) {
    const { data } = await supabase
      .from('customer_debts')
      .select('customer_id, amount')
      .eq('status', 'pending')
      .in('customer_id', customerIds)
    return data ?? []
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ['customer_debts'] })

  const createMut = useMutation({
    mutationFn: async (entry) => {
      const { data, error } = await supabase.from('customer_debts').insert(entry).select().single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const markPaidMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('customer_debts')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('customer_debts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const debts = query.data ?? []
  const totalPending = debts.filter(d => d.status === 'pending').reduce((s, d) => s + Number(d.amount), 0)

  return {
    debts,
    loading: query.isLoading,
    totalPending,
    fetchDebts: query.refetch,
    fetchDebtSummary,
    createDebt: createMut.mutateAsync,
    markPaid: markPaidMut.mutateAsync,
    deleteDebt: deleteMut.mutateAsync,
  }
}
