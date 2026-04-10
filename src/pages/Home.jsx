export default function Home() {
  return (
    <div className="px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-1">SplitPoint</h1>
      <p className="text-gray-500 mb-8">Concert tour management for artist agents.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-1">Active Tours</h2>
          <p className="text-gray-400 text-sm">No tours in progress</p>
        </div>
        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-1">Pending Confirmations</h2>
          <p className="text-gray-400 text-sm">No venues awaiting reply</p>
        </div>
        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-1">Artists on Roster</h2>
          <p className="text-gray-400 text-sm">0 artists</p>
        </div>
        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-1">Venues in Directory</h2>
          <p className="text-gray-400 text-sm">0 venues</p>
        </div>
      </div>
    </div>
  )
}
