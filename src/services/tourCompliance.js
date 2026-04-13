/**
 * FMCSA Hours of Service + IATSE crew turnaround compliance checks.
 *
 * checkTourCompliance(stops, tour) returns an array of ComplianceWarning objects.
 * Runs against stored arrival_date / departure_date + travel_hours_from_prev —
 * no re-routing needed. Call after every optimization and on page load.
 */

export const FMCSA_MAX_DRIVE  = 10   // single-driver hard limit (hours)
export const FMCSA_WARN_DRIVE = 8    // single-driver advisory threshold
export const IATSE_MIN_TURNAROUND = 8 // absolute IATSE minimum (hours)

// ─── Internal helpers ─────────────────────────────────────────────────────────

function parseLocal(str) {
  if (!str) return null
  const s = str.replace(/[Zz]$/, '').replace(/[+-]\d{2}:\d{2}$/, '')
  return new Date(s.includes('T') ? s : s + 'T00:00:00')
}

/**
 * Compute IATSE crew turnaround hours between two consecutive stops.
 *
 * When show_end_time / load_in_time are set on the tour, use those for
 * precise load-out → load-in timing.  Otherwise derive from:
 *   load-out  = prev.departure_date  (already = show end + breakdown)
 *   load-in   = next show date @ (showStart − setupHours)
 */
function iatseTurnaround(prev, next, tour) {
  if (!prev.departure_date || !next.arrival_date) return null

  if (tour.show_end_time && tour.load_in_time) {
    // Precise: use tour-level load-out / load-in times
    const prevDate = prev.departure_date.split('T')[0]
    const nextDate = next.arrival_date.split('T')[0]
    const loadOut  = parseLocal(`${prevDate}T${tour.show_end_time}`)
    const loadIn   = parseLocal(`${nextDate}T${tour.load_in_time}`)
    if (!loadOut || !loadIn) return null
    return (loadIn - loadOut) / 3_600_000
  }

  // Approximate: departure → setup-deadline at next stop
  const showStart  = next.show_start_hour          ?? tour.default_show_start_hour        ?? 20
  const setupHours = next.production_setup_hours   ?? tour.default_production_setup_hours ?? 4
  const deadlineH  = showStart - setupHours             // decimal hour of day
  const hh = String(Math.floor(deadlineH)).padStart(2, '0')
  const mm = String(Math.round((deadlineH % 1) * 60)).padStart(2, '0')
  const showDate   = next.arrival_date.split('T')[0]
  const loadIn     = parseLocal(`${showDate}T${hh}:${mm}:00`)
  const departure  = parseLocal(prev.departure_date)
  if (!loadIn || !departure) return null
  return (loadIn - departure) / 3_600_000
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {Array}  stops  - ordered tour_stops rows (with venues joined)
 * @param {Object} tour   - tours row (includes driver_count, crew_turnaround_hrs, etc.)
 * @returns {Array} ComplianceWarning[]
 *
 * ComplianceWarning shape:
 *   { type, severity, stopId, stopIndex, prevCity, nextCity,
 *     driveHours?, turnaroundHours?, message, suggestedFix }
 */
export function checkTourCompliance(stops, tour) {
  if (!tour || stops.length < 2) return []

  const warnings         = []
  const driverCount      = tour.driver_count        ?? 1
  const crewTurnaround   = tour.crew_turnaround_hrs ?? 10

  stops.forEach((stop, i) => {
    if (i === 0) return
    const prev       = stops[i - 1]
    const driveHours = stop.travel_hours_from_prev ?? stop.estimated_drive_hours
    const prevCity   = prev.venues?.city  ?? '?'
    const nextCity   = stop.venues?.city  ?? '?'

    // ── FMCSA drive-time checks ───────────────────────────────────────────────
    // Skip if tour is running a 2-driver team OR this specific leg is flagged for 2 drivers
    if (driveHours != null && driverCount === 1 && !stop.requires_two_driver) {
      if (driveHours > FMCSA_MAX_DRIVE) {
        warnings.push({
          type:          'FMCSA_DRIVE_LIMIT',
          severity:      'error',
          stopId:        stop.id,
          stopIndex:     i,
          prevCity, nextCity, driveHours,
          message:       `${driveHours.toFixed(1)}h drive exceeds the 10h single-driver FMCSA limit.`,
          suggestedFix:  'TWO_DRIVER_OR_REST_STOP',
        })
      } else if (driveHours > FMCSA_WARN_DRIVE) {
        warnings.push({
          type:          'FMCSA_DRIVE_ADVISORY',
          severity:      'warning',
          stopId:        stop.id,
          stopIndex:     i,
          prevCity, nextCity, driveHours,
          message:       `${driveHours.toFixed(1)}h drive is approaching the 10h single-driver FMCSA limit.`,
          suggestedFix:  'CONSIDER_TWO_DRIVER',
        })
      }
    }

    // ── IATSE crew turnaround checks ──────────────────────────────────────────
    // Skip for transit_rest → show legs (crew is already resting at a rest stop)
    if (prev.stop_type === 'transit_rest' || stop.stop_type === 'transit_rest') return

    const turnaround = iatseTurnaround(prev, stop, tour)
    if (turnaround != null) {
      if (turnaround < IATSE_MIN_TURNAROUND) {
        warnings.push({
          type:             'CREW_TURNAROUND',
          severity:         'error',
          stopId:           stop.id,
          stopIndex:        i,
          prevCity, nextCity, turnaroundHours: turnaround, crewTurnaround,
          message:          `Only ${turnaround.toFixed(1)}h crew turnaround — below the 8h IATSE minimum.`,
          suggestedFix:     'ADD_BUFFER_DAY',
        })
      } else if (turnaround < crewTurnaround) {
        warnings.push({
          type:             'CREW_TURNAROUND_ADVISORY',
          severity:         'warning',
          stopId:           stop.id,
          stopIndex:        i,
          prevCity, nextCity, turnaroundHours: turnaround, crewTurnaround,
          message:          `${turnaround.toFixed(1)}h crew turnaround is below your ${crewTurnaround}h preference.`,
          suggestedFix:     'ADD_BUFFER_DAY',
        })
      }
    }
  })

  return warnings
}
