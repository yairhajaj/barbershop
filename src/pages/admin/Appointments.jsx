import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  addDays, startOfWeek, endOfWeek, startOfDay, endOfDay,
  isSameDay, format, isToday,
} from 'date-fns'
import { he } from 'date-fns/locale/he'
import {
  DndContext, useDraggable, useDroppable,
  PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { useAllAppointments } from '../../hooks/useAppointments'
import { useCustomerDebts } from '../../hooks/useCustomerDebts'
import { useStaff } from '../../hooks/useStaff'
import { useServices } from '../../hooks/useServices'
import { useProducts } from '../../hooks/useProducts'
import { useRecurringBreaks } from '../../hooks/useRecurringBreaks'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useBranch } from '../../contexts/BranchContext'
import { StatusBadge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { AdminSkeleton } from '../../components/feedback/AdminSkeleton'
import { useToast } from '../../components/ui/Toast'
import { findGapOpportunities, findRescheduleCandidates, formatTime, formatDate, generateSlots, dayName } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { printInvoice } from '../../lib/invoice'
import { BUSINESS } from '../../config/business'
import { buzz } from '../../lib/native'

// ─── Constants ────────────────────────────────────────────────────────────────
const VIEWS = ['day', 'week', 'list']
const VIEW_LABELS = { day: 'יומי', week: 'שבועי', list: 'רשימה' }
const VIEW_ICONS  = { day: '📅', week: '📆', list: '☰' }

const START_HOUR = 7
const END_HOUR = 20
const SLOT_HEIGHT = 52 // px per slot unit

const COLOR_PRESETS = [
  '#C9A96E', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#ec4899', '#64748b',
]
const DEFAULT_COLOR = '#C9A96E'

const EMPTY_EVENT = {
  title:      '',
  staff_ids:  [],   // multi-select
  dates:      [],   // multi-select
  start_time: '',
  end_time:   '',
}

const BLOCK_TIME_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const mins = 7 * 60 + i * 30
  return `${String(Math.floor(mins / 60)).padStart(2,'0')}:${String(mins % 60).padStart(2,'0')}`
})

const BLOCK_PRESETS = [
  { emoji: '🤝', label: 'פגישה' },
  { emoji: '☕', label: 'הפסקה' },
  { emoji: '🏖', label: 'חופשה' },
  { emoji: '🔧', label: 'תחזוקה' },
  { emoji: '🎓', label: 'הדרכה' },
  { emoji: '✏️', label: 'אחר' },
]

const DURATION_PRESETS = [
  { label: '30ד׳', minutes: 30 },
  { label: '1ש׳',  minutes: 60 },
  { label: '2ש׳',  minutes: 120 },
  { label: 'כל היום', minutes: null },
]

// ─── localStorage helpers ──────────────────────────────────────────────────────
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* noop */ }
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function Appointments() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState('week')
  const [filterStaff, setFilterStaff] = useState('')
  const [selectedAppt, setSelectedAppt] = useState(null)
  const [invoiceStep, setInvoiceStep] = useState(null)   // null | 'paying' | 'done'
  const [invoiceData, setInvoiceData] = useState(null)   // saved invoice record
  const [invoiceProducts, setInvoiceProducts] = useState([]) // [{ product_id, name, unit_price, quantity, staff_id }]
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [gapAlert, setGapAlert] = useState(null)
  const [addEventOpen, setAddEventOpen] = useState(false)
  const [eventForm, setEventForm] = useState(EMPTY_EVENT)
  const [savingEvent, setSavingEvent] = useState(false)
  const [eventPreset, setEventPreset]         = useState('')       // '' | preset label | 'אחר'
  const [eventPickerMode, setEventPickerMode] = useState('from')  // 'from' | 'to'

  // Calendar settings (localStorage)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [slotMinutes, setSlotMinutesState] = useState(() => lsGet('cal_slot_minutes', 15))
  const [calColumns, setCalColumnsState] = useState(() => lsGet('cal_columns', 3))
  const [serviceColors, setServiceColorsState] = useState(() => lsGet('cal_service_colors', {}))
  const [calStartHour, setCalStartHourState] = useState(() => lsGet('cal_start_hour', 7))
  const [calEndHour,   setCalEndHourState]   = useState(() => lsGet('cal_end_hour',   21))

  // Pending move confirmation
  const [pendingMove, setPendingMove] = useState(null)
  const [movingSave, setMovingSave] = useState(false)

  // Book for customer modal
  const [bookOpen, setBookOpen] = useState(false)
  const [bookForm, setBookForm] = useState({ customerSearch: '', customerId: null, customerName: '', customerPhone: '', serviceId: '', staffId: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '', notes: '', wlTimeFrom: '', wlTimeTo: '' })
  const [customerResults, setCustomerResults] = useState([])
  const [savingBook, setSavingBook] = useState(false)
  const [deviceContacts, setDeviceContacts] = useState([])
  const [contactsTab, setContactsTab] = useState('db') // 'db' | 'contacts'
  const [contactsLoaded, setContactsLoaded] = useState(false)

  // WhatsApp prompt after move
  const [whatsappAfterMove, setWhatsappAfterMove] = useState(null)

  // Waitlist prefill — id of waitlist entry to mark booked after manual scheduling
  const [waitlistPrefillId, setWaitlistPrefillId] = useState(null)

  // Waitlist lock — original service/staff from waitlist entry (when present, chips are locked)
  const [bookWlOrigService,  setBookWlOrigService]  = useState('')
  const [bookWlOrigStaff,    setBookWlOrigStaff]    = useState('')
  const [bookWlLockService,  setBookWlLockService]  = useState(false)
  const [bookWlLockStaff,    setBookWlLockStaff]    = useState(false)
  const [bookChangeConfirm,  setBookChangeConfirm]  = useState(null) // { type, newId, newName, origName }

  // Debt modal
  const [debtModal, setDebtModal] = useState(false)
  const [debtForm, setDebtForm] = useState({ amount: '', description: '' })
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false)
  const [pendingBlockCustomerId, setPendingBlockCustomerId] = useState(null)

  // Cancel notification modal
  const [cancelModal, setCancelModal] = useState({ open: false, appt: null, notify: 'push' })

  // Reschedule appointment sheet
  const [rescheduleOpen,   setRescheduleOpen]   = useState(false)
  const [rescheduleAppt,   setRescheduleAppt]   = useState(null)
  const [rescheduleDate,   setRescheduleDate]   = useState('')
  const [rescheduleStaff,  setRescheduleStaff]  = useState('')
  const [rescheduleSlot,   setRescheduleSlot]   = useState(null)   // { start, end }
  const [rescheduleSlots,  setRescheduleSlots]  = useState([])
  const [rescheduleRec,    setRescheduleRec]    = useState(new Set())
  const [rescheduleLoading,setRescheduleLoading]= useState(false)
  const [savingReschedule, setSavingReschedule] = useState(false)

  // Blocked times for current range
  const [allBlockedTimes, setAllBlockedTimes] = useState([])

  const toast = useToast()
  const { currentBranch } = useBranch()
  const { debts: apptDebts, totalPending: apptDebtTotal, createDebt } = useCustomerDebts({ customerId: selectedAppt?.customer_id })
  const { breaks: recurringBreaks } = useRecurringBreaks()
  const { staff } = useStaff({ activeOnly: true, branchId: currentBranch?.id ?? null })
  const { services } = useServices({ activeOnly: false })
  const { products } = useProducts({ activeOnly: true })
  const { settings, hours: businessHours, saveBusinessHours } = useBusinessSettings()
  const [hoursForm, setHoursForm] = useState([])
  const [savingHours, setSavingHours] = useState(false)

  // Slot picker for booking modal
  const [bookSlots, setBookSlots]                   = useState([])
  const [bookSlotsRecommended, setBookSlotsRecommended] = useState(new Set())
  const [bookSlotsLoading, setBookSlotsLoading]     = useState(false)
  const [bookShowManualTime, setBookShowManualTime]  = useState(false)

  // ── Setters that also persist ────────────────────────────────────────────────
  const setSlotMinutes = useCallback(v => {
    setSlotMinutesState(v); lsSet('cal_slot_minutes', v)
  }, [])
  const setCalColumns = useCallback(v => {
    setCalColumnsState(v); lsSet('cal_columns', v)
  }, [])
  const setCalStartHour = useCallback(v => {
    setCalStartHourState(v); lsSet('cal_start_hour', v)
  }, [])
  const setCalEndHour = useCallback(v => {
    setCalEndHourState(v); lsSet('cal_end_hour', v)
  }, [])
  const setServiceColor = useCallback((serviceId, color) => {
    setServiceColorsState(prev => {
      const next = { ...prev, [serviceId]: color }
      lsSet('cal_service_colors', next)
      return next
    })
  }, [])

  // Sync hoursForm from DB whenever businessHours loads/changes.
  // Always build a complete 7-day array: DB rows take priority; any day
  // missing from the DB falls back to a sensible default.  This prevents
  // a partial save from silently wiping missing days out of the DB.
  useEffect(() => {
    const defaults = Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i,
      open_time:   '09:00',
      close_time:  '19:00',
      is_closed:   i === 6,   // Saturday closed by default
    }))
    const merged = defaults.map(def => {
      const dbRow = businessHours.find(h => h.day_of_week === def.day_of_week)
      return dbRow ?? def
    })
    setHoursForm(merged)
  }, [businessHours])

  function updateHour(day, field, value) {
    setHoursForm(h => h.map(r => r.day_of_week === day ? { ...r, [field]: value } : r))
  }

  async function handleSaveHours() {
    if (hoursForm.length < 7) return   // guard: never save a partial form
    setSavingHours(true)
    try { await saveBusinessHours(hoursForm) } finally { setSavingHours(false) }
  }

  // ── Customer prefill: auto-open booking modal with pre-selected customer ──────
  useEffect(() => {
    const raw = sessionStorage.getItem('customer_prefill')
    if (!raw) return
    sessionStorage.removeItem('customer_prefill')
    try {
      const p = JSON.parse(raw)
      setBookForm(f => ({
        ...f,
        customerSearch: p.customerName ? `${p.customerName}${p.customerPhone ? ' · ' + p.customerPhone : ''}` : '',
        customerId:    p.customerId   || null,
        customerName:  p.customerName || '',
        customerPhone: p.customerPhone || '',
      }))
      setBookOpen(true)
    } catch { /* ignore */ }
  }, [])

  // ── Waitlist prefill: auto-open booking modal if navigated from waitlist ──────
  useEffect(() => {
    const raw = sessionStorage.getItem('waitlist_prefill')
    if (!raw) return
    sessionStorage.removeItem('waitlist_prefill')
    try {
      const p = JSON.parse(raw)
      setWaitlistPrefillId(p.waitlistId ?? null)
      setBookWlOrigService(p.serviceId || '')
      setBookWlOrigStaff(p.staffId || '')
      setBookWlLockService(!!p.serviceId)
      setBookWlLockStaff(!!p.staffId)
      setBookChangeConfirm(null)
      setBookForm({
        customerSearch: p.customerName ? `${p.customerName}${p.customerPhone ? ' · ' + p.customerPhone : ''}` : '',
        customerId:     p.customerId   || null,
        customerName:   p.customerName || '',
        customerPhone:  p.customerPhone || '',
        serviceId:      p.serviceId    || '',
        staffId:        p.staffId      || '',
        date:           p.date         || format(new Date(), 'yyyy-MM-dd'),
        startTime:      p.startTime    || '',
        notes:          '',
        wlTimeFrom:     p.wlTimeFrom   || '',
        wlTimeTo:       p.wlTimeTo     || '',
      })
      // Navigate calendar to the prefilled date
      if (p.date) setCurrentDate(new Date(p.date + 'T12:00:00'))
      setBookOpen(true)
    } catch { /* ignore */ }
  }, [])

  // ── Slot picker: compute available slots for booking modal ───────────────────
  useEffect(() => {
    if (!bookOpen) return
    computeBookSlots()
  }, [bookForm.staffId, bookForm.date, bookForm.serviceId, bookOpen])

  async function computeBookSlots() {
    const { staffId, date: dateStr, serviceId } = bookForm
    if (!staffId || !dateStr || !serviceId) {
      setBookSlots([])
      setBookSlotsRecommended(new Set())
      return
    }
    setBookSlotsLoading(true)
    try {
      const date = new Date(dateStr + 'T12:00:00')
      const dow  = date.getDay()
      const dayStart = startOfDay(date)
      const dayEnd   = endOfDay(date)

      const [{ data: dayAppts }, { data: dayBlocked }] = await Promise.all([
        supabase.from('appointments')
          .select('start_at, end_at, status')
          .eq('staff_id', staffId)
          .in('status', ['confirmed', 'pending_reschedule'])
          .gte('start_at', dayStart.toISOString())
          .lte('start_at', dayEnd.toISOString()),
        supabase.from('blocked_times')
          .select('start_at, end_at')
          .eq('staff_id', staffId)
          .lte('start_at', dayEnd.toISOString())
          .gte('end_at', dayStart.toISOString()),
      ])

      const member   = staff.find(s => s.id === staffId)
      const staffDay = member?.staff_hours?.find(h => h.day_of_week === dow)
      const bizDay   = businessHours.find(h => h.day_of_week === dow)
      const svc      = services.find(s => s.id === serviceId)
      const duration = svc?.duration_minutes ?? 30

      const sharedParams = {
        date,
        durationMinutes: duration,
        staffHours:  staffDay,
        businessHours: bizDay,
        existingAppointments: dayAppts  ?? [],
        blockedTimes:         dayBlocked ?? [],
        recurringBreaks,
      }

      // All available slots (no smart filter)
      const allSlots = generateSlots(sharedParams)

      // Recommended slots — gap-minimising (always apply smart logic)
      const apptCount = (dayAppts ?? []).length
      const recSlots  = generateSlots({
        ...sharedParams,
        smartScheduling: {
          enabled:          true,
          adjacent:         true,
          startOfDay:       true,
          endOfDay:         true,
          freeCount:        0,
          appointmentCount: apptCount,
        },
      })

      const recSet = new Set(recSlots.map(s => s.start.getTime()))

      // Filter out past slots if today
      const now = new Date()
      let filtered = allSlots.filter(s =>
        date.toDateString() !== now.toDateString() || s.start > now
      )

      // If coming from waitlist, only show slots within the customer's requested time range
      const { wlTimeFrom, wlTimeTo } = bookForm
      if (wlTimeFrom && wlTimeTo) {
        filtered = filtered.filter(s => {
          const t = `${String(s.start.getHours()).padStart(2,'0')}:${String(s.start.getMinutes()).padStart(2,'0')}`
          return t >= wlTimeFrom && t < wlTimeTo
        })
        // Also filter recommended to only in-range slots
      }

      setBookSlots(filtered)
      // Recommended: only slots that are both recommended AND in range
      const finalRecSet = wlTimeFrom && wlTimeTo
        ? new Set([...recSet].filter(ts => filtered.some(s => s.start.getTime() === ts)))
        : recSet
      setBookSlotsRecommended(finalRecSet)
      // Reset manual time toggle when slots load
      setBookShowManualTime(false)
    } catch {
      setBookSlots([])
      setBookSlotsRecommended(new Set())
    } finally {
      setBookSlotsLoading(false)
    }
  }

  // ── Date range ────────────────────────────────────────────────────────────────
  const startDate = view === 'day'
    ? startOfDay(currentDate)
    : startOfWeek(currentDate, { weekStartsOn: 0 })
  const endDate = view === 'day'
    ? endOfDay(currentDate)
    : endOfWeek(currentDate, { weekStartsOn: 0 })

  const { appointments, loading, refetch, markNoShow } = useAllAppointments({
    startDate,
    endDate,
    staffId: filterStaff || undefined,
    branchId: currentBranch?.id ?? null,
  })

  // Load blocked times for the visible date range
  useEffect(() => {
    supabase
      .from('blocked_times')
      .select('*')
      .gte('end_at', startDate.toISOString())
      .lte('start_at', endDate.toISOString())
      .then(({ data }) => setAllBlockedTimes(data ?? []))
  }, [startDate.toISOString(), endDate.toISOString()])

  // Load waitlist entries for visible date range (week view)
  const [waitlistByDate, setWaitlistByDate] = useState({})
  useEffect(() => {
    const s = format(startDate, 'yyyy-MM-dd')
    const e = format(endDate,   'yyyy-MM-dd')
    supabase
      .from('waitlist')
      .select('*, profiles(name, phone), services(name)')
      .gte('preferred_date', s)
      .lte('preferred_date', e)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        const map = {}
        ;(data ?? []).forEach(entry => {
          const d = entry.preferred_date
          if (!map[d]) map[d] = []
          map[d].push(entry)
        })
        setWaitlistByDate(map)
      })
  }, [startDate.toISOString(), endDate.toISOString()])

  function navigate(dir) {
    const delta = dir * (view === 'day' ? 1 : 7)
    setCurrentDate(d => addDays(d, delta))
  }

  // ── Staff columns for day view ─────────────────────────────────────────────
  const staffColumns = useMemo(() => {
    if (filterStaff) return staff.filter(s => s.id === filterStaff)
    return staff.slice(0, calColumns)
  }, [staff, filterStaff, calColumns])

  // ── Realtime subscription for reschedule offer updates ──────────────────
  useEffect(() => {
    if (!gapAlert) return

    const channel = supabase
      .channel('reschedule-offers')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'reschedule_offers',
      }, (payload) => {
        const { appointment_id, status } = payload.new
        setGapAlert(prev => {
          if (!prev) return prev
          return {
            ...prev,
            step2_reschedule: {
              ...prev.step2_reschedule,
              offers: { ...prev.step2_reschedule.offers, [appointment_id]: status }
            }
          }
        })
        if (status === 'accepted') refetch()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [!!gapAlert])

  // ── Appointment actions ────────────────────────────────────────────────────
  function handleCancel(id) {
    const appt = appointments.find(a => a.id === id)
    setCancelModal({ open: true, appt, notify: 'push' })
  }

  async function confirmCancel() {
    const { appt, notify } = cancelModal
    if (!appt) return
    const id = appt.id
    setCancelModal(m => ({ ...m, open: false }))

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', cancelled_by: 'admin' })
      .eq('id', id)
    if (error) { toast({ message: 'שגיאה', type: 'error' }); return }

    await refetch()
    setSelectedAppt(null)
    await buzz('success')
    toast({ message: 'תור בוטל', type: 'success' })

    // Send cancellation notification
    if (notify !== 'none') {
      const customerName = appt.profiles?.name || 'לקוח'
      const serviceName  = appt.services?.name  || 'תור'
      const dateStr      = formatDate(appt.start_at)
      const timeStr      = formatTime(appt.start_at)
      const msg = `שלום ${customerName}, תורך ל${serviceName} ב${dateStr} בשעה ${timeStr} בוטל.`
      if (notify === 'push' || notify === 'both') {
        const token = appt.profiles?.push_token
        if (token) {
          try { await supabase.functions.invoke('send-push', { body: { title: 'תור בוטל ❌', body: msg, tokens: [token] } }) } catch {}
        }
      }
      if (notify === 'whatsapp' || notify === 'both') {
        const phone = appt.profiles?.phone
        if (phone) {
          try { await supabase.functions.invoke('send-whatsapp', { body: { recipients: [{ name: customerName, phone }], message: msg } }) } catch {}
        }
      }
    }

    const cancelledAppt = appt
    const mode = settings?.gap_closer_mode || 'off'
    const threshold = settings?.gap_closer_threshold_minutes || 30
    const advanceHours = settings?.gap_closer_advance_hours ?? 2

    // Always notify waitlist
    let waitlistResult = 'none'
    if (cancelledAppt) {
      try {
        const { data } = await supabase.functions.invoke('notify-waitlist', {
          body: {
            serviceId:   cancelledAppt.service_id,
            branchId:    cancelledAppt.branch_id ?? null,
            staffId:     cancelledAppt.staff_id  ?? null,
            staffName:   cancelledAppt.staff?.name ?? '',
            slotStart:   cancelledAppt.start_at,
            slotEnd:     cancelledAppt.end_at,
            serviceName: cancelledAppt.services?.name ?? '',
          },
        })
        waitlistResult = data?.notified > 0 ? 'sent' : 'none'
      } catch { waitlistResult = 'none' }
    }

    if (mode === 'off' || !cancelledAppt) return

    // Find reschedule candidates
    const remaining = appointments.filter(a => a.id !== id && a.status === 'confirmed')
    const sameDayStaff = remaining.filter(a =>
      a.staff_id === cancelledAppt.staff_id &&
      isSameDay(new Date(a.start_at), new Date(cancelledAppt.start_at))
    )
    const candidates = findRescheduleCandidates(
      { start: new Date(cancelledAppt.start_at), end: new Date(cancelledAppt.end_at) },
      sameDayStaff,
      threshold
    )

    // Smart timing: check if the gap is too far in the future
    const gapStart = new Date(cancelledAppt.start_at)
    const now = new Date()
    const hoursUntilGap = (gapStart - now) / (1000 * 60 * 60)
    const tooEarly = hoursUntilGap > advanceHours
    const activateAt = tooEarly ? new Date(gapStart.getTime() - advanceHours * 60 * 60 * 1000) : null
    const msUntilActivation = activateAt ? activateAt - now : 0

    const alert = {
      cancelledAppt,
      freedSlot: { start: cancelledAppt.start_at, end: cancelledAppt.end_at },
      step1_waitlist: waitlistResult,
      step2_reschedule: { candidates, offers: {} },
      step3_shared: false,
      waiting: tooEarly,
      activateAt,
    }
    setGapAlert(alert)

    // If too early — schedule activation via setTimeout
    if (tooEarly && candidates.length > 0) {
      const timerId = setTimeout(() => {
        setGapAlert(prev => {
          if (!prev) return prev
          return { ...prev, waiting: false, activateAt: null }
        })
        // Auto mode: send when timer fires
        if (mode === 'auto') {
          candidates.forEach(c => sendRescheduleOffer(c, cancelledAppt))
        }
      }, msUntilActivation)
      // Clean up timer if alert is dismissed
      const origSetGapAlert = setGapAlert
      // Store timer ID on the alert for potential cleanup
      setGapAlert(prev => prev ? { ...prev, _timerId: timerId } : prev)
    }

    // If within window — act now
    if (!tooEarly && mode === 'auto') {
      for (const candidate of candidates) {
        await sendRescheduleOffer(candidate, cancelledAppt)
      }
    }
  }

  async function sendRescheduleOffer(candidate, cancelledAppt) {
    const { appointment, newStart, newEnd } = candidate

    // Insert offer with token
    const { data: offer, error } = await supabase
      .from('reschedule_offers')
      .insert({
        appointment_id: appointment.id,
        customer_id: appointment.customer_id,
        staff_id: cancelledAppt.staff_id,
        offered_start_at: newStart.toISOString(),
        offered_end_at: newEnd.toISOString(),
        original_start_at: appointment.start_at,
        original_end_at: appointment.end_at,
      })
      .select('token')
      .single()

    if (error || !offer) { toast({ message: 'שגיאה ביצירת הצעה', type: 'error' }); return }

    // Send WhatsApp
    const APP_URL = window.location.origin
    const message = `היי ${appointment.profiles?.name || 'לקוח/ה'}! 🙋‍♂️\n` +
      `יש אפשרות להקדים את התור שלך ל-${formatTime(newStart)} (במקום ${formatTime(appointment.start_at)}).\n` +
      `אישור: ${APP_URL}/reschedule/confirm?token=${offer.token}&action=accept\n` +
      `לא מתאים: ${APP_URL}/reschedule/confirm?token=${offer.token}&action=decline`

    await supabase.functions.invoke('send-whatsapp', {
      body: {
        recipients: [{ name: appointment.profiles?.name || '', phone: appointment.profiles?.phone }],
        message,
      },
    })

    // Mark sent
    await supabase.from('reschedule_offers').update({ notification_sent: true }).eq('token', offer.token)

    // Update UI
    setGapAlert(prev => prev ? ({
      ...prev,
      step2_reschedule: {
        ...prev.step2_reschedule,
        offers: { ...prev.step2_reschedule.offers, [appointment.id]: 'sent' }
      }
    }) : prev)
  }

  // Reset invoice state when modal closes
  useEffect(() => {
    if (!selectedAppt) { setInvoiceStep(null); setInvoiceData(null); setInvoiceProducts([]); setShowAddProduct(false) }
  }, [selectedAppt])

  // Pay + auto-generate invoice in one click
  const PAYMENT_LABELS = { cash: 'מזומן', credit: 'כרטיס אשראי', bit: 'ביט', paybox: 'Paybox', transfer: 'העברה בנקאית' }
  async function handlePayAndInvoice(appt, method) {
    setInvoiceStep('paying')
    try {
      // 1. Mark appointment paid
      await supabase.from('appointments')
        .update({ payment_status: 'paid', cash_paid: method === 'cash' })
        .eq('id', appt.id)

      // 2. Calculate VAT — across service + products
      const vatRate = settings?.vat_rate || 18
      const businessType = settings?.business_type || 'osek_morsheh'
      const isPatur = businessType === 'osek_patur'
      const servicePrice = Number(appt.services?.price) || 0
      const productsTotal = invoiceProducts.reduce((s, p) => s + Number(p.unit_price) * Number(p.quantity || 1), 0)
      const price = servicePrice + productsTotal
      const priceBeforeVat = isPatur ? price : Math.round((price / (1 + vatRate / 100)) * 100) / 100
      const vatAmount = isPatur ? 0 : Math.round((price - priceBeforeVat) * 100) / 100

      // 3. Record service income
      await supabase.from('manual_income').insert({
        amount: servicePrice,
        vat_amount: isPatur ? 0 : Math.round((servicePrice - servicePrice / (1 + vatRate / 100)) * 100) / 100,
        description: appt.services?.name || 'תור',
        customer_name: appt.profiles?.name || '',
        staff_id: appt.staff_id,
        service_id: appt.service_id,
        appointment_id: appt.id,
        payment_method: method,
        date: appt.start_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      })

      // 4. Get sequential invoice number
      const { data: invoiceNum, error: numErr } = await supabase.rpc('next_invoice_number')
      if (numErr) throw numErr

      // 5. Save invoice to DB
      const serviceNames = [appt.services?.name, ...invoiceProducts.map(p => p.name)].filter(Boolean).join(' + ')
      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        invoice_number: invoiceNum,
        appointment_id: appt.id,
        customer_name: appt.profiles?.name || '',
        customer_phone: appt.profiles?.phone || '',
        service_name: serviceNames,
        staff_name: appt.staff?.name || '',
        service_date: appt.start_at,
        amount_before_vat: priceBeforeVat,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total_amount: price,
        status: 'paid',
        paid_at: new Date().toISOString(),
        notes: method,
      }).select().single()
      if (invErr) throw invErr

      // 6. Save invoice_items (service + products)
      const items = [
        {
          invoice_id: inv.id,
          kind: 'service',
          service_id: appt.service_id,
          name: appt.services?.name || 'שירות',
          quantity: 1,
          unit_price: servicePrice,
          line_total: servicePrice,
          staff_id: appt.staff_id,
        },
        ...invoiceProducts.map(p => ({
          invoice_id: inv.id,
          kind: 'product',
          product_id: p.product_id,
          name: p.name,
          quantity: Number(p.quantity || 1),
          unit_price: Number(p.unit_price),
          line_total: Number(p.unit_price) * Number(p.quantity || 1),
          staff_id: p.staff_id || appt.staff_id,
        })),
      ]
      const { error: itemsErr } = await supabase.from('invoice_items').insert(items)
      if (itemsErr) console.warn('invoice_items insert failed:', itemsErr)

      setInvoiceData({ ...inv, paymentMethod: method, appointment: appt, items })
      setInvoiceStep('done')
      await refetch()
      toast({ message: 'תשלום נרשם וחשבונית נוצרה ✓', type: 'success' })
    } catch (e) {
      toast({ message: e.message || 'שגיאה', type: 'error' })
      setInvoiceStep(null)
    }
  }

  function doPrintInvoice(appt, inv) {
    printInvoice({
      appointment: appt,
      business: BUSINESS,
      footerText: settings?.invoice_footer_text,
      vatRate: settings?.vat_rate || 18,
      businessType: settings?.business_type || 'osek_morsheh',
      invoiceNumber: inv?.invoice_number,
      businessTaxId: settings?.business_tax_id,
      paymentMethod: inv?.notes,
      invoiceDate: inv?.created_at,
      logoUrl: settings?.logo_url,
      items: inv?.items,
    })
  }

  async function handlePrintExistingInvoice(appt) {
    const { data: inv } = await supabase.from('invoices').select('*').eq('appointment_id', appt.id).maybeSingle()
    let items = undefined
    if (inv?.id) {
      const { data: rows } = await supabase.from('invoice_items').select('*').eq('invoice_id', inv.id).order('created_at', { ascending: true })
      if (rows && rows.length > 0) items = rows
    }
    doPrintInvoice(appt, { ...(inv || {}), items })
  }

  function shareInvoiceWhatsApp(appt, inv, phone) {
    const invoiceUrl = `${window.location.origin}/invoice/${inv?.id}`
    const rawPhone = (phone || '').replace(/\D/g, '')
    const waPhone = rawPhone.startsWith('0') ? '972' + rawPhone.slice(1) : rawPhone
    const msg = encodeURIComponent(
      `שלום ${appt.profiles?.name || ''}! 🧾\n` +
      `חשבונית מס׳ ${inv?.invoice_number} עבור ${appt.services?.name}.\n` +
      `לצפייה בחשבונית: ${invoiceUrl}\n` +
      `תודה על הביקור! 💈`
    )
    window.open(`https://wa.me/${waPhone}?text=${msg}`, '_blank')
  }

  async function handleComplete(id) {
    await supabase.from('appointments').update({ status: 'completed' }).eq('id', id)
    await refetch()
    setSelectedAppt(null)
    toast({ message: 'תור סומן כהושלם ✓', type: 'success' })
  }

  async function handleNoShow(id) {
    if (!confirm('לסמן לקוח כלא הגיע?')) return
    try {
      await markNoShow(id)
      setSelectedAppt(null)
      toast({ message: 'סומן: לא הגיע', type: 'success' })
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    }
  }

  // Customer search for book modal
  async function searchCustomers(q) {
    if (!q || q.length < 2) { setCustomerResults([]); return }
    if (contactsTab === 'contacts') {
      // Search device contacts locally
      const lower = q.toLowerCase()
      const filtered = deviceContacts
        .filter(c => c.name.toLowerCase().includes(lower) || c.phone.includes(q))
        .slice(0, 8)
        .map(c => ({ id: `device:${c.phone}`, name: c.name, phone: c.phone, isDevice: true }))
      setCustomerResults(filtered)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, name, phone')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8)
    setCustomerResults(data ?? [])
  }

  async function syncDeviceContacts() {
    if (!('contacts' in navigator) || !('ContactsManager' in window)) {
      toast({ message: 'הדפדפן שלך לא תומך בגישה לאנשי קשר. נסה ב-Chrome/Safari במובייל.', type: 'error' })
      return
    }
    try {
      const raw = await navigator.contacts.select(['name', 'tel'], { multiple: true })
      const normalized = raw
        .map(c => ({ name: (c.name?.[0] || '').trim(), phone: (c.tel?.[0] || '').trim() }))
        .filter(c => c.name || c.phone)
      setDeviceContacts(normalized)
      setContactsLoaded(true)
      setContactsTab('contacts')
      toast({ message: `נטענו ${normalized.length} אנשי קשר`, type: 'success' })
    } catch {
      toast({ message: 'לא הצלחנו לגשת לאנשי הקשר', type: 'error' })
    }
  }

  async function selectDeviceContact(c) {
    // Try to find existing profile by phone
    const phone = c.phone.replace(/\D/g, '')
    const { data } = await supabase.from('profiles').select('id,name,phone').ilike('phone', `%${phone.slice(-9)}%`).limit(1)
    if (data?.[0]) {
      setBookForm(f => ({ ...f, customerId: data[0].id, customerName: data[0].name, customerPhone: data[0].phone || c.phone, customerSearch: `${data[0].name}${data[0].phone ? ' · ' + data[0].phone : ''}` }))
    } else {
      // New customer — will be created on save
      setBookForm(f => ({ ...f, customerId: 'new', customerName: c.name, customerPhone: c.phone, customerSearch: `${c.name}${c.phone ? ' · ' + c.phone : ''}` }))
    }
    setCustomerResults([])
  }

  // Book appointment for customer
  async function handleBookForCustomer(e) {
    e.preventDefault()
    if (!bookForm.customerId) { toast({ message: 'יש לבחור לקוח', type: 'error' }); return }
    if (!bookForm.serviceId)  { toast({ message: 'יש לבחור שירות', type: 'error' }); return }
    if (!bookForm.staffId)    { toast({ message: 'יש לבחור ספר', type: 'error' }); return }
    if (!bookForm.date || !bookForm.startTime) { toast({ message: 'יש לבחור תאריך ושעה', type: 'error' }); return }

    const svc = services.find(s => s.id === bookForm.serviceId)
    const durationMin = svc?.duration_minutes ?? 30
    const start_at = new Date(`${bookForm.date}T${bookForm.startTime}`).toISOString()
    const end_at   = new Date(new Date(start_at).getTime() + durationMin * 60000).toISOString()

    setSavingBook(true)
    try {
      let customerId = bookForm.customerId

      // If selected from device contacts and not yet in DB — create a profile
      if (customerId === 'new') {
        const { data: newProfile, error: profErr } = await supabase
          .from('profiles')
          .insert({ name: bookForm.customerName, phone: bookForm.customerPhone, role: 'customer' })
          .select('id')
          .single()
        if (profErr) throw profErr
        customerId = newProfile.id
      }

      const { error } = await supabase.from('appointments').insert({
        customer_id: customerId,
        service_id:  bookForm.serviceId,
        staff_id:    bookForm.staffId,
        branch_id:   currentBranch?.id ?? null,
        start_at,
        end_at,
        status: 'confirmed',
        notes: bookForm.notes || null,
      })
      if (error) throw error

      // If this was a manual schedule from the waitlist — mark entry as booked
      if (waitlistPrefillId) {
        supabase.from('waitlist')
          .update({ status: 'booked', token: null })
          .eq('id', waitlistPrefillId)
          .then(() => {})  // fire-and-forget
        setWaitlistPrefillId(null)
      }

      await refetch()
      toast({ message: 'תור נקבע בהצלחה ✓', type: 'success' })
      closeBook()
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setSavingBook(false)
    }
  }

  function handleScheduleFromWaitlist(entry) {
    const svcId  = entry.service_id || ''
    const stfId  = entry.staff_id   || ''
    setWaitlistPrefillId(entry.id)
    setBookWlOrigService(svcId)
    setBookWlOrigStaff(stfId)
    setBookWlLockService(!!svcId)
    setBookWlLockStaff(!!stfId)
    setBookChangeConfirm(null)
    setBookForm({
      customerSearch: entry.profiles?.name
        ? `${entry.profiles.name}${entry.profiles.phone ? ' · ' + entry.profiles.phone : ''}`
        : '',
      customerId:   entry.customer_id || null,
      customerName: entry.profiles?.name  || '',
      customerPhone:entry.profiles?.phone || '',
      serviceId:    svcId,
      staffId:      stfId,
      date:         entry.preferred_date  || format(new Date(), 'yyyy-MM-dd'),
      startTime:    entry.time_from?.slice(0,5) || '',
      notes:        '',
      wlTimeFrom:   entry.time_from?.slice(0,5) || '',
      wlTimeTo:     entry.time_to?.slice(0,5)   || '',
    })
    if (entry.preferred_date) setCurrentDate(new Date(entry.preferred_date + 'T12:00:00'))
    setBookOpen(true)
  }

  function closeBook() {
    setBookOpen(false)
    setCustomerResults([])
    setWaitlistPrefillId(null)
    setBookSlots([])
    setBookSlotsRecommended(new Set())
    setBookShowManualTime(false)
    setBookWlOrigService('')
    setBookWlOrigStaff('')
    setBookWlLockService(false)
    setBookWlLockStaff(false)
    setBookChangeConfirm(null)
    setBookForm({ customerSearch: '', customerId: null, customerName: '', customerPhone: '', serviceId: '', staffId: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '', notes: '', wlTimeFrom: '', wlTimeTo: '' })
  }

  // Open book modal pre-filled from a slot click in DayView
  function handleSlotClick(staffId, minuteOffset, date) {
    const h = START_HOUR + Math.floor(minuteOffset / 60)
    const m = minuteOffset % 60
    const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
    const dateStr = format(date, 'yyyy-MM-dd')
    setBookForm(f => ({ ...f, staffId, date: dateStr, startTime: timeStr }))
    setBookOpen(true)
  }

  // ── Reschedule ────────────────────────────────────────────────────────────────
  function openReschedule(appt) {
    setRescheduleAppt(appt)
    setRescheduleDate(format(new Date(appt.start_at), 'yyyy-MM-dd'))
    setRescheduleStaff(appt.staff_id ?? '')
    setRescheduleSlot(null)
    setRescheduleSlots([])
    setRescheduleRec(new Set())
    setRescheduleOpen(true)
    setSelectedAppt(null)
  }

  useEffect(() => {
    if (!rescheduleOpen || !rescheduleAppt || !rescheduleDate || !rescheduleStaff) {
      setRescheduleSlots([]); setRescheduleRec(new Set()); return
    }
    setRescheduleLoading(true)
    ;(async () => {
      try {
        const date     = new Date(rescheduleDate + 'T12:00:00')
        const dow      = date.getDay()
        const dayStart = startOfDay(date)
        const dayEnd   = endOfDay(date)

        const [{ data: dayAppts }, { data: dayBlocked }] = await Promise.all([
          supabase.from('appointments')
            .select('start_at, end_at, status, id')
            .eq('staff_id', rescheduleStaff)
            .in('status', ['confirmed', 'pending_reschedule'])
            .gte('start_at', dayStart.toISOString())
            .lte('start_at', dayEnd.toISOString()),
          supabase.from('blocked_times')
            .select('start_at, end_at')
            .eq('staff_id', rescheduleStaff)
            .lte('start_at', dayEnd.toISOString())
            .gte('end_at', dayStart.toISOString()),
        ])

        // Exclude the appointment being rescheduled from "busy" slots
        const filteredAppts = (dayAppts ?? []).filter(a => a.id !== rescheduleAppt.id)

        const member   = staff.find(s => s.id === rescheduleStaff)
        const staffDay = member?.staff_hours?.find(h => h.day_of_week === dow)
        const bizDay   = businessHours.find(h => h.day_of_week === dow)
        const svc      = services.find(s => s.id === rescheduleAppt.service_id)
        const duration = svc?.duration_minutes ?? Math.round((new Date(rescheduleAppt.end_at) - new Date(rescheduleAppt.start_at)) / 60000)

        const params = {
          date, durationMinutes: duration,
          staffHours: staffDay, businessHours: bizDay,
          existingAppointments: filteredAppts,
          blockedTimes: dayBlocked ?? [],
          recurringBreaks,
        }

        const allSlots = generateSlots(params)
        const recSlots = generateSlots({ ...params, smartScheduling: { enabled: true, adjacent: true, startOfDay: true, endOfDay: true, freeCount: 0, appointmentCount: filteredAppts.length } })
        const recSet   = new Set(recSlots.map(s => s.start.getTime()))

        const now = new Date()
        const filtered = allSlots.filter(s => date.toDateString() !== now.toDateString() || s.start > now)

        setRescheduleSlots(filtered)
        setRescheduleRec(recSet)
      } finally {
        setRescheduleLoading(false)
      }
    })()
  }, [rescheduleOpen, rescheduleDate, rescheduleStaff, rescheduleAppt])

  async function handleReschedule() {
    if (!rescheduleAppt || !rescheduleSlot) return
    setSavingReschedule(true)
    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          start_at: rescheduleSlot.start.toISOString(),
          end_at:   rescheduleSlot.end.toISOString(),
          staff_id: rescheduleStaff,
        })
        .eq('id', rescheduleAppt.id)
      if (error) throw error
      await refetch()
      toast({ message: 'מועד התור עודכן בהצלחה', type: 'success' })
      setRescheduleOpen(false)
      setRescheduleAppt(null)
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setSavingReschedule(false)
    }
  }

  async function handleSaveEvent(e) {
    e?.preventDefault()
    if (!eventForm.title || !eventForm.staff_ids.length || !eventForm.dates.length || !eventForm.start_time || !eventForm.end_time) {
      toast({ message: 'יש למלא את כל השדות', type: 'error' })
      return
    }
    setSavingEvent(true)
    try {
      // Insert one row per (date × staff) combination
      const rows = []
      for (const date of eventForm.dates) {
        for (const sid of eventForm.staff_ids) {
          rows.push({
            staff_id: sid,
            start_at: new Date(`${date}T${eventForm.start_time}`).toISOString(),
            end_at:   new Date(`${date}T${eventForm.end_time}`).toISOString(),
            reason:   eventForm.title,
          })
        }
      }
      const { error } = await supabase.from('blocked_times').insert(rows)
      if (error) throw error
      const n = rows.length
      toast({ message: n === 1 ? 'שעות נחסמו ביומן' : `נחסמו ${n} שעות ביומן`, type: 'success' })
      setEventForm(EMPTY_EVENT)
      setEventPreset('')
      setEventPickerMode('from')
      setAddEventOpen(false)
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setSavingEvent(false)
    }
  }

  // ── Move request (from DayView drag-end) ────────────────────────────────────
  function handleMoveRequest(appt, newStart, newEnd, newStaffId) {
    setPendingMove({ appt, newStart, newEnd, newStaffId })
  }

  async function confirmMove() {
    if (!pendingMove) return
    setMovingSave(true)
    try {
      const { appt, newStart, newEnd, newStaffId } = pendingMove
      const { error } = await supabase
        .from('appointments')
        .update({
          start_at: newStart.toISOString(),
          end_at: newEnd.toISOString(),
          staff_id: newStaffId,
        })
        .eq('id', appt.id)
      if (error) throw error
      await refetch()
      toast({ message: 'תור הועבר בהצלחה ✓', type: 'success' })
      setPendingMove(null)
      // Prompt WhatsApp notification if customer has phone
      if (appt.profiles?.phone) {
        setWhatsappAfterMove({
          phone: appt.profiles.phone,
          name: appt.profiles.name,
          newStart,
        })
      }
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setMovingSave(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const weekDays = useMemo(() => (
    Array.from({ length: 7 }, (_, i) =>
      addDays(startOfWeek(currentDate, { weekStartsOn: 0 }), i)
    )
  ), [currentDate])

  const pendingMoveStaff = pendingMove
    ? staff.find(s => s.id === pendingMove.newStaffId)
    : null

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>יומן תורים</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Book for customer — primary action */}
          <button
            onClick={() => setBookOpen(true)}
            className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>
            </svg>
            קבע תור ללקוח
          </button>

          <button
            onClick={() => setAddEventOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors"
            style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
          >
            🚫 חסימת שעות
          </button>

          <button
            onClick={() => setSettingsOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm rounded-lg border font-medium transition-colors"
            style={settingsOpen
              ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' }
              : { background: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-muted)' }
            }
          >
            ⚙ הגדרות
          </button>

          {/* View switcher */}
          <div
            className="flex gap-1 p-1 rounded-2xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            {VIEWS.map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={view === v
                  ? { background: 'var(--color-primary)', color: '#fff', boxShadow: '0 2px 8px var(--color-gold-ring)' }
                  : { background: 'transparent', color: 'var(--color-muted)' }
                }
                onMouseEnter={e => { if (view !== v) e.currentTarget.style.color = 'var(--color-text)' }}
                onMouseLeave={e => { if (view !== v) e.currentTarget.style.color = 'var(--color-muted)' }}
              >
                <span>{VIEW_ICONS[v]}</span>
                <span className="hidden sm:inline">{VIEW_LABELS[v]}</span>
              </button>
            ))}
          </div>

          <select
            className="input w-auto py-2.5 text-sm font-medium"
            value={filterStaff}
            onChange={e => setFilterStaff(e.target.value)}
          >
            <option value="">כל הספרים</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* ── Calendar Settings Panel ── */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            key="cal-settings"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-5 mb-4 space-y-5">
              <h2 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>הגדרות יומן</h2>

              {/* Slot size */}
              <div>
                <p className="text-xs font-bold mb-2 tracking-wide uppercase" style={{ color: 'var(--color-muted)' }}>גודל סלוט</p>
                <div
                  className="flex gap-1 p-1 rounded-2xl w-fit"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  {[15, 30, 60].map(m => (
                    <button
                      key={m}
                      onClick={() => setSlotMinutes(m)}
                      className="px-4 py-1.5 rounded-xl text-sm font-semibold transition-all"
                      style={slotMinutes === m
                        ? { background: 'var(--color-primary)', color: '#fff', boxShadow: '0 2px 8px var(--color-gold-ring)' }
                        : { background: 'transparent', color: 'var(--color-muted)' }
                      }
                    >
                      {m}ד׳
                    </button>
                  ))}
                </div>
              </div>

              {/* Hour range */}
              <div>
                <p className="text-xs font-bold mb-2 tracking-wide uppercase" style={{ color: 'var(--color-muted)' }}>שעות תצוגה</p>
                <div className="flex items-center gap-2">
                  <select
                    className="input py-1 text-sm w-20"
                    value={calStartHour}
                    onChange={e => setCalStartHour(Number(e.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 5).map(h => (
                      <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
                    ))}
                  </select>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>—</span>
                  <select
                    className="input py-1 text-sm w-20"
                    value={calEndHour}
                    onChange={e => setCalEndHour(Number(e.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 13).map(h => (
                      <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Columns */}
              <div>
                <p className="text-xs font-bold mb-2 tracking-wide uppercase" style={{ color: 'var(--color-muted)' }}>עמודות תצוגה יומית</p>
                <div
                  className="flex gap-1 p-1 rounded-2xl w-fit"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  {Array.from({ length: Math.min(staff.length || 5, 6) }, (_, i) => i + 1).map(n => (
                    <button
                      key={n}
                      onClick={() => setCalColumns(n)}
                      className="w-9 h-9 rounded-xl text-sm font-semibold transition-all"
                      style={calColumns === n
                        ? { background: 'var(--color-primary)', color: '#fff', boxShadow: '0 2px 8px var(--color-gold-ring)' }
                        : { background: 'transparent', color: 'var(--color-muted)' }
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Service colors */}
              {services.length > 0 && (
                <div className="space-y-3">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>צבע שירות</span>
                  <div className="space-y-2">
                    {services.map(svc => {
                      const currentColor = serviceColors[svc.id] || DEFAULT_COLOR
                      return (
                        <div key={svc.id} className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm w-36 truncate" style={{ color: 'var(--color-muted)' }}>{svc.name}</span>
                          <div className="flex gap-2 flex-wrap items-center">
                            {COLOR_PRESETS.map(color => {
                              const isSelected = currentColor === color
                              return (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => setServiceColor(svc.id, color)}
                                  title={color}
                                  className="w-7 h-7 rounded-full transition-all hover:scale-110 flex items-center justify-center flex-shrink-0"
                                  style={{
                                    backgroundColor: color,
                                    boxShadow: isSelected ? `0 0 0 3px #fff, 0 0 0 5px ${color}` : '0 1px 3px var(--color-shadow-lg)',
                                    transform: isSelected ? 'scale(1.15)' : undefined,
                                  }}
                                >
                                  {isSelected && (
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                          {/* Live preview chip */}
                          <span
                            className="text-xs px-2.5 py-1 rounded-full text-white font-bold flex-shrink-0 transition-all"
                            style={{ backgroundColor: currentColor, boxShadow: `0 2px 8px ${currentColor}55` }}
                          >
                            {svc.name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Business Hours */}
              <div>
                <p className="text-xs font-bold mb-3 tracking-wide uppercase" style={{ color: 'var(--color-muted)' }}>שעות פעילות עסק</p>
                <div className="space-y-2">
                  {hoursForm.map(h => (
                    <div key={h.day_of_week} className="flex items-center gap-3 text-sm">
                      <span className="w-14 font-medium text-right shrink-0" style={{ color: 'var(--color-text)' }}>{dayName(h.day_of_week)}</span>
                      <input
                        type="checkbox"
                        checked={!h.is_closed}
                        onChange={e => updateHour(h.day_of_week, 'is_closed', !e.target.checked)}
                        className="accent-[var(--color-primary)]"
                      />
                      {!h.is_closed ? (
                        <>
                          <input type="time" className="input py-1 text-sm w-24" value={h.open_time || '09:00'} onChange={e => updateHour(h.day_of_week, 'open_time', e.target.value)} />
                          <span style={{ color: 'var(--color-muted)' }}>—</span>
                          <input type="time" className="input py-1 text-sm w-24" value={h.close_time || '19:00'} onChange={e => updateHour(h.day_of_week, 'close_time', e.target.value)} />
                        </>
                      ) : (
                        <span style={{ color: 'var(--color-muted)' }}>סגור</span>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleSaveHours}
                  disabled={savingHours}
                  className="mt-3 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                  style={{ background: 'var(--color-primary)', color: '#fff', opacity: savingHours ? 0.7 : 1 }}
                >
                  {savingHours ? 'שומר…' : 'שמור שעות'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Navigation ── */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 px-4 py-2.5 rounded-xl border font-semibold text-sm transition-colors shadow-sm"
          style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          הקודם
        </button>
        <button
          onClick={() => setCurrentDate(new Date())}
          className="px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
          style={{ background: 'var(--color-gold)', color: '#fff' }}
        >
          היום
        </button>
        <button
          onClick={() => navigate(1)}
          className="flex items-center gap-1 px-4 py-2.5 rounded-xl border font-semibold text-sm transition-colors shadow-sm"
          style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          הבא
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <span className="text-base font-bold" style={{ color: 'var(--color-text)' }}>
          {view === 'day'
            ? format(currentDate, 'EEEE, d בMMMM', { locale: he })
            : `${format(startDate, 'd MMM', { locale: he })} — ${format(endDate, 'd MMM yyyy', { locale: he })}`
          }
        </span>
      </div>

      {/* ── Day-at-a-glance stats ── */}
      {view === 'day' && !loading && (() => {
        const active    = appointments.filter(a => a.status !== 'cancelled')
        const completed = appointments.filter(a => a.status === 'completed').length
        const pending   = appointments.filter(a => a.status === 'pending').length
        const revenue   = appointments
          .filter(a => a.status === 'completed')
          .reduce((s, a) => s + (Number(a.services?.price) || 0), 0)
        return (
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: 'תורים היום', value: active.length,                      color: 'var(--color-gold)' },
              { label: 'הושלמו',     value: completed,                          color: '#22c55e' },
              { label: 'ממתינים',    value: pending,                            color: '#f97316' },
              { label: 'הכנסה',      value: revenue > 0 ? `₪${revenue}` : '—', color: 'var(--color-primary)' },
            ].map(stat => (
              <div key={stat.label} className="card p-3 text-center" style={{ border: '1px solid var(--color-border)' }}>
                <div className="text-xl font-black" style={{ color: stat.color }}>{stat.value}</div>
                <div className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--color-muted)' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── Gap Closer Alert — 3-step progress card ── */}
      {gapAlert && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 mb-4"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-sm flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              ⚡ Gap Closer — מילוי חור ביומן
            </h3>
            <button
              onClick={() => {
                if (gapAlert._timerId) clearTimeout(gapAlert._timerId)
                setGapAlert(null)
              }}
              className="text-xs font-medium px-2 py-1 rounded-lg"
              style={{ color: 'var(--color-muted)' }}
            >
              ✕
            </button>
          </div>

          {/* Waiting indicator */}
          {gapAlert.waiting && gapAlert.activateAt && (
            <div className="text-xs mb-4 px-3 py-2.5 rounded-xl flex items-center gap-2"
              style={{ background: 'var(--color-gold-tint)', border: '1px solid var(--color-gold)', color: 'var(--color-gold)' }}>
              <span>⏰</span>
              <span>
                החור רחוק — הצעות יישלחו בשעה {formatTime(gapAlert.activateAt)} ({Math.round((gapAlert.activateAt - new Date()) / 60000)} דק׳)
              </span>
            </div>
          )}

          {/* Cancelled slot info */}
          <div className="text-xs mb-4 px-3 py-2 rounded-xl" style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}>
            תור שבוטל: {gapAlert.cancelledAppt?.services?.name || 'שירות'} — {formatTime(gapAlert.freedSlot.start)}
            {gapAlert.cancelledAppt?.staff?.name && ` (${gapAlert.cancelledAppt.staff.name})`}
          </div>

          {/* Step 1: Waitlist */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--color-gold)', color: '#fff' }}>1</div>
            <span className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>רשימת המתנה</span>
            <span className="text-xs" style={{ color: gapAlert.step1_waitlist === 'sent' ? '#22c55e' : 'var(--color-muted)' }}>
              {gapAlert.step1_waitlist === 'sent' ? '— הודעה נשלחה ✓' :
               gapAlert.step1_waitlist === 'none' ? '— אין ממתינים' :
               '— שולח...'}
            </span>
          </div>

          {/* Step 2: Reschedule */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--color-gold)', color: '#fff' }}>2</div>
            <span className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>הקדמת תורים</span>
          </div>
          <div className="mr-9 mb-3">
            {gapAlert.step2_reschedule.candidates.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>אין תורים מתאימים להקדמה</p>
            ) : (
              <div className="flex flex-col gap-2">
                {gapAlert.step2_reschedule.candidates.map(({ appointment, newStart, timeSaved }) => {
                  const offerStatus = gapAlert.step2_reschedule.offers[appointment.id]
                  return (
                    <div key={appointment.id} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs"
                      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                      <div style={{ color: 'var(--color-text)' }}>
                        <span className="font-medium">{appointment.profiles?.name || 'לקוח'}</span>
                        <span className="mx-1" style={{ color: 'var(--color-muted)' }}>—</span>
                        <span style={{ color: 'var(--color-muted)' }}>{formatTime(appointment.start_at)} → {formatTime(newStart)}</span>
                        <span className="mx-1 text-[10px]" style={{ color: 'var(--color-gold)' }}>({timeSaved} דק׳ מוקדם)</span>
                      </div>
                      {offerStatus === 'accepted' ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ color: '#22c55e' }}>אושר ✓</span>
                      ) : offerStatus === 'declined' ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ color: '#ef4444' }}>נדחה ✕</span>
                      ) : offerStatus === 'sent' ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ color: 'var(--color-gold)' }}>נשלח ⏳</span>
                      ) : gapAlert.waiting ? (
                        <span className="text-[10px] px-2 py-1 rounded-lg" style={{ color: 'var(--color-muted)' }}>ממתין ⏰</span>
                      ) : (
                        <button
                          onClick={() => sendRescheduleOffer({ appointment, newStart, newEnd: new Date(newStart.getTime() + (new Date(appointment.end_at) - new Date(appointment.start_at))), timeSaved }, gapAlert.cancelledAppt)}
                          className="px-3 py-1 rounded-lg text-[10px] font-bold text-white transition-all"
                          style={{ background: 'var(--color-gold)' }}
                        >
                          שלח הצעה
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Step 3: WhatsApp Share */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--color-gold)', color: '#fff' }}>3</div>
            <span className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>שיתוף בוואטסאפ</span>
          </div>
          <div className="mr-9">
            {gapAlert.step3_shared ? (
              <p className="text-xs" style={{ color: '#22c55e' }}>שותף ✓</p>
            ) : (
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `🔥 תור פנוי!\n` +
                  `${gapAlert.cancelledAppt?.services?.name || 'שירות'} ביום ${dayName(new Date(gapAlert.freedSlot.start).getDay())} בשעה ${formatTime(gapAlert.freedSlot.start)}\n` +
                  `${gapAlert.cancelledAppt?.staff?.name ? `אצל ${gapAlert.cancelledAppt.staff.name}\n` : ''}` +
                  `לקביעת תור: ${window.location.origin}/book/all`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setGapAlert(prev => prev ? ({ ...prev, step3_shared: true }) : prev)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all"
                style={{ background: '#25D366' }}
              >
                📲 שתף בקבוצת וואטסאפ
              </a>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Calendar Content ── */}
      {loading ? (
        <AdminSkeleton />
      ) : view === 'list' ? (
        <ListViewAppointments appointments={appointments} onSelect={setSelectedAppt} staff={staff} />
      ) : view === 'day' ? (
        <DayView
          date={currentDate}
          appointments={appointments.filter(a => isSameDay(new Date(a.start_at), currentDate))}
          staffColumns={staffColumns}
          slotMinutes={slotMinutes}
          startHour={calStartHour}
          endHour={calEndHour}
          serviceColors={serviceColors}
          onSelect={setSelectedAppt}
          onMoveRequest={handleMoveRequest}
          onSlotClick={handleSlotClick}
          recurringBreaks={recurringBreaks}
          blockedTimes={allBlockedTimes.filter(bt => isSameDay(new Date(bt.start_at), currentDate))}
        />
      ) : (
        <WeekView
          days={weekDays}
          appointments={appointments}
          serviceColors={serviceColors}
          onSelect={setSelectedAppt}
          recurringBreaks={recurringBreaks}
          blockedTimes={allBlockedTimes}
          startHour={calStartHour}
          endHour={calEndHour}
          waitlistByDate={waitlistByDate}
          onScheduleWaitlist={handleScheduleFromWaitlist}
          onReschedule={openReschedule}
        />
      )}

      {/* ── Appointment detail modal ── */}
      <Modal open={!!selectedAppt} onClose={() => setSelectedAppt(null)} title="פרטי תור">
        {selectedAppt && (
          <div className="space-y-4">
            {apptDebtTotal > 0 && (
              <div className="text-center text-sm py-1.5 rounded-xl font-bold" style={{ background: 'var(--color-danger-tint)', color: '#dc2626', border: '1.5px solid var(--color-danger-ring)' }}>
                ⚠️ חוב: ₪{apptDebtTotal}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'לקוח', value: selectedAppt.profiles?.name },
                { label: 'טלפון', value: selectedAppt.profiles?.phone },
                { label: 'שירות', value: selectedAppt.services?.name },
                { label: 'ספר', value: selectedAppt.staff?.name },
                { label: 'תאריך', value: formatDate(selectedAppt.start_at) },
                { label: 'שעה', value: `${formatTime(selectedAppt.start_at)} — ${formatTime(selectedAppt.end_at)}` },
                { label: 'מחיר', value: selectedAppt.services?.price ? `₪${selectedAppt.services.price}` : '-' },
                { label: 'סטטוס', value: <StatusBadge status={selectedAppt.status} /> },
              ].map(row => (
                <div key={row.label}>
                  <span className="text-muted">{row.label}: </span>
                  <span className="font-medium">{row.value}</span>
                </div>
              ))}
            </div>
            {selectedAppt.notes && (
              <p className="text-sm rounded-lg p-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <span className="text-muted">הערות: </span>{selectedAppt.notes}
              </p>
            )}

            {/* Quick actions: phone + WhatsApp */}
            {selectedAppt.profiles?.phone && (() => {
              const rawPhone = selectedAppt.profiles.phone.replace(/\D/g, '')
              const waPhone = rawPhone.startsWith('0') ? '972' + rawPhone.slice(1) : rawPhone
              const apptDate = formatDate(selectedAppt.start_at)
              const apptTime = formatTime(selectedAppt.start_at)
              const svcName = selectedAppt.services?.name ?? ''
              const msg = encodeURIComponent(
                `שלום ${selectedAppt.profiles?.name ?? ''}, רצינו להזכיר לך את התור שלך ל${svcName} בתאריך ${apptDate} בשעה ${apptTime}. נתראה! 💈`
              )
              return (
                <div className="flex gap-2">
                  <a
                    href={`tel:${selectedAppt.profiles.phone}`}
                    className="flex items-center justify-center gap-2 flex-1 py-2.5 px-3 rounded-xl font-semibold text-sm transition-colors"
                    style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                    </svg>
                    התקשר
                  </a>
                  <a
                    href={`https://wa.me/${waPhone}?text=${msg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 flex-1 py-2.5 px-3 rounded-xl font-semibold text-sm transition-colors"
                    style={{ background: '#25D366', color: '#fff' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                  </a>
                </div>
              )
            })()}

            {/* Reschedule button — always shown for non-cancelled */}
            {selectedAppt.status !== 'cancelled' && (
              <button
                onClick={() => openReschedule(selectedAppt)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all"
                style={{ background: 'var(--color-gold-tint)', color: 'var(--color-gold)', border: '1.5px solid var(--color-gold-ring)' }}
              >
                📅 שנה מועד התור
              </button>
            )}

            {/* ── Payment + Invoice Panel ── */}
            {(() => {
              const isPaid = selectedAppt.payment_status === 'paid' || selectedAppt.cash_paid

              // Invoice just created — show success + actions
              if (invoiceStep === 'done' && invoiceData) {
                return (
                  <div className="space-y-2">
                    <div className="text-center text-sm py-2 rounded-xl font-bold" style={{ background: 'var(--color-success-tint)', color: '#16a34a', border: '1.5px solid var(--color-success-ring)' }}>
                      ✅ שולם ב{PAYMENT_LABELS[invoiceData.paymentMethod] || invoiceData.paymentMethod} · חשבונית {invoiceData.invoice_number}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => doPrintInvoice(invoiceData.appointment, invoiceData)}
                        className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                        style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}
                      >
                        🖨 הדפס חשבונית
                      </button>
                      {selectedAppt.profiles?.phone && (
                        <button
                          onClick={() => shareInvoiceWhatsApp(invoiceData.appointment, invoiceData, selectedAppt.profiles.phone)}
                          className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center"
                          style={{ background: '#25D366', color: '#fff' }}
                        >
                          📱 שלח ללקוח
                        </button>
                      )}
                    </div>
                  </div>
                )
              }

              // Processing payment
              if (invoiceStep === 'paying') {
                return (
                  <div className="flex items-center justify-center gap-2 py-3 text-sm" style={{ color: 'var(--color-muted)' }}>
                    <Spinner size="sm" /> רושם תשלום ומפיק חשבונית...
                  </div>
                )
              }

              // Already paid — show badge + print button
              if (isPaid) {
                return (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 text-center text-sm py-2 rounded-xl font-bold" style={{ background: 'var(--color-success-tint)', color: '#16a34a', border: '1.5px solid var(--color-success-ring)' }}>
                      ✅ שולם
                    </div>
                    <button
                      onClick={() => handlePrintExistingInvoice(selectedAppt)}
                      className="py-2 px-3 rounded-xl font-bold text-sm"
                      style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}
                    >
                      🖨 חשבונית
                    </button>
                  </div>
                )
              }

              // Not paid — show payment methods (+ optional products on invoice)
              const servicePrice = Number(selectedAppt.services?.price) || 0
              const productsTotal = invoiceProducts.reduce((s, p) => s + Number(p.unit_price) * Number(p.quantity || 1), 0)
              const invoiceTotal = servicePrice + productsTotal
              return (
                <div className="space-y-3">
                  {/* Invoice line items preview */}
                  <div className="rounded-xl p-3 text-xs" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold" style={{ color: 'var(--color-text)' }}>פרטי חשבונית</span>
                      <span className="font-black" style={{ color: 'var(--color-gold)' }}>סה"כ ₪{invoiceTotal.toLocaleString('he-IL')}</span>
                    </div>
                    <div className="flex items-center justify-between py-1" style={{ color: 'var(--color-muted)' }}>
                      <span>{selectedAppt.services?.name || 'שירות'}</span>
                      <span>₪{servicePrice.toLocaleString('he-IL')}</span>
                    </div>
                    {invoiceProducts.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between py-1 gap-2" style={{ color: 'var(--color-muted)' }}>
                        <span className="flex-1 truncate">📦 {p.name} × {p.quantity}</span>
                        <span>₪{(Number(p.unit_price) * Number(p.quantity || 1)).toLocaleString('he-IL')}</span>
                        <button
                          onClick={() => setInvoiceProducts(prev => prev.filter((_, i) => i !== idx))}
                          className="text-red-500 hover:text-red-700 px-1"
                          title="הסר"
                        >✕</button>
                      </div>
                    ))}

                    {showAddProduct ? (
                      <div className="mt-2 pt-2 space-y-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                        <select
                          className="input-field w-full text-xs"
                          defaultValue=""
                          onChange={e => {
                            const p = products.find(x => x.id === e.target.value)
                            if (!p) return
                            setInvoiceProducts(prev => [...prev, {
                              product_id: p.id,
                              name: p.name,
                              unit_price: Number(p.price) || 0,
                              quantity: 1,
                              staff_id: selectedAppt.staff_id,
                            }])
                            setShowAddProduct(false)
                          }}
                        >
                          <option value="" disabled>בחר מוצר...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} — ₪{p.price}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => setShowAddProduct(false)}
                          className="w-full py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: 'var(--color-card)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
                        >ביטול</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddProduct(true)}
                        className="w-full mt-2 py-1.5 rounded-lg text-xs font-bold transition-all"
                        style={{ background: 'var(--color-success-tint)', color: '#16a34a', border: '1px dashed var(--color-success-ring)' }}
                      >
                        ➕ הוסף מוצר לחשבונית
                      </button>
                    )}
                  </div>

                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>בחר אמצעי תשלום להפקת חשבונית:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'cash',     icon: '💵', label: 'מזומן' },
                      { key: 'credit',   icon: '💳', label: 'אשראי' },
                      { key: 'bit',      icon: '📱', label: 'ביט' },
                      { key: 'paybox',   icon: '📦', label: 'Paybox' },
                      { key: 'transfer', icon: '🏦', label: 'העברה' },
                    ].map(({ key, icon, label }) => (
                      <motion.button
                        key={key}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => handlePayAndInvoice(selectedAppt, key)}
                        className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all"
                        style={{ background: 'var(--color-success-tint)', color: '#16a34a', border: '1.5px solid var(--color-success-ring)' }}
                      >
                        {icon} {label}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )
            })()}

            {!(invoiceStep === 'done' || selectedAppt.payment_status === 'paid' || selectedAppt.cash_paid) && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setDebtForm({
                    amount: selectedAppt.services?.price || '',
                    description: 'אי הגעה לתור',
                  })
                  setDebtModal(true)
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all"
                style={{ background: 'var(--color-warning-tint)', color: '#d97706', border: '1.5px solid var(--color-warning-ring)' }}
              >
                💳 הוסף חוב
              </motion.button>
            )}

            {selectedAppt.status === 'confirmed' && !(invoiceStep === 'done' || selectedAppt.payment_status === 'paid' || selectedAppt.cash_paid) && (
              <div className="flex gap-2 pt-1 flex-wrap">
                <button
                  onClick={() => handleNoShow(selectedAppt.id)}
                  className="flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-colors"
                  style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-muted)' }}
                >
                  👻 לא הגיע
                </button>
                <button
                  onClick={() => handleCancel(selectedAppt.id)}
                  className="flex-1 py-2 px-3 bg-red-50 text-red-600 rounded-lg font-medium text-sm hover:bg-red-100 transition-colors"
                >
                  ✕ בטל
                </button>
              </div>
            )}
            {selectedAppt.no_show && (
              <div className="text-center text-sm py-1 rounded-lg" style={{ background: '#fff3cd', color: '#856404' }}>
                ⚠️ לקוח זה סומן כ&quot;לא הגיע&quot;
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Debt Modal ── */}
      <Modal open={debtModal} onClose={() => setDebtModal(false)} title="💳 הוספת חוב">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>סכום (₪)</label>
            <input
              type="number"
              min="0"
              value={debtForm.amount}
              onChange={e => setDebtForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>תיאור</label>
            <input
              type="text"
              value={debtForm.description}
              onChange={e => setDebtForm(f => ({ ...f, description: e.target.value }))}
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}
              placeholder="תספורת לא שולמה"
            />
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={async () => {
              if (!debtForm.amount || Number(debtForm.amount) <= 0) return
              try {
                await createDebt({
                  customer_id: selectedAppt.customer_id,
                  appointment_id: selectedAppt.id,
                  amount: Number(debtForm.amount),
                  description: debtForm.description,
                })
                setDebtModal(false)
                setPendingBlockCustomerId(selectedAppt.customer_id)
                setBlockConfirmOpen(true)
              } catch (e) {
                toast({ message: e.message || 'שגיאה', type: 'error' })
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm"
            style={{ background: 'var(--color-warning-tint)', color: '#d97706', border: '1.5px solid var(--color-warning-ring)' }}
          >
            שמור חוב
          </motion.button>
        </div>
      </Modal>

      {/* ── Block Confirm Modal ── */}
      <Modal open={blockConfirmOpen} onClose={() => { setBlockConfirmOpen(false); toast({ message: 'חוב נשמר ✓', type: 'success' }) }} title="🚫 חסימת לקוח">
        <div className="space-y-4 text-center">
          <p className="text-sm" style={{ color: 'var(--color-text)' }}>האם לחסום את הלקוח מהזמנות עד לתשלום החוב?</p>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                if (pendingBlockCustomerId) {
                  await supabase.from('profiles').update({ is_blocked: true }).eq('id', pendingBlockCustomerId)
                }
                setBlockConfirmOpen(false)
                setPendingBlockCustomerId(null)
                toast({ message: 'חוב נשמר + לקוח נחסם ✓', type: 'success' })
              }}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{ background: 'var(--color-danger-tint)', color: '#dc2626', border: '1px solid var(--color-danger-ring)' }}
            >
              כן, חסום
            </button>
            <button
              onClick={() => {
                setBlockConfirmOpen(false)
                setPendingBlockCustomerId(null)
                toast({ message: 'חוב נשמר ✓', type: 'success' })
              }}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
            >
              לא, רק חוב
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Cancel Notification Modal ── */}
      <Modal open={cancelModal.open} onClose={() => setCancelModal(m => ({ ...m, open: false }))} title="ביטול תור">
        {cancelModal.appt && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>
              ביטול התור של <strong>{cancelModal.appt.profiles?.name || 'לקוח'}</strong><br />
              <span style={{ color: 'var(--color-muted)' }}>{cancelModal.appt.services?.name} · {formatDate(cancelModal.appt.start_at)} {formatTime(cancelModal.appt.start_at)}</span>
            </p>
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>שלח התראה ללקוח?</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'push', label: '🔔 Push' },
                  { key: 'whatsapp', label: '📱 WhatsApp' },
                  { key: 'both', label: '📣 שניהם' },
                  { key: 'none', label: '🚫 ללא' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setCancelModal(m => ({ ...m, notify: opt.key }))}
                    className="py-2 rounded-xl text-xs font-bold transition-all"
                    style={{
                      background: cancelModal.notify === opt.key ? 'var(--color-gold)' : 'var(--color-surface)',
                      color: cancelModal.notify === opt.key ? '#000' : 'var(--color-text)',
                      border: `1.5px solid ${cancelModal.notify === opt.key ? 'var(--color-gold)' : 'var(--color-border)'}`,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={confirmCancel}
              className="w-full py-2.5 rounded-xl font-bold text-sm text-white"
              style={{ background: '#dc2626' }}
            >
              בטל תור
            </button>
          </div>
        )}
      </Modal>

      {/* ── Reschedule Bottom Sheet ── */}
      <AnimatePresence>
        {rescheduleOpen && rescheduleAppt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
            style={{ background: 'var(--color-overlay-md)', backdropFilter: 'blur(2px)' }}
            onClick={e => e.target === e.currentTarget && setRescheduleOpen(false)}
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col"
              style={{ background: 'var(--color-card)', maxHeight: 'calc(100dvh - 100px - env(safe-area-inset-bottom, 0px))', marginBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))', border: '1px solid var(--color-border)', boxShadow: '0 -8px 40px var(--color-shadow-lg)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 sm:hidden flex-shrink-0">
                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-border)' }} />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <h2 className="text-base font-black" style={{ color: 'var(--color-text)' }}>📅 שנה מועד התור</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                    {rescheduleAppt.profiles?.name} · {rescheduleAppt.services?.name}
                  </p>
                </div>
                <button onClick={() => setRescheduleOpen(false)}
                  className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-lg"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}>×</button>
              </div>

              {/* Current appointment info */}
              <div className="mx-5 mt-4 px-4 py-3 rounded-xl text-sm flex items-center gap-3"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <span className="text-lg">🕐</span>
                <div>
                  <p className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>מועד נוכחי</p>
                  <p className="font-bold" style={{ color: 'var(--color-text)' }}>
                    {formatDate(rescheduleAppt.start_at)} · {formatTime(rescheduleAppt.start_at)}–{formatTime(rescheduleAppt.end_at)}
                  </p>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 p-5 space-y-5">

                {/* Staff chips */}
                <div>
                  <p className="text-xs font-bold mb-2.5" style={{ color: 'var(--color-muted)' }}>ספר</p>
                  <div className="flex flex-wrap gap-2">
                    {staff.map(s => {
                      const active = rescheduleStaff === s.id
                      return (
                        <button key={s.id} type="button"
                          onClick={() => { setRescheduleStaff(s.id); setRescheduleSlot(null) }}
                          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition-all"
                          style={{
                            background: active ? 'var(--color-gold)' : 'var(--color-surface)',
                            color:      active ? '#fff'              : 'var(--color-text)',
                            border:     `1.5px solid ${active ? 'var(--color-gold)' : 'var(--color-border)'}`,
                            boxShadow:  active ? '0 2px 10px var(--color-gold-ring)' : 'none',
                          }}>
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0"
                            style={{ background: active ? 'var(--color-white-25)' : 'var(--color-gold)', color: '#fff' }}>
                            {s.name[0]}
                          </span>
                          {s.name}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Date scroll */}
                <div>
                  <p className="text-xs font-bold mb-2.5" style={{ color: 'var(--color-muted)' }}>תאריך חדש</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                    {Array.from({ length: 30 }, (_, i) => addDays(new Date(), i)).map(d => {
                      const val    = format(d, 'yyyy-MM-dd')
                      const active = rescheduleDate === val
                      return (
                        <button key={val} type="button"
                          onClick={() => { setRescheduleDate(val); setRescheduleSlot(null) }}
                          className="flex-shrink-0 flex flex-col items-center rounded-2xl px-3 py-2 transition-all"
                          style={{
                            background: active ? 'var(--color-gold)' : 'var(--color-surface)',
                            color:      active ? '#fff'              : 'var(--color-text)',
                            border:     `1.5px solid ${active ? 'var(--color-gold)' : 'var(--color-border)'}`,
                            minWidth:   '52px',
                          }}>
                          <span className="text-[10px] font-bold opacity-80">{dayName(d.getDay())}</span>
                          <span className="text-sm font-black">{format(d, 'd')}</span>
                          <span className="text-[10px] opacity-70">{format(d, 'M/yy')}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Slot grid */}
                {rescheduleDate && rescheduleStaff && (
                  <div>
                    <p className="text-xs font-bold mb-2.5" style={{ color: 'var(--color-muted)' }}>
                      שעה פנויה
                      {rescheduleRec.size > 0 && <span className="mr-1.5 font-normal">· ⭐ = מומלץ</span>}
                    </p>
                    {rescheduleLoading ? (
                      <div className="flex justify-center py-6"><Spinner size="sm" /></div>
                    ) : rescheduleSlots.length === 0 ? (
                      <p className="text-sm text-center py-4" style={{ color: 'var(--color-muted)' }}>אין שעות פנויות ביום זה</p>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5">
                        {rescheduleSlots.map(slot => {
                          const timeStr  = `${String(slot.start.getHours()).padStart(2,'0')}:${String(slot.start.getMinutes()).padStart(2,'0')}`
                          const isRec    = rescheduleRec.has(slot.start.getTime())
                          const isActive = rescheduleSlot?.start.getTime() === slot.start.getTime()
                          return (
                            <button key={timeStr} type="button"
                              onClick={() => setRescheduleSlot(slot)}
                              className="py-2 rounded-xl text-xs font-bold transition-all"
                              style={{
                                background: isActive  ? 'var(--color-gold)'             : isRec ? 'var(--color-gold-tint)' : 'var(--color-surface)',
                                color:      isActive  ? '#fff'                           : isRec ? 'var(--color-gold)'   : 'var(--color-text)',
                                border:     `1.5px solid ${isActive ? 'var(--color-gold)' : isRec ? 'var(--color-gold-ring)' : 'var(--color-border)'}`,
                                boxShadow:  isActive  ? '0 2px 8px var(--color-gold-ring)' : 'none',
                              }}>
                              {isRec && !isActive && <span className="mr-0.5">⭐</span>}{timeStr}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
                {rescheduleSlot && (
                  <p className="text-xs text-center mb-2 font-medium" style={{ color: 'var(--color-muted)' }}>
                    {formatDate(rescheduleSlot.start.toISOString())} ·{' '}
                    {String(rescheduleSlot.start.getHours()).padStart(2,'0')}:{String(rescheduleSlot.start.getMinutes()).padStart(2,'0')}
                    {' '}→{' '}
                    {String(rescheduleSlot.end.getHours()).padStart(2,'0')}:{String(rescheduleSlot.end.getMinutes()).padStart(2,'0')}
                  </p>
                )}
                <button type="button" onClick={handleReschedule}
                  disabled={savingReschedule || !rescheduleSlot}
                  className="btn-primary w-full justify-center py-3 text-sm font-bold disabled:opacity-40">
                  {savingReschedule
                    ? <Spinner size="sm" className="border-white border-t-transparent" />
                    : rescheduleSlot ? '✓ עדכן מועד' : 'בחר שעה לעדכון'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Block Hours — Bottom Sheet ── */}
      <AnimatePresence>
        {addEventOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
            style={{ background: 'var(--color-overlay-md)', backdropFilter: 'blur(2px)' }}
            onClick={e => { if (e.target === e.currentTarget) { setAddEventOpen(false); setEventForm(EMPTY_EVENT); setEventPreset(''); setEventPickerMode('from') } }}
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0,  opacity: 1 }}
              exit={{    y: 80, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col"
              style={{
                background:  'var(--color-card)',
                maxHeight:   'calc(100dvh - 100px - env(safe-area-inset-bottom, 0px))',
                marginBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
                border:      '1px solid var(--color-border)',
                boxShadow:   '0 -8px 40px var(--color-shadow-lg)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-0 sm:hidden flex-shrink-0">
                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-border)' }} />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
                <h2 className="text-base font-black" style={{ color: 'var(--color-text)' }}>🚫 חסימת שעות</h2>
                <button
                  onClick={() => { setAddEventOpen(false); setEventForm(EMPTY_EVENT); setEventPreset(''); setEventPickerMode('from') }}
                  className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-lg transition-all"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}
                >×</button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 p-5 space-y-5">

                {/* Preset chips */}
                <div>
                  <p className="text-xs font-bold mb-2.5" style={{ color: 'var(--color-muted)' }}>סוג האירוע</p>
                  <div className="flex flex-wrap gap-2">
                    {BLOCK_PRESETS.map(p => {
                      const active = eventPreset === p.label
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => {
                            setEventPreset(p.label)
                            if (p.label !== 'אחר') setEventForm(f => ({ ...f, title: p.label }))
                            else setEventForm(f => ({ ...f, title: '' }))
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition-all"
                          style={{
                            background: active ? 'var(--color-gold)' : 'var(--color-surface)',
                            color:      active ? '#fff'              : 'var(--color-text)',
                            border:     `1.5px solid ${active ? 'var(--color-gold)' : 'var(--color-border)'}`,
                          }}
                        >
                          <span>{p.emoji}</span>
                          <span>{p.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  {/* Custom title input — shown when "אחר" selected, or no preset chosen */}
                  {(eventPreset === 'אחר' || !eventPreset) && (
                    <input
                      className="input mt-3"
                      placeholder={eventPreset === 'אחר' ? 'תיאור חופשי...' : 'תיאור חופשי (או בחר סוג למעלה)...'}
                      value={eventForm.title}
                      onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                      autoFocus={eventPreset === 'אחר'}
                    />
                  )}
                </div>

                {/* Staff chips — multi-select */}
                <div>
                  <p className="text-xs font-bold mb-2.5" style={{ color: 'var(--color-muted)' }}>
                    ספרים
                    {eventForm.staff_ids.length > 0 && (
                      <span className="mr-1.5 font-normal" style={{ color: 'var(--color-gold)' }}>
                        ({eventForm.staff_ids.length} נבחרו)
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {staff.map(s => {
                      const active = eventForm.staff_ids.includes(s.id)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setEventForm(f => ({
                            ...f,
                            staff_ids: active
                              ? f.staff_ids.filter(id => id !== s.id)
                              : [...f.staff_ids, s.id],
                          }))}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition-all"
                          style={{
                            background: active ? 'var(--color-gold)' : 'var(--color-surface)',
                            color:      active ? '#fff'              : 'var(--color-text)',
                            border:     `1.5px solid ${active ? 'var(--color-gold)' : 'var(--color-border)'}`,
                          }}
                        >
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
                            style={{ background: 'var(--color-white-25)', color: active ? '#fff' : 'var(--color-gold)', border: active ? 'none' : '1px solid var(--color-gold)' }}
                          >{s.name?.[0]}</span>
                          <span>{s.name}</span>
                          {active && <span className="text-[10px]">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Dates — horizontal scroll (30 days), multi-select */}
                <div>
                  <p className="text-xs font-bold mb-2.5" style={{ color: 'var(--color-muted)' }}>
                    תאריכים
                    {eventForm.dates.length > 0 && (
                      <span className="mr-1.5 font-normal" style={{ color: 'var(--color-gold)' }}>
                        ({eventForm.dates.length} נבחרו)
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                    {Array.from({ length: 30 }, (_, i) => {
                      const d      = addDays(new Date(), i)
                      const val    = format(d, 'yyyy-MM-dd')
                      const active = eventForm.dates.includes(val)
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setEventForm(f => ({
                            ...f,
                            dates: active
                              ? f.dates.filter(dv => dv !== val)
                              : [...f.dates, val],
                          }))}
                          className="flex-shrink-0 flex flex-col items-center rounded-2xl px-3 py-2 transition-all relative"
                          style={{
                            background: active ? 'var(--color-gold)' : 'var(--color-surface)',
                            color:      active ? '#fff'              : 'var(--color-text)',
                            border:     `1.5px solid ${active ? 'var(--color-gold)' : 'var(--color-border)'}`,
                            minWidth:   '52px',
                          }}
                        >
                          {active && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-[9px] font-black flex items-center justify-center" style={{ color: 'var(--color-gold)', border: '1.5px solid var(--color-gold)' }}>✓</span>
                          )}
                          <span className="text-[10px] font-bold opacity-80">{dayName(d.getDay())}</span>
                          <span className="text-sm font-black">{format(d, 'd')}</span>
                          <span className="text-[10px] opacity-70">{format(d, 'M/yy')}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Time picker — FROM/TO tab + grid (same pattern as waitlist) */}
                <div>
                  <p className="text-xs font-bold mb-2.5" style={{ color: 'var(--color-muted)' }}>שעות חסימה</p>

                  {/* FROM / TO tab buttons */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { key: 'from', label: 'התחלה', value: eventForm.start_time || '--:--' },
                      { key: 'to',   label: 'סיום',   value: eventForm.end_time   || '--:--' },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setEventPickerMode(tab.key)}
                        className="flex flex-col items-center py-3 rounded-2xl transition-all"
                        style={{
                          background:  eventPickerMode === tab.key ? 'var(--color-gold)'              : 'var(--color-surface)',
                          color:       eventPickerMode === tab.key ? '#fff'                            : 'var(--color-text)',
                          border:      `2px solid ${eventPickerMode === tab.key ? 'var(--color-gold)' : 'var(--color-border)'}`,
                          boxShadow:   eventPickerMode === tab.key ? '0 2px 12px var(--color-gold-ring)'  : 'none',
                        }}
                      >
                        <span className="text-[10px] font-semibold mb-0.5" style={{ opacity: 0.8 }}>{tab.label}</span>
                        <span className="text-xl font-black tracking-tight">{tab.value}</span>
                      </button>
                    ))}
                  </div>

                  {/* Time grid */}
                  <div
                    className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto rounded-2xl p-2"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    {BLOCK_TIME_OPTIONS.map(t => {
                      const isFrom   = t === eventForm.start_time
                      const isTo     = t === eventForm.end_time
                      const inRange  = eventForm.start_time && eventForm.end_time && t > eventForm.start_time && t < eventForm.end_time
                      const isActive = eventPickerMode === 'from' ? isFrom : isTo
                      const disabled = eventPickerMode === 'to' && eventForm.start_time && t <= eventForm.start_time
                      return (
                        <button
                          key={t}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            if (eventPickerMode === 'from') {
                              setEventForm(f => {
                                const newF = { ...f, start_time: t }
                                // push end_time forward if now invalid
                                if (f.end_time && f.end_time <= t) {
                                  const idx  = BLOCK_TIME_OPTIONS.indexOf(t)
                                  newF.end_time = BLOCK_TIME_OPTIONS[idx + 1] ?? ''
                                }
                                return newF
                              })
                              setEventPickerMode('to')
                            } else {
                              setEventForm(f => ({ ...f, end_time: t }))
                            }
                          }}
                          className="py-1.5 text-xs font-bold rounded-xl transition-all"
                          style={{
                            background: isActive ? 'var(--color-gold)'          : inRange ? 'var(--color-gold-tint)' : 'transparent',
                            color:      isActive ? '#fff'                        : inRange ? 'var(--color-gold)'    : disabled ? 'var(--color-border)' : 'var(--color-text)',
                            border:     `1px solid ${isActive ? 'var(--color-gold)' : inRange ? 'var(--color-gold-ring)' : 'transparent'}`,
                            opacity:    disabled ? 0.35 : 1,
                            cursor:     disabled ? 'not-allowed' : 'pointer',
                          }}
                        >{t}</button>
                      )
                    })}
                  </div>

                  {/* Duration quick chips */}
                  <div className="flex gap-2 flex-wrap mt-3">
                    <span className="text-[10px] font-bold self-center" style={{ color: 'var(--color-muted)' }}>משך מהיר:</span>
                    {DURATION_PRESETS.map(dp => (
                      <button
                        key={dp.label}
                        type="button"
                        onClick={() => {
                          if (dp.minutes === null) {
                            setEventForm(f => ({ ...f, start_time: '07:00', end_time: '20:00' }))
                          } else if (eventForm.start_time) {
                            const [h, m]    = eventForm.start_time.split(':').map(Number)
                            const totalMins = h * 60 + m + dp.minutes
                            const eh = String(Math.floor(totalMins / 60) % 24).padStart(2, '0')
                            const em = String(totalMins % 60).padStart(2, '0')
                            setEventForm(f => ({ ...f, end_time: `${eh}:${em}` }))
                          }
                        }}
                        className="px-3 py-1 rounded-full text-xs font-bold transition-all"
                        style={{
                          background: 'var(--color-surface)',
                          color:      'var(--color-text)',
                          border:     '1.5px solid var(--color-border)',
                        }}
                      >{dp.label}</button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
                {/* Summary row */}
                {(eventForm.staff_ids.length > 0 || eventForm.dates.length > 0 || eventForm.start_time) && (
                  <p className="text-xs text-center mb-2 font-medium" style={{ color: 'var(--color-muted)' }}>
                    {eventForm.staff_ids.length > 0  ? `${eventForm.staff_ids.length} ספרים · ` : ''}
                    {eventForm.dates.length > 0       ? `${eventForm.dates.length} תאריכים · `   : ''}
                    {eventForm.start_time && eventForm.end_time ? `${eventForm.start_time}–${eventForm.end_time}` : ''}
                    {eventForm.staff_ids.length > 0 && eventForm.dates.length > 0
                      ? ` · ${eventForm.staff_ids.length * eventForm.dates.length} חסימות`
                      : ''}
                  </p>
                )}
                {/* Missing fields hint */}
                {(!eventForm.title || !eventForm.staff_ids.length || !eventForm.dates.length || !eventForm.start_time || !eventForm.end_time) && (
                  <p className="text-xs text-center mb-2" style={{ color: 'var(--color-muted)' }}>
                    {[
                      !eventForm.title           && 'בחר סוג אירוע',
                      !eventForm.staff_ids.length && 'בחר ספר',
                      !eventForm.dates.length     && 'בחר תאריך',
                      !eventForm.start_time       && 'בחר שעת התחלה',
                      !eventForm.end_time         && 'בחר שעת סיום',
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleSaveEvent}
                  disabled={savingEvent || !eventForm.title || !eventForm.staff_ids.length || !eventForm.dates.length || !eventForm.start_time || !eventForm.end_time}
                  className="btn-primary w-full justify-center py-3 text-sm font-bold disabled:opacity-40"
                >
                  {savingEvent
                    ? <Spinner size="sm" className="border-white border-t-transparent" />
                    : `🚫 חסום שעות${eventForm.staff_ids.length * eventForm.dates.length > 1 ? ` (${eventForm.staff_ids.length * eventForm.dates.length})` : ''}`
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Book for Customer — Bottom Sheet ── */}
      <AnimatePresence>
        {bookOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
            style={{ background: 'var(--color-overlay-md)', backdropFilter: 'blur(2px)' }}
            onClick={e => e.target === e.currentTarget && closeBook()}
          >
            <motion.form
              onSubmit={handleBookForCustomer}
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0,  opacity: 1 }}
              exit={{    y: 80, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col"
              style={{
                background:  'var(--color-card)',
                maxHeight:   'calc(100dvh - 100px - env(safe-area-inset-bottom, 0px))',
                marginBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
                border:      '1px solid var(--color-border)',
                boxShadow:   '0 -8px 40px var(--color-shadow-lg)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle (mobile) */}
              <div className="flex justify-center pt-3 pb-0 sm:hidden flex-shrink-0">
                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-border)' }} />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <h2 className="text-lg font-black" style={{ color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
                    📅 קביעת תור ללקוח
                  </h2>
                  {waitlistPrefillId && (
                    <div>
                      <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--color-gold)' }}>📋 שיבוץ מרשימת המתנה</p>
                      {bookForm.wlTimeFrom && bookForm.wlTimeTo && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                          טווח שעות מבוקש: {bookForm.wlTimeFrom} – {bookForm.wlTimeTo}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <button type="button" onClick={closeBook}
                  className="min-w-11 min-h-11 flex items-center justify-center rounded-full text-xl flex-shrink-0"
                  style={{ color: 'var(--color-muted)', background: 'var(--color-surface)' }}
                >×</button>
              </div>

              {/* ── Scrollable body ── */}
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 min-h-0">

                {/* 1. Customer */}
                <section>
                  <p className="text-[11px] font-bold mb-2 tracking-widest uppercase" style={{ color: 'var(--color-muted)' }}>👤 לקוח</p>
                  {bookForm.customerId ? (
                    <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
                      style={{ background: 'var(--color-gold-tint)', border: '1.5px solid var(--color-gold)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0"
                          style={{ background: 'var(--color-gold)', color: '#fff' }}>
                          {bookForm.customerName?.[0] ?? '?'}
                        </div>
                        <div>
                          <div className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{bookForm.customerName}</div>
                          {bookForm.customerPhone && <div className="text-xs" style={{ color: 'var(--color-muted)' }}>{bookForm.customerPhone}</div>}
                        </div>
                      </div>
                      <button type="button"
                        onClick={() => setBookForm(f => ({ ...f, customerId: null, customerName: '', customerPhone: '', customerSearch: '' }))}
                        className="text-sm w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0"
                        style={{ color: 'var(--color-muted)', background: 'var(--color-surface)' }}
                      >✕</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        className="input"
                        placeholder="🔍  חפש לפי שם או טלפון..."
                        value={bookForm.customerSearch}
                        autoComplete="off"
                        onChange={e => {
                          const q = e.target.value
                          setBookForm(f => ({ ...f, customerSearch: q, customerId: null, customerName: '', customerPhone: '' }))
                          searchCustomers(q)
                        }}
                      />
                      {customerResults.length > 0 && (
                        <div className="absolute top-full mt-1 w-full rounded-2xl shadow-xl z-20 overflow-hidden"
                          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                          {customerResults.map(c => (
                            <button key={c.id} type="button"
                              className="w-full text-right px-4 py-3 text-sm flex items-center gap-3 transition-all"
                              style={{ borderBottom: '1px solid var(--color-border)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              onClick={() => {
                                if (c.isDevice) { selectDeviceContact(c) }
                                else {
                                  setBookForm(f => ({ ...f, customerId: c.id, customerName: c.name, customerPhone: c.phone || '', customerSearch: '' }))
                                  setCustomerResults([])
                                }
                              }}
                            >
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                                style={{ background: 'var(--color-gold)', color: '#fff' }}>{c.name?.[0] ?? '?'}</div>
                              <div className="text-right">
                                <div className="font-semibold">{c.name}</div>
                                {c.phone && <div className="text-xs" style={{ color: 'var(--color-muted)' }}>{c.phone}</div>}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* 2. Service */}
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-muted)' }}>✂ שירות</p>
                    {waitlistPrefillId && bookWlLockService && (
                      <button type="button" onClick={() => setBookWlLockService(false)}
                        className="text-xs px-2 py-0.5 rounded-lg transition-all"
                        style={{ color: 'var(--color-muted)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                      >שנה ↓</button>
                    )}
                  </div>
                  {waitlistPrefillId && bookWlLockService ? (
                    /* Locked — show only the selected service */
                    (() => {
                      const svc = services.find(s => s.id === bookForm.serviceId)
                      return svc ? (
                        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl"
                          style={{ background: 'var(--color-gold-tint)', border: '1.5px solid var(--color-gold)' }}>
                          <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
                            {svc.name}
                            <span className="text-[10px] mr-1" style={{ opacity: 0.6 }}>· {svc.duration_minutes}ד׳</span>
                          </span>
                          <span className="text-xs font-semibold" style={{ color: 'var(--color-gold)' }}>✓ כבקשת הלקוח</span>
                        </div>
                      ) : null
                    })()
                  ) : (
                    /* Unlocked — all chips */
                    <div className="flex flex-wrap gap-2">
                      {services.filter(s => s.is_active && s.booking_type !== 'by_request').map(s => {
                        const active = bookForm.serviceId === s.id
                        const isDifferent = waitlistPrefillId && bookWlOrigService && s.id !== bookWlOrigService
                        return (
                          <button key={s.id} type="button"
                            onClick={() => {
                              if (isDifferent) {
                                const origName = services.find(x => x.id === bookWlOrigService)?.name ?? ''
                                setBookChangeConfirm({ type: 'service', newId: s.id, newName: s.name, origName })
                              } else {
                                setBookForm(f => ({ ...f, serviceId: s.id, startTime: '' }))
                              }
                            }}
                            className="px-3.5 py-2 rounded-xl text-sm font-bold transition-all"
                            style={{
                              background: active ? 'var(--color-gold)' : 'var(--color-surface)',
                              color:      active ? '#fff'              : 'var(--color-text)',
                              border:     `1.5px solid ${active ? 'var(--color-gold)' : 'var(--color-border)'}`,
                              boxShadow:  active ? '0 2px 10px var(--color-gold-ring)' : 'none',
                            }}
                          >
                            {s.name}
                            <span className="text-[10px] mr-1" style={{ opacity: 0.7 }}>· {s.duration_minutes}ד׳</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </section>

                {/* 3. Staff */}
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-muted)' }}>💈 ספר</p>
                    {waitlistPrefillId && bookWlLockStaff && (
                      <button type="button" onClick={() => setBookWlLockStaff(false)}
                        className="text-xs px-2 py-0.5 rounded-lg transition-all"
                        style={{ color: 'var(--color-muted)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                      >שנה ↓</button>
                    )}
                  </div>
                  {waitlistPrefillId && bookWlLockStaff ? (
                    /* Locked — show only the selected staff */
                    (() => {
                      const member = staff.find(s => s.id === bookForm.staffId)
                      return member ? (
                        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl"
                          style={{ background: 'var(--color-gold-tint)', border: '1.5px solid var(--color-gold)' }}>
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black"
                              style={{ background: 'var(--color-gold)', color: '#fff' }}>{member.name[0]}</span>
                            <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{member.name}</span>
                          </div>
                          <span className="text-xs font-semibold" style={{ color: 'var(--color-gold)' }}>✓ כבקשת הלקוח</span>
                        </div>
                      ) : null
                    })()
                  ) : (
                    /* Unlocked — all chips */
                    <div className="flex flex-wrap gap-2">
                      {staff.map(s => {
                        const active = bookForm.staffId === s.id
                        const isDifferent = waitlistPrefillId && bookWlOrigStaff && s.id !== bookWlOrigStaff
                        return (
                          <button key={s.id} type="button"
                            onClick={() => {
                              if (isDifferent) {
                                const origName = staff.find(x => x.id === bookWlOrigStaff)?.name ?? ''
                                setBookChangeConfirm({ type: 'staff', newId: s.id, newName: s.name, origName })
                              } else {
                                setBookForm(f => ({ ...f, staffId: s.id, startTime: '' }))
                              }
                            }}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition-all"
                            style={{
                              background: active ? 'var(--color-gold)' : 'var(--color-surface)',
                              color:      active ? '#fff'              : 'var(--color-text)',
                              border:     `1.5px solid ${active ? 'var(--color-gold)' : 'var(--color-border)'}`,
                              boxShadow:  active ? '0 2px 10px var(--color-gold-ring)' : 'none',
                            }}
                          >
                            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0"
                              style={{ background: active ? 'var(--color-white-25)' : 'var(--color-gold)', color: '#fff' }}>
                              {s.name[0]}
                            </span>
                            {s.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </section>

                {/* 4. Date */}
                <section>
                  <p className="text-[11px] font-bold mb-2 tracking-widest uppercase" style={{ color: 'var(--color-muted)' }}>📅 תאריך</p>
                  <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    <div className="flex gap-2 min-w-max">
                      {Array.from({ length: 30 }, (_, i) => addDays(startOfDay(new Date()), i)).map(date => {
                        const dateStr  = format(date, 'yyyy-MM-dd')
                        const active   = bookForm.date === dateStr
                        const todayFlg = isSameDay(date, new Date())
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() => setBookForm(f => ({ ...f, date: dateStr, startTime: '' }))}
                            className="flex flex-col items-center px-3 py-2.5 text-xs font-semibold transition-all min-w-[52px] border-2 flex-shrink-0"
                            style={{
                              background:   active ? 'var(--color-gold)'                : 'var(--color-surface)',
                              borderColor:  active ? 'var(--color-gold)'                : 'var(--color-border)',
                              color:        active ? '#fff'                             : 'var(--color-text)',
                              boxShadow:    active ? '0 2px 10px var(--color-gold-ring)' : 'none',
                              borderRadius: 'var(--radius-btn, 12px)',
                            }}
                          >
                            <span className="text-[10px] mb-0.5" style={{ opacity: active ? 1 : 0.5 }}>{dayName(date.getDay())}</span>
                            <span className="text-base font-black">{date.getDate()}</span>
                            {todayFlg && <span className="text-[9px]" style={{ opacity: 0.65 }}>היום</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </section>

                {/* 5. Time slots */}
                {bookForm.staffId && bookForm.serviceId && bookForm.date && (
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-muted)' }}>🕐 שעה</p>
                      <button type="button"
                        onClick={() => setBookShowManualTime(v => !v)}
                        className="text-xs px-2 py-1 rounded-lg transition-all"
                        style={{ color: 'var(--color-muted)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                      >
                        {bookShowManualTime ? '← שעות פנויות' : '✏ ידנית'}
                      </button>
                    </div>

                    {bookShowManualTime ? (
                      <input type="time" className="input" value={bookForm.startTime}
                        onChange={e => setBookForm(f => ({ ...f, startTime: e.target.value }))} />
                    ) : bookSlotsLoading ? (
                      <div className="flex items-center gap-2 py-5" style={{ color: 'var(--color-muted)' }}>
                        <Spinner size="sm" />
                        <span className="text-xs">טוען שעות פנויות...</span>
                      </div>
                    ) : bookSlots.length === 0 ? (
                      <div className="py-5 text-center text-sm rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
                        אין שעות פנויות ביום זה
                        <br />
                        <button type="button" onClick={() => setBookShowManualTime(true)}
                          className="text-xs mt-1.5 underline" style={{ color: 'var(--color-gold)' }}>
                          הכנס שעה ידנית
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Recommended */}
                        {bookSlotsRecommended.size > 0 && (
                          <div className="rounded-2xl p-3" style={{ background: 'var(--color-gold-tint)', border: '1px solid var(--color-gold-ring)' }}>
                            <p className="text-[10px] font-bold mb-2" style={{ color: 'var(--color-gold)' }}>
                              ⭐ מומלצות — ממזערות חורים ביומן
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {bookSlots.filter(s => bookSlotsRecommended.has(s.start.getTime())).map(slot => {
                                const t   = `${String(slot.start.getHours()).padStart(2,'0')}:${String(slot.start.getMinutes()).padStart(2,'0')}`
                                const sel = bookForm.startTime === t
                                return (
                                  <button key={t} type="button"
                                    onClick={() => setBookForm(f => ({ ...f, startTime: t }))}
                                    className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                                    style={{
                                      background: sel ? 'var(--color-gold)'       : 'var(--color-gold-tint)',
                                      color:      sel ? '#fff'                    : 'var(--color-gold)',
                                      border:     `1.5px solid ${sel ? 'var(--color-gold)' : 'var(--color-gold-ring)'}`,
                                      boxShadow:  sel ? '0 2px 10px var(--color-gold-ring)' : 'none',
                                    }}
                                  >{t}</button>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* All other slots */}
                        {bookSlots.some(s => !bookSlotsRecommended.has(s.start.getTime())) && (
                          <div>
                            {bookSlotsRecommended.size > 0 && (
                              <p className="text-[10px] font-semibold mb-2" style={{ color: 'var(--color-muted)' }}>שאר השעות הפנויות</p>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              {bookSlots.filter(s => !bookSlotsRecommended.has(s.start.getTime())).map(slot => {
                                const t   = `${String(slot.start.getHours()).padStart(2,'0')}:${String(slot.start.getMinutes()).padStart(2,'0')}`
                                const sel = bookForm.startTime === t
                                return (
                                  <button key={t} type="button"
                                    onClick={() => setBookForm(f => ({ ...f, startTime: t }))}
                                    className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                                    style={{
                                      background: sel ? 'var(--color-gold)'   : 'var(--color-surface)',
                                      color:      sel ? '#fff'                : 'var(--color-text)',
                                      border:     `1.5px solid ${sel ? 'var(--color-gold)' : 'var(--color-border)'}`,
                                      boxShadow:  sel ? '0 2px 10px var(--color-gold-ring)' : 'none',
                                    }}
                                  >{t}</button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* 6. Notes */}
                <section>
                  <p className="text-[11px] font-bold mb-2 tracking-widest uppercase" style={{ color: 'var(--color-muted)' }}>📝 הערות (אופציונלי)</p>
                  <textarea
                    className="input resize-none text-sm"
                    rows={2}
                    placeholder="הערות לתור..."
                    value={bookForm.notes}
                    onChange={e => setBookForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </section>

              </div>{/* end scroll */}

              {/* ── Fixed Footer ── */}
              <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
                {/* Missing fields hint */}
                {(() => {
                  const missing = [
                    !bookForm.customerId && 'לקוח',
                    !bookForm.serviceId  && 'שירות',
                    !bookForm.staffId    && 'ספר',
                    !bookForm.date       && 'תאריך',
                    !bookForm.startTime  && 'שעה',
                  ].filter(Boolean)
                  return missing.length > 0 ? (
                    <p className="text-center text-xs mb-2.5" style={{ color: 'var(--color-muted)' }}>
                      חסר: {missing.join(' · ')}
                    </p>
                  ) : null
                })()}
                <button
                  type="submit"
                  disabled={savingBook || !bookForm.customerId || !bookForm.serviceId || !bookForm.staffId || !bookForm.date || !bookForm.startTime}
                  className="btn-primary w-full justify-center py-3.5 text-base font-bold"
                  style={{ opacity: (!bookForm.customerId || !bookForm.serviceId || !bookForm.staffId || !bookForm.date || !bookForm.startTime) ? 0.45 : 1 }}
                >
                  {savingBook
                    ? <><Spinner size="sm" className="border-white border-t-transparent" /><span className="mr-2">שומר...</span></>
                    : `✓ קבע תור${bookForm.customerName ? ` ל${bookForm.customerName}` : ''}`
                  }
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Change confirmation dialog (service/staff differs from waitlist request) ── */}
      <AnimatePresence>
        {bookChangeConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-6"
            style={{ background: 'var(--color-overlay-lg)', backdropFilter: 'blur(2px)' }}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1,    opacity: 1 }}
              exit={{    scale: 0.88, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              className="w-full max-w-sm rounded-3xl overflow-hidden"
              style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', boxShadow: '0 20px 60px var(--color-shadow-lg)' }}
            >
              <div className="px-5 pt-5 pb-4 space-y-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mx-auto"
                  style={{ background: 'var(--color-danger-tint)' }}>⚠️</div>
                <h3 className="text-base font-black text-center" style={{ color: 'var(--color-text)' }}>
                  שינוי {bookChangeConfirm.type === 'service' ? 'שירות' : 'ספר'}
                </h3>
                <p className="text-sm text-center" style={{ color: 'var(--color-muted)' }}>
                  הלקוח ביקש{' '}
                  <span className="font-bold" style={{ color: 'var(--color-text)' }}>"{bookChangeConfirm.origName}"</span>
                </p>
                <p className="text-sm text-center" style={{ color: 'var(--color-muted)' }}>
                  האם לשנות ל
                  <span className="font-bold" style={{ color: '#ef4444' }}> "{bookChangeConfirm.newName}"</span>?
                </p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-x-reverse" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setBookChangeConfirm(null)}
                  className="py-3 text-sm font-bold transition-all"
                  style={{ color: 'var(--color-muted)' }}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (bookChangeConfirm.type === 'service') {
                      setBookForm(f => ({ ...f, serviceId: bookChangeConfirm.newId, startTime: '' }))
                      setBookWlLockService(false)
                    } else {
                      setBookForm(f => ({ ...f, staffId: bookChangeConfirm.newId, startTime: '' }))
                      setBookWlLockStaff(false)
                    }
                    setBookChangeConfirm(null)
                  }}
                  className="py-3 text-sm font-bold transition-all"
                  style={{ color: '#ef4444' }}
                >
                  כן, שנה
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── WhatsApp After Move Modal ── */}
      <Modal open={!!whatsappAfterMove} onClose={() => setWhatsappAfterMove(null)} title="שליחת הודעה ללקוח">
        {whatsappAfterMove && (() => {
          const rawPhone = whatsappAfterMove.phone.replace(/\D/g, '')
          const waPhone = rawPhone.startsWith('0') ? '972' + rawPhone.slice(1) : rawPhone
          const newDate = formatDate(whatsappAfterMove.newStart)
          const newTime = formatTime(whatsappAfterMove.newStart)
          const msg = encodeURIComponent(`שלום ${whatsappAfterMove.name}, תורך שונה ל-${newDate} בשעה ${newTime}. נתראה! 💈`)
          return (
            <div className="space-y-4 text-center">
              <div className="text-4xl">📲</div>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                האם לשלוח הודעת WhatsApp ל<strong style={{ color: 'var(--color-text)' }}>{whatsappAfterMove.name}</strong> על שינוי המועד?
              </p>
              <div className="rounded-xl p-3 text-sm text-right" style={{ direction: 'rtl', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                שלום {whatsappAfterMove.name}, תורך שונה ל-{newDate} בשעה {newTime}. נתראה! 💈
              </div>
              <div className="flex gap-3">
                <a
                  href={`https://wa.me/${waPhone}?text=${msg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWhatsappAfterMove(null)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm"
                  style={{ background: '#25D366', color: '#fff' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  שלח WhatsApp
                </a>
                <button onClick={() => setWhatsappAfterMove(null)} className="flex-1 btn-outline py-2.5">לא עכשיו</button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ── Move Confirmation Modal ── */}
      <Modal
        open={!!pendingMove}
        onClose={() => setPendingMove(null)}
        title="אישור העברת תור"
      >
        {pendingMove && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>
              האם להעביר את התור הבא?
            </p>
            <div className="rounded-xl p-4 space-y-2 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div>
                <span className="text-muted">לקוח: </span>
                <span className="font-semibold">{pendingMove.appt.profiles?.name}</span>
              </div>
              <div>
                <span className="text-muted">שירות: </span>
                <span className="font-medium">{pendingMove.appt.services?.name}</span>
              </div>
              <div>
                <span className="text-muted">שעה חדשה: </span>
                <span className="font-medium">
                  {format(pendingMove.newStart, 'HH:mm')} — {format(pendingMove.newEnd, 'HH:mm')}
                </span>
              </div>
              {pendingMoveStaff && pendingMove.appt.staff_id !== pendingMove.newStaffId && (
                <div>
                  <span className="text-muted">ספר חדש: </span>
                  <span className="font-medium text-[var(--color-gold)]">{pendingMoveStaff.name}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={confirmMove}
                disabled={movingSave}
                className="btn-primary flex-1 justify-center"
              >
                {movingSave ? 'מעביר...' : '✓ כן, הזז תור'}
              </button>
              <button
                onClick={() => setPendingMove(null)}
                className="btn-outline flex-1 justify-center"
              >
                ביטול
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── List View ─────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: '',           label: 'כל הסטטוסים' },
  { value: 'confirmed',  label: 'מאושר' },
  { value: 'pending',    label: 'ממתין' },
  { value: 'completed',  label: 'הושלם' },
  { value: 'cancelled',  label: 'בוטל' },
  { value: 'no_show',    label: 'לא הגיע' },
]

function ListViewAppointments({ appointments, onSelect, staff = [] }) {
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [staffFilter,  setStaffFilter]  = useState('')

  const filtered = appointments.filter(a => {
    if (statusFilter && a.status !== statusFilter) return false
    if (staffFilter  && a.staff_id !== staffFilter) return false
    if (search) {
      const q     = search.toLowerCase()
      const name  = (a.profiles?.name  || '').toLowerCase()
      const phone = (a.profiles?.phone || '').toLowerCase()
      if (!name.includes(q) && !phone.includes(q)) return false
    }
    return true
  })
  const sorted = [...filtered].sort((a, b) => new Date(a.start_at) - new Date(b.start_at))

  return (
    <div className="flex flex-col gap-3">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="input flex-1 min-w-[180px] py-2 text-sm"
          placeholder="🔍 חפש לפי שם או טלפון..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="input py-2 text-sm w-auto"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {staff.length > 0 && (
          <select
            className="input py-2 text-sm w-auto"
            value={staffFilter}
            onChange={e => setStaffFilter(e.target.value)}
          >
            <option value="">כל הספרים</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {(search || statusFilter || staffFilter) && (
          <button
            onClick={() => { setSearch(''); setStatusFilter(''); setStaffFilter('') }}
            className="text-xs px-3 py-2 rounded-lg transition-all"
            style={{ background: 'var(--color-surface)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
          >
            נקה
          </button>
        )}
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
          {sorted.length} תורים
        </span>
      </div>

      {/* ── Appointment rows ── */}
      {sorted.length === 0 ? (
        <div className="card p-12 text-center text-muted">
          <div className="text-4xl mb-3">📭</div>
          <p>{search || statusFilter || staffFilter ? 'אין תורים התואמים את הסינון' : 'אין תורים בטווח זה'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map(appt => {
            const isGroup = appt.notes?.includes('קבוצה של')
            return (
              <motion.button
                key={appt.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => onSelect(appt)}
                className="card p-4 text-right hover:ring-2 hover:ring-[var(--color-gold)] transition-all w-full"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <div className="text-xs text-muted">{format(new Date(appt.start_at), 'EEE', { locale: he })}</div>
                      <div className="font-bold">{formatTime(appt.start_at)}</div>
                      <div className="text-xs text-muted">{formatDate(appt.start_at)}</div>
                    </div>
                    <div>
                      <p className="font-semibold">
                        {isGroup && <span className="text-sm mr-1">👥</span>}
                        {appt.profiles?.name}
                      </p>
                      <p className="text-sm text-muted">{appt.services?.name} · {appt.staff?.name}</p>
                    </div>
                  </div>
                  <StatusBadge status={appt.status} />
                </div>
              </motion.button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Week View ─────────────────────────────────────────────────────────────────
function WeekView({ days, appointments, serviceColors, onSelect, onReschedule, recurringBreaks = [], blockedTimes = [], startHour = 7, endHour = 20, waitlistByDate = {}, onScheduleWaitlist }) {
  const SLOT_PX   = 24                                   // px per 15-minute slot
  const HOUR_PX   = SLOT_PX * 4                         // 96px per hour
  const TOTAL_H   = (endHour - startHour) * HOUR_PX     // total grid height
  const activeAppts = appointments.filter(a => a.status !== 'cancelled')
  const [waitlistModal, setWaitlistModal] = useState(null)

  // minutes → px from top of grid
  function minsToY(mins) { return (mins / 15) * SLOT_PX }

  function apptTop(appt) {
    const s = new Date(appt.start_at)
    return Math.max(0, minsToY((s.getHours() - startHour) * 60 + s.getMinutes()))
  }
  function apptHeight(appt) {
    const dur = (new Date(appt.end_at) - new Date(appt.start_at)) / 60000
    return Math.max(minsToY(dur), SLOT_PX)   // min 1 slot tall
  }

  // All 15-min slots across the day
  const totalSlots = (endHour - startHour) * 4
  const slots = Array.from({ length: totalSlots }, (_, i) => {
    const totalMins = startHour * 60 + i * 15
    const h = Math.floor(totalMins / 60)
    const m = totalMins % 60
    return { i, h, m, isHour: m === 0, isHalf: m === 30 }
  })

  function getBands(day) {
    const dow = day.getDay()
    const bands = []
    recurringBreaks
      .filter(b => b.is_active && (b.day_of_week === null || b.day_of_week === dow))
      .forEach(b => {
        const [sh, sm = 0] = b.start_time.split(':').map(Number)
        const [eh, em = 0] = b.end_time.split(':').map(Number)
        const top = minsToY((sh - startHour) * 60 + sm)
        const h   = minsToY((eh - sh) * 60 + (em - sm))
        if (h > 0) bands.push({ top, height: h, label: b.label || 'הפסקה' })
      })
    blockedTimes
      .filter(bt => isSameDay(new Date(bt.start_at), day))
      .forEach(bt => {
        const s   = new Date(bt.start_at)
        const e   = new Date(bt.end_at)
        const top = minsToY((s.getHours() - startHour) * 60 + s.getMinutes())
        const h   = minsToY((e - s) / 60000)
        if (h > 0) bands.push({ top, height: h, label: bt.reason || 'חסום' })
      })
    return bands
  }

  return (
    <>
    <div className="card overflow-hidden select-none" style={{ border: '1px solid var(--color-border)' }}>

      {/* ── Column headers (sticky below AdminLayout top bar h-14=56px) ── */}
      <div className="flex border-b sticky top-[56px] z-10"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}>
        {/* time gutter */}
        <div className="flex-shrink-0 border-r" style={{ width: 52, borderColor: 'var(--color-border)' }} />
        {days.map(day => {
          const isNow     = isSameDay(day, new Date())
          const count     = activeAppts.filter(a => isSameDay(new Date(a.start_at), day)).length
          const dateKey   = format(day, 'yyyy-MM-dd')
          const wlEntries = waitlistByDate[dateKey] ?? []
          const wlCount   = wlEntries.length
          return (
            <div key={day.toISOString()}
              className="flex-1 py-2 px-1 text-center border-r last:border-0 min-w-0"
              style={{ background: isNow ? 'var(--color-gold-tint)' : undefined, borderColor: 'var(--color-border)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wide"
                style={{ color: isNow ? 'var(--color-primary)' : 'var(--color-muted)' }}>
                {format(day, 'EEE', { locale: he })}
              </div>
              <div className="text-lg font-black leading-tight"
                style={{ color: isNow ? 'var(--color-primary)' : 'var(--color-text)' }}>
                {format(day, 'd')}
              </div>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                {count > 0 && (
                  <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none"
                    style={{ background: isNow ? 'var(--color-primary)' : 'var(--color-border)', color: isNow ? '#fff' : 'var(--color-muted)' }}>
                    {count}
                  </span>
                )}
                {wlCount > 0 && (
                  <button type="button"
                    onClick={() => setWaitlistModal({ date: day, entries: wlEntries })}
                    className="text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none hover:opacity-75"
                    style={{ background: 'var(--color-gold-tint)', color: 'var(--color-gold)', border: '1px solid var(--color-gold-ring)' }}>
                    📋{wlCount}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Scrollable body ── */}
      <div className="overflow-auto" style={{ maxHeight: '75vh' }}>
        <div className="flex" style={{ height: TOTAL_H }}>

          {/* Time-label gutter */}
          <div className="flex-shrink-0 relative border-r" style={{ width: 52, height: TOTAL_H, borderColor: 'var(--color-border)' }}>
            {slots.filter(s => s.isHour || s.isHalf).map(s => (
              <div key={s.i}
                className="absolute right-0 left-0 flex items-center justify-end pr-1.5"
                style={{ top: s.i * SLOT_PX - 7, height: 14, pointerEvents: 'none' }}>
                <span style={{
                  fontSize: s.isHour ? 11 : 9,
                  fontWeight: s.isHour ? 700 : 500,
                  color: s.isHour ? 'var(--color-muted)' : 'var(--color-border)',
                  lineHeight: 1,
                }}>
                  {String(s.h).padStart(2,'0')}:{String(s.m).padStart(2,'0')}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(day => {
            const isNow    = isSameDay(day, new Date())
            const dayAppts = activeAppts.filter(a => isSameDay(new Date(a.start_at), day))
            const bands    = getBands(day)

            return (
              <div key={day.toISOString()}
                className="flex-1 relative border-r last:border-0 min-w-0"
                style={{
                  height: TOTAL_H,
                  background: isNow ? 'var(--color-gold-tint)' : 'transparent',
                  borderColor: 'var(--color-border)',
                }}>

                {/* 15-minute slot lines */}
                {slots.map(s => (
                  <div key={s.i}
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                      top:       s.i * SLOT_PX,
                      height:    SLOT_PX,
                      borderTop: s.isHour
                        ? '1.5px solid var(--color-border)'
                        : s.isHalf
                          ? '1px dashed var(--color-border)'
                          : '1px dotted var(--color-border)',
                    opacity: s.isHour ? 1 : s.isHalf ? 0.5 : 0.25,
                    }}
                  />
                ))}

                {/* Break / blocked bands */}
                {bands.map((band, i) => (
                  <div key={i}
                    className="absolute left-0 right-0 overflow-hidden pointer-events-none flex items-center justify-center"
                    style={{
                      top:        band.top,
                      height:     band.height,
                      background: 'repeating-linear-gradient(135deg,var(--color-surface) 0,var(--color-surface) 4px,var(--color-border) 4px,var(--color-border) 8px)',
                      opacity:    0.85,
                      zIndex:     1,
                    }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af' }}>{band.label}</span>
                  </div>
                ))}

                {/* Appointments */}
                {dayAppts.map(appt => {
                  const color  = appt.no_show ? '#ef4444' : (serviceColors[appt.service_id] || DEFAULT_COLOR)
                  const top    = apptTop(appt)
                  const height = apptHeight(appt)
                  const dur    = Math.round((new Date(appt.end_at) - new Date(appt.start_at)) / 60000)
                  const showService = height >= SLOT_PX * 2     // ≥ 30 min
                  const showDur     = height >= SLOT_PX * 3     // ≥ 45 min
                  const isGroupAppt = appt.notes?.includes('קבוצה של')
                  const wkStatusBorder = appt.no_show ? undefined
                    : appt.status === 'pending'   ? 'var(--color-warning-solid)'
                    : appt.status === 'confirmed' ? 'var(--color-success-solid)'
                    : undefined

                  return (
                    <div
                      key={appt.id}
                      className="absolute"
                      style={{ top, height: height - 2, left: 2, right: 2, zIndex: 10 }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(appt)}
                        className="absolute inset-0 text-right hover:brightness-110 hover:z-30 active:scale-95 transition-all"
                        style={{
                          background:   color,
                          color:        '#fff',
                          borderRadius: 5,
                          overflow:     'hidden',
                          padding:      '2px 5px',
                          boxShadow:    '0 1px 4px var(--color-shadow-xl)',
                          fontSize:     10,
                          fontWeight:   700,
                          lineHeight:   1.25,
                          borderRight:  wkStatusBorder ? `3px solid ${wkStatusBorder}` : undefined,
                          border:       'none',
                          cursor:       'pointer',
                        }}
                      >
                        <div className="truncate leading-tight">
                          {isGroupAppt && <span style={{ opacity: 0.9 }}>👥 </span>}{appt.profiles?.name}
                        </div>
                        {showService && (
                          <div className="truncate opacity-80" style={{ fontSize: 9 }}>{appt.services?.name}</div>
                        )}
                        {showDur && (
                          <div className="opacity-60" style={{ fontSize: 9 }}>{dur}ד׳</div>
                        )}
                      </button>
                      {onReschedule && height >= SLOT_PX * 2 && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); onReschedule(appt) }}
                          className="absolute bottom-0.5 left-0.5"
                          style={{ fontSize: 7, background: 'var(--color-shadow-lg)', color: 'rgba(255,255,255,0.85)', borderRadius: 2, padding: '1px 3px', lineHeight: 1, zIndex: 15, border: 'none', cursor: 'pointer' }}
                          title="שנה מועד"
                        >
                          📅
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>

    {/* Waitlist day modal */}
    {waitlistModal && (
      <Modal
        open={true}
        onClose={() => setWaitlistModal(null)}
        title={`📋 רשימת המתנה — ${format(waitlistModal.date, 'dd.MM.yyyy')}`}
        size="sm"
      >
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {waitlistModal.entries.map(entry => (
            <div key={entry.id}
              className="flex items-center justify-between rounded-xl p-3 text-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                  style={{ background: 'var(--color-gold)', color: '#fff' }}>
                  {entry.profiles?.name?.[0] ?? '?'}
                </div>
                <div>
                  <div className="font-bold" style={{ color: 'var(--color-text)' }}>{entry.profiles?.name}</div>
                  <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    {entry.profiles?.phone}
                    {entry.services?.name ? ` · ${entry.services.name}` : ''}
                    {` · ${entry.time_from?.slice(0,5)}–${entry.time_to?.slice(0,5)}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {onScheduleWaitlist && (
                  <button type="button"
                    onClick={() => { setWaitlistModal(null); onScheduleWaitlist(entry) }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: 'var(--color-gold-tint)', color: 'var(--color-gold)', border: '1px solid var(--color-gold-ring)' }}>
                    📅 שיבוץ
                  </button>
                )}
                {entry.profiles?.phone && (
                  <a href={`https://wa.me/${entry.profiles.phone.replace(/\D/g,'').replace(/^0/,'972')}`}
                    target="_blank" rel="noopener noreferrer"
                    className="min-w-11 min-h-11 flex items-center justify-center rounded-lg text-sm transition-all"
                    style={{ background: 'var(--color-success-tint)', color: '#25d366' }}>
                    💬
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    )}
    </>
  )
}

// ─── Day View (with DnD) ───────────────────────────────────────────────────────
function DayView({ date, appointments, staffColumns, slotMinutes, startHour = START_HOUR, endHour = END_HOUR, serviceColors, onSelect, onMoveRequest, onSlotClick, recurringBreaks = [], blockedTimes = [] }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  const scrollRef = useRef(null)

  const totalMinutes = (endHour - startHour) * 60
  const slotsCount = totalMinutes / slotMinutes
  const TOTAL_HEIGHT = slotsCount * SLOT_HEIGHT

  // Current time for "now" indicator
  const [nowTop, setNowTop] = useState(null)
  useEffect(() => {
    function calcNow() {
      const now = new Date()
      if (!isToday(date)) { setNowTop(null); return }
      const mins = (now.getHours() - startHour) * 60 + now.getMinutes()
      if (mins < 0 || mins > totalMinutes) { setNowTop(null); return }
      setNowTop((mins / slotMinutes) * SLOT_HEIGHT)
    }
    calcNow()
    const iv = setInterval(calcNow, 60000)
    return () => clearInterval(iv)
  }, [date, slotMinutes, totalMinutes])

  // Auto-scroll to current time when viewing today
  useEffect(() => {
    if (!isToday(date) || !scrollRef.current) return
    const now = new Date()
    const mins = (now.getHours() - startHour) * 60 + now.getMinutes()
    if (mins < 0 || mins > totalMinutes) return
    const targetTop = (mins / slotMinutes) * SLOT_HEIGHT
    const offset = Math.max(0, targetTop - 120)
    setTimeout(() => scrollRef.current?.scrollTo({ top: offset, behavior: 'smooth' }), 150)
  }, [date])

  // All time slots — for row labels
  const timeSlots = useMemo(() => {
    const slots = []
    for (let m = 0; m < totalMinutes; m += slotMinutes) slots.push(m)
    return slots
  }, [totalMinutes, slotMinutes])

  // Only active appointments for this day
  const dayAppts = appointments.filter(a => a.status !== 'cancelled')
  const dow = date.getDay()

  function handleDragEnd({ active, over }) {
    if (!over) return
    const parts = over.id.split('__')
    if (parts.length < 2) return
    const newStaffId = parts[0]
    const minuteOffset = Number(parts[1])
    const appt = dayAppts.find(a => a.id === active.id)
    if (!appt) return
    const duration = (new Date(appt.end_at) - new Date(appt.start_at)) / 60000
    const newStart = new Date(date)
    newStart.setHours(startHour + Math.floor(minuteOffset / 60), minuteOffset % 60, 0, 0)
    const newEnd = new Date(newStart.getTime() + duration * 60000)
    onMoveRequest(appt, newStart, newEnd, newStaffId)
  }

  // Compute break blocks for a given staff column
  function getBreakBlocks(staffId) {
    const blocks = []
    // Recurring breaks
    recurringBreaks
      .filter(b => b.is_active && (b.day_of_week === null || b.day_of_week === dow) && (!b.staff_id || b.staff_id === staffId))
      .forEach(b => {
        const [sh, sm] = b.start_time.split(':').map(Number)
        const [eh, em] = b.end_time.split(':').map(Number)
        const startMin = (sh - startHour) * 60 + sm
        const endMin   = (eh - startHour) * 60 + em
        if (startMin >= totalMinutes || endMin <= 0) return
        blocks.push({ top: (Math.max(startMin,0) / slotMinutes) * SLOT_HEIGHT, height: ((endMin - Math.max(startMin,0)) / slotMinutes) * SLOT_HEIGHT, label: b.label || 'הפסקה' })
      })
    // Blocked times (personal events) for this staff
    blockedTimes
      .filter(bt => bt.staff_id === staffId)
      .forEach(bt => {
        const start = new Date(bt.start_at)
        const end   = new Date(bt.end_at)
        const startMin = (start.getHours() - startHour) * 60 + start.getMinutes()
        const endMin   = (end.getHours()   - startHour) * 60 + end.getMinutes()
        if (startMin >= totalMinutes || endMin <= 0) return
        blocks.push({ top: (Math.max(startMin,0) / slotMinutes) * SLOT_HEIGHT, height: ((endMin - Math.max(startMin,0)) / slotMinutes) * SLOT_HEIGHT, label: bt.reason || 'חסום' })
      })
    return blocks
  }

  if (staffColumns.length === 0) {
    return (
      <div className="card p-12 text-center text-muted">
        <div className="text-3xl mb-2">👤</div>
        <p>לא נמצאו ספרים פעילים</p>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="card overflow-hidden">
        {/* Header */}
        <div
          className="grid border-b sticky top-0 z-10"
          style={{ gridTemplateColumns: `52px repeat(${staffColumns.length}, 1fr)`, background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="border-r" style={{ borderColor: 'var(--color-border)' }} />
          {staffColumns.map(s => {
            const staffCount = dayAppts.filter(a => a.staff_id === s.id).length
            return (
              <div
                key={s.id}
                className="p-3 text-center font-bold border-r last:border-0"
                style={{ fontSize: '13px', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
              >
                {s.name}
                {staffCount > 0 && (
                  <span
                    className="inline-block mr-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none align-middle"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}
                  >
                    {staffCount}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Scrollable grid */}
        <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          <div
            className="grid"
            style={{
              gridTemplateColumns: `52px repeat(${staffColumns.length}, 1fr)`,
              height: TOTAL_HEIGHT,
              position: 'relative',
            }}
          >
            {/* Time axis */}
            <div className="relative border-r" style={{ height: TOTAL_HEIGHT, borderColor: 'var(--color-border)' }}>
              {timeSlots.map(minuteOff => {
                const isHour   = minuteOff % 60 === 0
                const isHalf   = !isHour && minuteOff % 30 === 0
                const top = (minuteOff / slotMinutes) * SLOT_HEIGHT
                const hour = startHour + Math.floor(minuteOff / 60)
                const min  = minuteOff % 60
                return (
                  <div key={minuteOff} className="absolute w-full flex items-start justify-center" style={{ top, height: SLOT_HEIGHT }}>
                    {isHour ? (
                      <span className="text-xs font-bold mt-0.5 select-none leading-none" style={{ color: 'var(--color-muted)' }}>
                        {String(hour).padStart(2,'0')}:00
                      </span>
                    ) : isHalf ? (
                      <span className="text-[10px] mt-0.5 select-none leading-none" style={{ color: 'var(--color-border)' }}>
                        :{String(min).padStart(2,'0')}
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {/* Staff columns */}
            {staffColumns.map(s => {
              const staffAppts  = dayAppts.filter(a => a.staff_id === s.id)
              const breakBlocks = getBreakBlocks(s.id)

              return (
                <div key={s.id} className="relative border-r last:border-0" style={{ height: TOTAL_HEIGHT, borderColor: 'var(--color-border)' }}>
                  {/* Droppable slots */}
                  {timeSlots.map(minuteOff => {
                    const isHour  = minuteOff % 60 === 0
                    const isHalf  = !isHour && minuteOff % 30 === 0
                    const top = (minuteOff / slotMinutes) * SLOT_HEIGHT
                    return (
                      <DroppableSlot
                        key={minuteOff}
                        id={`${s.id}__${minuteOff}`}
                        top={top}
                        height={SLOT_HEIGHT}
                        isHour={isHour}
                        isHalf={isHalf}
                        onEmptyClick={() => onSlotClick(s.id, minuteOff, date)}
                      />
                    )
                  })}

                  {/* Break / blocked-time blocks */}
                  {breakBlocks.map((b, i) => (
                    <BreakBlock key={i} top={b.top} height={b.height} label={b.label} />
                  ))}

                  {/* Appointment blocks */}
                  {staffAppts.map(appt => {
                    const startDt = new Date(appt.start_at)
                    const totalStartMin = (startDt.getHours() - startHour) * 60 + startDt.getMinutes()
                    const durationMin   = (new Date(appt.end_at) - startDt) / 60000
                    const top    = (totalStartMin / slotMinutes) * SLOT_HEIGHT
                    const height = Math.max((durationMin / slotMinutes) * SLOT_HEIGHT, 28)
                    const color  = appt.no_show ? '#ef4444' : (serviceColors[appt.service_id] || DEFAULT_COLOR)
                    const isTall = height >= 52
                    const isXTall = height >= 76
                    return (
                      <DraggableAppt
                        key={appt.id}
                        appt={appt}
                        top={top}
                        height={height}
                        color={color}
                        isTall={isTall}
                        isXTall={isXTall}
                        onSelect={onSelect}
                      />
                    )
                  })}

                  {/* Now indicator line */}
                  {nowTop !== null && (
                    <div
                      className="absolute inset-x-0 z-20 pointer-events-none"
                      style={{ top: nowTop }}
                    >
                      <div className="h-0.5 bg-red-500 w-full" style={{ boxShadow: '0 0 4px rgba(239,68,68,0.6)' }} />
                      <div className="absolute -top-1 right-0 w-2.5 h-2.5 rounded-full bg-red-500" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </DndContext>
  )
}

// ─── DroppableSlot ─────────────────────────────────────────────────────────────
function DroppableSlot({ id, top, height, isHour, isHalf, onEmptyClick }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  let borderTop
  if (isHour)       borderTop = '1.5px solid var(--color-border)'
  else if (isHalf)  borderTop = '1px dashed var(--color-border)'
  else              borderTop = '1px dotted var(--color-border)'

  return (
    <div
      ref={setNodeRef}
      className="absolute inset-x-0 transition-colors cursor-pointer"
      style={{
        top,
        height,
        borderTop,
        backgroundColor: isOver ? 'var(--color-gold-tint)' : 'transparent',
      }}
      onClick={onEmptyClick}
    />
  )
}

// ─── BreakBlock ────────────────────────────────────────────────────────────────
function BreakBlock({ top, height, label }) {
  const h = Math.max(height, 16)
  return (
    <div
      className="absolute inset-x-0 flex items-center justify-center overflow-hidden pointer-events-none select-none"
      style={{
        top,
        height: h,
        zIndex: 3,  // above DroppableSlots (auto) and appointments (2) — but pointer-events-none so clicks pass through
        background: 'repeating-linear-gradient(135deg, var(--color-surface) 0px, var(--color-surface) 5px, var(--color-border) 5px, var(--color-border) 10px)',
        borderTop: '1.5px solid var(--color-border)',
        borderBottom: '1.5px solid var(--color-border)',
      }}
    >
      {h >= 20 && (
        <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textAlign: 'center', padding: '0 4px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', width: '100%', display: 'block' }}>
          {label}
        </span>
      )}
    </div>
  )
}

// ─── DraggableAppt ─────────────────────────────────────────────────────────────
function DraggableAppt({ appt, top, height, color, isTall, isXTall, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: appt.id })

  const isNoShow = appt.no_show
  const statusBorderColor = isNoShow ? undefined
    : appt.status === 'pending'   ? 'var(--color-warning-solid)'
    : appt.status === 'confirmed' ? 'var(--color-success-solid)'
    : undefined

  const style = {
    position: 'absolute',
    top,
    height,
    left: 3,
    right: 3,
    backgroundColor: color,
    opacity: isDragging ? 0.55 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 50 : 2,
    borderRadius: 8,
    cursor: isDragging ? 'grabbing' : 'grab',
    overflow: 'hidden',
    userSelect: 'none',
    boxShadow: isDragging ? '0 8px 24px var(--color-shadow-xl)' : '0 1px 4px var(--color-shadow-md)',
    transition: isDragging ? 'none' : 'box-shadow 0.15s',
    borderRight: statusBorderColor ? `3px solid ${statusBorderColor}` : undefined,
    backgroundImage: isNoShow
      ? 'repeating-linear-gradient(45deg, var(--color-shadow-sm), var(--color-shadow-sm) 3px, transparent 3px, transparent 9px)'
      : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {/* Drag grip hint */}
      {height >= 24 && (
        <div className="absolute top-0.5 left-1 pointer-events-none select-none"
          style={{ fontSize: 8, lineHeight: 1, color: 'var(--color-white-25)', letterSpacing: 1 }}>
          ⠿
        </div>
      )}
      <button
        onClick={e => { e.stopPropagation(); onSelect(appt) }}
        onPointerDown={e => e.stopPropagation()}
        className="absolute inset-0 w-full h-full text-right px-2 py-1"
        tabIndex={-1}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <div className="text-white text-xs font-bold truncate leading-tight">
          {appt.profiles?.name}
        </div>
        {isTall && (
          <div className="text-white/85 text-xs truncate leading-tight">{appt.services?.name}</div>
        )}
        {isTall && (
          <div className="text-white/70 text-[10px] leading-tight">{formatTime(appt.start_at)} — {formatTime(appt.end_at)}</div>
        )}
        {isXTall && appt.profiles?.phone && (
          <div className="text-white/60 text-[10px] leading-tight mt-0.5">{appt.profiles.phone}</div>
        )}
        {isNoShow && height >= 28 && (
          <div className="text-white/90 text-[10px] font-bold leading-tight">✕ לא הגיע</div>
        )}
      </button>
    </div>
  )
}
