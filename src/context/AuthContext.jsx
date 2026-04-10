import { createContext, useContext, useState } from 'react'
import { readProfile, writeProfile } from '../services/db'

// Credential registry — only email/password/role live here.
// All editable profile fields are stored in the Supabase profiles table.
const MOCK_USERS = [
  {
    id: 1,
    name: 'SplitPoint Admin',
    email: 'admin@splitpoint.com',
    password: 'admin123',
    role: 'admin',
    agency: 'SplitPoint',
    phone: '',
  },
]

const SESSION_KEY = 'sp_session'
const AuthContext = createContext(null)

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadSession)

  async function signIn(email, password) {
    const match = MOCK_USERS.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    )
    if (!match) throw new Error('Invalid email or password.')

    const { password: _, ...baseUser } = match
    // Merge with any profile edits saved to Supabase
    const saved = await readProfile(baseUser.id)
    const sessionUser = { ...baseUser, ...(saved ?? {}) }

    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser))
    setUser(sessionUser)
  }

  function signOut() {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  async function updateUser(fields) {
    const updated = { ...user, ...fields }
    await writeProfile(user.id, updated)
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated))
    setUser(updated)
  }

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
