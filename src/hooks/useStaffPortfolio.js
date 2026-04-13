import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useStaffPortfolio(staffId) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (staffId) fetchPhotos() }, [staffId])

  async function fetchPhotos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('staff_portfolio')
      .select('*')
      .eq('staff_id', staffId)
      .order('display_order')
    if (error) console.error('useStaffPortfolio:', error)
    setPhotos(data ?? [])
    setLoading(false)
  }

  async function addPhoto(url, caption = '') {
    const { error } = await supabase
      .from('staff_portfolio')
      .insert({ staff_id: staffId, image_url: url, caption })
    if (error) throw new Error(error.message)
    await fetchPhotos()
  }

  async function deletePhoto(id) {
    const { error } = await supabase
      .from('staff_portfolio')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchPhotos()
  }

  return { photos, loading, addPhoto, deletePhoto }
}
