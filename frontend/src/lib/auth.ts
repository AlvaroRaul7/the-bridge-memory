/**
 * Auth wiring for Clerk.
 *
 * Two deliberate design points:
 *
 * 1. **Clerk is optional.** With no `VITE_CLERK_PUBLISHABLE_KEY` the app runs
 *    exactly as before — unauthenticated, single dev API key. That is the mode
 *    `specs/03` describes ("assume a single dev API key in an env var for the
 *    workshop") and the mode the e2e suite runs in. Set the key and the app
 *    gates behind sign-in. Nothing else changes.
 *
 * 2. **`api.ts` must not import React.** It is a plain module used from tests
 *    too, so it cannot call `useAuth()`. Instead a React component registers a
 *    token getter here at mount, and the fetch wrapper reads it. One direction
 *    of dependency, no hook rules to violate.
 */

export const CLERK_PUBLISHABLE_KEY = import.meta.env
  .VITE_CLERK_PUBLISHABLE_KEY as string | undefined

/** True when Clerk is configured for this build. */
export const authEnabled = Boolean(CLERK_PUBLISHABLE_KEY)

type TokenProvider = () => Promise<string | null>

let tokenProvider: TokenProvider | undefined

/** Called once from a component inside <ClerkProvider>. */
export function setAuthTokenProvider(provider: TokenProvider | undefined) {
  tokenProvider = provider
}

/** Current session token, or null when signed out / Clerk not configured. */
export async function getAuthToken(): Promise<string | null> {
  if (!tokenProvider) return null
  try {
    return await tokenProvider()
  } catch {
    // An expired or revoked session should surface as a 401 from the API,
    // not as an unhandled rejection here.
    return null
  }
}

/**
 * Spec 2 scopes every memory and session by `tenant_id`.
 *
 * Two things need to stay isolated, and they are different axes:
 *   - the four assistants must not read each other's memory
 *   - one customer must not read another customer's memory
 *
 * So the tenant is the pair. Signed out (or with Clerk off) the customer half
 * is `demo`, which is what the seeded mock data uses.
 */
export function tenantId(scenarioId: string, accountId?: string | null) {
  return `tenant_${accountId ?? 'demo'}_${scenarioId}`
}
