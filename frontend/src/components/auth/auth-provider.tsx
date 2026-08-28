import type { ReactNode } from 'react'
import { ClerkProvider } from '@clerk/react'
import { CLERK_PUBLISHABLE_KEY, authEnabled } from '@/lib/auth'

/**
 * Wraps the app in Clerk only when a publishable key is configured.
 *
 * Without a key the app renders unauthenticated — the single-dev-key mode
 * `specs/03` describes, and the mode the e2e suite runs in. This keeps Clerk
 * from becoming a hard dependency of running the project locally.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!authEnabled) return <>{children}</>

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY!}
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  )
}
