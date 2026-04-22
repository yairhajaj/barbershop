import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useStaff({ activeOnly = false, branchId = null } = {}) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['staff', { activeOnly, branchId }],
    queryFn: async () => {
      let allowedIds = null
      if (branchId) {
        const { data: sb } = await supabase
          .from('staff_branches')
          .select('staff_id')
          .eq('branch_id', branchId)
        allowedIds = (sb ?? []).map(r => r.staff_id)
        if (allowedIds.length === 0) return []
      }

      let q = supabase
        .from('staff')
        .select('*, staff_hours(*), staff_services(service_id), staff_branches(branch_id)')
      if (activeOnly)          q = q.eq('is_active', true)
      if (allowedIds !== null) q = q.in('id', allowedIds)

      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })

  const upsertMut = useMutation({
    mutationFn: async (member) => {
      const { staff_hours, staff_services, staff_branches: branchIds, ...memberData } = member
      delete memberData.branch_id

      const { data, error } = await supabase.from('staff').upsert(memberData).select().single()
      if (error) throw error

      if (staff_hours) {
        await supabase.from('staff_hours').delete().eq('staff_id', data.id)
        if (staff_hours.length > 0) {
          await supabase.from('staff_hours').insert(
            staff_hours.map(h => ({ ...h, staff_id: data.id }))
          )
        }
      }

      if (staff_services) {
        await supabase.from('staff_services').delete().eq('staff_id', data.id)
        if (staff_services.length > 0) {
          await supabase.from('staff_services').insert(
            staff_services.map(sid => ({ staff_id: data.id, service_id: sid }))
          )
        }
      }

      if (branchIds !== undefined) {
        await supabase.from('staff_branches').delete().eq('staff_id', data.id)
        if (branchIds.length > 0) {
          await supabase.from('staff_branches').insert(
            branchIds.map(bid => ({ staff_id: data.id, branch_id: bid }))
          )
        }
      }

      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] })
      qc.invalidateQueries({ queryKey: ['booking-available-staff'] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('staff').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] })
      qc.invalidateQueries({ queryKey: ['booking-available-staff'] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
    },
  })

  async function deactivateStaff(id) {
    const { error } = await supabase.from('staff').update({ is_active: false }).eq('id', id)
    if (error) throw error
    qc.invalidateQueries({ queryKey: ['staff'] })
    qc.invalidateQueries({ queryKey: ['booking-available-staff'] })
    qc.invalidateQueries({ queryKey: ['appointments'] })
  }

  async function toggleActiveStaff(id, active) {
    const { error } = await supabase.from('staff').update({ is_active: active }).eq('id', id)
    if (error) throw error
    qc.invalidateQueries({ queryKey: ['staff'] })
    qc.invalidateQueries({ queryKey: ['booking-available-staff'] })
    qc.invalidateQueries({ queryKey: ['appointments'] })
  }

  return {
    staff: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    upsertStaffMember: upsertMut.mutateAsync,
    deleteStaffMember: deleteMut.mutateAsync,
    deactivateStaff,
    toggleActiveStaff,
  }
}
