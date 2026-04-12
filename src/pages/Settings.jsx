import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabase'
import { enrichFromHERE } from '../services/here'
import { enrichFromOSM }  from '../services/osm'

// ─── Shared primitives ───────────────────────────────────────────────────────

function Section({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 mb-3 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{icon}</span>
          <span className="text-sm font-semibold text-gray-900">{title}</span>
        </div>
        <span className={`text-gray-300 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      {open && <div className="px-5 pb-5 border-t border-gray-50">{children}</div>}
    </div>
  )
}

function Toggle({ label, description, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="mr-4">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          value ? 'bg-indigo-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5 ${
            value ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function Field({ label, value, editing, field, type = 'text', onChange }) {
  if (!editing) {
    return (
      <div className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-sm text-gray-900 font-medium">{value || '—'}</span>
      </div>
    )
  }
  return (
    <div className="py-2">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
    </div>
  )
}

// ─── Profile section ─────────────────────────────────────────────────────────

function ProfileSection({ user, updateUser }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(user)

  function handleChange(field, val) {
    setDraft((d) => ({ ...d, [field]: val }))
  }
  function handleEdit() { setDraft(user); setEditing(true) }
  function handleSave() { updateUser(draft); setEditing(false) }
  function handleCancel() { setDraft(user); setEditing(false) }

  const initials = (user.name || '?')
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="pt-4">
      <div className="flex items-center gap-4 mb-5">
        <div className="h-14 w-14 rounded-full bg-indigo-100 flex items-center justify-center text-lg font-bold text-indigo-600 shrink-0">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{user.name}</p>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            user.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-indigo-50 text-indigo-600'
          }`}>
            {user.role === 'admin' ? 'Admin' : 'Agent'}
          </span>
        </div>
        {!editing && (
          <button onClick={handleEdit} className="ml-auto text-xs text-indigo-600 font-medium">
            Edit
          </button>
        )}
      </div>

      <div className={editing ? 'space-y-1' : ''}>
        <Field label="Full name" value={editing ? draft.name   : user.name}   editing={editing} field="name"   onChange={handleChange} />
        <Field label="Email"     value={editing ? draft.email  : user.email}  editing={editing} field="email"  type="email" onChange={handleChange} />
        <Field label="Agency"    value={editing ? draft.agency : user.agency} editing={editing} field="agency" onChange={handleChange} />
        <Field label="Phone"     value={editing ? draft.phone  : user.phone}  editing={editing} field="phone"  type="tel"   onChange={handleChange} />
      </div>

      {editing && (
        <div className="flex gap-2 mt-4">
          <button onClick={handleSave}
            className="flex-1 rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2 hover:bg-indigo-700 transition-colors">
            Save changes
          </button>
          <button onClick={handleCancel}
            className="flex-1 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold py-2 hover:bg-gray-200 transition-colors">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Display section ─────────────────────────────────────────────────────────

function DisplaySection() {
  const [dark, setDark] = useState(() => localStorage.getItem('sp_dark') === 'true')
  const [compact, setCompact] = useState(() => localStorage.getItem('sp_compact') === 'true')

  function toggleDark(val) {
    setDark(val)
    localStorage.setItem('sp_dark', val)
    document.documentElement.classList.toggle('dark', val)
  }

  function toggleCompact(val) {
    setCompact(val)
    localStorage.setItem('sp_compact', val)
    document.documentElement.classList.toggle('compact', val)
  }

  return (
    <div className="pt-2">
      <Toggle
        label="Dark Mode"
        description="Switch to a dark color scheme"
        value={dark}
        onChange={toggleDark}
      />
      <Toggle
        label="Compact Text"
        description="Reduce font and spacing size"
        value={compact}
        onChange={toggleCompact}
      />
    </div>
  )
}

// ─── Coordinators section ────────────────────────────────────────────────────

const COORD_KEYS = {
  email:   'sp_coord_email',
  sms:     'sp_coord_sms',
  auto:    'sp_coord_auto',
  autoMsg: 'sp_coord_msg',
}

function CoordinatorsSection() {
  const [emailNotifs, setEmailNotifs] = useState(
    () => localStorage.getItem(COORD_KEYS.email) !== 'false'
  )
  const [smsNotifs, setSmsNotifs] = useState(
    () => localStorage.getItem(COORD_KEYS.sms) === 'true'
  )
  const [autoRespond, setAutoRespond] = useState(
    () => localStorage.getItem(COORD_KEYS.auto) === 'true'
  )
  const [autoMsg, setAutoMsg] = useState(
    () => localStorage.getItem(COORD_KEYS.autoMsg) || ''
  )

  function set(key, setter, val) {
    setter(val)
    localStorage.setItem(key, val)
  }

  function saveAutoMsg(val) {
    setAutoMsg(val)
    localStorage.setItem(COORD_KEYS.autoMsg, val)
  }

  return (
    <div className="pt-2">
      <Toggle
        label="Email notifications"
        description="Receive booking inquiries and updates by email"
        value={emailNotifs}
        onChange={(v) => set(COORD_KEYS.email, setEmailNotifs, v)}
      />
      <Toggle
        label="SMS notifications"
        description="Receive urgent alerts via text message"
        value={smsNotifs}
        onChange={(v) => set(COORD_KEYS.sms, setSmsNotifs, v)}
      />
      <Toggle
        label="Auto-respond to inquiries"
        description="Send an automatic reply when a new inquiry arrives"
        value={autoRespond}
        onChange={(v) => set(COORD_KEYS.auto, setAutoRespond, v)}
      />
      {autoRespond && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Auto-response message
          </label>
          <textarea
            value={autoMsg}
            onChange={(e) => saveAutoMsg(e.target.value)}
            rows={3}
            placeholder="Thanks for reaching out! We'll get back to you within 24 hours…"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          />
        </div>
      )}
    </div>
  )
}

// ─── Agreements section ──────────────────────────────────────────────────────

function AgreementsSection() {
  const templates = [
    { name: 'Standard Venue Agreement', status: 'coming soon' },
    { name: 'Festival Appearance Rider', status: 'coming soon' },
    { name: 'Revenue Share Agreement',   status: 'coming soon' },
  ]
  return (
    <div className="pt-2 space-y-2">
      {templates.map((t) => (
        <div key={t.name} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
          <p className="text-sm font-medium text-gray-700">{t.name}</p>
          <span className="text-xs text-gray-400 italic">{t.status}</span>
        </div>
      ))}
      <p className="text-xs text-gray-400 pt-1">
        Agreement variable configuration will be available in a future update.
      </p>
    </div>
  )
}

// ─── User Management section (admin only) ────────────────────────────────────

function UserRow({ u, isSelf, onPasswordReset, onToggleStatus }) {
  const [state, setState] = useState(null)
  const isInactive = u.status === 'inactive'

  async function handleReset() {
    setState('resetting')
    await onPasswordReset(u.email)
    setState('reset_sent')
    setTimeout(() => setState(null), 3000)
  }
  async function handleToggle() {
    setState('toggling')
    await onToggleStatus(u)
    setState(null)
  }

  return (
    <div className={`rounded-xl border p-3 ${isInactive ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-100 bg-gray-50'}`}>
      <div className="flex items-start justify-between mb-1">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{u.name || '—'}</p>
          <p className="text-xs text-gray-400 truncate">{u.email}</p>
          {u.agency && <p className="text-xs text-gray-400 truncate">{u.agency}</p>}
        </div>
        <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            u.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-indigo-50 text-indigo-600'
          }`}>
            {u.role === 'admin' ? 'Admin' : 'Agent'}
          </span>
          {isInactive && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-500">
              Inactive
            </span>
          )}
        </div>
      </div>
      {isSelf ? (
        <p className="text-xs text-gray-400 mt-1">Your account</p>
      ) : (
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleReset}
            disabled={!!state}
            className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-white border border-gray-200 text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
          >
            {state === 'resetting' ? 'Sending…' : state === 'reset_sent' ? 'Email sent!' : 'Reset password'}
          </button>
          <button
            onClick={handleToggle}
            disabled={!!state}
            className={`flex-1 text-xs font-medium py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
              isInactive
                ? 'bg-white border-green-200 text-green-600 hover:bg-green-50'
                : 'bg-white border-red-200 text-red-500 hover:bg-red-50'
            }`}
          >
            {state === 'toggling' ? '…' : isInactive ? 'Reactivate' : 'Deactivate'}
          </button>
        </div>
      )}
    </div>
  )
}

function UserManagementSection({ currentUserId }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, name, email, agency, role, status')
      .order('name')
      .then(({ data }) => { setUsers(data ?? []); setLoading(false) })
  }, [])

  async function handlePasswordReset(email) {
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
  }

  async function handleToggleStatus(target) {
    const newStatus = target.status === 'inactive' ? 'active' : 'inactive'
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', target.id)
    if (!error) setUsers((prev) => prev.map((u) => u.id === target.id ? { ...u, status: newStatus } : u))
  }

  return (
    <div className="pt-2">
      {loading ? (
        <p className="text-sm text-gray-400">Loading users…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-gray-400">No users found.</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <UserRow
              key={u.id}
              u={u}
              isSelf={u.id === currentUserId}
              onPasswordReset={handlePasswordReset}
              onToggleStatus={handleToggleStatus}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Venue Cleanup section (admin only) ──────────────────────────────────────

const VENUE_SORT_OPTS = [
  { key: 'name',       label: 'Name'   },
  { key: 'city',       label: 'City'   },
  { key: 'state',      label: 'State'  },
  { key: 'capacity',   label: 'Cap'    },
  { key: 'venue_type', label: 'Type'   },
]

// All fields that can be auto-enriched, grouped for display
const ENRICH_FIELD_GROUPS = [
  {
    group: 'Location',
    fields: [
      { key: 'geocode',      label: 'Coordinates'  },
      { key: 'address',      label: 'Address'      },
      { key: 'neighborhood', label: 'Neighborhood' },
      { key: 'city',         label: 'City'         },
      { key: 'state',        label: 'State'        },
      { key: 'zip',          label: 'ZIP'          },
    ],
  },
  {
    group: 'Contact',
    fields: [
      { key: 'phone',   label: 'Phone'   },
      { key: 'website', label: 'Website' },
    ],
  },
  {
    group: 'Venue Info',
    fields: [
      { key: 'capacity',   label: 'Capacity'   },
      { key: 'venue_type', label: 'Venue Type' },
    ],
  },
]

const ALL_ENRICH_FIELDS = ENRICH_FIELD_GROUPS.flatMap(g => g.fields)

const MISSING_FILTERS = [
  { key: null,       label: 'All'        },
  { key: 'geocode',  label: 'No geo'     },
  { key: 'phone',    label: 'No phone'   },
  { key: 'website',  label: 'No website' },
]

const SOURCE_OPTS = [
  { key: 'here', label: 'HERE'       },
  { key: 'web',  label: 'Web (OSM)'  },
  { key: 'auto', label: 'HERE → Web' },
]

// Direct mapping: field key → DB column(s)
const DIRECT_FIELDS = ['address', 'neighborhood', 'city', 'state', 'zip', 'phone', 'website', 'venue_type']

function getDisplayVal(venue, found, field) {
  const fmt = (v, f) => {
    if (f === 'geocode') return v?.lat != null ? `${Number(v.lat).toFixed(5)}, ${Number(v.lng).toFixed(5)}` : null
    if (f === 'capacity') return v?.[f] != null ? Number(v[f]).toLocaleString() : null
    return v?.[f] || null
  }
  return { current: fmt(venue, field), found: fmt(found, field) }
}

function VenueResultCard({ result, enrichFields, onToggleAccept }) {
  const { venue, found, accepted, error } = result
  const sourceLabel = found._source ?? ''

  return (
    <div className={`rounded-xl border p-3 ${error ? 'border-red-100 bg-red-50' : 'border-gray-100 bg-white'}`}>
      <div className="flex items-start justify-between mb-1">
        <p className="text-sm font-semibold text-gray-900 leading-tight">{venue.name}</p>
        {sourceLabel && !error && (
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded ml-2 shrink-0">{sourceLabel}</span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-2">{venue.city}, {venue.state}</p>

      {error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : (
        <div className="space-y-1.5">
          {found._matchedTitle && found._matchedTitle !== venue.name && (
            <p className="text-xs text-gray-400 italic mb-2">Matched as: "{found._matchedTitle}"</p>
          )}
          {enrichFields.map(fieldKey => {
            const fieldMeta = ALL_ENRICH_FIELDS.find(f => f.key === fieldKey)
            const { current, found: foundVal } = getDisplayVal(venue, found, fieldKey)
            if (!foundVal) {
              return (
                <div key={fieldKey} className="flex items-center justify-between py-0.5">
                  <span className="text-xs text-gray-400">{fieldMeta?.label ?? fieldKey}</span>
                  <span className="text-xs text-gray-300 italic">not found</span>
                </div>
              )
            }
            const unchanged = String(foundVal) === String(current ?? '')
            return (
              <div key={fieldKey} className={`rounded-lg px-3 py-2 ${unchanged ? 'bg-gray-50' : 'border border-gray-100'}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-gray-600">{fieldMeta?.label ?? fieldKey}</span>
                  {unchanged ? (
                    <span className="text-xs text-gray-400 italic">unchanged</span>
                  ) : (
                    <button
                      onClick={() => onToggleAccept(venue.id, fieldKey)}
                      className={`text-xs px-2 py-0.5 rounded-lg font-medium transition-colors ${
                        accepted[fieldKey] ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {accepted[fieldKey] ? '✓ Apply' : 'Skip'}
                    </button>
                  )}
                </div>
                <p className={`text-xs truncate ${unchanged ? 'text-gray-500' : 'text-indigo-600 font-medium'}`}>
                  {foundVal}
                </p>
                {!unchanged && (
                  <p className="text-xs text-gray-300 truncate mt-0.5">
                    {current ? `was: ${current}` : 'was empty'}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function VenueCleanupSection() {
  const [venues, setVenues]               = useState([])
  const [loading, setLoading]             = useState(true)
  const [sortKey, setSortKey]             = useState('name')
  const [sortDir, setSortDir]             = useState('asc')
  const [missingFilter, setMissingFilter] = useState(null)
  const [checkedIds, setCheckedIds]       = useState(new Set())
  const [enrichFields, setEnrichFields]   = useState(new Set(['phone', 'website']))
  const [source, setSource]               = useState('auto') // 'here' | 'web' | 'auto'
  const [phase, setPhase]                 = useState('select') // 'select' | 'working' | 'review'
  const [progress, setProgress]           = useState({ done: 0, total: 0 })
  const [results, setResults]             = useState([])
  const [applying, setApplying]           = useState(false)
  const [toast, setToast]                 = useState('')

  useEffect(() => {
    supabase.from('venues')
      .select('id, name, address, neighborhood, city, state, zip, phone, website, capacity, venue_type, lat, lng')
      .order('name')
      .then(({ data }) => { setVenues(data ?? []); setLoading(false) })
  }, [])

  const displayed = useMemo(() => {
    let list = [...venues]
    if (missingFilter === 'geocode')  list = list.filter(v => !v.lat || !v.lng)
    if (missingFilter === 'phone')    list = list.filter(v => !v.phone)
    if (missingFilter === 'website')  list = list.filter(v => !v.website)
    list.sort((a, b) => {
      const va = a[sortKey] ?? '', vb = b[sortKey] ?? ''
      if (sortKey === 'capacity') return sortDir === 'asc' ? va - vb : vb - va
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va))
    })
    return list
  }, [venues, missingFilter, sortKey, sortDir])

  const allChecked = displayed.length > 0 && displayed.every(v => checkedIds.has(v.id))

  function toggleSortKey(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  function toggleCheck(id) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAllDisplayed() {
    if (allChecked) setCheckedIds(prev => { const n = new Set(prev); displayed.forEach(v => n.delete(v.id)); return n })
    else setCheckedIds(prev => new Set([...prev, ...displayed.map(v => v.id)]))
  }
  function toggleEnrichField(key) {
    setEnrichFields(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // Orchestrate lookup across HERE and/or OSM based on selected source
  async function lookupVenue(venue, fieldList) {
    let result = {}

    if (source === 'here' || source === 'auto') {
      result = await enrichFromHERE(venue, fieldList)
    }

    if (source === 'web' || source === 'auto') {
      // For 'auto': only ask OSM for fields HERE didn't fill in
      const missing = source === 'auto'
        ? fieldList.filter(f => f === 'geocode' ? result.lat == null : !result[f])
        : fieldList

      if (missing.length > 0) {
        const osmResult = await enrichFromOSM(venue, missing).catch(() => ({}))
        for (const f of missing) {
          if (f === 'geocode') {
            if (result.lat == null && osmResult.lat != null) {
              result.lat = osmResult.lat; result.lng = osmResult.lng
              result._source = osmResult._source
            }
          } else if (!result[f] && osmResult[f]) {
            result[f] = osmResult[f]
            if (!result._source) result._source = osmResult._source
          }
        }
        if (!result._matchedTitle && osmResult._matchedTitle) result._matchedTitle = osmResult._matchedTitle
      }
    }

    return result
  }

  async function handleLookUp() {
    const selected = venues.filter(v => checkedIds.has(v.id))
    if (!selected.length || !enrichFields.size) return
    setPhase('working')
    setProgress({ done: 0, total: selected.length })
    const fieldList = [...enrichFields]
    const newResults = []
    for (const venue of selected) {
      let found = {}, error = null
      try {
        found = await lookupVenue(venue, fieldList)
      } catch (err) {
        error = err.message
      }
      const accepted = {}
      for (const f of fieldList) {
        accepted[f] = f === 'geocode' ? found.lat != null : !!found[f]
      }
      newResults.push({ venue, found, accepted, error })
      setProgress(p => ({ ...p, done: p.done + 1 }))
      await new Promise(r => setTimeout(r, 150))
    }
    setResults(newResults)
    setPhase('review')
  }

  function toggleAccept(venueId, field) {
    setResults(prev => prev.map(r =>
      r.venue.id === venueId
        ? { ...r, accepted: { ...r.accepted, [field]: !r.accepted[field] } }
        : r
    ))
  }

  async function handleApplyAll() {
    setApplying(true)
    let saved = 0
    for (const r of results) {
      if (r.error) continue
      const updates = {}
      if (r.accepted.geocode && r.found.lat != null) { updates.lat = r.found.lat; updates.lng = r.found.lng }
      for (const f of DIRECT_FIELDS) {
        if (r.accepted[f] && r.found[f] != null) updates[f] = r.found[f]
      }
      if (r.accepted.capacity && r.found.capacity != null) updates.capacity = r.found.capacity
      if (!Object.keys(updates).length) continue
      const { error } = await supabase.from('venues').update(updates).eq('id', r.venue.id)
      if (!error) {
        setVenues(prev => prev.map(v => v.id === r.venue.id ? { ...v, ...updates } : v))
        saved++
      }
    }
    setApplying(false)
    setPhase('select')
    setCheckedIds(new Set())
    setResults([])
    setToast(`${saved} venue${saved !== 1 ? 's' : ''} updated.`)
    setTimeout(() => setToast(''), 4000)
  }

  if (loading) return <p className="pt-2 text-sm text-gray-400">Loading venues…</p>

  // ── Working phase ──────────────────────────────────────────────────────────
  if (phase === 'working') {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
    const sourceLabel = SOURCE_OPTS.find(s => s.key === source)?.label ?? source
    return (
      <div className="pt-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">
          Looking up via {sourceLabel}…
        </p>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-gray-400">{progress.done} of {progress.total}</p>
      </div>
    )
  }

  // ── Review phase ───────────────────────────────────────────────────────────
  if (phase === 'review') {
    const hasAny = results.some(r => !r.error && Object.values(r.accepted).some(Boolean))
    const fieldList = [...enrichFields]
    return (
      <div className="pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPhase('select')} className="text-xs text-gray-500 font-medium">← Back</button>
            <button
              onClick={handleApplyAll}
              disabled={applying || !hasAny}
              className="rounded-xl bg-indigo-600 text-white text-xs font-semibold px-4 py-1.5 disabled:opacity-50 hover:bg-indigo-700 transition-colors"
            >
              {applying ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
        <div className="space-y-3 max-h-[28rem] overflow-y-auto pb-1">
          {results.map(r => (
            <VenueResultCard
              key={r.venue.id}
              result={r}
              enrichFields={fieldList}
              onToggleAccept={toggleAccept}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Select phase ───────────────────────────────────────────────────────────
  return (
    <div className="pt-3 space-y-4">
      {toast && <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2">{toast}</p>}

      {/* Sort */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">Sort:</span>
        {VENUE_SORT_OPTS.map(o => (
          <button key={o.key} onClick={() => toggleSortKey(o.key)}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
              sortKey === o.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {o.label}{sortKey === o.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
          </button>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">Show:</span>
        {MISSING_FILTERS.map(f => (
          <button key={String(f.key)}
            onClick={() => { setMissingFilter(f.key); setCheckedIds(new Set()) }}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
              missingFilter === f.key ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Venue list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-400">
            {displayed.length} venue{displayed.length !== 1 ? 's' : ''}
            {checkedIds.size > 0 && <span className="text-indigo-600 font-medium"> · {checkedIds.size} selected</span>}
          </p>
          <button onClick={toggleAllDisplayed} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
            {allChecked ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {displayed.map(v => {
            const checked = checkedIds.has(v.id)
            const badges = [
              (!v.lat || !v.lng) && 'geo',
              !v.phone && 'ph',
              !v.website && 'web',
            ].filter(Boolean)
            return (
              <button key={v.id} onClick={() => toggleCheck(v.id)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left flex items-center gap-3 transition-colors ${
                  checked ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50 border-gray-100 hover:border-indigo-200'
                }`}>
                <span className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                  checked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'
                }`}>
                  {checked && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{v.name}</p>
                  <p className="text-xs text-gray-400">
                    {v.city}, {v.state}{v.capacity ? ` · ${v.capacity.toLocaleString()}` : ''}
                  </p>
                </div>
                {badges.length > 0 && (
                  <div className="flex gap-1 shrink-0">
                    {badges.map(b => (
                      <span key={b} className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">{b}</span>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
          {displayed.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No venues match this filter.</p>
          )}
        </div>
      </div>

      {/* Fields to look up — grouped */}
      <div className="border-t border-gray-50 pt-3 space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fields to look up</p>
        {ENRICH_FIELD_GROUPS.map(({ group, fields }) => (
          <div key={group}>
            <p className="text-xs text-gray-400 mb-1.5">{group}</p>
            <div className="flex flex-wrap gap-1.5">
              {fields.map(f => (
                <button key={f.key} onClick={() => toggleEnrichField(f.key)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-medium border transition-colors ${
                    enrichFields.has(f.key)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Source picker */}
      <div className="border-t border-gray-50 pt-3 space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Data Source</p>
        <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
          {SOURCE_OPTS.map(o => (
            <button key={o.key} onClick={() => setSource(o.key)}
              className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${
                source === o.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
              }`}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          {source === 'here'
            ? 'HERE Maps only — fast, authoritative for geocoding.'
            : source === 'web'
            ? 'OpenStreetMap only — community-sourced venue data.'
            : 'Tries HERE first; falls back to OpenStreetMap for any missing fields.'}
        </p>
      </div>

      {/* Action */}
      <button
        onClick={handleLookUp}
        disabled={checkedIds.size === 0 || enrichFields.size === 0}
        className="w-full rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 hover:bg-indigo-700 transition-colors disabled:opacity-50"
      >
        {checkedIds.size > 0
          ? `Look Up ${checkedIds.size} Venue${checkedIds.size !== 1 ? 's' : ''}`
          : 'Select venues to look up'}
      </button>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, signOut, updateUser } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'

  function handleSignOut() {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Settings</h1>

      <Section title="Profile" icon="👤" defaultOpen>
        <ProfileSection user={user} updateUser={updateUser} />
      </Section>

      <Section title="Display" icon="🎨">
        <DisplaySection />
      </Section>

      <Section title="Coordinators" icon="📋">
        <CoordinatorsSection />
      </Section>

      <Section title="Agreements" icon="📄">
        <AgreementsSection />
      </Section>

      {isAdmin && (
        <Section title="User Management" icon="🛡️">
          <UserManagementSection currentUserId={user.id} />
        </Section>
      )}

      {isAdmin && (
        <Section title="Venue Data Cleanup" icon="🗂️">
          <VenueCleanupSection />
        </Section>
      )}

      <button
        onClick={handleSignOut}
        className="w-full mt-2 rounded-2xl border border-red-200 text-red-500 text-sm font-medium py-3 hover:bg-red-50 transition-colors"
      >
        Sign out
      </button>
    </div>
  )
}
