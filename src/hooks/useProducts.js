import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useProducts({ activeOnly = false, featuredOnly = false } = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('products')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })
    if (activeOnly)   q = q.eq('is_active',   true)
    if (featuredOnly) q = q.eq('is_featured', true)
    const { data, error } = await q
    if (error) console.error('useProducts fetch:', error)
    setProducts(data ?? [])
    setLoading(false)
  }, [activeOnly, featuredOnly])

  useEffect(() => { fetch() }, [fetch])

  async function addProduct(p) {
    const { error } = await supabase.from('products').insert(p)
    if (error) throw new Error(error.message)
    await fetch()
  }

  async function updateProduct(id, updates) {
    const { error } = await supabase.from('products').update(updates).eq('id', id)
    if (error) throw new Error(error.message)
    await fetch()
  }

  async function deleteProduct(id) {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetch()
  }

  return { products, loading, addProduct, updateProduct, deleteProduct, refetch: fetch }
}
