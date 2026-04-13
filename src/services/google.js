/**
 * Google Custom Search JSON API — venue website and phone enrichment.
 * Free tier: 100 queries/day. Daily usage is tracked in localStorage
 * so the app never exceeds the free limit.
 *
 * Requires two env vars:
 *   VITE_GOOGLE_SEARCH_KEY — API key (Google Cloud Console)
 *   VITE_GOOGLE_SEARCH_CX  — Search Engine ID (programmablesearchengine.google.com)
 *
 * Fields supported: website, phone
 */

const SEARCH_URL  = 'https://www.googleapis.com/customsearch/v1'
const KEY         = import.meta.env.VITE_GOOGLE_SEARCH_KEY
const CX          = import.meta.env.VITE_GOOGLE_SEARCH_CX
const DAILY_LIMIT = 100
const STORAGE_KEY = 'splitpoint_google_search'

// ─── Usage tracking ───────────────────────────────────────────────────────────

function readUsage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { date: '', count: 0 }
  } catch {
    return { date: '', count: 0 }
  }
}

function saveUsage(usage) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(usage)) } catch {}
}

/** How many Google searches have been made today (resets at midnight). */
export function getGoogleUsageToday() {
  const today = new Date().toISOString().split('T')[0]
  const u = readUsage()
  return u.date === today ? u.count : 0
}

/** True when today's quota is exhausted. */
export function googleLimitReached() {
  return getGoogleUsageToday() >= DAILY_LIMIT
}

function increment() {
  const today = new Date().toISOString().split('T')[0]
  const u = readUsage()
  const count = u.date === today ? u.count + 1 : 1
  saveUsage({ date: today, count })
}

// ─── US phone number regex ────────────────────────────────────────────────────

const PHONE_RE = /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Search Google for a venue and extract website + phone from results.
 *
 * venue  : { name, city, state }
 * fields : subset of ['website', 'phone']
 *
 * Returns a partial result object. Never throws — Google is an optional pass.
 * Returns {} immediately if:
 *   - env vars are missing
 *   - daily limit is reached
 *   - no results found
 */
export async function enrichFromGoogle(venue, fields) {
  if (!KEY || !CX) return {}

  const wantWebsite = fields.includes('website')
  const wantPhone   = fields.includes('phone')
  if (!wantWebsite && !wantPhone) return {}

  if (googleLimitReached()) return {}

  const q = `"${venue.name}" ${[venue.city, venue.state].filter(Boolean).join(' ')}`

  const params = new URLSearchParams({ key: KEY, cx: CX, q, num: '3' })

  increment()

  try {
    const res = await fetch(`${SEARCH_URL}?${params}`)
    if (!res.ok) return {}
    const data  = await res.json()
    const items = data.items ?? []
    if (!items.length) return {}

    const result = { _source: 'Google' }

    if (wantWebsite) {
      result.website = items[0].link
    }

    if (wantPhone) {
      for (const item of items) {
        const match = (item.snippet ?? '').match(PHONE_RE)
        if (match) { result.phone = match[0]; break }
      }
    }

    // Only return if something useful was found
    if (!result.website && !result.phone) return {}
    return result
  } catch {
    return {}
  }
}
