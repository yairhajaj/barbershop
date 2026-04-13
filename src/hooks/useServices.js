import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useServices({ activeOnly = false } = {}) {
  const [services, setServices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    fetchServices()
  }, [activeOnly])

  async function fetchServices() {
    setLoading(true)
    let query = supabase.from('services').select('*').order('display_order')
    if (activeOnly) query = query.eq('is_active', true)
    const { data, error } = await query
    if (error) setError(error.message)
    else setServices(data ?? [])
    setLoading(false)
  }

  async function upsertService(service) {
    const { data, error } = await supabase.from('services').upsert(service).select().single()
    if (error) throw error
    await fetchServices()
    return data
  }

  async function deleteService(id) {
    const { error } = await supabase.from('services').delete().eq('id', id)
    if (error) throw error
    await fetchServices()
  }

  return { services, loading, error, refetch: fetchServices, upsertService, deleteService }
}
