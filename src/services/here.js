const KEY = import.meta.env.VITE_HERE_MAPS_KEY

/**
 * Geocode a full address string → { lat, lng, formattedAddress }
 */
export async function geocodeAddress(address) {
  const url =
    `https://geocode.search.hereapi.com/v1/geocode` +
    `?q=${encodeURIComponent(address)}&limit=1&apiKey=${KEY}`
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
 *   legs         — [{ durationHours, distanceMiles }] per leg
 */
export async function optimizeRoute(stops) {
  if (stops.length < 2) return { orderedStops: stops, legs: [] }

  const allStops = stops // keep reference for index mapping
  const [first, ...rest] = stops
  const last = rest.length > 0 ? rest.pop() : null
  const midpoints = rest // everything between first and last

  let url = `https://router.hereapi.com/v8/routes`
  url += `?transportMode=car`
  url += `&origin=${first.lat},${first.lng}`
  url += `&destination=${last ? `${last.lat},${last.lng}` : `${first.lat},${first.lng}`}`
  midpoints.forEach(s => { url += `&via=${s.lat},${s.lng}` })
  if (midpoints.length > 0) url += `&optimizeWaypointOrder=true`
  url += `&return=summary,polyline`
  url += `&apiKey=${KEY}`

  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.title ?? `HERE routing failed (${res.status})`)
  }
  const data = await res.json()
  const route = data.routes?.[0]
  if (!route) throw new Error('HERE returned no route')

  const sections = route.sections

  // Match a HERE-returned coordinate back to an original stop
  function findStop(lat, lng) {
    return allStops.find(s =>
      s.lat != null && s.lng != null &&
      Math.abs(s.lat - lat) < 0.002 &&
      Math.abs(s.lng - lng) < 0.002
    )
  }

  const seen    = new Set()
  const ordered = []

  for (let i = 0; i < sections.length; i++) {
    const dep = sections[i].departure.place
    const depLat = dep.originalLocation?.lat ?? dep.location?.lat
    const depLng = dep.originalLocation?.lng ?? dep.location?.lng
    const match = findStop(depLat, depLng)
    if (match && !seen.has(match.id)) { seen.add(match.id); ordered.push(match) }

    // Capture arrival of last section
    if (i === sections.length - 1) {
      const arr = sections[i].arrival.place
      const arrLat = arr.originalLocation?.lat ?? arr.location?.lat
      const arrLng = arr.originalLocation?.lng ?? arr.location?.lng
      const arrMatch = findStop(arrLat, arrLng)
      if (arrMatch && !seen.has(arrMatch.id)) { seen.add(arrMatch.id); ordered.push(arrMatch) }
    }
  }

  // Fallback: if coordinate matching missed any stop, return original order
  if (ordered.length < stops.length) {
    console.warn('HERE optimize: coordinate match incomplete, using original order')
    return { orderedStops: stops, legs: [] }
  }

  const legs = sections.map(s => ({
    durationHours:  +(s.summary.duration / 3600).toFixed(1),
    distanceMiles:  +(s.summary.length   / 1609.34).toFixed(1),
    encodedPolyline: s.polyline,
  }))

  return { orderedStops: ordered, legs }
}
