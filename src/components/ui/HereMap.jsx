import { useEffect, useRef } from 'react'

const KEY = import.meta.env.VITE_HERE_MAPS_KEY

const SCRIPTS = [
  'https://js.api.here.com/v3/3.1/mapsjs-core.js',
  'https://js.api.here.com/v3/3.1/mapsjs-service.js',
  'https://js.api.here.com/v3/3.1/mapsjs-mapevents.js',
  'https://js.api.here.com/v3/3.1/mapsjs-ui.js',
]

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const el = document.createElement('script')
    el.src = src
    el.onload = resolve
    el.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(el)
  })
}

async function loadHereSDK() {
  if (window.H) return
  if (!document.querySelector('link[href*="mapsjs-ui.css"]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://js.api.here.com/v3/3.1/mapsjs-ui.css'
    document.head.appendChild(link)
  }
  for (const src of SCRIPTS) await loadScript(src)
}

function numberedIcon(H, seq, { isFixed, isStart, isEnd } = {}) {
  const bg        = isStart ? '#22c55e' : isEnd ? '#f97316' : isFixed ? '#dc2626' : '#4f46e5'
  const label     = String(seq)
  const fontSize  = label.length > 1 ? 10 : 12
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="38">',
    `<path d="M16 0C9 0 3 6 3 13c0 9 13 25 13 25s13-16 13-25C29 6 23 0 16 0z" fill="${bg}" stroke="white" stroke-width="1.5"/>`,
    `<text x="16" y="16" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="${fontSize}" font-family="sans-serif" font-weight="bold">${label}</text>`,
    '</svg>',
  ].join('')
  const uri = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
  return new H.map.Icon(uri, { size: { w: 32, h: 38 }, anchor: { x: 16, y: 38 } })
}

/**
 * Interactive HERE map with numbered stop markers and a route polyline.
 *
 * props:
 *   stops — [{ lat, lng, name, city, state, is_fixed }] in display order
 *   legs  — [{ encodedPolyline }] from HERE optimize, one per leg (optional)
 */
export default function HereMap({ stops = [], legs = [], className = '', style = {} }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    loadHereSDK()
      .then(() => {
        if (cancelled || !containerRef.current) return

        const H = window.H
        const platform = new H.service.Platform({ apikey: KEY })
        const layers   = platform.createDefaultLayers()

        const map = new H.Map(
          containerRef.current,
          layers.vector.normal.map,
          { center: { lat: 37.8, lng: -96 }, zoom: 4, pixelRatio: window.devicePixelRatio || 1 }
        )
        mapRef.current = map

        new H.mapevents.Behavior(new H.mapevents.MapEvents(map))
        const ui = H.ui.UI.createDefault(map, layers)

        const validStops = stops.filter(s => s.lat != null && s.lng != null)
        if (validStops.length === 0) return

        const group = new H.map.Group()

        // Route polyline — use encoded legs if available, otherwise straight lines
        if (legs.length > 0 && legs.some(l => l.encodedPolyline)) {
          legs.forEach(leg => {
            if (!leg.encodedPolyline) return
            try {
              const linestring = H.geo.LineString.fromFlexiblePolyline(leg.encodedPolyline)
              group.addObject(new H.map.Polyline(linestring, {
                style: { strokeColor: '#4f46e5', lineWidth: 3, lineJoin: 'round' }
              }))
            } catch (_) { /* skip malformed polyline */ }
          })
        } else if (validStops.length > 1) {
          const linestring = new H.geo.LineString()
          validStops.forEach(s => linestring.pushPoint({ lat: s.lat, lng: s.lng }))
          group.addObject(new H.map.Polyline(linestring, {
            style: { strokeColor: '#4f46e5', lineWidth: 3, lineDash: [4, 4] }
          }))
        }

        // Numbered markers — seq matches the list view number
        validStops.forEach((stop, i) => {
          const seq = stop.seq ?? i + 1
          const marker = new H.map.Marker(
            { lat: stop.lat, lng: stop.lng },
            { icon: numberedIcon(H, seq, { isFixed: stop.is_fixed, isStart: stop.is_start, isEnd: stop.is_end }) }
          )
          const label = stop.is_start ? '▶ Start' : stop.is_end ? '■ End' : stop.is_fixed ? '📌 Fixed' : null
          marker.setData(
            `<div style="font-family:sans-serif;padding:4px 2px;min-width:130px">
               <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
                 <b style="font-size:13px">${stop.name || 'Stop ' + seq}</b>
               </div>
               <span style="color:#6b7280;font-size:12px">${[stop.city, stop.state].filter(Boolean).join(', ')}</span>
               ${label ? `<br/><span style="font-size:11px;color:#6b7280">${label}</span>` : ''}
             </div>`
          )
          group.addObject(marker)
        })

        group.addEventListener('tap', evt => {
          const bubble = new H.ui.InfoBubble(evt.target.getGeometry(), {
            content: evt.target.getData(),
          })
          ui.getBubbles().forEach(b => ui.removeBubble(b))
          ui.addBubble(bubble)
        })

        map.addObject(group)

        const bounds = group.getBoundingBox()
        if (bounds) map.getViewModel().setLookAtData({ bounds }, true)
      })
      .catch(err => console.error('HERE Maps load error:', err))

    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.dispose(); mapRef.current = null }
    }
  }, [stops, legs])

  return (
    <div ref={containerRef} className={className}
      style={{ background: '#e8e0d8', ...style }} /* neutral while tiles load */
    />
  )
}
