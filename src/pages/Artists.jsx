import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import BottomSheet from '../components/ui/BottomSheet'
import { readTable, upsertRow } from '../services/db'

// DB columns use snake_case: min_booking_fee, favorite_cities, spotify_url, avatar_initials

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.516 17.312a.75.75 0 0 1-1.031.25c-2.822-1.725-6.375-2.115-10.562-1.158a.75.75 0 1 1-.334-1.463c4.579-1.045 8.512-.595 11.677 1.34a.75.75 0 0 1 .25 1.031zm1.472-3.276a.937.937 0 0 1-1.288.309c-3.228-1.984-8.147-2.56-11.97-1.401a.937.937 0 1 1-.543-1.794c4.363-1.322 9.788-.681 13.493 1.598a.937.937 0 0 1 .308 1.288zm.126-3.409C15.422 8.457 9.1 8.247 5.518 9.35a1.125 1.125 0 1 1-.652-2.153c4.116-1.248 10.96-1.006 15.288 1.615a1.125 1.125 0 0 1-1.04 2.015z" />
    </svg>
  )
}

function EditArtistForm({ artist, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...artist })

  function set(field, value) {
    setDraft((d) => ({ ...d, [field]: value }))
  }

  return (
    <div className="space-y-4 pb-4">
      {[
        { label: 'Name',        field: 'name' },
        { label: 'Genre',       field: 'genre' },
        { label: 'Spotify URL', field: 'spotify_url', type: 'url' },
      ].map(({ label, field, type = 'text' }) => (
        <div key={field}>
          <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
          <input
            type={type}
            value={draft[field] ?? ''}
            onChange={(e) => set(field, e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      ))}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Min. booking fee ($)</label>
        <input
          type="number"
          value={draft.min_booking_fee ?? ''}
          onChange={(e) => set('min_booking_fee', Number(e.target.value))}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Favorite cities (comma-separated)</label>
        <input
          type="text"
          value={(draft.favorite_cities ?? []).join(', ')}
          onChange={(e) =>
            set('favorite_cities', e.target.value.split(',').map((c) => c.trim()).filter(Boolean))
          }
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
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

function ArtistCard({ artist, isAdmin, onEdit }) {
  const fee = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(artist.min_booking_fee)

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-4 mb-4">
        <div className="h-12 w-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">
          {artist.avatar_initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{artist.name}</p>
          <p className="text-sm text-gray-400">{artist.genre}</p>
        </div>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {isAdmin && (
            <button
              onClick={() => onEdit(artist)}
              className="text-xs text-indigo-600 font-medium hover:text-indigo-700"
            >
              Edit
            </button>
          )}
          <a
            href={artist.spotify_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-500 hover:text-green-600 transition-colors"
            aria-label={`Open ${artist.name} on Spotify`}
          >
            <SpotifyIcon />
          </a>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Min. booking fee</span>
          <span className="font-medium text-gray-900">{fee}</span>
        </div>
        <div className="flex justify-between items-start gap-2">
          <span className="text-gray-500 shrink-0">Favorite cities</span>
          <div className="flex flex-wrap justify-end gap-1">
            {(artist.favorite_cities ?? []).map((city) => (
              <span key={city} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-xs">
                {city}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Artists() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [artists, setArtists] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    readTable('artists')
      .then(setArtists)
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(updated) {
    const next = await upsertRow('artists', updated)
    setArtists(next)
    setEditing(null)
  }

  return (
    <div className="px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Artists</h1>
          <p className="text-gray-500 mt-1">Your represented roster</p>
        </div>
        {isAdmin && (
          <button className="rounded-xl bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700 transition-colors">
            + Add
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          {artists.map((artist) => (
            <ArtistCard
              key={artist.id}
              artist={artist}
              isAdmin={isAdmin}
              onEdit={setEditing}
            />
          ))}
        </div>
      )}

      <BottomSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit — ${editing.name}` : ''}
      >
        {editing && (
          <EditArtistForm
            artist={editing}
            onSave={handleSave}
            onClose={() => setEditing(null)}
          />
        )}
      </BottomSheet>
    </div>
  )
}
