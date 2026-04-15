import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Admin: all waitlist entries ───────────────────────────────────────────────
export function useWaitlist({ statusFilter = 'all' } = {}) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      // NOTE: waitlist has TWO FKs to staff (staff_id + offered_staff_id).
      // Use explicit FK hint to avoid PostgREST ambiguity error.
      const buildQuery = (includeStaff) => {
        const sel = includeStaff
          ? '*, profiles(name, phone), services(name), branches(name), staff!waitlist_staff_id_fkey(id, name)'
          : '*, profiles(name, phone), services(name), branches(name)'
        let q = supabase
          .from('waitlist')
          .select(sel)
          .order('created_at', { ascending: false })
        if (statusFilter !== 'all') q = q.eq('status', statusFilter)
        return q
      }

      let { data, error } = await buildQuery(true)

      // Fallback without staff join (in case FK hint doesn't match DB constraint name)
      if (error) {
        console.warn('useWaitlist: staff join failed, retrying without staff:', error.message)
        ;({ data, error } = await buildQuery(false))
      }

      if (error) throw error
      setEntries(data ?? [])
    } catch (err) {
      console.error('useWaitlist fetchAll error:', err)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function removeEntry(id) {
    await supabase.from('waitlist').update({ status: 'removed' }).eq('id', id)
    setEntries(es => es.filter(e => e.id !== id))
  }

  async function addEntry(data) {
    const { error } = await supabase.from('waitlist').insert(data)
    if (error) throw error
    await fetchAll()
  }

  return { entries, loading, removeEntry, addEntry, refetch: fetchAll }
}

// ── Customer: join waitlist (used in SelectDateTime modal) ────────────────────
export async function joinWaitlist({ userId, serviceId, staffId, branchId, date, timeFrom, timeTo, notes }) {
  const { error } = await supabase.from('waitlist').insert({
    customer_id:    userId,
    service_id:     serviceId   ?? null,
    staff_id:       staffId     ?? null,
    branch_id:      branchId    ?? null,
    preferred_date: date,           // "YYYY-MM-DD"
    time_from:      timeFrom,       // "HH:MM"
    time_to:        timeTo,         // "HH:MM"
    notes:          notes || null,
  })
  if (error) throw error
}
