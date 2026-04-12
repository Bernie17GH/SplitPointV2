import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { geocodeAddress, optimizeRoute } from '../services/here'
import { computeTourDates, formatDateRange } from '../services/tourDates'
import BottomSheet from '../components/ui/BottomSheet'
import HereMap from '../components/ui/HereMap'

const STATUS_STYLE = {
  draft:     'bg-gray-100 text-gray-600',
  active:    'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-500',
}

// ─── Stop card ────────────────────────────────────────────────────────────────

function StopCard({ stop, seq, onPin, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const venue = stop.venues
  const hasDates = stop.arrival_date && stop.departure_date

  return (
    <div className={`rounded-2xl border bg-white mb-3 overflow-hidden ${stop.is_fixed ? 'border-red-200' : 'border-gray-100'}`}>
      <button className="w-full flex items-center gap-3 px-4 py-4 text-left" onClick={() => setExpanded(e => !e)}>
        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white ${stop.is_fixed ? 'bg-red-500' : 'bg-indigo-600'}`}>
          {seq}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{venue?.name ?? '—'}</p>
          <p className="text-xs text-gray-400">{[venue?.city, venue?.state].filter(Boolean).join(', ')}</p>
        </div>
        <div className="text-right shrink-0">
          {hasDates ? (
            <p className="text-xs text-gray-500">{formatDateRange(stop.arrival_date, stop.departure_date)}</p>
          ) : (
            <p className="text-xs text-gray-300">Dates TBD</p>
          )}
          {stop.is_fixed && <p className="text-xs text-red-400 font-medium">📌 Fixed</p>}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-50 px-4 py-3 space-y-2 bg-gray-50">
          {stop.travel_hours_from_prev != null && (
            <p className="text-xs text-gray-500">Drive from previous: <span className="font-medium">{stop.travel_hours_from_prev}h</span></p>
          )}
          <p className="text-xs text-gray-500">
            Rest days: <span className="font-medium">{stop.rest_days ?? '(tour default)'}</span>
            {'  ·  '}
            Buffer days: <span className="font-medium">{stop.buffer_days ?? '(tour default)'}</span>
          </p>
          {venue?.address && <p className="text-xs text-gray-500">{venue.address}, {venue.city} {venue.state} {venue.zip}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => onPin(stop)}
              className={`flex-1 text-xs font-medium py-1.5 rounded-lg border transition-colors ${
                stop.is_fixed
                  ? 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                  : 'border-red-200 text-red-600 bg-white hover:bg-red-50'
              }`}>
              {stop.is_fixed ? 'Unpin date' : '📌 Pin date'}
            </button>
            <button onClick={() => onRemove(stop.id)}
              className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-red-200 text-red-500 bg-white hover:bg-red-50 transition-colors">
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Add Stop sheet ───────────────────────────────────────────────────────────

function AddStopSheet({ open, onClose, tourId, onAdded }) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [mode, setMode]           = useState('search') // 'search' | 'create'
  const [selected, setSelected]   = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const [newVenue, setNewVenue] = useState({
    name: '', address: '', city: '', state: '', zip: '',
  })
  const [stopOpts, setStopOpts] = useState({ rest_days: '', buffer_days: '', is_fixed: false })

  useEffect(() => {
    if (!open) {
      setQuery(''); setResults([]); setMode('search')
      setSelected(null); setError(''); setSaving(false)
      setNewVenue({ name: '', address: '', city: '', state: '', zip: '' })
      setStopOpts({ rest_days: '', buffer_days: '', is_fixed: false })
    }
  }, [open])

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      supabase.from('venues')
        .select('id, name, city, state, address, lat, lng')
        .ilike('name', `%${query}%`)
        .limit(8)
        .then(({ data }) => setResults(data ?? []))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  function setNV(field, val) { setNewVenue(v => ({ ...v, [field]: val })) }
  function setSO(field, val) { setStopOpts(o => ({ ...o, [field]: val })) }

  async function saveStop(venueId, lat, lng) {
    await supabase.from('tour_stops').insert({
      tour_id: tourId,
      venue_id: venueId,
      sequence_order: 9999,
      rest_days:   stopOpts.rest_days   ? parseInt(stopOpts.rest_days)   : null,
      buffer_days: stopOpts.buffer_days ? parseInt(stopOpts.buffer_days) : null,
      is_fixed: stopOpts.is_fixed,
    })
    onAdded()
  }

  async function handleSelectExisting(venue) {
    setSelected(venue)
    setMode('stop-opts')
  }

  async function handleSaveNew() {
    if (!newVenue.name.trim() || !newVenue.address.trim() || !newVenue.city.trim() || !newVenue.state.trim()) {
      setError('Venue name, address, city, and state are required.'); return
    }
    setSaving(true); setError('')
    try {
      const fullAddress = `${newVenue.address}, ${newVenue.city}, ${newVenue.state} ${newVenue.zip}`
      const geo = await geocodeAddress(fullAddress)
      const { data: venue, error: vErr } = await supabase.from('venues')
        .insert({ ...newVenue, lat: geo.lat, lng: geo.lng, availability: 'unconfirmed' })
        .select().single()
      if (vErr) throw vErr
      await saveStop(venue.id, geo.lat, geo.lng)
    } catch (e) {
      setError(e.message); setSaving(false)
    }
  }

  async function handleSaveExisting() {
    setSaving(true); setError('')
    try {
      // Geocode if missing lat/lng
      let { lat, lng } = selected
      if (!lat || !lng) {
        const full = `${selected.address}, ${selected.city}, ${selected.state}`
        const geo = await geocodeAddress(full)
        lat = geo.lat; lng = geo.lng
        await supabase.from('venues').update({ lat, lng }).eq('id', selected.id)
      }
      await saveStop(selected.id, lat, lng)
    } catch (e) {
      setError(e.message); setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <BottomSheet open={open} onClose={onClose} title={
      mode === 'search' ? 'Add Stop' :
      mode === 'create' ? 'New Venue' :
      `Stop Options — ${selected?.name}`
    }>
      <div className="space-y-4">

        {/* Search mode */}
        {mode === 'search' && (
          <>
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search venue by name…"
              className={inputCls} autoFocus />
            {results.length > 0 && (
              <div className="space-y-2">
                {results.map(v => (
                  <button key={v.id} onClick={() => handleSelectExisting(v)}
                    className="w-full rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-left hover:border-indigo-200 transition-colors">
                    <p className="text-sm font-medium text-gray-900">{v.name}</p>
                    <p className="text-xs text-gray-400">{[v.city, v.state].filter(Boolean).join(', ')}</p>
                  </button>
                ))}
              </div>
            )}
            {query.length >= 2 && results.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">No venues found for "{query}"</p>
            )}
            <button onClick={() => setMode('create')}
              className="w-full rounded-xl border border-dashed border-indigo-300 text-indigo-600 text-sm font-medium py-2.5 hover:bg-indigo-50 transition-colors">
              + Add new venue
            </button>
          </>
        )}

        {/* Create new venue mode */}
        {mode === 'create' && (
          <>
            <p className="text-xs text-gray-500">This venue will be added to the venue directory.</p>
            {[
              { label: 'Venue Name *', field: 'name',    placeholder: 'e.g. The Tabernacle' },
              { label: 'Street Address *', field: 'address', placeholder: '152 Luckie St NW' },
              { label: 'City *',       field: 'city',    placeholder: 'Atlanta' },
              { label: 'State *',      field: 'state',   placeholder: 'GA' },
              { label: 'ZIP',          field: 'zip',     placeholder: '30303' },
            ].map(({ label, field, placeholder }) => (
              <div key={field}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                <input value={newVenue[field]} onChange={e => setNV(field, e.target.value)}
                  placeholder={placeholder} className={inputCls} />
              </div>
            ))}
            {/* Stop options inline */}
            <div className="border-t border-gray-100 pt-3 space-y-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stop Options</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Rest days (override)</label>
                  <input type="number" min="0" value={stopOpts.rest_days}
                    onChange={e => setSO('rest_days', e.target.value)}
                    placeholder="Tour default" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Buffer days (override)</label>
                  <input type="number" min="0" value={stopOpts.buffer_days}
                    onChange={e => setSO('buffer_days', e.target.value)}
                    placeholder="Tour default" className={inputCls} />
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setMode('search')}
                className="flex-1 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold py-2.5">Back</button>
              <button onClick={handleSaveNew} disabled={saving}
                className="flex-1 rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 disabled:opacity-60">
                {saving ? 'Saving…' : 'Add Stop'}
              </button>
            </div>
          </>
        )}

        {/* Stop options for existing venue */}
        {mode === 'stop-opts' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rest days (override)</label>
                <input type="number" min="0" value={stopOpts.rest_days}
                  onChange={e => setSO('rest_days', e.target.value)}
                  placeholder="Tour default" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Buffer days (override)</label>
                <input type="number" min="0" value={stopOpts.buffer_days}
                  onChange={e => setSO('buffer_days', e.target.value)}
                  placeholder="Tour default" className={inputCls} />
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">Pin this date as fixed</p>
                <p className="text-xs text-gray-400">Route optimization won't move this stop</p>
              </div>
              <button onClick={() => setSO('is_fixed', !stopOpts.is_fixed)}
                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${stopOpts.is_fixed ? 'bg-red-500' : 'bg-gray-200'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${stopOpts.is_fixed ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setMode('search')}
                className="flex-1 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold py-2.5">Back</button>
              <button onClick={handleSaveExisting} disabled={saving}
                className="flex-1 rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 disabled:opacity-60">
                {saving ? 'Adding…' : 'Add Stop'}
              </button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TourDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [tour, setTour]         = useState(null)
  const [stops, setStops]       = useState([])
  const [legs, setLegs]         = useState([])
  const [view, setView]         = useState('list') // 'list' | 'map'
  const [addingStop, setAddingStop] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [optError, setOptError] = useState('')
  const [loading, setLoading]   = useState(true)

  const loadTour = useCallback(async () => {
    const [tourRes, stopsRes] = await Promise.all([
      supabase.from('tours')
        .select('*, tour_artists(role, appearance_order, artists(id, name))')
        .eq('id', id)
        .single(),
      supabase.from('tour_stops')
        .select('*, venues(id, name, address, city, state, zip, lat, lng, venue_type, capacity)')
        .eq('tour_id', id)
        .order('sequence_order'),
    ])
    if (tourRes.data) setTour(tourRes.data)
    if (stopsRes.data) setStops(stopsRes.data)
    setLoading(false)
  }, [id])

  useEffect(() => { loadTour() }, [loadTour])

  const headliner = tour?.tour_artists?.find(a => a.role === 'Headliner')

  const mapStops = useMemo(() =>
    stops
      .filter(s => s.venues?.lat && s.venues?.lng)
      .map(s => ({
        id: s.id,
        lat: s.venues.lat,
        lng: s.venues.lng,
        name: s.venues.name,
        city: s.venues.city,
        state: s.venues.state,
        is_fixed: s.is_fixed,
      })),
    [stops]
  )

  async function handleOptimize() {
    if (stops.length < 2) { setOptError('Add at least 2 stops to optimize.'); return }

    const missing = stops.filter(s => !s.venues?.lat || !s.venues?.lng)
    if (missing.length > 0) {
      setOptError(`${missing.length} stop(s) are missing coordinates. Try removing and re-adding them.`)
      return
    }

    setOptimizing(true); setOptError('')
    try {
      const waypoints = stops.map(s => ({
        id: s.id,
        lat: s.venues.lat,
        lng: s.venues.lng,
        name: s.venues.name,
        city: s.venues.city,
        state: s.venues.state,
      }))

      const { orderedStops, legs: newLegs } = await optimizeRoute(waypoints)
      setLegs(newLegs)

      // Apply tour date math
      const dated = computeTourDates(
        orderedStops,
        tour.start_date ?? new Date().toISOString().split('T')[0],
        tour.default_rest_days,
        tour.default_buffer_days
      )

      // Batch all stop updates + tour counter in two parallel calls
      const stopUpdates = orderedStops.map((ws, i) => ({
        id:                     ws.id,
        sequence_order:         i,
        arrival_date:           dated[i].arrival_date,
        departure_date:         dated[i].departure_date,
        travel_hours_from_prev: i > 0 ? newLegs[i - 1]?.durationHours ?? null : null,
      }))

      await Promise.all([
        supabase.from('tour_stops').upsert(stopUpdates),
        supabase.from('tours').update({
          route_calculations_count: (tour.route_calculations_count ?? 0) + 1,
        }).eq('id', id),
      ])

      await loadTour()
    } catch (e) {
      setOptError(e.message)
    } finally {
      setOptimizing(false)
    }
  }

  async function handlePin(stop) {
    await supabase.from('tour_stops').update({ is_fixed: !stop.is_fixed }).eq('id', stop.id)
    loadTour()
  }

  async function handleRemove(stopId) {
    await supabase.from('tour_stops').delete().eq('id', stopId)
    setStops(prev => prev.filter(s => s.id !== stopId))
  }

  if (loading) {
    return <div className="min-h-svh flex items-center justify-center"><p className="text-sm text-gray-400">Loading…</p></div>
  }
  if (!tour) {
    return <div className="px-4 py-8"><p className="text-gray-500">Tour not found.</p></div>
  }

  return (
    <div className="flex flex-col min-h-svh">
      {/* Header */}
      <div className="px-4 pt-8 pb-4">
        <button onClick={() => navigate('/tours')} className="flex items-center gap-1 text-sm text-indigo-600 font-medium mb-4">
          ← Tours
        </button>
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-3">
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{tour.name}</h1>
            {headliner?.artists?.name && (
              <p className="text-sm text-indigo-600 font-medium mt-0.5">{headliner.artists.name}</p>
            )}
            {tour.start_date && (
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDateRange(tour.start_date, tour.end_date ?? tour.start_date)}
              </p>
            )}
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize shrink-0 ${STATUS_STYLE[tour.status] ?? STATUS_STYLE.draft}`}>
            {tour.status}
          </span>
        </div>
      </div>

      {/* Optimize bar */}
      <div className="mx-4 mb-3 rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">
              {stops.length} stop{stops.length !== 1 ? 's' : ''}
              {' · '}
              <span className="font-medium">
                {tour.route_calculations_count > 0
                  ? `Optimized ${tour.route_calculations_count}×`
                  : 'Not optimized yet'}
              </span>
            </p>
            {tour.start_date && tour.end_date && (
              <p className="text-xs text-gray-400 mt-0.5">
                {tour.is_end_date_fixed ? '📌 End date fixed' : 'Flexible dates'}
              </p>
            )}
          </div>
          <button
            onClick={handleOptimize}
            disabled={optimizing || stops.length < 2}
            className="rounded-xl bg-indigo-600 text-white text-xs font-semibold px-4 py-2 hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {optimizing ? 'Optimizing…' : '✦ Optimize Route'}
          </button>
        </div>
        {optError && <p className="text-xs text-red-500 mt-2">{optError}</p>}
      </div>

      {/* Artist lineup */}
      {tour.tour_artists?.length > 0 && (
        <div className="mx-4 mb-3">
          <div className="flex flex-wrap gap-1.5">
            {[...tour.tour_artists]
              .sort((a, b) => b.appearance_order - a.appearance_order)
              .map(ta => (
                <span key={ta.artists?.id} className="text-xs bg-indigo-50 text-indigo-700 font-medium px-2 py-1 rounded-full">
                  {ta.role}: {ta.artists?.name}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* List / Map toggle + Add Stop */}
      <div className="mx-4 mb-4 flex items-center gap-2">
        <div className="flex-1 flex rounded-xl bg-gray-100 p-1 gap-1">
          {['list', 'map'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`flex-1 rounded-lg text-sm font-medium py-1.5 transition-colors capitalize ${view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              {v === 'list' ? '≡ List' : '⊕ Map'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAddingStop(true)}
          className="rounded-xl bg-indigo-600 text-white text-sm font-semibold px-4 py-2 hover:bg-indigo-700 transition-colors"
        >
          + Stop
        </button>
      </div>

      {/* Content */}
      {view === 'list' ? (
        <div className="flex-1 px-4 pb-24">
          {stops.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm text-center py-14">
              <p className="text-gray-400 text-sm mb-3">No stops yet</p>
              <button onClick={() => setAddingStop(true)}
                className="rounded-xl bg-indigo-600 text-white text-sm font-semibold px-5 py-2 hover:bg-indigo-700">
                Add first stop
              </button>
            </div>
          ) : (
            stops.map((stop, i) => (
              <StopCard
                key={stop.id}
                stop={stop}
                seq={i + 1}
                onPin={handlePin}
                onRemove={handleRemove}
              />
            ))
          )}
        </div>
      ) : (
        <div className="flex-1 mx-4 mb-24 rounded-2xl overflow-hidden border border-gray-100 shadow-sm" style={{ minHeight: 420 }}>
          {mapStops.length === 0 ? (
            <div className="h-full flex items-center justify-center bg-gray-50">
              <p className="text-sm text-gray-400">Add stops with addresses to see the map</p>
            </div>
          ) : (
            <HereMap stops={mapStops} legs={legs} className="w-full h-full" style={{ minHeight: 420 }} />
          )}
        </div>
      )}

      <AddStopSheet
        open={addingStop}
        onClose={() => setAddingStop(false)}
        tourId={id}
        onAdded={() => { setAddingStop(false); loadTour() }}
      />
    </div>
  )
}
