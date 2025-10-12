// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Import PWA manager (auto-initializes)
import './utils/pwa-registration'

// Remove loading screen after React renders
const removeLoadingScreen = () => {
  const loading = document.getElementById('app-loading');
  if (loading) {
    loading.classList.add('hidden');
    setTimeout(() => loading.remove(), 300);
  }
};

// Create and render app
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Remove loading screen after render
setTimeout(removeLoadingScreen, 100);