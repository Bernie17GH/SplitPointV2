import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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

function ProfileCard({ user, updateUser }) {
  const [editing, setEditing] = useState(false)
  // Initialize draft from full user so every field is always present
  const [draft, setDraft] = useState(user)

  function handleChange(field, value) {
    setDraft((d) => ({ ...d, [field]: value }))
  }

  function handleEdit() {
    setDraft(user) // re-sync in case user changed elsewhere
    setEditing(true)
  }

  function handleSave() {
    updateUser(draft)
    setEditing(false)
  }

  function handleCancel() {
    setDraft(user)
    setEditing(false)
  }

  const initials = user.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-6 mb-4">
      <div className="flex items-center gap-4 mb-5">
        <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center text-xl font-bold text-indigo-600 shrink-0">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{user.name}</p>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            user.role === 'admin'
              ? 'bg-violet-100 text-violet-700'
              : 'bg-indigo-50 text-indigo-600'
          }`}>
            {user.role === 'admin' ? 'Admin' : 'Agent'}
          </span>
        </div>
        {!editing && (
          <button
            onClick={handleEdit}
            className="ml-auto text-xs text-indigo-600 font-medium hover:text-indigo-700"
          >
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
          <button
            onClick={handleSave}
            className="flex-1 rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2 hover:bg-indigo-700 transition-colors"
          >
            Save changes
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold py-2 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function AdminPanel() {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-6 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">🛡️</span>
        <h2 className="text-base font-semibold text-gray-900">Admin Panel</h2>
      </div>
      <div className="space-y-1 text-sm">
        <p className="text-gray-400 mb-3">
          As admin you can edit any Agent profile or Venue record directly from the Artists and Venues pages.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="font-medium text-gray-700">Agents</p>
            <p className="text-xs text-gray-400 mt-0.5">Manage agent roster</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="font-medium text-gray-700">Venues</p>
            <p className="text-xs text-gray-400 mt-0.5">Edit venue directory</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="font-medium text-gray-700">Artists</p>
            <p className="text-xs text-gray-400 mt-0.5">Update artist data</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="font-medium text-gray-700">Tours</p>
            <p className="text-xs text-gray-400 mt-0.5">View all tours</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Profile() {
  const { user, signOut, updateUser } = useAuth()
  const navigate = useNavigate()

  function handleSignOut() {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Profile</h1>

      <ProfileCard user={user} updateUser={updateUser} />

      {user.role === 'admin' && <AdminPanel />}

      <button
        onClick={handleSignOut}
        className="w-full rounded-2xl border border-red-200 text-red-500 text-sm font-medium py-3 hover:bg-red-50 transition-colors"
      >
        Sign out
      </button>
    </div>
  )
}
