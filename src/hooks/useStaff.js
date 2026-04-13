import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useStaff({ activeOnly = false } = {}) {
  const [staff, setStaff]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    fetchStaff()
  }, [activeOnly])

  async function fetchStaff() {
    setLoading(true)
    let query = supabase
      .from('staff')
      .select('*, staff_hours(*), staff_services(service_id)')
    if (activeOnly) query = query.eq('is_active', true)
    const { data, error } = await query
    if (error) setError(error.message)
    else setStaff(data ?? [])
    setLoading(false)
  }

  async function upsertStaffMember(member) {
    const { staff_hours, staff_services, ...memberData } = member
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

    await fetchStaff()
    return data
  }

  async function deleteStaffMember(id) {
    const { error } = await supabase.from('staff').delete().eq('id', id)
    if (error) throw error
    await fetchStaff()
  }

  return { staff, loading, error, refetch: fetchStaff, upsertStaffMember, deleteStaffMember }
}
