import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useCustomers({ search = '' } = {}) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['customers', { search }],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('*')
        .eq('role', 'customer')
        .order('created_at', { ascending: false })

      if (search.trim()) {
        q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
      }

      const { data: profiles, error } = await q
      if (error) throw new Error(error.message)

      const { data: appts } = await supabase
        .from('appointments')
        .select('customer_id, status, start_at, services(price)')

      const statsMap = {}
      ;(appts ?? []).forEach(a => {
        const cid = a.customer_id
        if (!cid) return
        if (!statsMap[cid]) statsMap[cid] = { total: 0, noShow: 0, spent: 0, lastDate: null }
        const s = statsMap[cid]
        s.total++
        if (a.status === 'no_show') s.noShow++
        if (a.services?.price) s.spent += Number(a.services.price)
        if (!s.lastDate || a.start_at > s.lastDate) s.lastDate = a.start_at
      })

      return (profiles ?? []).map(p => ({
        ...p,
        ...(statsMap[p.id] ?? { total: 0, noShow: 0, spent: 0, lastDate: null }),
      }))
    },
  })

  const toggleBlockMut = useMutation({
    mutationFn: async ({ id, block }) => {
      const { error } = await supabase.from('profiles').update({ is_blocked: block }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('profiles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
    },
  })

  async function fetchHistory(customerId) {
    const { data } = await supabase
      .from('appointments')
      .select('*, services(name, price), staff(name)')
      .eq('customer_id', customerId)
      .order('start_at', { ascending: false })
    return data ?? []
  }

  return {
    customers: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
    toggleBlock: (id, block) => toggleBlockMut.mutateAsync({ id, block }),
    deleteCustomer: deleteMut.mutateAsync,
    fetchHistory,
  }
}
