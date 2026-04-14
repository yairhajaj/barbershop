import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Admin: all waitlist entries ───────────────────────────────────────────────
export function useWaitlist({ statusFilter = 'all' } = {}) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('waitlist')
        .select('*, profiles(name, phone), services(name), branches(name), staff(id, name)')
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        q = q.eq('status', statusFilter)
      }

      const { data, error } = await q
      if (error) throw error
      setEntries(data ?? [])
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
