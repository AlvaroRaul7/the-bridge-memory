import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './components/auth/auth-provider'

/**
 * Spec 3 asks for msw so swapping to the real backend is a one-line change.
 * That line is VITE_USE_MOCKS in .env.local — when it is not "true" the worker
 * never starts and every api.* call goes to VITE_API_BASE_URL for real.
 */
async function start() {
  if (import.meta.env.VITE_USE_MOCKS === 'true') {
    const { worker } = await import('./mocks/browser')
    await worker.start({
      onUnhandledRequest: 'bypass',
      quiet: true,
    })
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </StrictMode>,
  )
}

void start()
