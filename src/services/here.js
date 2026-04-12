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
 * Haversine distance in miles between two {lat, lng} points.
 */
function haversineDistance(a, b) {
  const R    = 3958.8 // Earth radius in miles
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat +
            Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLng * sinLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Nearest-neighbor TSP heuristic.
 * Visits every stop in `pool` starting from `from`, always picking the closest unvisited stop.
 */
function nearestNeighborTSP(pool, from) {
  const remaining = [...pool]
  const ordered   = []
  let current     = from
  while (remaining.length > 0) {
    let bestIdx  = 0
    let bestDist = Infinity
    remaining.forEach((s, i) => {
      const d = haversineDistance(current, s)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    })
    const next = remaining.splice(bestIdx, 1)[0]
    ordered.push(next)
    current = next
  }
  return ordered
}

/**
 * Optimize the order of tour stops using nearest-neighbor TSP + HERE Routing API v8.
 *
 * First stop = fixed origin, last stop = fixed destination.
 * All middle stops are reordered client-side via TSP heuristic, then sent to HERE
 * in that order so the leg data matches the displayed sequence.
 *
 * stops: [{ id, lat, lng, name, city, state }]
 *
 * Returns:
 *   orderedStops — stops in optimized sequence
 *   legs         — [{ durationHours, distanceMiles, encodedPolyline }] per leg
 */
export async function optimizeRoute(stops) {
  if (stops.length < 2) return { orderedStops: stops, legs: [] }

  const [first, ...rest] = stops

  // TSP over ALL non-first stops — endpoint is determined by the heuristic,
  // not pre-fixed to whatever stop was added last.
  const tspOrdered = rest.length > 1
    ? nearestNeighborTSP(rest, first)
    : rest

  const orderedStops = [first, ...tspOrdered]
  const destination  = tspOrdered[tspOrdered.length - 1]
  const viaStops     = tspOrdered.slice(0, -1)  // everything between origin and destination

  let url = `https://router.hereapi.com/v8/routes`
  url += `?transportMode=car`
  url += `&origin=${first.lat},${first.lng}`
  url += `&destination=${destination.lat},${destination.lng}`
  viaStops.forEach(s => { url += `&via=${s.lat},${s.lng}` })
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

  const legs = route.sections.map(s => ({
    durationHours:   +(s.summary.duration / 3600).toFixed(1),
    distanceMiles:   +(s.summary.length   / 1609.34).toFixed(1),
    encodedPolyline: s.polyline,
  }))

  return { orderedStops, legs }
}
