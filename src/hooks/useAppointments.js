import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { findGapOpportunities } from '../lib/utils'

export function useAppointments({ staffId, date, customerId } = {}) {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  useEffect(() => {
    fetchAppointments()
  }, [staffId, date?.toDateString(), customerId])

  async function fetchAppointments() {
    setLoading(true)
    let query = supabase
      .from('appointments')
      .select(`
        *,
        profiles ( id, name, phone ),
        services ( id, name, duration_minutes, price ),
        staff    ( id, name, photo_url )
      `)
      .in('status', ['confirmed', 'pending_reschedule'])
      .order('start_at')

    if (staffId) query = query.eq('staff_id', staffId)
    if (customerId) query = query.eq('customer_id', customerId)

    if (date) {
      const start = new Date(date); start.setHours(0,0,0,0)
      const end   = new Date(date); end.setHours(23,59,59,999)
      query = query.gte('start_at', start.toISOString()).lte('start_at', end.toISOString())
    }

    const { data, error } = await query
    if (error) setError(error.message)
    else setAppointments(data ?? [])
    setLoading(false)
  }

  async function createAppointment(apptData) {
    const { data, error } = await supabase
      .from('appointments')
      .insert(apptData)
      .select()
      .single()
    if (error) throw error
    await fetchAppointments()
    return data
  }

  async function createRecurringAppointments(apptData, weeksAhead = 12) {
    const groupId = crypto.randomUUID()
    const base = new Date(apptData.start_at)
    const baseEnd = new Date(apptData.end_at)
    const rows = []
    for (let w = 0; w < weeksAhead; w++) {
      const start = new Date(base)
      start.setDate(start.getDate() + w * 7)
      const end = new Date(baseEnd)
      end.setDate(end.getDate() + w * 7)
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
    await fetchAppointments()
    return data
  }

  async function cancelRecurringGroup(groupId, cancelledBy = 'customer') {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', cancelled_by: cancelledBy })
      .eq('recurring_group_id', groupId)
      .eq('status', 'confirmed')
      .gte('start_at', new Date().toISOString())
    if (error) throw error
    await fetchAppointments()
  }

  async function cancelAppointment(id, reason = '', cancelledBy = 'customer') {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', cancellation_reason: reason, cancelled_by: cancelledBy })
      .eq('id', id)
    if (error) throw error

    // Run gap closer analysis
    const updated = appointments.filter(a => a.id !== id)
    const gaps = findGapOpportunities(updated, id)

    await fetchAppointments()
    return { gaps }
  }

  async function completeAppointment(id) {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'completed' })
      .eq('id', id)
    if (error) throw error
    await fetchAppointments()
  }

  async function rescheduleAppointment(id, newStartAt, newEndAt) {
    const { error } = await supabase
      .from('appointments')
      .update({ start_at: newStartAt, end_at: newEndAt, status: 'confirmed' })
      .eq('id', id)
    if (error) throw error
    await fetchAppointments()
  }

  return {
    appointments,
    loading,
    error,
    refetch: fetchAppointments,
    createAppointment,
    createRecurringAppointments,
    cancelAppointment,
    cancelRecurringGroup,
    completeAppointment,
    rescheduleAppointment,
  }
}

// Hook for all appointments (admin use) — includes realtime subscription
export function useAllAppointments({ startDate, endDate, staffId, status, branchId } = {}) {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  // Always-current ref so the realtime handler calls the latest fetchAll
  // even though the subscription is set up only once.
  const fetchAllRef = useRef(null)

  async function fetchAll() {
    setLoading(true)
    let query = supabase
      .from('appointments')
      .select(`
        *,
        profiles ( id, name, phone ),
        services ( id, name, duration_minutes, price ),
        staff    ( id, name, photo_url )
      `)
      .order('start_at')

    if (startDate) query = query.gte('start_at', startDate.toISOString())
    if (endDate)   query = query.lte('start_at', endDate.toISOString())
    if (staffId)   query = query.eq('staff_id', staffId)
    if (status)    query = query.eq('status', status)
    if (branchId)  query = query.eq('branch_id', branchId)

    const { data, error } = await query
    if (error) setError(error.message)
    else setAppointments(data ?? [])
    setLoading(false)
  }

  // Keep the ref pointing at the latest closure so the realtime handler
  // always re-fetches with the current date range / filters.
  fetchAllRef.current = fetchAll

  // Re-fetch whenever the visible date range or filters change
  useEffect(() => {
    fetchAll()
  }, [startDate?.toISOString(), endDate?.toISOString(), staffId, status, branchId])

  // Realtime subscription — stays alive for the lifetime of the hook instance.
  // Listens to every INSERT / UPDATE / DELETE on the appointments table and
  // triggers a fresh fetch so the admin calendar never shows stale data.
  useEffect(() => {
    const channel = supabase
      .channel('admin-appointments-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => { fetchAllRef.current?.() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, []) // intentionally empty — subscription lives for the duration of the mount

  async function markNoShow(id) {
    const { error } = await supabase
      .from('appointments')
      .update({ no_show: true, status: 'completed' })
      .eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  return { appointments, loading, error, refetch: fetchAll, markNoShow }
}
