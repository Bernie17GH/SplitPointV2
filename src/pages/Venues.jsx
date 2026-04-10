import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import BottomSheet from '../components/ui/BottomSheet'
import { readTable, upsertRow } from '../services/db'

const AVAILABILITY_OPTIONS = ['unconfirmed', 'confirmed', 'unavailable']

const AVAILABILITY_STYLES = {
  unconfirmed: 'bg-gray-100 text-gray-500',
  confirmed:   'bg-green-100 text-green-700',
  unavailable: 'bg-red-100 text-red-600',
}

const AVAILABILITY_LABELS = {
  unconfirmed: 'Unconfirmed',
  confirmed:   'Confirmed',
  unavailable: 'Unavailable',
}

function EditVenueForm({ venue, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...venue })

  function set(field, value) {
    setDraft((d) => ({ ...d, [field]: value }))
  }

  function handleGenres(value) {
    set('genres', value.split(',').map((g) => g.trim()).filter(Boolean))
  }

  return (
    <div className="space-y-4 pb-4">
      {[
        { label: 'Name',         field: 'name' },
        { label: 'Address',      field: 'address' },
        { label: 'Neighborhood', field: 'neighborhood' },
        { label: 'City',         field: 'city' },
        { label: 'State',        field: 'state' },
        { label: 'ZIP',          field: 'zip' },
        { label: 'Phone',        field: 'phone', type: 'tel' },
        { label: 'Website',      field: 'website', type: 'url' },
        { label: 'Notes',        field: 'notes', multiline: true },
      ].map(({ label, field, type = 'text', multiline }) => (
        <div key={field}>
          <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
          {multiline ? (
            <textarea
              value={draft[field] ?? ''}
              onChange={(e) => set(field, e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          ) : (
            <input
              type={type}
              value={draft[field] ?? ''}
              onChange={(e) => set(field, e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          )}
        </div>
      ))}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Capacity</label>
        <input
          type="number"
          value={draft.capacity}
          onChange={(e) => set('capacity', Number(e.target.value))}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Genres (comma-separated)</label>
        <input
          type="text"
          value={draft.genres.join(', ')}
          onChange={(e) => handleGenres(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Availability</label>
        <select
          value={draft.availability}
          onChange={(e) => set('availability', e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
        >
          {AVAILABILITY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{AVAILABILITY_LABELS[opt]}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => onSave(draft)}
          className="flex-1 rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 hover:bg-indigo-700 transition-colors"
        >
          Save changes
        </button>
        <button
          onClick={onClose}
          className="flex-1 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold py-2.5 hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function VenueCard({ venue, isAdmin, onEdit }) {
  const capacityLabel = new Intl.NumberFormat('en-US').format(venue.capacity)

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold text-gray-900 leading-tight">{venue.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{venue.neighborhood} · {venue.city}, {venue.state}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${AVAILABILITY_STYLES[venue.availability]}`}>
            {AVAILABILITY_LABELS[venue.availability]}
          </span>
          {isAdmin && (
            <button
              onClick={() => onEdit(venue)}
              className="text-xs text-indigo-600 font-medium hover:text-indigo-700"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3">{venue.address}, {venue.city}, {venue.state} {venue.zip}</p>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-gray-400">Capacity</span>
          <span className="font-semibold text-gray-900">{capacityLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`tel:${venue.phone.replace(/\D/g, '')}`}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            {venue.phone}
          </a>
          <a
            href={venue.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Website ↗
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {venue.genres.map((g) => (
          <span key={g} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-xs">
            {g}
          </span>
        ))}
      </div>

      {venue.notes && (
        <p className="text-xs text-gray-400 leading-relaxed border-t border-gray-50 pt-3">
          {venue.notes}
        </p>
      )}
    </div>
  )
}

export default function Venues() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    readTable('venues')
      .then(setVenues)
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(updated) {
    const next = await upsertRow('venues', updated)
    setVenues(next)
    setEditing(null)
  }

  return (
    <div className="px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Venues</h1>
          <p className="text-gray-500 mt-1">Atlanta · Small hip-hop venues</p>
        </div>
        {isAdmin && (
          <button className="rounded-xl bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700 transition-colors">
            + Add
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-4">
        {loading ? 'Loading…' : `${venues.length} venues`}
      </p>

      <div className="space-y-4">
        {venues.map((venue) => (
          <VenueCard
            key={venue.id}
            venue={venue}
            isAdmin={isAdmin}
            onEdit={setEditing}
          />
        ))}
      </div>

      <BottomSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit — ${editing.name}` : ''}
      >
        {editing && (
          <EditVenueForm
            venue={editing}
            onSave={handleSave}
            onClose={() => setEditing(null)}
          />
        )}
      </BottomSheet>
    </div>
  )
}
