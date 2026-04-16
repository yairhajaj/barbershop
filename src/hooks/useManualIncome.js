import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useManualIncome({ startDate, endDate } = {}) {
  const [income, setIncome]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchIncome() }, [startDate, endDate])

  async function fetchIncome() {
    setLoading(true)
    let query = supabase
      .from('manual_income')
      .select('*, staff(id, name), services(id, name)')
      .order('date', { ascending: false })

    if (startDate) query = query.gte('date', startDate)
    if (endDate)   query = query.lte('date', endDate)

    const { data, error } = await query
    if (!error) setIncome(data ?? [])
    setLoading(false)
  }

  async function createIncome(entry) {
    const { data, error } = await supabase.from('manual_income').insert(entry).select().single()
    if (error) throw error
    await fetchIncome()
    return data
  }

  async function updateIncome(id, updates) {
    const { error } = await supabase.from('manual_income').update(updates).eq('id', id)
    if (error) throw error
    await fetchIncome()
  }

  async function deleteIncome(id) {
    const { error } = await supabase.from('manual_income').delete().eq('id', id)
    if (error) throw error
    await fetchIncome()
  }

  return { income, loading, refetch: fetchIncome, createIncome, updateIncome, deleteIncome }
}
