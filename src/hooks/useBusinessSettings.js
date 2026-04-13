import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_SETTINGS = {
  cancellation_hours: 24,
  cancellation_fee: null,
  cancellation_fee_type: 'none', // 'none' | 'full' | 'percentage' | 'fixed'
  smart_scheduling_enabled: false,
  smart_adjacent: true,
  smart_start_of_day: true,
  smart_end_of_day: true,
  free_slots_count: 1,
  invoice_footer_text: '',
  calendar_default_view: 'week',
  calendar_columns: 1,
  recurring_appointments_enabled: true,
  recurring_weeks_ahead: 12,
  floating: false,
  shabbat_mode: false,
  shabbat_lat: 31.7683,
  shabbat_lng: 35.2137,
  shabbat_offset_minutes: 18,
  reminder_enabled:   false,
  reminder_channel:   'whatsapp',
  reminder_1_hours:   24,
  reminder_2_enabled: false,
  reminder_2_hours:   2,
  reminder_3_enabled: false,
  reminder_3_hours:   1,
}

export function useBusinessSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [hours, setHours]       = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [settingsRes, hoursRes] = await Promise.all([
      supabase.from('business_settings').select('*').single(),
      supabase.from('business_hours').select('*').order('day_of_week'),
    ])
    if (settingsRes.data) setSettings({ ...DEFAULT_SETTINGS, ...settingsRes.data })
    if (hoursRes.data)    setHours(hoursRes.data)
    setLoading(false)
  }

  // Columns guaranteed to exist in the original schema (001_schema.sql)
  const BASE_COLS = [
    'cancellation_hours', 'cancellation_fee', 'smart_scheduling_enabled',
    'free_slots_count', 'invoice_footer_text', 'calendar_default_view', 'calendar_columns',
  ]

  async function saveSettings(updates) {
    const { data: existing } = await supabase.from('business_settings').select('id').single()

    const doSave = async (data) => {
      if (existing) {
        return supabase.from('business_settings').update(data).eq('id', existing.id)
      } else {
        return supabase.from('business_settings').insert(data)
      }
    }

    let { error } = await doSave(updates)

    // If a column doesn't exist yet (migration not run), retry with only base columns
    if (error && (error.code === '42703' || error.message?.includes('column'))) {
      const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => BASE_COLS.includes(k)))
      if (Object.keys(safe).length > 0) {
        const result = await doSave(safe)
        error = result.error
      } else {
        error = null
      }
    }

    if (error) throw new Error(error.message)
    await fetchAll()
  }

  async function saveBusinessHours(hoursData) {
    await supabase.from('business_hours').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('business_hours').insert(hoursData)
    await fetchAll()
  }

  return { settings, hours, loading, saveSettings, saveBusinessHours, refetch: fetchAll }
}
