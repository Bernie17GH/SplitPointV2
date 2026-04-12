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
 * Look up venue details from OpenStreetMap via Nominatim.
 * venue  : { name, city, state, address?, lat?, lng? }
 * fields : array of field keys
 * Returns a partial object; empty {} if not found.
 * Throws on network / non-200 response so callers can surface the error.
 */
export async function enrichFromOSM(venue, fields) {
  const q = [venue.name, venue.city, venue.state, 'USA'].filter(Boolean).join(', ')

  const params = new URLSearchParams({
    q,
    format:         'json',
    addressdetails: '1',
    extratags:      '1',
    limit:          '5',
  })

  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': 'SplitPoint-venue-lookup/1.0' },
  })
  if (!res.ok) throw new Error(`OSM ${res.status}`)
  const items = await res.json()
  if (!items.length) return {}

  // Pick the result whose display name best matches the venue name
  const lower = venue.name.toLowerCase()
  const best  =
    items.find(i => i.display_name.toLowerCase().includes(lower)) ?? items[0]

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
