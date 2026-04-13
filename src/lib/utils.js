import {
  format,
  addMinutes,
  isBefore,
  isAfter,
  parseISO,
  startOfDay,
  endOfDay,
  areIntervalsOverlapping,
  isSameDay,
} from 'date-fns'
import { he } from 'date-fns/locale'

// ── Date Formatters ──────────────────────────────────────────────

export function formatDate(date) {
  return format(new Date(date), 'dd/MM/yyyy', { locale: he })
}

export function formatTime(date) {
  return format(new Date(date), 'HH:mm')
}

export function formatDateFull(date) {
  return format(new Date(date), "EEEE, d בMMMM yyyy", { locale: he })
}

export function formatDateShort(date) {
  return format(new Date(date), 'd MMM', { locale: he })
}

// ── Slot Generation ──────────────────────────────────────────────

/**
 * Generate available time slots for a given staff member on a given date.
 *
 * @param {Object} params
 * @param {Date}   params.date             - The target date
 * @param {number} params.durationMinutes  - Duration of the service in minutes
 * @param {Object} params.staffHours       - { start_time: "09:00", end_time: "18:00", is_working: true }
 * @param {Object} params.businessHours    - { open_time: "09:00", close_time: "20:00", is_closed: false }
 * @param {Array}  params.existingAppointments - [{ start_at, end_at }]
 * @param {Array}  params.blockedTimes     - [{ start_at, end_at }]
 * @param {Object} params.smartScheduling  - { enabled, freeCount, appointmentCount }
 * @returns {Array} Array of { start: Date, end: Date, available: boolean }
 */
export function generateSlots({
  date,
  durationMinutes,
  staffHours,
  businessHours,
  existingAppointments = [],
  blockedTimes = [],
  recurringBreaks = [],
  smartScheduling = { enabled: false },
}) {
  if (!staffHours?.is_working || businessHours?.is_closed) return []

  const dayStart = parseDateWithTime(date, staffHours.start_time || businessHours.open_time)
  const dayEnd   = parseDateWithTime(date, staffHours.end_time   || businessHours.close_time)

  if (!dayStart || !dayEnd) return []

  const slots = []
  let current = dayStart
  const dayOfWeek = date.getDay()

  while (!isAfter(addMinutes(current, durationMinutes), dayEnd)) {
    const slotEnd = addMinutes(current, durationMinutes)
    const slot = { start: new Date(current), end: slotEnd }

    const isBusy = [...existingAppointments, ...blockedTimes].some(appt =>
      areIntervalsOverlapping(
        { start: slot.start, end: slot.end },
        { start: new Date(appt.start_at), end: new Date(appt.end_at) },
        { inclusive: false }
      )
    )

    const isBusyBreak = recurringBreaks.some(rb => {
      if (rb.day_of_week !== null && rb.day_of_week !== dayOfWeek) return false
      const breakStart = parseDateWithTime(date, rb.start_time)
      const breakEnd   = parseDateWithTime(date, rb.end_time)
      if (!breakStart || !breakEnd) return false
      return areIntervalsOverlapping(
        { start: slot.start, end: slot.end },
        { start: breakStart, end: breakEnd },
        { inclusive: false }
      )
    })

    if (!isBusy && !isBusyBreak) {
      slots.push(slot)
    }

    current = addMinutes(current, 15) // 15-minute granularity
  }

  // Apply Smart Scheduling filter
  if (smartScheduling.enabled && smartScheduling.appointmentCount >= smartScheduling.freeCount) {
    return filterSlotsSmartScheduling(slots, existingAppointments, date, smartScheduling)
  }

  return slots
}

/**
 * Smart Scheduling: Filter slots based on 3 configurable options:
 * - adjacent: slots right before/after existing appointments
 * - startOfDay: first available slot of the day
 * - endOfDay: last available slot of the day
 */
function filterSlotsSmartScheduling(availableSlots, existingAppointments, date, smartScheduling = {}) {
  if (availableSlots.length === 0) return []

  const {
    adjacent = true,
    startOfDay: allowStart = true,
    endOfDay: allowEnd = true,
  } = smartScheduling

  const dayAppts = existingAppointments
    .filter(a => isSameDay(new Date(a.start_at), date) && a.status !== 'cancelled')
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))

  const allowed = new Set()

  // Start of day: first slot
  if (allowStart) {
    allowed.add(availableSlots[0].start.getTime())
  }

  // End of day: last slot
  if (allowEnd) {
    allowed.add(availableSlots[availableSlots.length - 1].start.getTime())
  }

  // Adjacent to existing appointments
  if (adjacent && dayAppts.length > 0) {
    const firstStart = new Date(dayAppts[0].start_at)
    const lastEnd    = new Date(dayAppts[dayAppts.length - 1].end_at)

    availableSlots.forEach(slot => {
      const endsBeforeFirst = Math.abs(slot.end.getTime() - firstStart.getTime()) < 60000
      const startsAfterLast = Math.abs(slot.start.getTime() - lastEnd.getTime()) < 60000
      if (endsBeforeFirst || startsAfterLast) allowed.add(slot.start.getTime())
    })
  }

  // If no options selected, return all slots
  if (!allowStart && !allowEnd && !adjacent) return availableSlots

  return availableSlots.filter(slot => allowed.has(slot.start.getTime()))
}

// ── Gap Closer ───────────────────────────────────────────────────

/**
 * Find appointments that became "isolated" after a cancellation.
 * An isolated appointment has a gap before it OR after it of >= gapThreshold minutes,
 * but there exists a closer slot that would eliminate the gap.
 *
 * @param {Array}  appointments       - All confirmed appointments for the day (sorted)
 * @param {string} cancelledId        - ID of the just-cancelled appointment
 * @param {number} gapThreshold       - Min gap size in minutes to trigger (default 15)
 * @returns {Array} [{ appointment, suggestedSlot }]
 */
export function findGapOpportunities(appointments, cancelledId, gapThreshold = 15) {
  const dayAppts = appointments
    .filter(a => a.id !== cancelledId && a.status === 'confirmed')
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))

  if (dayAppts.length === 0) return []

  const opportunities = []

  dayAppts.forEach((appt, i) => {
    const prev = dayAppts[i - 1]
    const next = dayAppts[i + 1]

    const gapBefore = prev
      ? (new Date(appt.start_at) - new Date(prev.end_at)) / 60000
      : null
    const gapAfter = next
      ? (new Date(next.start_at) - new Date(appt.end_at)) / 60000
      : null

    // Appointment is isolated if surrounded by large gaps
    const isIsolated =
      (gapBefore === null || gapBefore > gapThreshold) &&
      (gapAfter === null || gapAfter > gapThreshold)

    if (isIsolated) {
      // Suggest moving this appointment to fill the cancelled slot
      opportunities.push({ appointment: appt, reason: 'isolated' })
    }
  })

  return opportunities
}

// ── Helpers ──────────────────────────────────────────────────────

function parseDateWithTime(date, timeStr) {
  if (!timeStr) return null
  const [hours, minutes] = timeStr.split(':').map(Number)
  const d = new Date(date)
  d.setHours(hours, minutes, 0, 0)
  return d
}

export function minutesToDisplay(minutes) {
  if (minutes < 60) return `${minutes} דקות`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}:${String(m).padStart(2, '0')} שעות` : `${h} שעה${h > 1 ? '' : ''}`
}

export function priceDisplay(price) {
  if (!price) return 'חינם'
  return `₪${Number(price).toFixed(0)}`
}

export function dayName(dayIndex) {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  return days[dayIndex]
}

export function isWithinCancellationWindow(startAt, cancellationHours) {
  const now = new Date()
  const apptTime = new Date(startAt)
  const hoursUntil = (apptTime - now) / (1000 * 60 * 60)
  return hoursUntil >= cancellationHours
}
