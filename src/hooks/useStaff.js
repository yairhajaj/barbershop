import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useStaff({ activeOnly = false, branchId = null } = {}) {
  const [staff, setStaff]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    fetchStaff()
  }, [activeOnly, branchId])

  async function fetchStaff() {
    setLoading(true)

    // If filtering by branch — first get staff IDs assigned to that branch
    let allowedIds = null
    if (branchId) {
      const { data: sb } = await supabase
        .from('staff_branches')
        .select('staff_id')
        .eq('branch_id', branchId)
      allowedIds = (sb ?? []).map(r => r.staff_id)
      if (allowedIds.length === 0) {
        setStaff([])
        setLoading(false)
        return
      }
    }

    let query = supabase
      .from('staff')
      .select('*, staff_hours(*), staff_services(service_id), staff_branches(branch_id)')

    if (activeOnly)           query = query.eq('is_active', true)
    if (allowedIds !== null)  query = query.in('id', allowedIds)

    const { data, error } = await query
    if (error) setError(error.message)
    else setStaff(data ?? [])
    setLoading(false)
  }

  async function upsertStaffMember(member) {
    // Separate relation fields from the main staff row
    const { staff_hours, staff_services, staff_branches: branchIds, ...memberData } = member
    // Remove branch_id from memberData if present (legacy field — not used for grouping anymore)
    delete memberData.branch_id

    const { data, error } = await supabase.from('staff').upsert(memberData).select().single()
    if (error) throw error

    // Sync staff_hours
    if (staff_hours) {
      await supabase.from('staff_hours').delete().eq('staff_id', data.id)
      if (staff_hours.length > 0) {
        await supabase.from('staff_hours').insert(
          staff_hours.map(h => ({ ...h, staff_id: data.id }))
        )
      }
    }

    // Sync staff_services
    if (staff_services) {
      await supabase.from('staff_services').delete().eq('staff_id', data.id)
      if (staff_services.length > 0) {
        await supabase.from('staff_services').insert(
          staff_services.map(sid => ({ staff_id: data.id, service_id: sid }))
        )
      }
    }

    // Sync staff_branches (array of branch_id strings)
    if (branchIds !== undefined) {
      await supabase.from('staff_branches').delete().eq('staff_id', data.id)
      if (branchIds.length > 0) {
        await supabase.from('staff_branches').insert(
          branchIds.map(bid => ({ staff_id: data.id, branch_id: bid }))
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
