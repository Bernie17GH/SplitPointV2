/**
 * OpenStreetMap Nominatim — venue data enrichment.
 * Free, no API key required, CORS-enabled, more reliable than Overpass.
 * Uses extratags to return phone, website, and other venue details.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

// Nominatim returns full state names; map to 2-letter codes
const STATE_ABBR = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
  'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
  'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC',
  'North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA',
  'Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN',
  'Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA',
  'West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY','District of Columbia':'DC',
}

/**
 * Score how well a Nominatim result matches the venue name.
 * Counts how many words from the venue name appear in the display_name.
 * Returns a value 0–1; 1 = all words matched.
 */
function matchScore(venueName, displayName) {
  const haystack = displayName.toLowerCase()
  const words    = venueName.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  if (!words.length) return 0
  const matched  = words.filter(w => haystack.includes(w)).length
  return matched / words.length
}

/**
 * Run one Nominatim search and return the parsed JSON array.
 * Returns [] on any non-200 or network error.
 */
async function nominatimSearch(params) {
  params.set('format',         'json')
  params.set('addressdetails', '1')
  params.set('extratags',      '1')
  params.set('limit',          '5')
  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'User-Agent': 'SplitPoint-venue-lookup/1.0' },
    })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

/**
 * Look up venue details from OpenStreetMap via Nominatim.
 * Tries three search strategies in order and picks the best-matching result:
 *   1. Structured search  — amenity name + city + country
 *   2. Free-text search   — name + city + country
 *   3. Free-text fallback — name + zip (if zip available)
 *
 * venue  : { name, city, state, zip?, address?, lat?, lng? }
 * fields : array of field keys
 * Returns a partial object; empty {} if not found.
 * Throws only on hard errors so callers can surface them.
 */
export async function enrichFromOSM(venue, fields) {
  // Strategy 1: structured search (amenity = venue name, scoped to city)
  const structuredParams = new URLSearchParams({
    amenity: venue.name,
    city:    venue.city ?? '',
    country: 'US',
  })

  // Strategy 2: free-text name + city
  const cityParams = new URLSearchParams({
    q: [venue.name, venue.city, 'USA'].filter(Boolean).join(', '),
  })

  // Strategy 3: free-text name + zip (if available)
  const zipParams = venue.zip ? new URLSearchParams({
    q: [venue.name, venue.zip, 'USA'].filter(Boolean).join(', '),
  }) : null

  const [structured, byCity, byZip] = await Promise.all([
    nominatimSearch(structuredParams),
    nominatimSearch(cityParams),
    zipParams ? nominatimSearch(zipParams) : Promise.resolve([]),
  ])

  // Merge all candidates, score each, pick the best match above threshold
  const allItems = [...structured, ...byCity, ...byZip]
  if (!allItems.length) return {}

  const scored = allItems.map(i => ({ item: i, score: matchScore(venue.name, i.display_name) }))
  scored.sort((a, b) => b.score - a.score)

  // Accept result if at least half the meaningful words matched; else skip
  if (scored[0].score < 0.5) return {}
  const best = scored[0].item

  const ext  = best.extratags ?? {}
  const addr = best.address   ?? {}
  const result = { _matchedTitle: addr.amenity ?? addr.building ?? best.display_name.split(',')[0], _source: 'OpenStreetMap' }

  if (fields.includes('geocode')) {
    result.lat = parseFloat(best.lat)
    result.lng = parseFloat(best.lon)
  }
  if (fields.includes('address')) {
    result.address = [addr.house_number, addr.road].filter(Boolean).join(' ') || null
  }
  if (fields.includes('neighborhood'))
    result.neighborhood = addr.neighbourhood ?? addr.quarter ?? addr.suburb ?? null
  if (fields.includes('city'))
    result.city  = addr.city ?? addr.town ?? addr.village ?? null
  if (fields.includes('state'))
    result.state = STATE_ABBR[addr.state] ?? addr.state ?? null
  if (fields.includes('zip'))
    result.zip   = addr.postcode ?? null
  if (fields.includes('phone'))
    result.phone = ext.phone ?? ext['contact:phone'] ?? null
  if (fields.includes('website'))
    result.website = ext.website ?? ext['contact:website'] ?? ext.url ?? null
  if (fields.includes('capacity')) {
    const cap = ext.capacity ?? ext['capacity:persons']
    result.capacity = cap != null ? parseInt(cap, 10) : null
  }
  if (fields.includes('venue_type'))
    result.venue_type = addr.amenity ?? ext.amenity ?? ext.leisure ?? null

  return result
}
