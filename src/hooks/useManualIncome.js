import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useManualIncome({ startDate, endDate, branchId = null } = {}) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['manual_income', { startDate, endDate, branchId }],
    queryFn: async () => {
      let q = supabase
        .from('manual_income')
        .select('*, staff(id, name), services(id, name)')
        .order('date', { ascending: false })
      if (startDate) q = q.gte('date', startDate)
      if (endDate)   q = q.lte('date', endDate)
      if (branchId)  q = q.or(`branch_id.eq.${branchId},branch_id.is.null`)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['manual_income'] })
    qc.invalidateQueries({ queryKey: ['finance'] })
  }

  const createMut = useMutation({
    mutationFn: async (entry) => {
      const { data, error } = await supabase.from('manual_income').insert(entry).select().single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const updateMut = useMutation({
    mutationFn: async ({ id, updates }) => {
      const { error } = await supabase.from('manual_income').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('manual_income').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    income: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
    createIncome: createMut.mutateAsync,
    updateIncome: (id, updates) => updateMut.mutateAsync({ id, updates }),
    deleteIncome: deleteMut.mutateAsync,
  }
}
