import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useStaffCommissions({ staffId, startDate, endDate, status } = {}) {
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => { fetchCommissions() }, [staffId, startDate, endDate, status])

  async function fetchCommissions() {
    setLoading(true)
    let query = supabase
      .from('staff_commissions')
      .select('*, staff(id, name, photo_url)')
      .order('date', { ascending: false })

    if (staffId)   query = query.eq('staff_id', staffId)
    if (status)    query = query.eq('status', status)
    if (startDate) query = query.gte('date', startDate)
    if (endDate)   query = query.lte('date', endDate)

    const { data, error } = await query
    if (!error) setCommissions(data ?? [])
    setLoading(false)
  }

  async function createCommission(entry) {
    const { data, error } = await supabase.from('staff_commissions').insert(entry).select().single()
    if (error) throw error
    await fetchCommissions()
    return data
  }

  /** Mark a single commission as paid */
  async function markPaid(id) {
    const { error } = await supabase
      .from('staff_commissions')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await fetchCommissions()
  }

  /** Mark all pending commissions for a staff member as paid */
  async function markAllPaid(staffId) {
    const { error } = await supabase
      .from('staff_commissions')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('staff_id', staffId)
      .eq('status', 'pending')
    if (error) throw error
    await fetchCommissions()
  }

  async function deleteCommission(id) {
    const { error } = await supabase.from('staff_commissions').delete().eq('id', id)
    if (error) throw error
    await fetchCommissions()
  }

  return {
    commissions, loading, refetch: fetchCommissions,
    createCommission, markPaid, markAllPaid, deleteCommission,
  }
}
