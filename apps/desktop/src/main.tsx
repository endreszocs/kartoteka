import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { SplashScreen, ThemeStyleProvider } from '@kartoteka/ui-app'
import App from './App'
import { ErrorBoundary } from './lib/error-boundary'
import './index.css'

/**
 * AppWithSplash — Sprint R F4 (v0.8.3).
 *
 * A desktop indításkor 1.5 másodpercig megjelenik a SplashScreen (sidebar
 * mély színe + Kartotéka logó kt-pulse + indeterminate progress + verzió).
 * Az App komponens már a háttérben mountol és tölt — a Splash csak overlay
 * (position: fixed, z-index: 9999), így a tényleges idle nem nőtt meg.
 */
function AppWithSplash() {
  const [showSplash, setShowSplash] = useState(true)
  useEffect(() => {
    const id = window.setTimeout(() => setShowSplash(false), 1500)
    return () => window.clearTimeout(id)
  }, [])
  return (
    <>
      <App />
      {showSplash && <SplashScreen logoSrc="/kartoteka-logo.png" version="v0.8.8" />}
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeStyleProvider>
        <AppWithSplash />
      </ThemeStyleProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
