import { useState, type ReactNode } from 'react'
import { SignIn, SignUp } from '@clerk/react'
import { Brain, Loader2, TriangleAlert } from 'lucide-react'
// Resized/recompressed from src/images/The Bridge.jpeg (4032px, 1.3MB → 2400px,
// 409KB). The original is kept alongside it as the source of truth.
import backdrop from '@/images/the-bridge.jpg'

/**
 * Shared frame for every pre-auth screen.
 *
 * The photograph is misty and low-contrast — a pale sky over darker water — so
 * neither white nor dark text reads reliably straight on it. A gradient scrim
 * does the work: it darkens enough for white type at the top and bottom while
 * leaving the bridge visible through the middle. The Clerk widget sits on its
 * own solid card rather than on glass, because the widget brings its own
 * theming and a translucent panel would fight it.
 */
function AuthFrame({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children?: ReactNode
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <img
        src={backdrop}
        alt=""
        aria-hidden
        // eager + high priority: this is the only thing on screen, so lazy
        // loading it would just show an empty frame first.
        fetchPriority="high"
        // The photo is hazy and low-contrast straight off the camera; a light
        // touch of contrast and saturation stops it reading as grey mush once
        // the scrim goes over it.
        className="absolute inset-0 size-full object-cover [filter:contrast(1.12)_saturate(1.15)]"
      />

      {/* Scrim, in two parts. A vertical gradient darkens the top and bottom
          for white type, and a radial pool sits behind the card — so the
          bridge itself stays legible across the middle of the frame. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/20 to-slate-950/75"
      />
      <div
        aria-hidden
        className="absolute inset-0 [background:radial-gradient(60%_50%_at_50%_45%,rgba(2,6,23,0.55),transparent_75%)]"
      />

      <div className="relative flex w-full max-w-md flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/20 backdrop-blur-sm">
            <Brain className="size-5 text-white" />
          </div>
          <h1 className="text-[16px] font-semibold tracking-tight text-white [text-shadow:0_1px_3px_rgb(2_6_23/0.6)]">
            {title}
          </h1>
          <p className="text-[13px] leading-relaxed text-white/80 [text-shadow:0_1px_2px_rgb(2_6_23/0.5)]">
            {body}
          </p>
        </div>

        {children}
      </div>

      {/* Pinned to the frame rather than flowing after the card, so it never
          lands on top of the bridge deck. */}
      <p className="absolute bottom-5 text-[11px] tracking-wide text-white/45">
        The Bridge
      </p>
    </div>
  )
}

/**
 * Shared appearance for both Clerk widgets.
 *
 * `!hidden` rather than `hidden`: Clerk injects its stylesheet after
 * Tailwind's, so an equal-specificity rule loses and the bang is what actually
 * forces display:none.
 *
 * - header: duplicates the heading above it, and shows the Clerk dashboard's
 *   application name ("My Application") until someone renames it there.
 * - footer: its "Sign up" / "Sign in" links navigate to Clerk's HOSTED account
 *   portal on accounts.dev, which we cannot style. We hide them and offer our
 *   own toggle, so the whole flow stays on this page with this backdrop.
 */
const clerkAppearance = {
  elements: {
    header: '!hidden',
    footer: '!hidden',
    cardBox: 'shadow-2xl shadow-slate-950/40',
  },
} as const

/** Shown to signed-out visitors when Clerk is configured. */
export function SignInScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const signingUp = mode === 'sign-up'

  return (
    <AuthFrame
      title="Institutional Buddy"
      body={
        signingUp
          ? 'Create an account to get your own assistants. Each account keeps its own memory, so nothing you save is visible to anyone else.'
          : 'Your institutional buddy — the colleague who remembers everything. Sign in to reach your assistants. Each account keeps its own memory, so nothing you save is visible to anyone else.'
      }
    >
      {signingUp ? (
        <SignUp routing="hash" appearance={clerkAppearance} />
      ) : (
        <SignIn routing="hash" appearance={clerkAppearance} />
      )}

      <p className="text-[12.5px] text-white/70">
        {signingUp ? 'Already have an account?' : "Don't have an account?"}{' '}
        <button
          type="button"
          onClick={() => setMode(signingUp ? 'sign-in' : 'sign-up')}
          className="font-medium text-white underline-offset-4 hover:underline"
        >
          {signingUp ? 'Sign in' : 'Sign up'}
        </button>
      </p>
    </AuthFrame>
  )
}

/** Shown while Clerk's script is still loading. */
export function AuthLoadingScreen() {
  return (
    <AuthFrame title="Institutional Buddy" body="Getting things ready…">
      <Loader2 className="size-4 animate-spin text-white/70" />
    </AuthFrame>
  )
}

/**
 * Shown when Clerk cannot load at all — a bad publishable key, a blocked
 * script, or no network. Without this the page stays blank forever, because
 * <Show> renders null until Clerk resolves.
 */
export function AuthUnavailableScreen() {
  return (
    <AuthFrame
      title="Sign-in is unavailable"
      body="We could not reach the authentication service, so you cannot be signed in right now. This is usually a configuration or network problem rather than something you did."
    >
      <div className="flex items-start gap-2 rounded-lg bg-slate-950/55 px-3.5 py-2.5 text-[12.5px] text-amber-200 ring-1 ring-amber-300/30 backdrop-blur-sm">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>
          If you are running this locally, check{' '}
          <code className="font-mono text-[11.5px]">VITE_CLERK_PUBLISHABLE_KEY</code>.
        </span>
      </div>
    </AuthFrame>
  )
}
