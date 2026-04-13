import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { geocodeAddress, optimizeRoute } from '../services/here'
import { computeTourDates, addDays, formatDateRange, formatArrivalTime, formatHour, timeStrToHour, hourToTimeStr } from '../services/tourDates'
import { checkTourCompliance } from '../services/tourCompliance'
import BottomSheet from '../components/ui/BottomSheet'
import HereMap from '../components/ui/HereMap'

const STATUS_STYLE = {
  draft:     'bg-gray-100 text-gray-600',
  active:    'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-500',
}

// ─── Drive-time leg connector ─────────────────────────────────────────────────

function LegConnector({ stop, twoDriver }) {
  const hours = stop.travel_hours_from_prev ?? stop.estimated_drive_hours
  if (!hours) return null
  const miles        = stop.distance_miles_from_prev
  const needs2Driver = stop.requires_two_driver || (twoDriver && hours > 8)
  return (
    <div className="flex items-center gap-2 px-4 py-1 my-1">
      <div className="w-0.5 h-4 bg-gray-200 mx-3 shrink-0" />
      <span className="text-xs text-gray-400">
        {hours.toFixed(1)}h drive{miles ? ` · ${miles.toFixed(0)} mi` : ''}
      </span>
      {needs2Driver && (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
          2-Driver Leg
        </span>
      )}
    </div>
  )
}

// ─── Compliance warning banner ────────────────────────────────────────────────

function ComplianceWarningBanner({ warning, onSwitchToTwoDriver, onAddRestStop }) {
  const isError = warning.severity === 'error'
  const bg      = isError ? 'bg-red-50 border-red-200'   : 'bg-amber-50 border-amber-200'
  const text    = isError ? 'text-red-700'               : 'text-amber-700'
  const icon    = isError ? '🔴'                         : '🟡'

  return (
    <div className={`mx-0 mb-3 rounded-2xl border px-4 py-3 ${bg}`}>
      <p className={`text-xs font-semibold mb-1 ${text}`}>
        {icon} {warning.prevCity} → {warning.nextCity}
      </p>
      <p className={`text-xs mb-2 ${text}`}>{warning.message}</p>
      <div className="flex gap-2 flex-wrap">
        {(warning.suggestedFix === 'TWO_DRIVER_OR_REST_STOP' || warning.suggestedFix === 'CONSIDER_TWO_DRIVER') && (
          <button
            onClick={onSwitchToTwoDriver}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-current hover:opacity-80 transition-opacity"
          >
            Switch to 2-Driver Team
          </button>
        )}
        {(warning.suggestedFix === 'TWO_DRIVER_OR_REST_STOP' || warning.suggestedFix === 'ADD_BUFFER_DAY') && (
          <button
            onClick={onAddRestStop}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-current hover:opacity-80 transition-opacity"
          >
            Add Rest Stop
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Stop card ────────────────────────────────────────────────────────────────

/** Single editable row in the stop timing form. */
function TimingRow({ label, value, defaultVal, isTime, onChange, onReset }) {
  const isOverride  = value != null
  const effectiveVal = value ?? defaultVal
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 flex-1">
        {isTime ? (
          <input
            type="time"
            value={hourToTimeStr(effectiveVal)}
            onChange={e => onChange(timeStrToHour(e.target.value))}
            className={`flex-1 text-xs border rounded-lg px-2 py-1.5 bg-white ${isOverride ? 'border-indigo-300 text-gray-800' : 'border-gray-200 text-gray-400'}`}
          />
        ) : (
          <>
            <input
              type="number" min="0" step="0.5"
              value={effectiveVal}
              onChange={e => onChange(parseFloat(e.target.value) || 0)}
              className={`w-16 text-xs border rounded-lg px-2 py-1.5 bg-white text-center ${isOverride ? 'border-indigo-300 text-gray-800' : 'border-gray-200 text-gray-400'}`}
            />
            <span className="text-xs text-gray-400">h</span>
          </>
        )}
        {isOverride
          ? <button onClick={onReset} className="text-xs text-gray-400 hover:text-red-400 ml-auto" title="Reset to tour default">× default</button>
          : <span className="text-xs text-gray-300 ml-auto">default</span>
        }
      </div>
    </div>
  )
}

function StopCard({ stop, seq, onPin, onSetStart, onSetEnd, onRemove, onUpdate, tourDefaults = {} }) {
  // Transit rest stops get a minimal card — no venue, no timing controls
  if (stop.stop_type === 'transit_rest') {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 mb-3 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold bg-gray-300 text-white shrink-0">
            {seq}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-600">Rest Day</p>
            <p className="text-xs text-gray-400">
              {stop.arrival_date ? formatArrivalTime(stop.arrival_date) : 'Dates TBD'} · Transit rest
            </p>
          </div>
        </div>
        <button onClick={() => onRemove(stop.id)}
          className="text-xs text-red-400 font-medium hover:text-red-600">
          Remove
        </button>
      </div>
    )
  }

  const [expanded, setExpanded] = useState(false)
  const [editing,  setEditing]  = useState(false)
  const [form,     setForm]     = useState({})
  const [saving,   setSaving]   = useState(false)

  const venue    = stop.venues
  const hasDates = stop.arrival_date && stop.departure_date
  const isStart  = stop.is_start_stop
  const isEnd    = stop.is_end_stop
  const def      = tourDefaults

  const borderCls = isStart ? 'border-green-300'
    : isEnd               ? 'border-orange-300'
    : stop.is_fixed       ? 'border-red-200'
    : 'border-gray-100'

  const dotCls = isStart ? 'bg-green-500'
    : isEnd             ? 'bg-orange-400'
    : stop.is_fixed     ? 'bg-red-500'
    : 'bg-indigo-600'

  function startEdit() {
    setForm({
      show_start_hour:        stop.show_start_hour,
      show_duration_hours:    stop.show_duration_hours,
      production_setup_hours: stop.production_setup_hours,
      breakdown_hours:        stop.breakdown_hours,
    })
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    const { error } = await supabase
      .from('tour_stops')
      .update({
        show_start_hour:        form.show_start_hour,
        show_duration_hours:    form.show_duration_hours,
        production_setup_hours: form.production_setup_hours,
        breakdown_hours:        form.breakdown_hours,
      })
      .eq('id', stop.id)
    setSaving(false)
    if (!error) { setEditing(false); onUpdate?.() }
  }

  return (
    <div className={`rounded-2xl border bg-white mb-3 overflow-hidden ${borderCls}`}>
      {/* Main row — tapping expands details */}
      <button className="w-full flex items-center gap-3 px-4 pt-3 pb-2 text-left" onClick={() => setExpanded(e => !e)}>
        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white ${dotCls}`}>
          {seq}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{venue?.name ?? '—'}</p>
          <p className="text-xs text-gray-400">{[venue?.city, venue?.state].filter(Boolean).join(', ')}</p>
        </div>
        <div className="text-right shrink-0 space-y-0.5">
          {hasDates ? (
            <p className="text-xs text-gray-500">{formatDateRange(stop.arrival_date, stop.departure_date)}</p>
          ) : (
            <p className="text-xs text-gray-300">Dates TBD</p>
          )}
          {stop.is_fixed && !isStart && !isEnd && <p className="text-xs text-red-400 font-medium">📌 Fixed</p>}
        </div>
      </button>

      {/* Route anchor chips — always visible */}
      <div className="flex gap-2 px-4 pb-3" onClick={e => e.stopPropagation()}>
        <button onClick={() => onSetStart(stop)}
          className={`flex-1 text-xs font-semibold py-1 rounded-lg border transition-colors ${isStart ? 'border-green-400 text-green-700 bg-green-50' : 'border-gray-200 text-gray-400 bg-white hover:border-green-300 hover:text-green-600'}`}>
          {isStart ? '▶ Start' : '▶ Set Start'}
        </button>
        <button onClick={() => onSetEnd(stop)}
          className={`flex-1 text-xs font-semibold py-1 rounded-lg border transition-colors ${isEnd ? 'border-orange-400 text-orange-600 bg-orange-50' : 'border-gray-200 text-gray-400 bg-white hover:border-orange-300 hover:text-orange-500'}`}>
          {isEnd ? '■ End' : '■ Set End'}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-50 px-4 py-3 space-y-3 bg-gray-50">

          {/* Timing section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-600">Timing</p>
              {!editing && (
                <button onClick={startEdit} className="text-xs text-indigo-600 font-medium hover:text-indigo-700">
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-2">
                <TimingRow label="Show time" isTime
                  value={form.show_start_hour}
                  defaultVal={def.show_start_hour ?? 20}
                  onChange={v => setForm(f => ({ ...f, show_start_hour: v }))}
                  onReset={() => setForm(f => ({ ...f, show_start_hour: null }))}
                />
                <TimingRow label="Duration"
                  value={form.show_duration_hours}
                  defaultVal={def.show_duration_hours ?? 2}
                  onChange={v => setForm(f => ({ ...f, show_duration_hours: v }))}
                  onReset={() => setForm(f => ({ ...f, show_duration_hours: null }))}
                />
                <TimingRow label="Setup"
                  value={form.production_setup_hours}
                  defaultVal={def.production_setup_hours ?? 4}
                  onChange={v => setForm(f => ({ ...f, production_setup_hours: v }))}
                  onReset={() => setForm(f => ({ ...f, production_setup_hours: null }))}
                />
                <TimingRow label="Breakdown"
                  value={form.breakdown_hours}
                  defaultVal={def.breakdown_hours ?? 2}
                  onChange={v => setForm(f => ({ ...f, breakdown_hours: v }))}
                  onReset={() => setForm(f => ({ ...f, breakdown_hours: null }))}
                />
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditing(false)} className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-gray-200 text-gray-500 bg-white hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={saveEdit} disabled={saving} className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  { label: 'Show time', val: stop.show_start_hour        != null ? formatHour(stop.show_start_hour)              : formatHour(def.show_start_hour),                                    isDefault: stop.show_start_hour        == null },
                  { label: 'Duration',  val: stop.show_duration_hours    != null ? `${stop.show_duration_hours}h`                : def.show_duration_hours    != null ? `${def.show_duration_hours}h`    : null, isDefault: stop.show_duration_hours    == null },
                  { label: 'Setup',     val: stop.production_setup_hours != null ? `${stop.production_setup_hours}h`            : def.production_setup_hours != null ? `${def.production_setup_hours}h` : null, isDefault: stop.production_setup_hours == null },
                  { label: 'Breakdown', val: stop.breakdown_hours        != null ? `${stop.breakdown_hours}h`                    : def.breakdown_hours        != null ? `${def.breakdown_hours}h`        : null, isDefault: stop.breakdown_hours        == null },
                ].map(({ label, val, isDefault }) => (
                  <p key={label} className="text-xs text-gray-500">
                    {label}: <span className="font-medium">{val ?? '—'}</span>
                    {isDefault && val && <span className="text-gray-300 ml-1">default</span>}
                  </p>
                ))}
                {(stop.rest_days ?? def.rest_days ?? 0) > 0 && (
                  <p className="text-xs text-gray-500 col-span-2">
                    Rest days: <span className="font-medium">{stop.rest_days ?? def.rest_days}</span>
                    {stop.rest_days == null && <span className="text-gray-300 ml-1">default</span>}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Address */}
          {venue?.address && (
            <p className="text-xs text-gray-400">{venue.address}, {venue.city} {venue.state} {venue.zip}</p>
          )}

          {/* Pin + Remove */}
          <div className="flex gap-2">
            <button onClick={() => onPin(stop)}
              className={`flex-1 text-xs font-medium py-1.5 rounded-lg border transition-colors ${stop.is_fixed ? 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50' : 'border-red-200 text-red-600 bg-white hover:bg-red-50'}`}>
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

// ─── Schedule view ────────────────────────────────────────────────────────────

function formatTravel(h, miles) {
  if (h == null) return null
  if (h === 0) return 'Same venue — no drive'
  const totalMin = Math.round(h * 60)
  const hours    = Math.floor(totalMin / 60)
  const mins     = totalMin % 60
  const time = hours === 0 ? `${mins} min drive`
             : mins  === 0 ? `${hours}h drive`
             : `${hours}h ${mins} min drive`
  return miles ? `${time} · ${miles.toFixed(0)} mi` : time
}

function ScheduleRow({ label, value, sub, accent }) {
  return (
    <div className="flex items-baseline justify-between text-xs py-0.5">
      <span className={`font-medium w-24 shrink-0 ${accent ? 'text-indigo-600' : 'text-gray-500'}`}>{label}</span>
      <span className={`font-semibold text-right flex-1 ${accent ? 'text-indigo-700' : 'text-gray-800'}`}>{value ?? '—'}</span>
      {sub && <span className="text-gray-300 ml-3 shrink-0 text-xs">{sub}</span>}
    </div>
  )
}

function ScheduleView({ stops, tourDefaults: def }) {
  if (!stops.length) return (
    <p className="text-sm text-gray-400 text-center py-12">No stops yet — add stops and optimize to see the schedule.</p>
  )

  return (
    <div className="pb-24 max-w-xl mx-auto">
      {stops.map((stop, i) => {
        const venue          = stop.venues
        const showStart      = stop.show_start_hour          ?? def.show_start_hour        ?? 20
        const showDuration   = stop.show_duration_hours      ?? def.show_duration_hours    ?? 2
        const setupHours     = stop.production_setup_hours   ?? def.production_setup_hours ?? 4
        const breakdownHours = stop.breakdown_hours          ?? def.breakdown_hours        ?? 2
        const showEnd        = (showStart + showDuration) % 24
        const setupDeadline  = showStart - setupHours
        const travelNext      = stops[i + 1]?.travel_hours_from_prev
        const travelNextMiles = stops[i + 1]?.distance_miles_from_prev
        const isStart        = stop.is_start_stop
        const isEnd          = stop.is_end_stop

        return (
          <div key={stop.id}>
            {/* Stop card */}
            <div className={`rounded-2xl bg-white border overflow-hidden ${isStart ? 'border-green-300' : isEnd ? 'border-orange-300' : 'border-gray-100'}`}>
              {/* Venue header */}
              <div className={`px-4 py-3 flex items-center justify-between ${isStart ? 'bg-green-50' : isEnd ? 'bg-orange-50' : 'bg-gray-50'} border-b border-gray-100`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${isStart ? 'bg-green-500' : isEnd ? 'bg-orange-400' : 'bg-indigo-600'}`}>
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{venue?.name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{[venue?.city, venue?.state].filter(Boolean).join(', ')}</p>
                  </div>
                </div>
                {(isStart || isEnd) && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2 ${isStart ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'}`}>
                    {isStart ? '▶ Start' : '■ End'}
                  </span>
                )}
              </div>
              {/* Schedule rows */}
              <div className="px-4 py-3 divide-y divide-gray-50">
                <div className="pb-2 space-y-0.5">
                  <ScheduleRow label="Arrives"    value={formatArrivalTime(stop.arrival_date)} />
                  <ScheduleRow label="Setup by"   value={formatHour(setupDeadline)} sub={`${setupHours}h needed`} />
                </div>
                <div className="py-2">
                  <ScheduleRow label="Show"       value={`${formatHour(showStart)} – ${formatHour(showEnd)}`} sub={`${showDuration}h`} accent />
                </div>
                <div className="pt-2 space-y-0.5">
                  <ScheduleRow label="Breakdown"  value={`${breakdownHours}h`} />
                  <ScheduleRow label="Departs"    value={formatArrivalTime(stop.departure_date)} />
                </div>
              </div>
            </div>

            {/* Travel connector to next stop */}
            {i < stops.length - 1 && (
              <div className="flex items-center gap-3 px-6 py-1">
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <div className="w-px h-3 bg-gray-200" />
                  <div className="text-gray-300 text-xs">↓</div>
                  <div className="w-px h-3 bg-gray-200" />
                </div>
                <p className="text-xs text-gray-400 font-medium">
                  {travelNext != null ? formatTravel(travelNext, travelNextMiles) : 'Optimize to calculate drive time'}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Edit Tour sheet ──────────────────────────────────────────────────────────

const STATUSES = ['draft', 'active', 'completed', 'cancelled']

function EditTourSheet({ open, onClose, tour, onSaved, hardErrorCount = 0 }) {
  const [form, setForm]     = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (open && tour) {
      setForm({
        name:                        tour.name                        ?? '',
        status:                      tour.status                      ?? 'draft',
        start_date:                  tour.start_date                  ?? '',
        end_date:                    tour.end_date                    ?? '',
        is_end_date_fixed:           tour.is_end_date_fixed           ?? false,
        default_show_start_hour:     tour.default_show_start_hour     ?? 20,
        default_show_duration_hours: tour.default_show_duration_hours ?? 2,
        default_production_setup_hours: tour.default_production_setup_hours ?? 4,
        default_breakdown_hours:     tour.default_breakdown_hours     ?? 2,
        default_rest_days:           tour.default_rest_days           ?? 0,
        driver_count:                tour.driver_count                ?? 1,
        crew_turnaround_hrs:         tour.crew_turnaround_hrs         ?? 10,
        show_end_time:               tour.show_end_time               ?? '',
        load_in_time:                tour.load_in_time                ?? '',
      })
      setError('')
    }
  }, [open, tour])

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSave() {
    if (!form.name.trim()) { setError('Tour name is required.'); return }
    setSaving(true); setError('')
    try {
      const { error: err } = await supabase.from('tours').update({
        name:                           form.name.trim(),
        status:                         form.status,
        start_date:                     form.start_date                  || null,
        end_date:                       form.end_date                    || null,
        is_end_date_fixed:              form.is_end_date_fixed,
        default_show_start_hour:        form.default_show_start_hour,
        default_show_duration_hours:    form.default_show_duration_hours,
        default_production_setup_hours: form.default_production_setup_hours,
        default_breakdown_hours:        form.default_breakdown_hours,
        default_rest_days:              form.default_rest_days,
        driver_count:                   form.driver_count,
        crew_turnaround_hrs:            form.crew_turnaround_hrs,
        show_end_time:                  form.show_end_time               || null,
        load_in_time:                   form.load_in_time                || null,
      }).eq('id', tour.id)
      if (err) throw err
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <BottomSheet open={open} onClose={onClose} title="Edit Tour">
      <div className="space-y-4">

        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tour Name *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Status</label>
          <div className="grid grid-cols-4 gap-1 bg-gray-100 rounded-xl p-1">
            {STATUSES.map(s => {
              const blocked = s === 'active' && hardErrorCount > 0
              return (
                <button key={s}
                  onClick={() => !blocked && set('status', s)}
                  title={blocked ? `Fix ${hardErrorCount} compliance error${hardErrorCount > 1 ? 's' : ''} before activating` : undefined}
                  className={`rounded-lg text-xs font-medium py-1.5 capitalize transition-colors ${
                    form.status === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  } ${blocked ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  {s}{blocked ? ' 🔴' : ''}
                </button>
              )
            })}
          </div>
          {hardErrorCount > 0 && form.status !== 'active' && (
            <p className="text-xs text-red-500 mt-1.5">
              {hardErrorCount} compliance error{hardErrorCount > 1 ? 's' : ''} must be resolved before activating this tour.
            </p>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
            <input type="date" value={form.start_date ?? ''} onChange={e => set('start_date', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
            <input type="date" value={form.end_date ?? ''} onChange={e => set('end_date', e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex items-center justify-between py-1 border-t border-gray-50">
          <div>
            <p className="text-sm font-medium text-gray-900">End date is fixed</p>
            <p className="text-xs text-gray-400">Routing will solve for start date</p>
          </div>
          <button onClick={() => set('is_end_date_fixed', !form.is_end_date_fixed)}
            className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${form.is_end_date_fixed ? 'bg-indigo-600' : 'bg-gray-200'}`}>
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${form.is_end_date_fixed ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* Show defaults */}
        <div className="border-t border-gray-50 pt-3 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Show Defaults</p>
          <p className="text-xs text-gray-400">Applies to every stop unless overridden per stop.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Show Start Time</label>
              <input type="time" step="1800"
                value={form.default_show_start_hour != null ? hourToTimeStr(form.default_show_start_hour) : ''}
                onChange={e => set('default_show_start_hour', e.target.value ? timeStrToHour(e.target.value) : null)}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Show Duration (hrs)</label>
              <input type="number" min="0.5" max="6" step="0.5" value={form.default_show_duration_hours ?? ''}
                onChange={e => set('default_show_duration_hours', parseFloat(e.target.value) || 2)}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Production Setup (hrs)</label>
              <input type="number" min="0.5" max="12" step="0.5" value={form.default_production_setup_hours ?? ''}
                onChange={e => set('default_production_setup_hours', parseFloat(e.target.value) || 4)}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Breakdown (hrs)</label>
              <input type="number" min="0.5" max="6" step="0.5" value={form.default_breakdown_hours ?? ''}
                onChange={e => set('default_breakdown_hours', parseFloat(e.target.value) || 2)}
                className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Rest Days per venue</label>
              <input type="number" min="0" max="14" value={form.default_rest_days ?? 0}
                onChange={e => set('default_rest_days', parseInt(e.target.value) || 0)}
                className={inputCls} />
            </div>
          </div>
        </div>

        {/* Crew & Driver Compliance */}
        <div className="border-t border-gray-50 pt-3 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Crew &amp; Driver Compliance</p>

          {/* Driver count toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-gray-900">Driver Team</p>
              <p className="text-xs text-gray-400">2-driver teams bypass the 10h FMCSA limit</p>
            </div>
            <div className="flex items-center gap-2">
              {form.driver_count === 2 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">2-Driver Team active</span>
              )}
              <button onClick={() => set('driver_count', form.driver_count === 2 ? 1 : 2)}
                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${form.driver_count === 2 ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${form.driver_count === 2 ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          {/* Crew turnaround */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Preferred Crew Turnaround (hrs)</label>
            <input type="number" min="8" max="24" step="0.5" value={form.crew_turnaround_hrs ?? 10}
              onChange={e => set('crew_turnaround_hrs', parseFloat(e.target.value) || 10)}
              className={inputCls} />
            <p className="text-xs text-gray-400 mt-0.5">IATSE absolute minimum is 8h. Advisory warnings shown below your preference.</p>
          </div>

          {/* Precise load-out / load-in times (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Show End / Load-Out Time</label>
              <input type="time" step="600" value={form.show_end_time ?? ''}
                onChange={e => set('show_end_time', e.target.value)}
                className={inputCls} />
              <p className="text-xs text-gray-400 mt-0.5">Optional — enables precise IATSE checks</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Load-In Call Time</label>
              <input type="time" step="600" value={form.load_in_time ?? ''}
                onChange={e => set('load_in_time', e.target.value)}
                className={inputCls} />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

        <button onClick={handleSave} disabled={saving}
          className="w-full rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 hover:bg-indigo-700 transition-colors disabled:opacity-60">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </BottomSheet>
  )
}

// ─── Add Stop sheet ───────────────────────────────────────────────────────────

function AddStopSheet({ open, onClose, tourId, onAdded }) {
  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState([])
  const [mode, setMode]             = useState('search') // 'search' | 'stop-opts' | 'create'
  const [checkedIds, setCheckedIds] = useState(new Set()) // multi-select
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const [newVenue, setNewVenue] = useState({
    name: '', address: '', city: '', state: '', zip: '',
  })
  const [stopOpts, setStopOpts] = useState({
    rest_days: '', show_start_hour: '', show_duration_hours: '',
    production_setup_hours: '', breakdown_hours: '', is_fixed: false,
  })

  useEffect(() => {
    if (!open) {
      setQuery(''); setResults([]); setMode('search')
      setCheckedIds(new Set()); setError(''); setSaving(false)
      setNewVenue({ name: '', address: '', city: '', state: '', zip: '' })
      setStopOpts({ rest_days: '', show_start_hour: '', show_duration_hours: '', production_setup_hours: '', breakdown_hours: '', is_fixed: false })
    }
  }, [open])

  // Search venues by city name
  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      supabase.from('venues')
        .select('id, name, city, state, address, lat, lng, capacity')
        .ilike('city', `%${query}%`)
        .order('city')
        .order('name')
        .limit(30)
        .then(({ data }) => { setResults(data ?? []); setCheckedIds(new Set()) })
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  function setNV(field, val) { setNewVenue(v => ({ ...v, [field]: val })) }
  function setSO(field, val) { setStopOpts(o => ({ ...o, [field]: val })) }

  function toggleCheck(id) {
    setCheckedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (checkedIds.size === results.length) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(results.map(v => v.id)))
    }
  }

  // Geocode any venue missing coordinates, then batch-insert all stops
  async function handleSaveSelected() {
    setSaving(true); setError('')
    try {
      const venues = results.filter(v => checkedIds.has(v.id))

      // Geocode venues missing lat/lng
      const geocoded = await Promise.all(venues.map(async v => {
        if (v.lat && v.lng) return v
        const full = `${v.address}, ${v.city}, ${v.state}`
        const geo = await geocodeAddress(full)
        await supabase.from('venues').update({ lat: geo.lat, lng: geo.lng }).eq('id', v.id)
        return { ...v, lat: geo.lat, lng: geo.lng }
      }))

      const rows = geocoded.map(v => ({
        tour_id:                 tourId,
        venue_id:                v.id,
        sequence_order:          9999,
        rest_days:               stopOpts.rest_days               ? parseInt(stopOpts.rest_days)                : null,
        show_start_hour:         stopOpts.show_start_hour         ? parseFloat(stopOpts.show_start_hour)        : null,
        show_duration_hours:     stopOpts.show_duration_hours     ? parseFloat(stopOpts.show_duration_hours)    : null,
        production_setup_hours:  stopOpts.production_setup_hours  ? parseFloat(stopOpts.production_setup_hours) : null,
        breakdown_hours:         stopOpts.breakdown_hours         ? parseFloat(stopOpts.breakdown_hours)        : null,
        is_fixed:                stopOpts.is_fixed,
      }))

      const { error: insertErr } = await supabase.from('tour_stops').insert(rows)
      if (insertErr) throw insertErr
      onAdded()
    } catch (e) {
      setError(e.message); setSaving(false)
    }
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
      await supabase.from('tour_stops').insert({
        tour_id:                 tourId,
        venue_id:                venue.id,
        sequence_order:          9999,
        rest_days:               stopOpts.rest_days               ? parseInt(stopOpts.rest_days)                : null,
        show_start_hour:         stopOpts.show_start_hour         ? parseFloat(stopOpts.show_start_hour)        : null,
        show_duration_hours:     stopOpts.show_duration_hours     ? parseFloat(stopOpts.show_duration_hours)    : null,
        production_setup_hours:  stopOpts.production_setup_hours  ? parseFloat(stopOpts.production_setup_hours) : null,
        breakdown_hours:         stopOpts.breakdown_hours         ? parseFloat(stopOpts.breakdown_hours)        : null,
        is_fixed:                stopOpts.is_fixed,
      })
      onAdded()
    } catch (e) {
      setError(e.message); setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const selectedVenues = results.filter(v => checkedIds.has(v.id))
  const allChecked = results.length > 0 && checkedIds.size === results.length

  const sheetTitle =
    mode === 'create'    ? 'New Venue' :
    mode === 'stop-opts' ? `Stop Options — ${checkedIds.size} venue${checkedIds.size !== 1 ? 's' : ''}` :
    'Add Stop'

  return (
    <BottomSheet open={open} onClose={onClose} title={sheetTitle}>
      <div className="space-y-4">

        {/* ── Search / select mode ── */}
        {mode === 'search' && (
          <>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by city…"
              className={inputCls}
              autoFocus
            />

            {results.length > 0 && (
              <>
                {/* Select-all row */}
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs text-gray-400">
                    {results.length} venue{results.length !== 1 ? 's' : ''} in{' '}
                    <span className="font-medium text-gray-600">{results[0].city}{results.some(v => v.city !== results[0].city) ? ' area' : ''}</span>
                  </p>
                  <button
                    onClick={toggleAll}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {allChecked ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                {/* Venue list */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {results.map(v => {
                    const checked = checkedIds.has(v.id)
                    return (
                      <button
                        key={v.id}
                        onClick={() => toggleCheck(v.id)}
                        className={`w-full rounded-xl border px-4 py-3 text-left flex items-center gap-3 transition-colors ${
                          checked
                            ? 'bg-indigo-50 border-indigo-300'
                            : 'bg-gray-50 border-gray-100 hover:border-indigo-200'
                        }`}
                      >
                        {/* Checkbox indicator */}
                        <span className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          checked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'
                        }`}>
                          {checked && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                            </svg>
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{v.name}</p>
                          <p className="text-xs text-gray-400">
                            {[v.city, v.state].filter(Boolean).join(', ')}
                            {v.capacity ? ` · ${v.capacity.toLocaleString()} cap` : ''}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {query.length >= 2 && results.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">No venues found in "{query}"</p>
            )}

            {/* Proceed / new venue actions */}
            {checkedIds.size > 0 && (
              <button
                onClick={() => setMode('stop-opts')}
                className="w-full rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 hover:bg-indigo-700 transition-colors"
              >
                Continue with {checkedIds.size} venue{checkedIds.size !== 1 ? 's' : ''} →
              </button>
            )}

            <button
              onClick={() => setMode('create')}
              className="w-full rounded-xl border border-dashed border-indigo-300 text-indigo-600 text-sm font-medium py-2.5 hover:bg-indigo-50 transition-colors"
            >
              + Add new venue
            </button>
          </>
        )}

        {/* ── Stop options for selected existing venues ── */}
        {mode === 'stop-opts' && (
          <>
            {/* Summary of selected venues */}
            <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1 max-h-32 overflow-y-auto">
              {selectedVenues.map(v => (
                <p key={v.id} className="text-sm text-gray-700 truncate">
                  <span className="font-medium">{v.name}</span>
                  <span className="text-gray-400"> · {v.city}, {v.state}</span>
                </p>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Show Start Time</label>
                <input type="time" step="1800"
                  value={stopOpts.show_start_hour ? hourToTimeStr(stopOpts.show_start_hour) : ''}
                  onChange={e => setSO('show_start_hour', e.target.value ? timeStrToHour(e.target.value) : '')}
                  placeholder="Tour default" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Show Duration (hrs)</label>
                <input type="number" min="0.5" max="6" step="0.5" value={stopOpts.show_duration_hours}
                  onChange={e => setSO('show_duration_hours', e.target.value)}
                  placeholder="Tour default" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Production Setup (hrs)</label>
                <input type="number" min="0.5" max="12" step="0.5" value={stopOpts.production_setup_hours}
                  onChange={e => setSO('production_setup_hours', e.target.value)}
                  placeholder="Tour default" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Breakdown (hrs)</label>
                <input type="number" min="0.5" max="6" step="0.5" value={stopOpts.breakdown_hours}
                  onChange={e => setSO('breakdown_hours', e.target.value)}
                  placeholder="Tour default" className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Rest Days (multi-night)</label>
                <input type="number" min="0" value={stopOpts.rest_days}
                  onChange={e => setSO('rest_days', e.target.value)}
                  placeholder="Tour default" className={inputCls} />
              </div>
            </div>

            <div className="flex items-center justify-between py-2 border-t border-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">Pin dates as fixed</p>
                <p className="text-xs text-gray-400">Route optimization won't move these stops</p>
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
              <button onClick={handleSaveSelected} disabled={saving}
                className="flex-1 rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 disabled:opacity-60">
                {saving ? 'Adding…' : `Add ${checkedIds.size} Stop${checkedIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}

        {/* ── Create new venue mode ── */}
        {mode === 'create' && (
          <>
            <p className="text-xs text-gray-500">This venue will be added to the venue directory.</p>
            {[
              { label: 'Venue Name *',      field: 'name',    placeholder: 'e.g. The Tabernacle' },
              { label: 'Street Address *',  field: 'address', placeholder: '152 Luckie St NW' },
              { label: 'City *',            field: 'city',    placeholder: 'Atlanta' },
              { label: 'State *',           field: 'state',   placeholder: 'GA' },
              { label: 'ZIP',               field: 'zip',     placeholder: '30303' },
            ].map(({ label, field, placeholder }) => (
              <div key={field}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                <input value={newVenue[field]} onChange={e => setNV(field, e.target.value)}
                  placeholder={placeholder} className={inputCls} />
              </div>
            ))}
            <div className="border-t border-gray-100 pt-3 space-y-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stop Options</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Show Start Time</label>
                  <input type="time" step="1800"
                    value={stopOpts.show_start_hour ? hourToTimeStr(stopOpts.show_start_hour) : ''}
                    onChange={e => setSO('show_start_hour', e.target.value ? timeStrToHour(e.target.value) : '')}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Show Duration (hrs)</label>
                  <input type="number" min="0.5" max="6" step="0.5" value={stopOpts.show_duration_hours}
                    onChange={e => setSO('show_duration_hours', e.target.value)}
                    placeholder="Tour default" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Production Setup (hrs)</label>
                  <input type="number" min="0.5" max="12" step="0.5" value={stopOpts.production_setup_hours}
                    onChange={e => setSO('production_setup_hours', e.target.value)}
                    placeholder="Tour default" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Breakdown (hrs)</label>
                  <input type="number" min="0.5" max="6" step="0.5" value={stopOpts.breakdown_hours}
                    onChange={e => setSO('breakdown_hours', e.target.value)}
                    placeholder="Tour default" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Rest Days (multi-night)</label>
                  <input type="number" min="0" value={stopOpts.rest_days}
                    onChange={e => setSO('rest_days', e.target.value)}
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
  const [view, setView]         = useState('list') // 'list' | 'map' | 'schedule'
  const [addingStop, setAddingStop]   = useState(false)
  const [editingTour, setEditingTour] = useState(false)
  const [optimizing, setOptimizing]   = useState(false)
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
    if (stopsRes.data) {
      setStops(stopsRes.data)
      // Reconstruct legs from stored per-stop data so the map renders without re-calling HERE
      const restoredLegs = stopsRes.data
        .slice(1)
        .map(s => ({
          durationHours:   s.travel_hours_from_prev ?? s.estimated_drive_hours ?? 0,
          distanceMiles:   s.distance_miles_from_prev   ?? 0,
          encodedPolyline: s.encoded_polyline_from_prev ?? null,
        }))
      if (restoredLegs.some(l => l.encodedPolyline)) setLegs(restoredLegs)
    }
    setLoading(false)
  }, [id])

  useEffect(() => { loadTour() }, [loadTour])

  const headliner    = tour?.tour_artists?.find(a => a.role === 'Headliner')
  const tourDefaults = {
    show_start_hour:        tour?.default_show_start_hour,
    show_duration_hours:    tour?.default_show_duration_hours,
    production_setup_hours: tour?.default_production_setup_hours,
    breakdown_hours:        tour?.default_breakdown_hours,
    rest_days:              tour?.default_rest_days,
  }

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

  const compliance = useMemo(() => checkTourCompliance(stops, tour), [stops, tour])
  const hardErrorCount = compliance.filter(w => w.severity === 'error').length

  // Key compliance warnings by the stopId they reference for easy lookup
  const complianceByStop = useMemo(() => {
    const map = {}
    compliance.forEach(w => {
      if (!map[w.stopId]) map[w.stopId] = []
      map[w.stopId].push(w)
    })
    return map
  }, [compliance])

  async function handleSwitchToTwoDriver(stopId) {
    await supabase.from('tour_stops').update({ requires_two_driver: true }).eq('id', stopId)
    loadTour()
  }

  async function handleAddRestStop(afterStopIndex) {
    setOptError('')
    try {
      const newOrder = afterStopIndex + 1
      // Shift all subsequent stops up by 1 (use their DB sequence_order, not array index)
      const toShift = stops.slice(newOrder)
      await Promise.all(toShift.map(s =>
        supabase.from('tour_stops').update({ sequence_order: s.sequence_order + 1 }).eq('id', s.id)
      ))
      // Insert rest stop — omit venue_id entirely so it stays NULL without FK conflict
      const { error: insertErr } = await supabase.from('tour_stops').insert({
        tour_id:        id,
        sequence_order: newOrder,
        stop_type:      'transit_rest',
        rest_days:      1,
      })
      if (insertErr) throw insertErr
      loadTour()
    } catch (e) {
      setOptError(`Could not add rest stop: ${e.message}`)
    }
  }

  async function handleOptimize() {
    if (stops.length < 2) { setOptError('Add at least 2 stops to optimize.'); return }

    const missing = stops.filter(s => !s.venues?.lat || !s.venues?.lng)
    if (missing.length > 0) {
      setOptError(`${missing.length} stop(s) are missing coordinates. Try removing and re-adding them.`)
      return
    }

    setOptimizing(true); setOptError('')
    try {
      // Respect designated start/end anchors
      const startStop = stops.find(s => s.is_start_stop)
      const endStop   = stops.find(s => s.is_end_stop)
      const middle    = stops.filter(s => s !== startStop && s !== endStop)
      const orderedForOpt = [
        ...(startStop ? [startStop] : []),
        ...middle,
        ...(endStop ? [endStop] : []),
      ]
      // If no designated start, use existing order as-is
      const stopsToOpt = orderedForOpt.length > 0 ? orderedForOpt : stops

      const waypoints = stopsToOpt.map(s => ({
        id: s.id,
        lat: s.venues.lat,
        lng: s.venues.lng,
        name: s.venues.name,
        city: s.venues.city,
        state: s.venues.state,
      }))

      const { orderedStops, legs: newLegs } = await optimizeRoute(waypoints, { fixedEnd: !!endStop })
      setLegs(newLegs)

      // Map optimized waypoints back to full stop objects so rest_days/buffer_days are preserved
      const orderedFullStops = orderedStops.map(ws => stops.find(s => s.id === ws.id))

      // Apply tour date math — guard against null tour defaults
      const dated = computeTourDates(
        orderedFullStops,
        tour.start_date ?? new Date().toISOString().split('T')[0],
        {
          defaultRestDays:             tour.default_rest_days              ?? 0,
          defaultShowStartHour:        tour.default_show_start_hour        ?? 20,
          defaultShowDurationHours:    tour.default_show_duration_hours    ?? 2,
          defaultProductionSetupHours: tour.default_production_setup_hours ?? 4,
          defaultBreakdownHours:       tour.default_breakdown_hours        ?? 2,
        },
        newLegs
      )

      // Batch all stop updates + tour counter in two parallel calls
      const stopUpdates = orderedFullStops.map((stop, i) => ({
        id:                          stop.id,
        tour_id:                     stop.tour_id,
        venue_id:                    stop.venue_id,
        sequence_order:              i,
        arrival_date:                dated[i].arrival_date,
        departure_date:              dated[i].departure_date,
        travel_hours_from_prev:      i > 0 ? newLegs[i - 1]?.durationHours  ?? null : null,
        estimated_drive_hours:       i > 0 ? newLegs[i - 1]?.durationHours  ?? null : null,
        distance_miles_from_prev:    i > 0 ? newLegs[i - 1]?.distanceMiles  ?? null : null,
        encoded_polyline_from_prev:  i > 0 ? newLegs[i - 1]?.encodedPolyline ?? null : null,
        stop_type:                   stop.stop_type ?? 'show',
      }))

      const [stopsResult, tourResult] = await Promise.all([
        supabase.from('tour_stops').upsert(stopUpdates),
        supabase.from('tours').update({
          route_calculations_count: (tour.route_calculations_count ?? 0) + 1,
        }).eq('id', id),
      ])
      if (stopsResult.error) throw new Error(`Stop save failed: ${stopsResult.error.message}`)
      if (tourResult.error)  throw new Error(`Tour save failed: ${tourResult.error.message}`)

      await loadTour()
    } catch (e) {
      setOptError(e.message)
    } finally {
      setOptimizing(false)
    }
  }

  async function handleSetStart(stop) {
    // Clear any existing start, then toggle this stop
    await supabase.from('tour_stops').update({ is_start_stop: false }).eq('tour_id', id)
    if (!stop.is_start_stop) {
      await supabase.from('tour_stops').update({ is_start_stop: true }).eq('id', stop.id)
    }
    loadTour()
  }

  async function handleSetEnd(stop) {
    // Clear any existing end, then toggle this stop
    await supabase.from('tour_stops').update({ is_end_stop: false }).eq('tour_id', id)
    if (!stop.is_end_stop) {
      await supabase.from('tour_stops').update({ is_end_stop: true }).eq('id', stop.id)
    }
    loadTour()
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
      <div className="px-4 pt-8 pb-4 md:px-8 md:pt-10">
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
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[tour.status] ?? STATUS_STYLE.draft}`}>
              {tour.status}
            </span>
            <button
              onClick={() => setEditingTour(true)}
              className="text-xs text-indigo-600 font-medium hover:text-indigo-700 px-2 py-0.5 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Optimize bar */}
      <div className="mx-4 mb-3 md:mx-8 rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3">
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
        {compliance.length > 0 ? (
          <p className="text-xs mt-2">
            {hardErrorCount > 0 && <span className="text-red-600 font-semibold">🔴 {hardErrorCount} error{hardErrorCount > 1 ? 's' : ''} </span>}
            {compliance.filter(w => w.severity === 'warning').length > 0 && (
              <span className="text-amber-600 font-semibold">
                🟡 {compliance.filter(w => w.severity === 'warning').length} warning{compliance.filter(w => w.severity === 'warning').length > 1 ? 's' : ''}
              </span>
            )}
          </p>
        ) : (
          stops.length >= 2 && tour.route_calculations_count > 0 &&
          <p className="text-xs text-green-600 mt-2">✅ All clear</p>
        )}
      </div>

      {/* Artist lineup */}
      {tour.tour_artists?.length > 0 && (
        <div className="mx-4 mb-3 md:mx-8">
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

      {/* Mobile: List / Map / Schedule toggle + Add Stop */}
      <div className="mx-4 mb-4 flex items-center gap-2 md:hidden">
        <div className="flex-1 flex rounded-xl bg-gray-100 p-1 gap-1">
          {[['list', '≡ List'], ['map', '⊕ Map'], ['schedule', '📅']].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`flex-1 rounded-lg text-sm font-medium py-1.5 transition-colors ${view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              {label}
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

      {/* Desktop: view toggle + Add Stop button */}
      <div className="hidden md:flex mx-8 mb-4 items-center justify-between">
        <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
          {[['list', '≡ List'], ['map', '⊕ Map'], ['schedule', '📅 Schedule']].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-lg text-sm font-medium px-4 py-1.5 transition-colors ${view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
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

      {/* Mobile content: toggled list / map / schedule */}
      <div className="md:hidden">
        {view === 'list' && (
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
                <div key={stop.id}>
                  {i > 0 && <LegConnector stop={stop} twoDriver={tour.driver_count === 2} />}
                  {(complianceByStop[stop.id] ?? []).map((w, wi) => (
                    <ComplianceWarningBanner key={wi} warning={w}
                      onSwitchToTwoDriver={() => handleSwitchToTwoDriver(w.stopId)}
                      onAddRestStop={() => handleAddRestStop(w.stopIndex - 1)} />
                  ))}
                  <StopCard stop={stop} seq={i + 1} onPin={handlePin} onSetStart={handleSetStart} onSetEnd={handleSetEnd} onRemove={handleRemove} onUpdate={loadTour} tourDefaults={tourDefaults} />
                </div>
              ))
            )}
          </div>
        )}
        {view === 'map' && (
          <div className="mx-4 mb-24 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
            {mapStops.length === 0 ? (
              <div className="flex items-center justify-center bg-gray-50" style={{ height: 420 }}>
                <p className="text-sm text-gray-400">Add stops with addresses to see the map</p>
              </div>
            ) : (
              <HereMap stops={mapStops} legs={legs} className="w-full" style={{ height: 420 }} />
            )}
          </div>
        )}
        {view === 'schedule' && (
          <div className="px-4">
            <ScheduleView stops={stops} tourDefaults={tourDefaults} />
          </div>
        )}
      </div>

      {/* Desktop content */}
      <div className="hidden md:block md:px-8 md:pb-10">
        {view === 'schedule' ? (
          <ScheduleView stops={stops} tourDefaults={tourDefaults} />
        ) : (
          <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
            {/* Stop list */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
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
                  <div key={stop.id}>
                    {i > 0 && <LegConnector stop={stop} twoDriver={tour.driver_count === 2} />}
                    {(complianceByStop[stop.id] ?? []).map((w, wi) => (
                      <ComplianceWarningBanner key={wi} warning={w}
                        onSwitchToTwoDriver={handleSwitchToTwoDriver}
                        onAddRestStop={() => handleAddRestStop(w.stopIndex - 1)} />
                    ))}
                    <StopCard stop={stop} seq={i + 1} onPin={handlePin} onSetStart={handleSetStart} onSetEnd={handleSetEnd} onRemove={handleRemove} onUpdate={loadTour} tourDefaults={tourDefaults} />
                  </div>
                ))
              )}
            </div>
            {/* Map */}
            <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
              {mapStops.length === 0 ? (
                <div className="flex items-center justify-center bg-gray-50 h-full" style={{ minHeight: 480 }}>
                  <p className="text-sm text-gray-400">Add stops with addresses to see the map</p>
                </div>
              ) : (
                <HereMap stops={mapStops} legs={legs} className="w-full" style={{ minHeight: 480, height: '100%' }} />
              )}
            </div>
          </div>
        )}
      </div>

      <EditTourSheet
        open={editingTour}
        onClose={() => setEditingTour(false)}
        tour={tour}
        onSaved={() => { setEditingTour(false); loadTour() }}
        hardErrorCount={hardErrorCount}
      />

      <AddStopSheet
        open={addingStop}
        onClose={() => setAddingStop(false)}
        tourId={id}
        onAdded={() => { setAddingStop(false); loadTour() }}
      />
    </div>
  )
}
