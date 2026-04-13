/**
 * Add N calendar days to a YYYY-MM-DD date string.
 * Uses local date math to avoid UTC-shift bugs.
 */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + n)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Build an ISO-8601 local datetime string from a YYYY-MM-DD date and a
 * decimal hour offset from midnight (e.g. 13.5 → "2026-05-04T13:30:00").
 * Clamps hours that overflow past midnight into the next calendar day.
 */
function toLocalISO(dateStr, decimalHour) {
  const totalMins = Math.round(decimalHour * 60)
  const extraDays = Math.floor(totalMins / (24 * 60))
  const minOfDay  = totalMins % (24 * 60)
  const hh = String(Math.floor(minOfDay / 60)).padStart(2, '0')
  const mm = String(minOfDay % 60).padStart(2, '0')
  const base = extraDays > 0 ? addDays(dateStr, extraDays) : dateStr
  return `${base}T${hh}:${mm}:00`
}

const DATE_FMT     = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const DATETIME_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * Parse a date or datetime string into a local Date without UTC-shift.
 * Handles "YYYY-MM-DD", "YYYY-MM-DDTHH:MM:SS", and "YYYY-MM-DDTHH:MM:SS+00:00".
 * All tour times are wall-clock local times — timezone offsets are stripped.
 */
function parseLocal(str) {
  if (!str) return null
  // Strip any timezone offset so JS treats it as local time (not UTC)
  const local = str.replace(/[Zz]$/, '').replace(/[+-]\d{2}:\d{2}$/, '')
  // Date-only: append midnight to avoid UTC interpretation
  return new Date(local.includes('T') ? local : local + 'T00:00:00')
}

/**
 * Format a date range as "Oct 14 – Nov 2, 2026".
 * Works with both date-only ("YYYY-MM-DD") and datetime ("YYYY-MM-DDTHH:MM:SS") strings.
 */
export function formatDateRange(startDate, endDate) {
  const s = parseLocal(startDate)
  const e = parseLocal(endDate)
  if (!s || !e) return ''
  const sYear = s.getFullYear()
  const eYear = e.getFullYear()
  if (sYear !== eYear) {
    return `${DATE_FMT.format(s)}, ${sYear} – ${DATE_FMT.format(e)}, ${eYear}`
  }
  return `${DATE_FMT.format(s)} – ${DATE_FMT.format(e)}, ${eYear}`
}

/**
 * Format an arrival datetime string as "May 4, 1:12 PM".
 * Falls back gracefully if the value is date-only or null.
 */
export function formatArrivalTime(datetimeStr) {
  if (!datetimeStr) return null
  const d = parseLocal(datetimeStr)
  if (!d) return null
  // If it has a time component and the time is not midnight, show date+time
  if (datetimeStr.includes('T') && !/T00:00:00/.test(datetimeStr)) {
    return DATETIME_FMT.format(d)
  }
  return DATE_FMT.format(d)
}

/**
 * Format a decimal hour (e.g. 20 → "8:00 PM", 13.5 → "1:30 PM").
 */
export function formatHour(h) {
  if (h == null) return '—'
  const totalMins = Math.round(h * 60)
  const hh = Math.floor(totalMins / 60) % 24
  const mm = totalMins % 60
  const period = hh >= 12 ? 'PM' : 'AM'
  const display = hh % 12 || 12
  return `${display}:${String(mm).padStart(2, '0')} ${period}`
}

/**
 * Convert "HH:MM" time string to decimal hours (e.g. "20:30" → 20.5).
 */
export function timeStrToHour(str) {
  if (!str) return 20
  const [h, m] = str.split(':').map(Number)
  return h + m / 60
}

/**
 * Convert decimal hours to "HH:MM" string (e.g. 20.5 → "20:30").
 */
export function hourToTimeStr(h) {
  if (h == null) return '20:00'
  const hh = Math.floor(h)
  const mm = Math.round((h % 1) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/**
 * Compute arrival_date and departure_date for each stop sequentially.
 *
 * Departure from a stop = show_start + show_duration + breakdown
 * (crew cannot leave until production is fully packed up)
 *
 * Arrival at next stop = departure + HERE travel time
 * Show day at next stop = that arrival day, unless crew arrives after
 * the setup deadline (show_start - production_setup), in which case
 * the show rolls to the following day.
 *
 * defaults:
 *   defaultShowStartHour         — decimal hour, e.g. 20 = 8 PM
 *   defaultShowDurationHours     — hours the show runs
 *   defaultProductionSetupHours  — hours of setup required before show start
 *   defaultBreakdownHours        — hours of breakdown required after show ends
 *   defaultRestDays              — extra days at venue (multi-night residency)
 *
 * legs: [{ durationHours }] from optimizeRoute, one per leg between stops.
 */
export function computeTourDates(stops, startDate, defaults = {}, legs = []) {
  const {
    defaultShowStartHour         = 20,
    defaultShowDurationHours     = 2,
    defaultProductionSetupHours  = 4,
    defaultBreakdownHours        = 2,
    defaultRestDays              = 0,
  } = defaults

  // elapsedHours: hours since startDate midnight when crew arrives at current stop
  let elapsedHours = 0

  return stops.map((stop, i) => {
    const showStart   = stop.show_start_hour           ?? defaultShowStartHour
    const duration    = stop.show_duration_hours       ?? defaultShowDurationHours
    const setup       = stop.production_setup_hours    ?? defaultProductionSetupHours
    const breakdown   = stop.breakdown_hours           ?? defaultBreakdownHours
    const restDays    = stop.rest_days                 ?? defaultRestDays

    // Capture arrival hour for THIS stop before the cursor advances
    const arrivalHourOfDay = i === 0 ? 0 : elapsedHours % 24

    // Which calendar day (offset from startDate) does the show fall on?
    let showDayOffset
    if (i === 0) {
      showDayOffset = 0
    } else {
      const arrivalDayOffset  = Math.floor(elapsedHours / 24)
      const setupDeadlineHour = showStart - setup  // crew must arrive by this hour

      showDayOffset = arrivalDayOffset
      if (arrivalHourOfDay > setupDeadlineHour) {
        // Crew arrived too late for today's setup; show moves to next day
        showDayOffset += 1
      }
    }

    // Multi-night residency: last show day is restDays after first show
    const lastShowDayOffset = showDayOffset + restDays

    // Crew departs after show + breakdown on last show day
    const hoursAfterMidnight = showStart + duration + breakdown
    const departureDayOffset = lastShowDayOffset + Math.floor(hoursAfterMidnight / 24)
    const departureHourOfDay = hoursAfterMidnight % 24

    // Advance cursor: crew arrives at next stop after travel
    const travelHours = legs[i]?.durationHours ?? 0
    elapsedHours = departureDayOffset * 24 + departureHourOfDay + travelHours

    return {
      ...stop,
      arrival_date:   toLocalISO(addDays(startDate, showDayOffset),      arrivalHourOfDay),
      departure_date: toLocalISO(addDays(startDate, departureDayOffset),  departureHourOfDay),
    }
  })
}
