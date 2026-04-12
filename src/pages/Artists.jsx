import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import BottomSheet from '../components/ui/BottomSheet'
import { supabase } from '../services/supabase'

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.516 17.312a.75.75 0 0 1-1.031.25c-2.822-1.725-6.375-2.115-10.562-1.158a.75.75 0 1 1-.334-1.463c4.579-1.045 8.512-.595 11.677 1.34a.75.75 0 0 1 .25 1.031zm1.472-3.276a.937.937 0 0 1-1.288.309c-3.228-1.984-8.147-2.56-11.97-1.401a.937.937 0 1 1-.543-1.794c4.363-1.322 9.788-.681 13.493 1.598a.937.937 0 0 1 .308 1.288zm.126-3.409C15.422 8.457 9.1 8.247 5.518 9.35a1.125 1.125 0 1 1-.652-2.153c4.116-1.248 10.96-1.006 15.288 1.615a1.125 1.125 0 0 1-1.04 2.015z" />
    </svg>
  )
}

async function fetchAllArtists() {
  const { data: artists, error } = await supabase
    .from('artists')
    .select('id, name, genre, agent_id, min_booking_fee, favorite_cities, spotify_url, avatar_initials')
    .order('name')
  if (error) throw error

  // Fetch profiles for any agents who have claimed artists
  const agentIds = [...new Set(artists.filter((a) => a.agent_id).map((a) => a.agent_id))]
  let profileMap = {}
  if (agentIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, agency')
      .in('id', agentIds)
    profiles?.forEach((p) => { profileMap[p.id] = p })
  }

  return artists.map((a) => ({
    ...a,
    profiles: a.agent_id ? (profileMap[a.agent_id] ?? null) : null,
  }))
}

async function setAgentId(artistId, agentId) {
  const { error } = await supabase
    .from('artists')
    .update({ agent_id: agentId })
    .eq('id', artistId)
  if (error) throw error
}

function initials(name) {
  return name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function AddArtistForm({ agentId, onSave, onClose }) {
  const [draft, setDraft] = useState({
    name: '', genre: '', min_booking_fee: '', favorite_cities: [], spotify_url: '', avatar_initials: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function set(field, value) {
    setDraft((d) => ({
      ...d,
      [field]: value,
      // Auto-update initials as name changes
      ...(field === 'name' ? { avatar_initials: initials(value) } : {}),
    }))
  }

  async function handleSave() {
    if (!draft.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase.from('artists').insert({
        name: draft.name.trim(),
        genre: draft.genre.trim(),
        min_booking_fee: Number(draft.min_booking_fee) || 0,
        favorite_cities: draft.favorite_cities,
        spotify_url: draft.spotify_url.trim(),
        avatar_initials: draft.avatar_initials || initials(draft.name),
        agent_id: agentId ?? null,
      })
      if (err) throw err
      onSave()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 pb-4">
      {[
        { label: 'Artist / Act name', field: 'name' },
        { label: 'Genre',             field: 'genre' },
        { label: 'Spotify URL',       field: 'spotify_url', type: 'url' },
      ].map(({ label, field, type = 'text' }) => (
        <div key={field}>
          <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
          <input
            type={type}
            value={draft[field]}
            onChange={(e) => set(field, e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      ))}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Min. booking fee ($)</label>
        <input
          type="number"
          value={draft.min_booking_fee}
          onChange={(e) => set('min_booking_fee', e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Favorite cities (comma-separated)</label>
        <input
          type="text"
          value={draft.favorite_cities.join(', ')}
          onChange={(e) =>
            set('favorite_cities', e.target.value.split(',').map((c) => c.trim()).filter(Boolean))
          }
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 hover:bg-indigo-700 transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Add artist'}
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

function EditArtistForm({ artist, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...artist })

  function set(field, value) {
    setDraft((d) => ({ ...d, [field]: value }))
  }

  async function handleSave() {
    const { profiles: _, ...row } = draft
    const { error } = await supabase.from('artists').upsert(row)
    if (error) { alert(error.message); return }
    onSave()
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
          onClick={handleSave}
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

function ArtistCard({ artist, user, isAdmin, onEdit, onClaim, onRelease }) {
  const isMine = artist.agent_id === user?.id
  const isClaimed = !!artist.agent_id

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
          {(isAdmin || isMine) && (
            <button
              onClick={() => onEdit(artist)}
              className="text-xs text-indigo-600 font-medium hover:text-indigo-700"
            >
              Edit
            </button>
          )}
          {!isAdmin && !isClaimed && (
            <button
              onClick={() => onClaim(artist)}
              className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Claim
            </button>
          )}
          {!isAdmin && isMine && (
            <button
              onClick={() => onRelease(artist)}
              className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors"
            >
              Release
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

      {/* Agent attribution */}
      {isAdmin && (
        <p className="text-xs mb-3 font-medium">
          {isClaimed
            ? <span className="text-indigo-600">{artist.profiles?.name ?? 'Unknown agent'} · {artist.profiles?.agency ?? ''}</span>
            : <span className="text-gray-400">Unclaimed</span>
          }
        </p>
      )}

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

function Section({ title, children, empty }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h2>
      {children ?? (
        <div className="rounded-2xl bg-white border border-gray-100 p-6 text-center">
          <p className="text-sm text-gray-400">{empty}</p>
        </div>
      )}
    </div>
  )
}

export default function Artists() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [artists, setArtists] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setArtists(await fetchAllArtists())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleClaim(artist) {
    await setAgentId(artist.id, user.id)
    await load()
  }

  async function handleRelease(artist) {
    await setAgentId(artist.id, null)
    await load()
  }

  const { myArtists, available, claimedByOther } = useMemo(() => {
    const myArtists      = []
    const available      = []
    const claimedByOther = []
    for (const a of artists) {
      if (!a.agent_id)                       available.push(a)
      else if (a.agent_id === user?.id)      myArtists.push(a)
      else                                   claimedByOther.push(a)
    }
    return { myArtists, available, claimedByOther }
  }, [artists, user?.id])

  const cardProps = { user, isAdmin, onEdit: setEditing, onClaim: handleClaim, onRelease: handleRelease }

  return (
    <div className="px-4 py-8 md:px-8 md:py-10 md:max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Artists</h1>
          <p className="text-gray-500 mt-1">{isAdmin ? 'All artists' : 'Your roster'}</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="rounded-xl bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700 transition-colors"
        >
          + Add
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : isAdmin ? (
        // Admin: see all artists grouped by status
        <>
          <Section title={`Represented (${claimedByOther.length + myArtists.length})`} empty="None yet">
            {(claimedByOther.length + myArtists.length) > 0 && (
              <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                {[...myArtists, ...claimedByOther].map(a => <ArtistCard key={a.id} artist={a} {...cardProps} />)}
              </div>
            )}
          </Section>
          <Section title={`Unclaimed (${available.length})`} empty="None">
            {available.length > 0 && (
              <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                {available.map(a => <ArtistCard key={a.id} artist={a} {...cardProps} />)}
              </div>
            )}
          </Section>
        </>
      ) : (
        // Agent: my roster + available to claim
        <>
          <Section title={`My Roster (${myArtists.length})`} empty="You haven't claimed any artists yet.">
            {myArtists.length > 0 && (
              <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                {myArtists.map(a => <ArtistCard key={a.id} artist={a} {...cardProps} />)}
              </div>
            )}
          </Section>
          <Section title={`Available (${available.length})`} empty="No unclaimed artists at this time.">
            {available.length > 0 && (
              <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                {available.map(a => <ArtistCard key={a.id} artist={a} {...cardProps} />)}
              </div>
            )}
          </Section>
          {claimedByOther.length > 0 && (
            <Section title={`Represented by others (${claimedByOther.length})`} empty="">
              <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                {claimedByOther.map(a => <ArtistCard key={a.id} artist={a} {...cardProps} />)}
              </div>
            </Section>
          )}
        </>
      )}

      <BottomSheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add Artist"
      >
        <AddArtistForm
          agentId={isAdmin ? null : user?.id}
          onSave={async () => { setAdding(false); await load() }}
          onClose={() => setAdding(false)}
        />
      </BottomSheet>

      <BottomSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit — ${editing.name}` : ''}
      >
        {editing && (
          <EditArtistForm
            artist={editing}
            onSave={async () => { setEditing(null); await load() }}
            onClose={() => setEditing(null)}
          />
        )}
      </BottomSheet>
    </div>
  )
}
