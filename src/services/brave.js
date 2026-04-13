/**
 * Brave Search — venue website and phone enrichment.
 * Calls our own /api/search proxy (Vercel serverless) which holds the key server-side.
 *
 * Free tier: 2,000 queries/month. Monthly usage tracked in localStorage.
 * Fields supported: website, phone
 */

const MONTHLY_LIMIT = 2000
const STORAGE_KEY   = 'splitpoint_brave_search'

// ─── Usage tracking ───────────────────────────────────────────────────────────

function readUsage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { month: '', count: 0 }
  } catch {
    return { month: '', count: 0 }
  }
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Queries used so far this calendar month. */
export function getBraveUsageThisMonth() {
  const u = readUsage()
  return u.month === currentMonth() ? u.count : 0
}

/** True when this month's quota is exhausted. */
export function braveLimitReached() {
  return getBraveUsageThisMonth() >= MONTHLY_LIMIT
}

function increment() {
  const month = currentMonth()
  const u     = readUsage()
  const count = u.month === month ? u.count + 1 : 1
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ month, count })) } catch {}
}

// ─── Known aggregator domains to skip when looking for official site ──────────

const AGGREGATORS = [
  // Ticketing
  'ticketmaster.com', 'livenation.com', 'axs.com', 'stubhub.com',
  'seatgeek.com', 'vividseats.com', 'eventbrite.com', 'concerts.com',
  // Concert listings
  'bandsintown.com', 'songkick.com', 'setlist.fm', 'jambase.com',
  'artistandfan.com', 'concerts50.com', 'concertful.com', 'goout.net',
  // Reviews / directories
  'yelp.com', 'tripadvisor.com', 'foursquare.com', 'timeout.com',
  // Social / encyclopedic
  'google.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'tiktok.com', 'youtube.com', 'reddit.com', 'wikipedia.org', 'wikidata.org',
  // Music info
  'allmusic.com', 'last.fm', 'discogs.com', 'rateyourmusic.com',
  // Press / editorial
  'backstageaxxess.com', 'smithsonianmag.com', 'rollingstone.com',
  'pitchfork.com', 'billboard.com',
]

function isAggregator(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return AGGREGATORS.some(a => host === a || host.endsWith('.' + a))
  } catch { return false }
}

// ─── US phone number regex ────────────────────────────────────────────────────

const PHONE_RE = /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Search the web for a venue and extract website + phone from results.
 *
 * venue  : { name, city, state, venue_type? }
 * fields : subset of ['website', 'phone']
 *
 * Never throws — Brave is an optional enrichment pass.
 */
export async function enrichFromBrave(venue, fields) {
  const wantWebsite = fields.includes('website')
  const wantPhone   = fields.includes('phone')
  if (!wantWebsite && !wantPhone) return {}

  if (braveLimitReached()) return {}

  // Adding "venue" anchors the search to the right category
  const q = `"${venue.name}" ${[venue.city, venue.state].filter(Boolean).join(' ')} venue`

  increment()

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&count=5`)
    if (!res.ok) return {}
    const data    = await res.json()
    const results = data.web?.results ?? []
    if (!results.length) return {}

    const result = { _source: 'Brave' }

    if (wantWebsite) {
      // Prefer the first non-aggregator result as the official site
      const official = results.find(r => !isAggregator(r.url))
      if (official) result.website = official.url
    }

    if (wantPhone) {
      // Scan all snippets for a US phone number
      for (const r of results) {
        const text  = `${r.title ?? ''} ${r.description ?? ''}`
        const match = text.match(PHONE_RE)
        if (match) { result.phone = match[0]; break }
      }
    }

    if (!result.website && !result.phone) return {}
    return result
  } catch {
    return {}
  }
}
