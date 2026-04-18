import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { findGapOpportunities } from '../lib/utils'

const APPT_SELECT = `
  *,
  profiles ( id, name, phone ),
  services ( id, name, duration_minutes, price ),
  staff    ( id, name, photo_url )
`

export function useAppointments({ staffId, date, customerId } = {}) {
  const qc = useQueryClient()
  const dateKey = date ? date.toDateString() : null

  const query = useQuery({
    queryKey: ['appointments', 'list', { staffId, dateKey, customerId }],
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select(APPT_SELECT)
        .in('status', ['confirmed', 'pending_reschedule'])
        .order('start_at')

      if (staffId)    q = q.eq('staff_id', staffId)
      if (customerId) q = q.eq('customer_id', customerId)

      if (date) {
        const start = new Date(date); start.setHours(0,0,0,0)
        const end   = new Date(date); end.setHours(23,59,59,999)
        q = q.gte('start_at', start.toISOString()).lte('start_at', end.toISOString())
      }

      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['appointments'] })
    qc.invalidateQueries({ queryKey: ['finance'] })
  }

  const createMut = useMutation({
    mutationFn: async (apptData) => {
      const { data, error } = await supabase.from('appointments').insert(apptData).select().single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const createRecurringMut = useMutation({
    mutationFn: async ({ apptData, weeksAhead = 12 }) => {
      const groupId = crypto.randomUUID()
      const base = new Date(apptData.start_at)
      const baseEnd = new Date(apptData.end_at)
      const rows = []
      for (let w = 0; w < weeksAhead; w++) {
        const start = new Date(base); start.setDate(start.getDate() + w * 7)
        const end   = new Date(baseEnd); end.setDate(end.getDate() + w * 7)
        rows.push({
          ...apptData,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          is_recurring: true,
          recurring_group_id: groupId,
        })
      }
      const { data, error } = await supabase.from('appointments').insert(rows).select()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const cancelRecurringGroupMut = useMutation({
    mutationFn: async ({ groupId, cancelledBy = 'customer' }) => {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled', cancelled_by: cancelledBy })
        .eq('recurring_group_id', groupId)
        .eq('status', 'confirmed')
        .gte('start_at', new Date().toISOString())
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const cancelMut = useMutation({
    mutationFn: async ({ id, reason = '', cancelledBy = 'customer' }) => {
      const current = query.data ?? []
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled', cancellation_reason: reason, cancelled_by: cancelledBy })
        .eq('id', id)
      if (error) throw error
      const updated = current.filter(a => a.id !== id)
      const gaps = findGapOpportunities(updated, id)
      return { gaps }
    },
    onSuccess: invalidate,
  })

  const completeMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('appointments').update({ status: 'completed' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const rescheduleMut = useMutation({
    mutationFn: async ({ id, newStartAt, newEndAt }) => {
      const { error } = await supabase
        .from('appointments')
        .update({ start_at: newStartAt, end_at: newEndAt, status: 'confirmed' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    appointments: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    createAppointment: createMut.mutateAsync,
    createRecurringAppointments: (apptData, weeksAhead) => createRecurringMut.mutateAsync({ apptData, weeksAhead }),
    cancelAppointment: (id, reason, cancelledBy) => cancelMut.mutateAsync({ id, reason, cancelledBy }),
    cancelRecurringGroup: (groupId, cancelledBy) => cancelRecurringGroupMut.mutateAsync({ groupId, cancelledBy }),
    completeAppointment: completeMut.mutateAsync,
    rescheduleAppointment: (id, newStartAt, newEndAt) => rescheduleMut.mutateAsync({ id, newStartAt, newEndAt }),
  }
}

// Hook for all appointments (admin use) — includes realtime subscription
export function useAllAppointments({ startDate, endDate, staffId, status, branchId } = {}) {
  const qc = useQueryClient()
  const startKey = startDate?.toISOString() ?? null
  const endKey   = endDate?.toISOString() ?? null

  const query = useQuery({
    queryKey: ['appointments', 'all', { startKey, endKey, staffId, status, branchId }],
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select(APPT_SELECT)
        .order('start_at')

      if (startDate) q = q.gte('start_at', startDate.toISOString())
      if (endDate)   q = q.lte('start_at', endDate.toISOString())
      if (staffId)   q = q.eq('staff_id', staffId)
      if (status)    q = q.eq('status', status)
      // Include appointments that match the selected branch OR have no branch set
      if (branchId)  q = q.or(`branch_id.eq.${branchId},branch_id.is.null`)

      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })

  // Realtime subscription — invalidate on any appointment change
  useEffect(() => {
    const channelName = `admin-appointments-${Date.now()}`
    let channel = null
    try {
      channel = supabase
        .channel(channelName)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'appointments' },
          () => qc.invalidateQueries({ queryKey: ['appointments'] }))
        .subscribe()
    } catch (err) {
      console.warn('[useAllAppointments] realtime setup failed:', err)
    }
    return () => { if (channel) { try { supabase.removeChannel(channel) } catch {} } }
  }, [qc])

  const markNoShowMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('appointments')
        .update({ no_show: true, status: 'completed' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
    },
  })

  return {
    appointments: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    markNoShow: markNoShowMut.mutateAsync,
  }
}
