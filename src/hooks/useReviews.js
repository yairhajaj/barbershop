import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useReviews({ staffId } = {}) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('reviews')
      .select('*, profiles(name), staff(name)')
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
    if (staffId) q = q.eq('staff_id', staffId)
    const { data } = await q
    setReviews(data ?? [])
    setLoading(false)
  }, [staffId])

  useEffect(() => { fetch() }, [fetch])

  async function submitReview({ appointmentId, customerId, staffId: sid, rating, comment }) {
    const { error } = await supabase.from('reviews').upsert({
      appointment_id: appointmentId,
      customer_id: customerId,
      staff_id: sid,
      rating,
      comment,
    }, { onConflict: 'appointment_id' })
    if (error) throw error
    await fetch()
  }

  return { reviews, loading, submitReview, refetch: fetch }
}

export function useAppointmentReview(appointmentId) {
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!appointmentId) { setLoading(false); return }
    supabase.from('reviews').select('*').eq('appointment_id', appointmentId).maybeSingle()
      .then(({ data }) => { setReview(data); setLoading(false) })
  }, [appointmentId])

  return { review, loading }
}
