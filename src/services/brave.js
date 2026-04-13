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

/** Queries remaining this calendar month (never negative). */
export function getBraveQueriesRemaining() {
  return Math.max(0, MONTHLY_LIMIT - getBraveUsageThisMonth())
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
    const webResults = data.web?.results ?? []

    // Brave's infobox = knowledge panel for the business (most reliable source)
    const infobox = data.infobox?.results?.[0]

    const result = { _source: 'Brave' }

    if (wantWebsite) {
      // 1. Infobox URL is the official site when present
      const infoboxUrl = infobox?.url ?? infobox?.profiles?.[0]?.url
      if (infoboxUrl && !isAggregator(infoboxUrl)) {
        result.website = infoboxUrl
      } else {
        // 2. Fall back to first non-aggregator web result
        const official = webResults.find(r => !isAggregator(r.url))
        if (official) result.website = official.url
      }
    }

    if (wantPhone) {
      // 1. Infobox attributes (structured data from Brave's knowledge panel)
      const phoneAttr = infobox?.attributes?.find(a =>
        /phone|telephone|contact/i.test(a.name ?? a.label ?? '')
      )
      if (phoneAttr?.value) result.phone = phoneAttr.value

      // 2. site:<domain> Brave search — Brave's crawler executes JavaScript, so
      //    rendered footer content (where phone numbers usually live) appears in
      //    snippets even though a plain fetch() would miss it entirely.
      if (!result.phone && result.website && !braveLimitReached()) {
        try {
          const domain = new URL(result.website).hostname
          increment()
          const siteRes = await fetch(`/api/search?q=${encodeURIComponent(`site:${domain}`)}&count=10`)
          if (siteRes.ok) {
            const siteData    = await siteRes.json()
            const siteResults = siteData.web?.results ?? []
            for (const r of siteResults) {
              const text  = `${r.title ?? ''} ${r.description ?? ''}`
              const match = text.match(PHONE_RE)
              if (match) { result.phone = match[0]; break }
            }
            // Also check the infobox that comes back with the site: query
            if (!result.phone) {
              const siteInbox = siteData.infobox?.results?.[0]
              const attr = siteInbox?.attributes?.find(a =>
                /phone|telephone|contact/i.test(a.name ?? a.label ?? '')
              )
              if (attr?.value) result.phone = attr.value
            }
          }
        } catch {}
      }

      // 3. Raw page fetch — works for static/server-rendered sites where the phone
      //    is present in the raw HTML (homepage, contact page, /about-us, etc.)
      if (!result.phone && result.website) {
        try {
          const pageRes = await fetch(`/api/fetch-page?url=${encodeURIComponent(result.website)}`)
          if (pageRes.ok) {
            const { phone } = await pageRes.json()
            if (phone) result.phone = phone
          }
        } catch {}
      }

      // 4. Scan the initial Brave web snippets
      if (!result.phone) {
        for (const r of webResults) {
          const text  = `${r.title ?? ''} ${r.description ?? ''}`
          const match = text.match(PHONE_RE)
          if (match) { result.phone = match[0]; break }
        }
      }

      // 5. Targeted phone search — appending "phone number" biases Brave toward
      //    business-listing results that put the number directly in the snippet
      if (!result.phone && !braveLimitReached()) {
        const phoneQ = `"${venue.name}" ${[venue.city, venue.state].filter(Boolean).join(' ')} phone number`
        increment()
        try {
          const phoneRes = await fetch(`/api/search?q=${encodeURIComponent(phoneQ)}&count=5`)
          if (phoneRes.ok) {
            const phoneData  = await phoneRes.json()
            const phoneInbox = phoneData.infobox?.results?.[0]
            const attr = phoneInbox?.attributes?.find(a =>
              /phone|telephone|contact/i.test(a.name ?? a.label ?? '')
            )
            if (attr?.value) {
              result.phone = attr.value
            } else {
              const phoneResults = phoneData.web?.results ?? []
              for (const r of phoneResults) {
                const text  = `${r.title ?? ''} ${r.description ?? ''}`
                const match = text.match(PHONE_RE)
                if (match) { result.phone = match[0]; break }
              }
            }
          }
        } catch {}
      }
    }

    if (!result.website && !result.phone) return {}
    return result
  } catch {
    return {}
  }
}
