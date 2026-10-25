// src/main.tsx
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { legalKeyForPath } from './pages/legal/legalConfig'
import { isWatchMode } from './watch/session'

// Start listening for install / update events before React renders (a beforeinstallprompt fired early is otherwise lost)
import { pwaManager } from './pwa/pwaManager'
pwaManager.init()

// Remove loading screen after React renders
const removeLoadingScreen = () => {
  const loading = document.getElementById('app-loading');
  if (loading) {
    loading.classList.add('hidden');
    setTimeout(() => loading.remove(), 300);
  }
};

// Public legal pages (/terms, /privacy) render on their own, without the app's sign-in, database or sync
const LegalRoot = lazy(() => import('./pages/legal/LegalRoot'))
const showLegalPage = legalKeyForPath(window.location.pathname) !== null

// Landlord Watch mode renders its own root and NEVER loads the PMS app (which initialises the SQLite database).
// The PMS app is loaded lazily, only when Watch mode is off.
const WatchRoot = lazy(() => import('./watch/WatchRoot'))
const App = lazy(() => import('./App.tsx'))
const watchMode = !showLegalPage && isWatchMode()

// Create and render app
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showLegalPage ? (
      <Suspense fallback={<div style={{ padding: 24, textAlign: 'center' }}>Loading…</div>}>
        <LegalRoot />
      </Suspense>
    ) : (
      <Suspense fallback={null}>
        {watchMode ? <WatchRoot /> : <App />}
      </Suspense>
    )}
  </StrictMode>,
)

// Remove loading screen after render
setTimeout(removeLoadingScreen, 100);