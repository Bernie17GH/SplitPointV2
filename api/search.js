/**
 * Vercel serverless function — proxies Brave Search API requests.
 * Keeps BRAVE_SEARCH_KEY server-side and handles CORS for the browser client.
 *
 * GET /api/search?q=<query>&count=<n>
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { q, count = '3' } = req.query
  if (!q) return res.status(400).json({ error: 'Missing query parameter' })

  const key = process.env.BRAVE_SEARCH_KEY
  if (!key) return res.status(500).json({ error: 'Search not configured' })

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${count}`

  try {
    const upstream = await fetch(url, {
      headers: {
        'Accept':               'application/json',
        'Accept-Encoding':      'gzip',
        'X-Subscription-Token': key,
      },
    })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (err) {
    res.status(502).json({ error: 'Search upstream error', detail: err.message })
  }
}
