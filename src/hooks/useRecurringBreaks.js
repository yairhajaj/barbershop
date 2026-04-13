import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useRecurringBreaks() {
  const [breaks, setBreaks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchBreaks() }, [])

  async function fetchBreaks() {
    setLoading(true)
    const { data } = await supabase.from('recurring_breaks').select('*').order('start_time')
    setBreaks(data ?? [])
    setLoading(false)
  }

  async function addBreak(b) {
    const { error } = await supabase.from('recurring_breaks').insert(b)
    if (error) throw error
    await fetchBreaks()
  }

  async function deleteBreak(id) {
    await supabase.from('recurring_breaks').delete().eq('id', id)
    await fetchBreaks()
  }

  return { breaks, loading, addBreak, deleteBreak, refetch: fetchBreaks }
}
