import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabase'

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

      <button
        onClick={handleSignOut}
        className="w-full mt-2 rounded-2xl border border-red-200 text-red-500 text-sm font-medium py-3 hover:bg-red-50 transition-colors"
      >
        Sign out
      </button>
    </div>
  )
}
