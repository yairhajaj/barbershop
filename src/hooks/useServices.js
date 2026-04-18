import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useServices({ activeOnly = false } = {}) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['services', { activeOnly }],
    queryFn: async () => {
      let q = supabase.from('services').select('*').order('display_order')
      if (activeOnly) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })

  const upsertMut = useMutation({
    mutationFn: async (service) => {
      const { data, error } = await supabase.from('services').upsert(service).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('services').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] })
    },
  })

  return {
    services: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    upsertService: upsertMut.mutateAsync,
    deleteService: deleteMut.mutateAsync,
  }
}
