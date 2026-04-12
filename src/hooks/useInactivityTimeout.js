import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const STORAGE_KEY = 'sp_last_active'

/**
 * Signs the user out and redirects to /login after TIMEOUT_MS of inactivity.
 * Also triggers when the page is restored from background (e.g. closing and
 * reopening the app on iOS) if more than TIMEOUT_MS has elapsed.
 */
export function useInactivityTimeout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const timerRef = useRef(null)

  const logout = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY)
    clearTimeout(timerRef.current)
    await signOut()
    navigate('/login', { state: { reason: 'inactivity' }, replace: true })
  }, [signOut, navigate])

  const resetTimer = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString())
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(logout, TIMEOUT_MS)
  }, [logout])

  const checkElapsed = useCallback(() => {
    const last = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
    if (last && Date.now() - last > TIMEOUT_MS) {
      logout()
    }
  }, [logout])

  useEffect(() => {
    if (!user) return

    // On mount: if last-active is too old, sign out immediately
    checkElapsed()
    resetTimer()

    const events = ['touchstart', 'mousedown', 'keydown', 'scroll']
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))

    // When the user returns to the app (iOS background restore, tab switch back)
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkElapsed()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(timerRef.current)
      events.forEach((e) => window.removeEventListener(e, resetTimer))
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, resetTimer, checkElapsed])
}
