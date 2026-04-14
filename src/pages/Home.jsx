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
    if (!user) return
    const uid = user.id
    async function load() {
      try {
        const [artistsRes, venuesRes, activeRes, draftRes] = await Promise.all([
          isAdmin
            ? supabase.from('artists').select('*', { count: 'exact', head: true })
            : supabase.from('artists').select('*', { count: 'exact', head: true }).eq('agent_id', uid),
          supabase.from('venues').select('*', { count: 'exact', head: true }),
          isAdmin
            ? supabase.from('tours').select('*', { count: 'exact', head: true }).eq('status', 'active')
            : supabase.from('tours').select('*', { count: 'exact', head: true }).eq('created_by', uid).eq('status', 'active'),
          isAdmin
            ? supabase.from('tours').select('*', { count: 'exact', head: true }).eq('status', 'draft')
            : supabase.from('tours').select('*', { count: 'exact', head: true }).eq('created_by', uid).eq('status', 'draft'),
        ])
        setStats({
          myArtists:   artistsRes.count ?? 0,
          venueCount:  venuesRes.count  ?? 0,
          activeTours: activeRes.count  ?? 0,
          draftTours:  draftRes.count   ?? 0,
        })
      } catch (e) {
        console.warn('Home stats load error:', e)
        setStats({ myArtists: 0, venueCount: 0, activeTours: 0, draftTours: 0 })
      }
    }
    load()
  }, [user, isAdmin])

  return (
    <div className="px-4 py-8 md:px-8 md:py-10 md:max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-1">SplitPoint</h1>
      <p className="text-gray-500 mb-8">Concert tour management for artist agents.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          value={stats?.activeTours ?? '—'}
          sub="in progress"
          to="/tours"
          loading={!stats}
        />
        <StatCard
          label="Draft Tours"
          value={stats?.draftTours ?? '—'}
          sub="in planning"
          to="/tours"
          loading={!stats}
        />
      </div>
    </div>
  )
}
