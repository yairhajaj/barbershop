import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useStaffCommissions({ staffId, startDate, endDate, status, branchId = null } = {}) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['staff_commissions', { staffId, startDate, endDate, status, branchId }],
    queryFn: async () => {
      let q = supabase
        .from('staff_commissions')
        .select('*, staff(id, name, photo_url)')
        .order('date', { ascending: false })
      if (staffId)   q = q.eq('staff_id', staffId)
      if (status)    q = q.eq('status', status)
      if (startDate) q = q.gte('date', startDate)
      if (endDate)   q = q.lte('date', endDate)
      if (branchId)  q = q.or(`branch_id.eq.${branchId},branch_id.is.null`)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['staff_commissions'] })
    qc.invalidateQueries({ queryKey: ['finance'] })
  }

  const createMut = useMutation({
    mutationFn: async (entry) => {
      const { data, error } = await supabase.from('staff_commissions').insert(entry).select().single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const markPaidMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('staff_commissions')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const markAllPaidMut = useMutation({
    mutationFn: async (staffId) => {
      const { error } = await supabase
        .from('staff_commissions')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('staff_id', staffId)
        .eq('status', 'pending')
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('staff_commissions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    commissions: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
    createCommission: createMut.mutateAsync,
    markPaid: markPaidMut.mutateAsync,
    markAllPaid: markAllPaidMut.mutateAsync,
    deleteCommission: deleteMut.mutateAsync,
  }
}
