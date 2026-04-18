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
  waitlist_enabled:   false,
  // Payments (Grow / Meshulam)
  payment_enabled:  false,
  payment_mode:     'required', // 'required' | 'optional' | 'per_service'
  grow_api_key:     '',
  grow_user_id:     '',
  grow_page_code:   '',
  // Finance
  vat_rate:                 18,
  business_tax_id:          '',
  business_type:            'osek_morsheh', // 'osek_morsheh' | 'osek_patur' | 'company'
  invoice_prefix:           'INV',
  invoice_next_number:      1,
  accountant_name:          '',
  accountant_email:         '',
  accountant_phone:         '',
  cash_tracking_enabled:    true,
  commission_type:          'percentage', // 'percentage' | 'fixed' | 'salary'
  commission_default_rate:  50,
  openai_api_key:           '',
  // Israeli Tax Authority — software registration (OPENFRMT 1.31 / Inst. 24/2004)
  tax_software_reg_number:  '',                   // 8-digit reg. number (from רשות המיסים)
  business_name:            '',                   // used in A000 field 1018 + invoice header
  business_address_street:  '',
  business_address_number:  '',
  business_address_city:    '',
  business_address_postal:  '',
  software_name:            'Barbershop Booking', // A000 field 1007
  software_version:         '1.0',                // A000 field 1008
  manufacturer_vat_id:      '',                   // A000 field 1009 (9 digits)
  manufacturer_name:        '',                   // A000 field 1010
  software_type:            2,                    // A000 field 1011 (1=חד-שנתי, 2=רב-שנתי)
  bookkeeping_type:         1,                    // A000 field 1013 (0/1/2)
  company_registration_number: '',                // A000 field 1015 (ח.פ.)
  deduction_file_number:    '',                   // A000 field 1016 (תיק ניכויים)
  leading_currency:         'ILS',                // A000 field 1032
  has_branches:             false,                // A000 field 1034
  customer_consent_required: true,                // Inst. 24/2004 §18ב(ג)(1)
  last_quarterly_backup_at: null,                 // Inst. 24/2004 §25(ו)
  last_openfrmt_export_at:  null,
  tax_office_notified:      false,                // Inst. 24/2004 §18ב(ב)
  tax_office_notified_at:   null,
  // Announcement
  announcement_enabled:    false,
  announcement_title:      '',
  announcement_body:       '',
  announcement_expires_at: null,
  announcement_color:      'gold',
  // Gap Closer
  gap_closer_mode:              'off',   // 'off' | 'approval' | 'auto'
  gap_closer_threshold_minutes: 30,
  gap_closer_advance_hours:     2,      // hours before gap to start acting
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

  // Returns branch_hours for a given branchId, falling back to global business_hours
  async function fetchBranchHours(branchId) {
    if (!branchId) return hours
    const { data } = await supabase
      .from('branch_hours')
      .select('*')
      .eq('branch_id', branchId)
      .order('day_of_week')
    if (data && data.length > 0) return data
    return hours // fallback to global hours
  }

  async function saveBranchHours(branchId, hoursData) {
    await supabase.from('branch_hours').delete().eq('branch_id', branchId)
    if (hoursData.length > 0) {
      await supabase.from('branch_hours').insert(hoursData.map(h => ({ ...h, branch_id: branchId })))
    }
  }

  return { settings, hours, loading, saveSettings, saveBusinessHours, fetchBranchHours, saveBranchHours, refetch: fetchAll }
}
