/** Time-of-day greeting. Split out so it can be tested without a clock hack. */
export function greetingFor(date: Date): string {
  const hour = date.getHours()
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * A name to greet someone by, from whatever Clerk actually has.
 *
 * Clerk accounts often have no first name — an email-only sign-up leaves it
 * null — so this falls back through the identifiers it does have and finally
 * returns undefined, which callers render as an un-named greeting rather than
 * "Good morning, undefined".
 */
export function displayName(user: {
  firstName?: string | null
  fullName?: string | null
  username?: string | null
  primaryEmailAddress?: { emailAddress?: string | null } | null
} | null | undefined): string | undefined {
  if (!user) return undefined
  const first = user.firstName?.trim()
  if (first) return first
  const full = user.fullName?.trim()
  if (full) return full.split(/\s+/)[0]
  const username = user.username?.trim()
  if (username) return username
  const email = user.primaryEmailAddress?.emailAddress?.trim()
  if (!email) return undefined
  // "ada.lovelace@x.com" → "Ada"
  const local = email.split('@')[0].split(/[.\-_+]/)[0]
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : undefined
}
