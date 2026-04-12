import { useState, useEffect } from 'react'
import { timeStrToHour, hourToTimeStr } from '../services/tourDates'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabase'
import BottomSheet from '../components/ui/BottomSheet'

const ROLES = ['Headliner', 'Co-Headliner', 'Direct Support', 'Opener', 'Special Guest']

const STATUS_STYLE = {
  draft:     'bg-gray-100 text-gray-600',
  active:    'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-500',
}

// ─── Tour card ───────────────────────────────────────────────────────────────

function TourCard({ tour, onClick }) {
  const headliner = tour.tour_artists?.find(a => a.role === 'Headliner')
  const stopCount = tour.tour_stops?.[0]?.count ?? tour.stop_count ?? 0

  const dateLabel = tour.start_date
    ? [
        new Date(tour.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        tour.end_date
          ? '– ' + new Date(tour.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          : '',
      ].join(' ')
    : 'Dates TBD'

  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl bg-white shadow-sm border border-gray-100 p-5 text-left hover:border-indigo-200 hover:shadow-md transition-all mb-3 md:mb-0"
    >
      <div className="flex items-start justify-between mb-2">
        <p className="font-semibold text-gray-900 text-base leading-tight pr-3">{tour.name}</p>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${STATUS_STYLE[tour.status] ?? STATUS_STYLE.draft}`}>
          {tour.status}
        </span>
      </div>

      {headliner?.artists?.name && (
        <p className="text-sm text-indigo-600 font-medium mb-1">{headliner.artists.name}</p>
      )}

      <p className="text-xs text-gray-400">{dateLabel}</p>

      <div className="flex gap-4 mt-3 pt-3 border-t border-gray-50">
        <span className="text-xs text-gray-500">{stopCount} stop{stopCount !== 1 ? 's' : ''}</span>
        <span className="text-xs text-gray-500">
          {tour.route_calculations_count > 0
            ? `Optimized ${tour.route_calculations_count}×`
            : 'Not yet optimized'}
        </span>
      </div>
    </button>
  )
}

// ─── New Tour sheet ───────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  start_date: '',
  end_date: '',
  is_end_date_fixed: false,
  default_rest_days: 0,
  default_show_start_hour: 20,
  default_show_duration_hours: 2,
  default_production_setup_hours: 4,
  default_breakdown_hours: 2,
  lineup: [],
}

function LineupRow({ row, index, artists, onChange, onRemove }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">Artist {index + 1}</span>
        <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-600">Remove</button>
      </div>
      <select
        value={row.artistId}
        onChange={e => onChange('artistId', e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">Select artist…</option>
        {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <div className="flex gap-2">
        <select
          value={row.role}
          onChange={e => onChange('role', e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          type="number"
          min="1"
          max="20"
          value={row.appearance_order}
          onChange={e => onChange('appearance_order', parseInt(e.target.value) || 1)}
          className="w-16 rounded-lg border border-gray-200 px-2 py-2 text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          title="Stage order (1 = opens show)"
        />
      </div>
      <p className="text-xs text-gray-400">Stage order: 1 = opens the show, higher = later set</p>
    </div>
  )
}

function NewTourSheet({ open, onClose, onCreated, artists }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) { setStep(1); setForm(EMPTY_FORM); setError('') }
  }, [open])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function addLineupRow() {
    setForm(f => ({
      ...f,
      lineup: [...f.lineup, {
        artistId: '',
        role: f.lineup.length === 0 ? 'Headliner' : 'Opener',
        appearance_order: f.lineup.length + 1,
      }],
    }))
  }

  function updateLineupRow(index, field, value) {
    setForm(f => {
      const lineup = [...f.lineup]
      lineup[index] = { ...lineup[index], [field]: value }
      return { ...f, lineup }
    })
  }

  function removeLineupRow(index) {
    setForm(f => ({ ...f, lineup: f.lineup.filter((_, i) => i !== index) }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Tour name is required.'); return }
    setSaving(true); setError('')
    try {
      const { data: tour, error: tourErr } = await supabase
        .from('tours')
        .insert({
          name: form.name.trim(),
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          is_end_date_fixed: form.is_end_date_fixed,
          default_rest_days: form.default_rest_days,
          default_show_start_hour: form.default_show_start_hour,
          default_show_duration_hours: form.default_show_duration_hours,
          default_production_setup_hours: form.default_production_setup_hours,
          default_breakdown_hours: form.default_breakdown_hours,
          status: 'draft',
          created_by: user.id,
        })
        .select()
        .single()
      if (tourErr) throw tourErr

      const lineupRows = form.lineup
        .filter(l => l.artistId)
        .map(l => ({
          tour_id: tour.id,
          artist_id: Number(l.artistId),
          role: l.role,
          appearance_order: l.appearance_order,
        }))
      if (lineupRows.length > 0) {
        const { error: lineupErr } = await supabase.from('tour_artists').insert(lineupRows)
        if (lineupErr) throw lineupErr
      }

      onCreated(tour)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const stepLabel = ['', 'Tour Info', 'Routing Defaults', 'Artist Lineup'][step]

  return (
    <BottomSheet open={open} onClose={onClose} title={`New Tour — ${stepLabel}`}>
      <div className="space-y-4">
        {/* Step 1: basics */}
        {step === 1 && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tour Name *</label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Summer Anthem Tour 2026"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">End date is fixed</p>
                <p className="text-xs text-gray-400">Routing will solve for start date</p>
              </div>
              <button
                onClick={() => set('is_end_date_fixed', !form.is_end_date_fixed)}
                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${form.is_end_date_fixed ? 'bg-indigo-600' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${form.is_end_date_fixed ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </>
        )}

        {/* Step 2: routing defaults */}
        {step === 2 && (
          <>
            <p className="text-sm text-gray-500">These defaults apply to every stop. You can override them per-stop in the tour builder.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Show Start Time</label>
                <input type="time" step="1800"
                  value={hourToTimeStr(form.default_show_start_hour)}
                  onChange={e => set('default_show_start_hour', timeStrToHour(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Show Duration (hrs)</label>
                <input type="number" min="0.5" max="6" step="0.5"
                  value={form.default_show_duration_hours}
                  onChange={e => set('default_show_duration_hours', parseFloat(e.target.value) || 2)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Production Setup (hrs)</label>
                <input type="number" min="0.5" max="12" step="0.5"
                  value={form.default_production_setup_hours}
                  onChange={e => set('default_production_setup_hours', parseFloat(e.target.value) || 4)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <p className="text-xs text-gray-400 mt-1">Before show start</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Breakdown (hrs)</label>
                <input type="number" min="0.5" max="6" step="0.5"
                  value={form.default_breakdown_hours}
                  onChange={e => set('default_breakdown_hours', parseFloat(e.target.value) || 2)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <p className="text-xs text-gray-400 mt-1">After show ends</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rest Days per venue</label>
              <input type="number" min="0" max="14" value={form.default_rest_days}
                onChange={e => set('default_rest_days', parseInt(e.target.value) || 0)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <p className="text-xs text-gray-400 mt-1">Extra days at venue for multi-night residencies (0 = single show)</p>
            </div>
          </>
        )}

        {/* Step 3: artist lineup */}
        {step === 3 && (
          <>
            <p className="text-sm text-gray-500">Define the default artist lineup for this tour. Individual stops can override this.</p>
            {form.lineup.length === 0 && (
              <p className="text-xs text-gray-400 italic">No artists added yet.</p>
            )}
            <div className="space-y-3">
              {form.lineup.map((row, i) => (
                <LineupRow
                  key={i} row={row} index={i} artists={artists}
                  onChange={(field, val) => updateLineupRow(i, field, val)}
                  onRemove={() => removeLineupRow(i)}
                />
              ))}
            </div>
            <button
              onClick={addLineupRow}
              className="w-full rounded-xl border border-dashed border-indigo-300 text-indigo-600 text-sm font-medium py-2.5 hover:bg-indigo-50 transition-colors"
            >
              + Add Artist
            </button>
            {artists.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                No artists in your roster yet. Add artists from the Artists page first, or create the tour now and add the lineup later.
              </p>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

        {/* Navigation */}
        <div className="flex gap-2 pt-2">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex-1 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold py-2.5 hover:bg-gray-200 transition-colors">
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => { if (step === 1 && !form.name.trim()) { setError('Tour name is required.'); return } setError(''); setStep(s => s + 1) }}
              className="flex-1 rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 hover:bg-indigo-700 transition-colors"
            >
              Next
            </button>
          ) : (
            <button onClick={handleSave} disabled={saving}
              className="flex-1 rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 hover:bg-indigo-700 transition-colors disabled:opacity-60">
              {saving ? 'Creating…' : 'Create Tour'}
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Tours() {
  const navigate = useNavigate()
  const [tours, setTours] = useState([])
  const [artists, setArtists] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  async function load() {
    const [toursRes, artistsRes] = await Promise.all([
      supabase
        .from('tours')
        .select(`
          id, name, status, start_date, end_date,
          default_rest_days, default_buffer_days,
          route_calculations_count,
          tour_artists ( role, appearance_order, artists ( id, name ) ),
          tour_stops ( id )
        `)
        .order('created_at', { ascending: false }),
      supabase.from('artists').select('id, name').order('name'),
    ])
    setTours(
      (toursRes.data ?? []).map(t => ({ ...t, stop_count: t.tour_stops?.length ?? 0 }))
    )
    setArtists(artistsRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function handleCreated(tour) {
    setCreating(false)
    navigate(`/tours/${tour.id}`)
  }

  return (
    <div className="px-4 py-8 md:px-8 md:py-10 md:max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tours</h1>
          <p className="text-gray-500 text-sm mt-0.5">Concert tour management</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded-xl bg-indigo-600 text-white text-sm font-semibold px-4 py-2 hover:bg-indigo-700 transition-colors"
        >
          + New Tour
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : tours.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-6 text-center py-16">
          <p className="text-gray-400 text-sm mb-3">No tours yet</p>
          <button onClick={() => setCreating(true)}
            className="rounded-xl bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 hover:bg-indigo-700 transition-colors">
            Create your first tour
          </button>
        </div>
      ) : (
        <div className="md:grid md:grid-cols-2 md:gap-4">
          {tours.map(t => (
            <TourCard key={t.id} tour={t} onClick={() => navigate(`/tours/${t.id}`)} />
          ))}
        </div>
      )}

      <NewTourSheet open={creating} onClose={() => setCreating(false)} onCreated={handleCreated} artists={artists} />
    </div>
  )
}
