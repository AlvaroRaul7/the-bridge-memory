import { useEffect } from 'react'
import { useAuth } from '@clerk/react'
import { setAuthTokenProvider } from '@/lib/auth'

/**
 * Hands Clerk's session-token getter to `lib/api.ts`.
 *
 * `api.ts` is a plain module (used from tests, no React), so it cannot call
 * `useAuth()` itself. This component is the one place the two meet.
 */
export function AuthBridge() {
  const { getToken } = useAuth()

  useEffect(() => {
    setAuthTokenProvider(() => getToken())
    return () => setAuthTokenProvider(undefined)
  }, [getToken])

  return null
}
