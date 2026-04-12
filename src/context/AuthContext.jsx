import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext(null)

async function fetchProfile(authUser) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, agency, phone, role, status')
      .eq('id', authUser.id)
      .maybeSingle()
    if (error) console.warn('fetchProfile error:', error.message)
    if (data?.status === 'inactive') {
      await supabase.auth.signOut()
      throw new Error('Account deactivated')
    }
    return {
      id: authUser.id,
      email: authUser.email,
      ...(data ?? {}),
    }
  } catch (e) {
    console.warn('fetchProfile threw:', e)
    // Return a minimal user so the app doesn't stay stuck
    return { id: authUser.id, email: authUser.email }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load existing session on mount
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) setUser(await fetchProfile(session.user))
      })
      .catch((e) => console.warn('getSession error:', e))
      .finally(() => setLoading(false))

    // Stay in sync with auth state changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          if (session?.user) {
            setUser(await fetchProfile(session.user))
          } else {
            setUser(null)
          }
        } catch (e) {
          console.warn('onAuthStateChange error:', e)
          setUser(null)
        } finally {
          setLoading(false)
        }
      }
    )

    // Re-validate the session when the app returns from background.
    // This prevents stale-token 404 errors after the device sleeps or the
    // tab is restored — Supabase will silently refresh the JWT if needed.
    async function onVisible() {
      if (document.visibilityState !== 'visible') return
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setUser(await fetchProfile(session.user))
        } else {
          setUser(null)
        }
      } catch (e) {
        console.warn('visibilitychange session check error:', e)
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }

  async function signUp(email, password, profileData) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw new Error(error.message)
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        role: 'agent',
        ...profileData,
      })
      if (profileError) throw new Error(profileError.message)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  async function updateUser(fields) {
    const { error } = await supabase
      .from('profiles')
      .upsert({ ...user, ...fields })
    if (error) throw new Error(error.message)
    setUser((prev) => ({ ...prev, ...fields }))
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
