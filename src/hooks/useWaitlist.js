import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Returns true if the waitlist entry's time window has already passed.
 * Window end = preferred_date + (time_to || '23:59').
 */
export function isWaitlistExpired(entry, now = new Date()) {
  if (!entry?.preferred_date) return false
  const timeTo = (entry.time_to && entry.time_to.slice(0, 5)) || '23:59'
  const cutoff = new Date(`${entry.preferred_date}T${timeTo}:59`)
  return cutoff <= now
}

/**
 * Fire-and-forget DB sweep: mark pending entries whose window passed as 'expired'.
 * Safe to call from anywhere — idempotent.
 */
export async function sweepExpiredWaitlist(entries) {
  const expired = (entries || []).filter(e => e.status === 'pending' && isWaitlistExpired(e))
  if (!expired.length) return 0
  try {
    await supabase
      .from('waitlist')
      .update({ status: 'expired' })
      .in('id', expired.map(e => e.id))
  } catch (err) {
    console.warn('sweepExpiredWaitlist failed:', err)
  }
  return expired.length
}

// ── Admin: all waitlist entries ───────────────────────────────────────────────
export function useWaitlist({ statusFilter = 'all' } = {}) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const fetchRef = useRef(null)

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
          .neq('status', 'removed')
          .order('created_at', { ascending: false })
        if (statusFilter === 'active') {
          q = q.in('status', ['pending', 'notified'])
        } else if (statusFilter !== 'all') {
          q = q.eq('status', statusFilter)
        }
        return q
      }

      let { data, error } = await buildQuery(true)

      // Fallback without staff join (in case FK hint doesn't match DB constraint name)
      if (error) {
        console.warn('useWaitlist: staff join failed, retrying without staff:', error.message)
        ;({ data, error } = await buildQuery(false))
      }

      if (error) throw error
      const rows = data ?? []

      // Sweep expired pending entries to DB (background)
      await sweepExpiredWaitlist(rows)

      // Reflect sweep locally: anything expired moves from pending → expired in-memory
      const now = new Date()
      const normalized = rows.map(e =>
        e.status === 'pending' && isWaitlistExpired(e, now) ? { ...e, status: 'expired' } : e
      )
      setEntries(normalized)
    } catch (err) {
      console.error('useWaitlist fetchAll error:', err)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  fetchRef.current = fetchAll
  useEffect(() => { fetchAll() }, [fetchAll])

  // Realtime subscription
  useEffect(() => {
    const channelName = `waitlist-realtime-${Date.now()}`
    let channel = null
    try {
      channel = supabase
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist' },
          () => { fetchRef.current?.() })
        .subscribe()
    } catch (err) {
      console.warn('[useWaitlist] realtime setup failed:', err)
    }
    return () => { if (channel) { try { supabase.removeChannel(channel) } catch {} } }
  }, [])

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
