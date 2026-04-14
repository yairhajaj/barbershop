import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useCustomers({ search = '' } = {}) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading]     = useState(true)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      // 1. All customer profiles
      let q = supabase
        .from('profiles')
        .select('*')
        .eq('role', 'customer')
        .order('created_at', { ascending: false })

      if (search.trim()) {
        q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
      }

      const { data: profiles, error } = await q
      if (error) throw error

      // 2. All appointments for stats
      const { data: appts } = await supabase
        .from('appointments')
        .select('customer_id, status, start_at, services(price)')

      // 3. Build stats map
      const statsMap = {}
      ;(appts ?? []).forEach(a => {
        const cid = a.customer_id
        if (!cid) return
        if (!statsMap[cid]) statsMap[cid] = { total: 0, noShow: 0, spent: 0, lastDate: null }
        const s = statsMap[cid]
        s.total++
        if (a.status === 'no_show') s.noShow++
        if (a.services?.price) s.spent += Number(a.services.price)
        if (!s.lastDate || a.start_at > s.lastDate) s.lastDate = a.start_at
      })

      setCustomers(
        (profiles ?? []).map(p => ({
          ...p,
          ...(statsMap[p.id] ?? { total: 0, noShow: 0, spent: 0, lastDate: null }),
        }))
      )
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  async function toggleBlock(id, block) {
    await supabase.from('profiles').update({ is_blocked: block }).eq('id', id)
    setCustomers(cs => cs.map(c => c.id === id ? { ...c, is_blocked: block } : c))
  }

  async function fetchHistory(customerId) {
    const { data } = await supabase
      .from('appointments')
      .select('*, services(name, price), staff(name)')
      .eq('customer_id', customerId)
      .order('start_at', { ascending: false })
    return data ?? []
  }

  return { customers, loading, toggleBlock, fetchHistory, refetch: fetchCustomers }
}
