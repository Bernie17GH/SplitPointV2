/**
 * OpenStreetMap Overpass API — venue data enrichment.
 * Free, no key required, CORS-enabled.
 * Coverage varies; best for well-known venues that have been mapped.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

/**
 * Look up venue details from OpenStreetMap.
 * venue: { name, city, state, lat?, lng? }
 * fields: array of field keys from ENRICH_FIELD_GROUPS
 * Returns a partial object with whatever OSM had; empty {} if not found.
 */
export async function enrichFromOSM(venue, fields) {
  // Escape OSM regex special chars in name / city
  const esc = s => (s ?? '').replace(/[[\](){}.*+?^$|\\]/g, '\\$&')
  const namePat = esc(venue.name)
  const cityPat = esc(venue.city)

  // If we have coordinates, use a bounding box search — more precise than name-only
  let areaFilter = `["addr:city"~"${cityPat}",i]`
  let aroundFilter = ''
  if (venue.lat && venue.lng) {
    // Search within 2 km of the known location
    aroundFilter = `(around:2000,${venue.lat},${venue.lng})`
    areaFilter = ''
  }

  const query = [
    '[out:json][timeout:20];',
    '(',
    `  node["name"~"${namePat}",i]${areaFilter}${aroundFilter};`,
    `  way["name"~"${namePat}",i]${areaFilter}${aroundFilter};`,
    `  relation["name"~"${namePat}",i]${areaFilter}${aroundFilter};`,
    ');',
    'out body center;',
  ].join('\n')

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) throw new Error(`OSM ${res.status}`)
  const data = await res.json()

  // Pick the element whose name best matches (case-insensitive exact first)
  const els = data.elements ?? []
  if (!els.length) return {}

  const lower = venue.name.toLowerCase()
  const best = els.find(e => (e.tags?.name ?? '').toLowerCase() === lower) ?? els[0]
  const t = best.tags ?? {}

  const result = { _matchedTitle: t.name, _source: 'OpenStreetMap' }

  if (fields.includes('geocode')) {
    result.lat = best.lat ?? best.center?.lat ?? null
    result.lng = best.lon ?? best.center?.lon ?? null
  }
  if (fields.includes('address')) {
    const num    = t['addr:housenumber'] ?? ''
    const street = t['addr:street'] ?? ''
    result.address = [num, street].filter(Boolean).join(' ') || null
  }
  if (fields.includes('neighborhood'))
    result.neighborhood = t['addr:neighbourhood'] ?? t['addr:suburb'] ?? t.neighbourhood ?? null
  if (fields.includes('city'))
    result.city  = t['addr:city']  ?? null
  if (fields.includes('state'))
    result.state = t['addr:state'] ?? null
  if (fields.includes('zip'))
    result.zip   = t['addr:postcode'] ?? null
  if (fields.includes('phone'))
    result.phone = t.phone ?? t['contact:phone'] ?? t['phone:main'] ?? null
  if (fields.includes('website'))
    result.website = t.website ?? t['contact:website'] ?? t.url ?? null
  if (fields.includes('capacity')) {
    const cap = t.capacity ?? t['capacity:persons']
    result.capacity = cap != null ? parseInt(cap, 10) : null
  }
  if (fields.includes('venue_type'))
    result.venue_type = t.amenity ?? t.leisure ?? t['building:use'] ?? null

  return result
}
