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

// ─── US phone number regex ────────────────────────────────────────────────────

const PHONE_RE = /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Search the web for a venue and extract website + phone from results.
 *
 * venue  : { name, city, state }
 * fields : subset of ['website', 'phone']
 *
 * Never throws — Brave is an optional enrichment pass.
 */
export async function enrichFromBrave(venue, fields) {
  const wantWebsite = fields.includes('website')
  const wantPhone   = fields.includes('phone')
  if (!wantWebsite && !wantPhone) return {}

  if (braveLimitReached()) return {}

  const q = `"${venue.name}" ${[venue.city, venue.state].filter(Boolean).join(' ')}`

  increment()

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&count=3`)
    if (!res.ok) return {}
    const data    = await res.json()
    const results = data.web?.results ?? []
    if (!results.length) return {}

    const result = { _source: 'Brave' }

    if (wantWebsite) {
      // First result is usually the official site
      result.website = results[0].url
    }

    if (wantPhone) {
      // Scan snippets/descriptions for a US phone number
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
