// VITE_HERE_MAPS_KEY handles all HERE calls — map rendering, geocoding, and routing
const REST_KEY = import.meta.env.VITE_HERE_MAPS_KEY

/**
 * HERE Geocoding only — location fields (geocode, address, neighborhood, city, state, zip).
 * HERE Discover (phone/website/venue_type) requires a paid Places tier not available on
 * this account; contact/info fields are handled by OSM Nominatim in Settings cleanup.
 *
 * venue  : { name, address, city, state, zip, lat?, lng? }
 * fields : array of field keys — any of:
 *   'geocode' | 'address' | 'neighborhood' | 'city' | 'state' | 'zip'
 *
 * Returns a flat object with whatever HERE found; missing fields are null.
 * Always includes _source: 'HERE'.
 */
export async function enrichFromHERE(venue, fields) {
  const result = { _source: 'HERE' }

  const LOC_FIELDS = ['geocode', 'address', 'neighborhood', 'city', 'state', 'zip']

  if (fields.some(f => LOC_FIELDS.includes(f))) {
    const parts = [venue.address, venue.city, venue.state, venue.zip].filter(Boolean)
    if (parts.length >= 2) {
      const url =
        `https://geocode.search.hereapi.com/v1/geocode` +
        `?q=${encodeURIComponent(parts.join(', '))}&limit=1&apiKey=${REST_KEY}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HERE Geocode ${res.status} — key may need Geocoding service enabled`)
      const { items } = await res.json()
      const it = items?.[0]
      if (it) {
        const a = it.address
        if (fields.includes('geocode')) {
          result.lat = it.position.lat
          result.lng = it.position.lng
        }
        if (fields.includes('address'))
          result.address = [a.houseNumber, a.street].filter(Boolean).join(' ') || null
        if (fields.includes('city'))         result.city         = a.city       ?? null
        if (fields.includes('state'))        result.state        = a.stateCode  ?? null
        if (fields.includes('zip'))          result.zip          = a.postalCode ?? null
        if (fields.includes('neighborhood')) result.neighborhood = a.district   ?? null
      }
    }
  }

  return result
}

/**
 * Geocode a full address string → { lat, lng, formattedAddress }
 * Used when adding new venues / tour stops.
 */
export async function geocodeAddress(address) {
  const url =
    `https://geocode.search.hereapi.com/v1/geocode` +
    `?q=${encodeURIComponent(address)}&limit=1&apiKey=${REST_KEY}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`)
  const data = await res.json()
  const item = data.items?.[0]
  if (!item) throw new Error(`No geocoding result for: ${address}`)
  return {
    lat: item.position.lat,
    lng: item.position.lng,
    formattedAddress: item.address.label,
  }
}

/**
 * Optimize the order of tour stops using HERE Routing API v8.
 *
 * First stop = fixed origin, last stop = fixed destination.
 * All middle stops are via-waypoints HERE will reorder.
 *
 * stops: [{ id, lat, lng, name, city, state }]
 *
 * Returns:
 *   orderedStops — stops in optimized sequence
 *   legs         — [{ durationHours, distanceMiles, encodedPolyline }] per leg
 */
export async function optimizeRoute(stops) {
  if (stops.length < 2) return { orderedStops: stops, legs: [] }

  const allStops = stops
  const [first, ...rest] = stops
  const last      = rest.length > 0 ? rest.pop() : null
  const midpoints = rest

  let url = `https://router.hereapi.com/v8/routes`
  url += `?transportMode=car`
  url += `&origin=${first.lat},${first.lng}`
  url += `&destination=${last ? `${last.lat},${last.lng}` : `${first.lat},${first.lng}`}`
  midpoints.forEach(s => { url += `&via=${s.lat},${s.lng}` })
  if (midpoints.length > 0) url += `&optimizeWaypointOrder=true`
  url += `&return=summary,polyline`
  url += `&apiKey=${REST_KEY}`

  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.title ?? `HERE routing failed (${res.status})`)
  }
  const data  = await res.json()
  const route = data.routes?.[0]
  if (!route) throw new Error('HERE returned no route')

  const sections = route.sections

  // O(1) coordinate index: grid key → stop (resolution ~220 m, ±1 cell tolerance)
  const GRID = 500
  const stopIndex = new Map()
  allStops.forEach(s => {
    if (s.lat == null || s.lng == null) return
    stopIndex.set(`${Math.round(s.lat * GRID)},${Math.round(s.lng * GRID)}`, s)
  })

  function findStop(lat, lng) {
    const r = Math.round(lat * GRID)
    const c = Math.round(lng * GRID)
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const s = stopIndex.get(`${r + dr},${c + dc}`)
        if (s) return s
      }
  }

  const seen    = new Set()
  const ordered = []

  for (let i = 0; i < sections.length; i++) {
    const dep    = sections[i].departure.place
    const depLat = dep.originalLocation?.lat ?? dep.location?.lat
    const depLng = dep.originalLocation?.lng ?? dep.location?.lng
    const match  = findStop(depLat, depLng)
    if (match && !seen.has(match.id)) { seen.add(match.id); ordered.push(match) }

    if (i === sections.length - 1) {
      const arr    = sections[i].arrival.place
      const arrLat = arr.originalLocation?.lat ?? arr.location?.lat
      const arrLng = arr.originalLocation?.lng ?? arr.location?.lng
      const arrMatch = findStop(arrLat, arrLng)
      if (arrMatch && !seen.has(arrMatch.id)) { seen.add(arrMatch.id); ordered.push(arrMatch) }
    }
  }

  if (ordered.length < stops.length) {
    console.warn('HERE optimize: coordinate match incomplete, using original order')
    return { orderedStops: stops, legs: [] }
  }

  const legs = sections.map(s => ({
    durationHours:   +(s.summary.duration / 3600).toFixed(1),
    distanceMiles:   +(s.summary.length   / 1609.34).toFixed(1),
    encodedPolyline: s.polyline,
  }))

  return { orderedStops: ordered, legs }
}
