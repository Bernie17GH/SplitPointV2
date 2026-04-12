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

const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/**
 * Format a date range as "Oct 14 – Nov 2, 2026".
 * Handles cross-year ranges correctly.
 */
export function formatDateRange(startDate, endDate) {
  const fmt = DATE_FMT
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate   + 'T00:00:00')
  const sYear = s.getFullYear()
  const eYear = e.getFullYear()
  if (sYear !== eYear) {
    return `${fmt.format(s)}, ${sYear} – ${fmt.format(e)}, ${eYear}`
  }
  return `${fmt.format(s)} – ${fmt.format(e)}, ${eYear}`
}

/**
 * Compute arrival_date and departure_date for each stop sequentially.
 *
 *   arrival[0]   = startDate
 *   departure[i] = arrival[i] + rest_days[i]        (days at venue)
 *   arrival[i+1] = departure[i] + buffer_days[i+1]  (travel / off days)
 *
 * Per-stop rest_days / buffer_days fall back to tour defaults when null.
 */
export function computeTourDates(stops, startDate, defaultRestDays = 1, defaultBufferDays = 1) {
  let cursor = startDate
  return stops.map((stop, i) => {
    const rest   = stop.rest_days   ?? defaultRestDays
    const buffer = stop.buffer_days ?? defaultBufferDays
    const arrival    = i === 0 ? cursor : addDays(cursor, buffer)
    const departure  = addDays(arrival, rest)
    cursor = departure
    return { ...stop, arrival_date: arrival, departure_date: departure }
  })
}
