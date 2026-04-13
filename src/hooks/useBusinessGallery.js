import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useBusinessGallery() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    setLoading(true)
    const { data } = await supabase
      .from('business_gallery')
      .select('*')
      .order('display_order')
    setItems(data ?? [])
    setLoading(false)
  }

  async function addItem(url, caption = '', type = 'image') {
    const { error } = await supabase
      .from('business_gallery')
      .insert({ url, caption, type })
    if (error) throw new Error(error.message)
    await fetchItems()
  }

  async function deleteItem(id) {
    const { error } = await supabase
      .from('business_gallery')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchItems()
  }

  return { items, loading, addItem, deleteItem }
}
