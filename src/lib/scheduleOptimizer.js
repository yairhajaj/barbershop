// ─── Smart Gap Closer / Schedule Optimizer ──────────────────────────────────
//
// אלגוריתם דחיסת יום חכם:
// במקום למלא את החור שנוצר מביטול, מסתכלים על כל היום של אותו ספר
// ומחפשים תרחיש הזזה שמייצר את הבלוק הרציף הארוך ביותר עם מינימום הזזות.
//
// עקרונות מנחים:
//  1. דחיסת יום > מילוי חור — ה-slot שהתפנה לא בהכרח אמור להתמלא
//  2. מינימום הזזות — תרחיש 1-לקוח עם תוצאה דומה > תרחיש 2-לקוחות
//  3. גם הקדמה וגם דחייה מותרות (העדפה קלה להקדמה)
//  4. סדרתי חכם — מחזירים עד 3 תרחישים עם לקוחות שונים, לניסיונות סדרתיים
//  5. הקשר מלא — כל הצעה נבדקת על מודל היום השלם (אין חפיפות)
// ────────────────────────────────────────────────────────────────────────────

const TOLERANCE_MS = 5 * 60 * 1000 // 5 דקות סבילות לזיהוי "צמודים"

function normalizeAppt(a) {
  const start = new Date(a.start_at)
  const fallbackDuration = (a.services?.duration_minutes || 30) * 60000
  const end = a.end_at ? new Date(a.end_at) : new Date(start.getTime() + fallbackDuration)
  return { id: a.id, customer_id: a.customer_id, start, end, raw: a }
}

/**
 * Build day metrics: blocks of contiguous appointments + total idle time.
 * @param {Array<{start: Date, end: Date}>} day - sorted by start
 */
function computeMetrics(day) {
  if (day.length === 0) return { totalIdle: 0, maxBlockSize: 0, blocks: [] }

  const blocks = []
  let current = [day[0]]
  for (let i = 1; i < day.length; i++) {
    const prevEnd = day[i - 1].end.getTime()
    const curStart = day[i].start.getTime()
    if (Math.abs(curStart - prevEnd) <= TOLERANCE_MS) {
      current.push(day[i])
    } else {
      blocks.push(current)
      current = [day[i]]
    }
  }
  blocks.push(current)

  const maxBlockSize = blocks.reduce((m, b) => Math.max(m, b.length), 0)
  let totalIdle = 0
  for (let i = 1; i < blocks.length; i++) {
    const prevEnd = blocks[i - 1][blocks[i - 1].length - 1].end.getTime()
    const curStart = blocks[i][0].start.getTime()
    totalIdle += Math.max(0, (curStart - prevEnd) / 60000)
  }
  return { totalIdle, maxBlockSize, blocks }
}

/**
 * Detects any overlapping appointments in a sorted day.
 */
function hasOverlaps(day) {
  for (let i = 1; i < day.length; i++) {
    if (day[i].start.getTime() < day[i - 1].end.getTime() - 100) return true
  }
  return false
}

/**
 * Collect candidate new-start positions for moving `target` somewhere useful.
 * Candidate positions are the start/end of every other appointment — moving
 * `target` to be adjacent to another appointment is what creates blocks.
 */
function collectCandidateStarts(target, day, dayBounds) {
  const duration = target.end.getTime() - target.start.getTime()
  const positions = new Set()
  for (const other of day) {
    if (other.id === target.id) continue
    // Adjacent right-after other: target.start = other.end
    positions.add(other.end.getTime())
    // Adjacent right-before other: target.end = other.start
    positions.add(other.start.getTime() - duration)
  }
  // Also bound by the day's earliest/latest activity (rough work-hours proxy)
  if (dayBounds) {
    positions.add(dayBounds.earliest.getTime())
    positions.add(dayBounds.latest.getTime() - duration)
  }
  return [...positions]
    .map(t => new Date(t))
    .filter(d => !isNaN(d.getTime()))
}

function scoreScenario({ maxBlockSize, idleSaved, moveCount, totalShift, allEarlier }) {
  return (maxBlockSize * 100)
    + (idleSaved * 2)
    - (moveCount * 50)        // עונש כבד על כל לקוח שמוטרד
    - (totalShift * 0.5)      // עונש קל על מאמץ הלקוחות
    + (allEarlier ? 10 : 0)   // בונוס קל להעדפת הקדמה
}

function buildDescription(maxBlockSize, idleSaved, direction) {
  const parts = []
  if (maxBlockSize >= 3) parts.push(`${maxBlockSize} תורים רצופים`)
  else if (maxBlockSize === 2) parts.push(`2 תורים רצופים`)
  if (idleSaved > 0) parts.push(`חוסך ${Math.round(idleSaved)} דק׳ זמן מת`)
  if (direction === 'later') parts.push(`(דחייה)`)
  return parts.join(' • ')
}

/**
 * Find up to N optimal reschedule scenarios for compacting a staff's day.
 *
 * @param {Array} dayAppointments - confirmed appointments for one staff one day
 *                                  (with profiles, services joined; status, start_at, end_at)
 * @param {Object} options
 * @param {number} options.threshold     - min shift in minutes (default 15)
 * @param {number} options.maxShift      - max shift in minutes (default 90)
 * @param {number} options.maxScenarios  - max scenarios to return (default 3)
 * @param {Date}   options.workStart     - optional earliest allowed time
 * @param {Date}   options.workEnd       - optional latest allowed time
 *
 * @returns {Array<{
 *   appointment, newStart, newEnd, timeSaved, shiftMinutes, direction,
 *   description, idleSavedMinutes, maxBlockSize, score
 * }>}
 *   Each scenario is a single 1-move suggestion. Returned ordered by quality
 *   (best first), with at most one move per customer (so retry hits another customer).
 */
export function findOptimalRescheduleScenarios(dayAppointments, options = {}) {
  const {
    threshold = 15,
    maxShift = 90,
    maxScenarios = 3,
    workStart = null,
    workEnd = null,
  } = options

  // 1. Filter & normalize
  const day = (dayAppointments || [])
    .filter(a => a.status === 'confirmed' && a.profiles?.phone)
    .map(normalizeAppt)
    .sort((a, b) => a.start - b.start)

  if (day.length < 2) return []

  const baseline = computeMetrics(day)
  // אם היום כבר מרצוף לחלוטין — אין מה לעשות
  if (baseline.totalIdle < threshold) return []

  // Day bounds proxy for work hours
  const dayBounds = {
    earliest: workStart || day[0].start,
    latest: workEnd || day[day.length - 1].end,
  }

  // 2. Enumerate all 1-move scenarios
  const scenarios = []
  for (const target of day) {
    const candidates = collectCandidateStarts(target, day, dayBounds)
    const duration = target.end.getTime() - target.start.getTime()

    for (const newStart of candidates) {
      const newEnd = new Date(newStart.getTime() + duration)
      const shift = Math.abs(newStart.getTime() - target.start.getTime()) / 60000

      if (shift < threshold) continue
      if (shift > maxShift) continue
      if (newStart < dayBounds.earliest) continue
      if (newEnd > dayBounds.latest) continue

      // Apply the move and re-sort
      const newDay = day
        .map(a => a.id === target.id ? { ...a, start: newStart, end: newEnd } : a)
        .sort((a, b) => a.start - b.start)

      if (hasOverlaps(newDay)) continue

      const metrics = computeMetrics(newDay)
      const idleSaved = baseline.totalIdle - metrics.totalIdle

      // חייבים שהמהלך אכן יחסוך זמן מת משמעותי
      if (idleSaved < threshold) continue
      // חייב לשפר או לפחות לשמור על גודל בלוק מקסימלי
      if (metrics.maxBlockSize < baseline.maxBlockSize) continue

      const direction = newStart.getTime() < target.start.getTime() ? 'earlier' : 'later'
      const score = scoreScenario({
        maxBlockSize: metrics.maxBlockSize,
        idleSaved,
        moveCount: 1,
        totalShift: shift,
        allEarlier: direction === 'earlier',
      })

      scenarios.push({
        appointment: target.raw,
        newStart,
        newEnd,
        timeSaved: direction === 'earlier' ? Math.round(shift) : -Math.round(shift),
        shiftMinutes: Math.round(shift),
        direction,
        description: buildDescription(metrics.maxBlockSize, idleSaved, direction),
        idleSavedMinutes: Math.round(idleSaved),
        maxBlockSize: metrics.maxBlockSize,
        score,
      })
    }
  }

  if (scenarios.length === 0) return []

  // 3. Sort best-first
  scenarios.sort((a, b) => b.score - a.score)

  // 4. Pick distinct-customer scenarios so a retry hits a different customer
  const picked = []
  const usedCustomers = new Set()
  for (const s of scenarios) {
    const cid = s.appointment.customer_id
    if (usedCustomers.has(cid)) continue
    usedCustomers.add(cid)
    picked.push(s)
    if (picked.length >= maxScenarios) break
  }

  return picked
}
