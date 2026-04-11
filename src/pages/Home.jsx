import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabase'

function StatCard({ label, value, sub, to, loading }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(to)}
      className="rounded-2xl bg-white shadow-sm border border-gray-100 p-6 text-left w-full hover:border-indigo-200 hover:shadow-md transition-all"
    >
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      {loading ? (
        <p className="text-2xl font-bold text-gray-300">—</p>
      ) : (
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      )}
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </button>
  )
}

export default function Home() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [stats, setStats] = useState(null)

  useEffect(() => {
    async function load() {
      const [artistsRes, venuesRes] = await Promise.all([
        supabase
          .from('artists')
          .select('id, agent_id', { count: 'exact' }),
        supabase
          .from('venues')
          .select('id', { count: 'exact' }),
      ])

      const allArtists = artistsRes.data ?? []
      const myArtists  = allArtists.filter((a) => a.agent_id === user?.id)

      setStats({
        myArtists:  isAdmin ? allArtists.length : myArtists.length,
        venueCount: venuesRes.count ?? 0,
      })
    }
    load()
  }, [user])

  return (
    <div className="px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-1">SplitPoint</h1>
      <p className="text-gray-500 mb-8">Concert tour management for artist agents.</p>

      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Artists"
          value={stats?.myArtists ?? '—'}
          sub={isAdmin ? 'total in system' : 'on your roster'}
          to="/artists"
          loading={!stats}
        />
        <StatCard
          label="Venues"
          value={stats?.venueCount ?? '—'}
          sub="in directory"
          to="/venues"
          loading={!stats}
        />
        <StatCard
          label="Active Tours"
          value="0"
          sub="in progress"
          to="/tours"
          loading={false}
        />
        <StatCard
          label="Pending"
          value="0"
          sub="awaiting reply"
          to="/tours"
          loading={false}
        />
      </div>
    </div>
  )
}
