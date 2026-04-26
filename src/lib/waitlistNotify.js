// ─── Waitlist Notification — Shared Helper ───────────────────────────────────
//
// Called from EVERY cancellation path to ensure waitlist members are always
// notified immediately when a slot opens — independent of Gap Closer mode,
// advance_hours settings, or how/where the appointment was cancelled.
//
// Gap Closer step 1 (in Appointments.jsx confirmCancel) also calls notify-waitlist
// separately and manages the cascade UI — do NOT call this helper from there to
// avoid double-notifications.
// ────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'

/**
 * Fire-and-forget: notify the first matching waitlist member that a slot opened.
 *
 * @param {Object} appointment - The cancelled appointment object.
 *   Required fields: service_id, start_at, end_at
 *   Optional (for message): branch_id, staff_id, staff?.name, services?.name
 * @param {string} notifChannel - 'push' | 'whatsapp' (default: 'push')
 */
export function notifyWaitlistOnCancellation(appointment, notifChannel = 'push') {
  if (!appointment?.service_id || !appointment?.start_at) return

  supabase.functions
    .invoke('notify-waitlist', {
      body: {
        serviceId:           appointment.service_id,
        branchId:            appointment.branch_id  ?? null,
        staffId:             appointment.staff_id   ?? null,
        staffName:           appointment.staff?.name ?? '',
        slotStart:           appointment.start_at,
        slotEnd:             appointment.end_at,
        serviceName:         appointment.services?.name ?? '',
        notificationChannel: notifChannel,
      },
    })
    .catch(() => {}) // Silent fail — never break the cancel flow
}
