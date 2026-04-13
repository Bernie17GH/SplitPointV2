/**
 * Vercel serverless function — fetches a venue website and extracts phone number.
 * Handles CORS for browser clients.
 *
 * GET /api/fetch-page?url=<venue website url>
 *
 * Returns: { phone: string|null }
 *
 * Extraction priority:
 *   1. JSON-LD schema.org telephone field
 *   2. <meta> contact/phone tags
 *   3. US phone regex scan across visible page text
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url parameter' })

  // Only allow http/https URLs
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' })
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SplitPoint-venue-lookup/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!upstream.ok) return res.status(200).json({ phone: null })

    // Read up to 500KB — enough for any contact page
    const buffer = await upstream.arrayBuffer()
    const html   = new TextDecoder().decode(buffer.slice(0, 500_000))

    const phone = extractPhone(html)
    return res.status(200).json({ phone })
  } catch {
    return res.status(200).json({ phone: null })
  }
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

const PHONE_RE = /(?:\+1[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g

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

  // 3. Strip HTML and scan visible text for US phone number
  const text    = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')

  const phones = [...text.matchAll(PHONE_RE)].map(m => m[0].trim())
  return phones.length ? normalizePhone(phones[0]) : null
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
  // Strip everything except digits and leading +
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
