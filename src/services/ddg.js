/**
 * DuckDuckGo Instant Answer API — venue enrichment.
 * Free, no API key, CORS-enabled.
 * Pulls from Wikidata/Wikipedia knowledge panels.
 *
 * Best for well-known venues (stadium, amphitheatre, large club).
 * Returns nothing for small venues that aren't in Wikidata.
 *
 * Fields supported: website, phone, capacity
 */

const DDG_URL = 'https://api.duckduckgo.com/'

/**
 * Find a value in a DDG infobox by label keyword (case-insensitive).
 */
function infoboxGet(content, ...keywords) {
  for (const entry of content) {
    const label = (entry.label ?? '').toLowerCase()
    if (keywords.some(kw => label.includes(kw))) {
      return typeof entry.value === 'string' ? entry.value.trim() : null
    }
  }
  return null
}

/**
 * Enrich a venue with data from DuckDuckGo Instant Answer API.
 *
 * venue  : { name, city, state }
 * fields : subset of ['website', 'phone', 'capacity']
 *
 * Returns a partial object with whatever was found.
 * Always resolves (never throws) — DDG is an optional enhancement.
 */
export async function enrichFromDDG(venue, fields) {
  const wantWebsite  = fields.includes('website')
  const wantPhone    = fields.includes('phone')
  const wantCapacity = fields.includes('capacity')
  if (!wantWebsite && !wantPhone && !wantCapacity) return {}

  const q = [venue.name, venue.city, venue.state].filter(Boolean).join(' ')

  const params = new URLSearchParams({
    q,
    format:        'json',
    no_html:       '1',
    skip_disambig: '1',
  })

  try {
    const res = await fetch(`${DDG_URL}?${params}`, {
      headers: { 'User-Agent': 'SplitPoint-venue-lookup/1.0' },
    })
    if (!res.ok) return {}
    const data = await res.json()

    // DDG returns '' (empty string) when there's no infobox
    const content = Array.isArray(data.Infobox?.content) ? data.Infobox.content : []
    if (!content.length && !data.AbstractURL) return {}

    const result = { _source: 'DDG' }

    if (wantWebsite) {
      const site = infoboxGet(content, 'official website', 'website', 'url', 'web')
      if (site) {
        result.website = site
      } else if (
        data.AbstractURL &&
        !data.AbstractURL.includes('wikipedia') &&
        !data.AbstractURL.includes('wikidata')
      ) {
        result.website = data.AbstractURL
      }
    }

    if (wantPhone) {
      const phone = infoboxGet(content, 'phone', 'telephone', 'contact')
      if (phone) result.phone = phone
    }

    if (wantCapacity) {
      const cap = infoboxGet(content, 'capacity')
      if (cap) {
        // Capacity may be "9,525" or "Basketball: 19,812, Concerts: 22,000"
        // Extract the first plain number
        const match = cap.replace(/,/g, '').match(/\d+/)
        if (match) result.capacity = parseInt(match[0], 10)
      }
    }

    // Only return if we actually found something useful
    if (!result.website && !result.phone && result.capacity == null) return {}
    return result
  } catch {
    return {}
  }
}
