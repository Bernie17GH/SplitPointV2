/**
 * Vercel serverless function — fetches a venue website and extracts phone number.
 * Handles CORS for browser clients.
 *
 * GET /api/fetch-page?url=<venue website url>
 *
 * Returns: { phone: string|null }
 *
 * Strategy:
 *   1. Fetch the homepage; try JSON-LD, <meta>, and text regex
 *   2. If no phone, scan the page for a contact/about link and fetch that page
 *   3. If still nothing, try common fallback paths (/contact, /contact-us, /about-us)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url parameter' })

  let baseUrl
  try {
    baseUrl = new URL(url)
    if (!['http:', 'https:'].includes(baseUrl.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' })
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  // 1. Try homepage
  const homeResult = await fetchPage(url)
  if (homeResult?.phone) return res.status(200).json({ phone: homeResult.phone })

  // 2. Look for contact/about links in the homepage HTML
  if (homeResult?.html) {
    const contactLinks = findContactLinks(homeResult.html, url)
    for (const link of contactLinks.slice(0, 3)) {
      const result = await fetchPage(link)
      if (result?.phone) return res.status(200).json({ phone: result.phone })
    }
  }

  // 3. Try common fallback paths regardless
  const fallbackPaths = ['/contact', '/contact-us', '/about', '/about-us', '/info', '/reach-us']
  for (const path of fallbackPaths) {
    const fallbackUrl = `${baseUrl.protocol}//${baseUrl.host}${path}`
    // Don't retry pages we already tried
    if (homeResult?.html && fallbackUrl === url) continue
    const result = await fetchPage(fallbackUrl)
    if (result?.phone) return res.status(200).json({ phone: result.phone })
  }

  return res.status(200).json({ phone: null })
}

// ─── Fetch a single page and extract phone ────────────────────────────────────

async function fetchPage(url) {
  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SplitPoint-venue-lookup/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!upstream.ok) return null
    const buffer = await upstream.arrayBuffer()
    const html   = new TextDecoder().decode(buffer.slice(0, 500_000))
    return { html, phone: extractPhone(html) }
  } catch {
    return null
  }
}

// ─── Find contact/about page links in HTML ────────────────────────────────────

const CONTACT_PATH_RE = /\/(contact(?:-us)?|about(?:-us)?|info(?:rmation)?|reach(?:-us)?|get-in-touch|hours|location(?:s)?)(\/[^"']*)?(?:\.html?)?/i

function findContactLinks(html, pageUrl) {
  const seen  = new Set()
  const links = []
  const hrefRe = /href=["']([^"']+)["']/gi
  let m
  while ((m = hrefRe.exec(html)) !== null) {
    const raw = m[1]
    // Skip anchors, mailto, tel, and external domains
    if (raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) continue
    if (CONTACT_PATH_RE.test(raw)) {
      try {
        const abs = new URL(raw, pageUrl).href
        if (!seen.has(abs)) { seen.add(abs); links.push(abs) }
      } catch {}
    }
  }
  return links
}

// ─── Phone extraction helpers ─────────────────────────────────────────────────

// Matches US phone numbers in many common formats
const PHONE_RE = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g

function extractPhone(html) {
  // 1. JSON-LD schema.org — most reliable structured source
  const jsonldMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const m of jsonldMatches) {
    try {
      const schemas = [].concat(JSON.parse(m[1]))
      for (const schema of schemas) {
        const tel = findInSchema(schema, 'telephone')
        if (tel) return normalizePhone(tel)
      }
    } catch {}
  }

  // 2. <meta> tags with phone/contact content
  const metaPhone = html.match(/<meta[^>]+(?:name|property)=["'](?:phone|telephone|contact[:\-]phone)[^"']*["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:phone|telephone)[^"']*["']/i)
  if (metaPhone) return normalizePhone(metaPhone[1])

  // 3. tel: href links — very common on venue/contact pages
  const telHref = html.match(/href=["']tel:([+\d\s.\-()]{7,20})["']/i)
  if (telHref) return normalizePhone(telHref[1])

  // 4. Strip HTML and scan visible text for US phone number
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')

  const phones = [...text.matchAll(PHONE_RE)].map(m => m[0].trim())
  // Prefer numbers that don't look like years or zip codes (at least 10 unique digits)
  const best = phones.find(p => p.replace(/\D/g, '').length >= 10)
  return best ? normalizePhone(best) : null
}

function findInSchema(obj, key) {
  if (!obj || typeof obj !== 'object') return null
  if (obj[key]) return String(obj[key])
  for (const v of Object.values(obj)) {
    const found = findInSchema(v, key)
    if (found) return found
  }
  return null
}

function normalizePhone(raw) {
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1)
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  }
  return raw.trim()
}
