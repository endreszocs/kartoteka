import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeStyleProvider } from '@kartoteka/ui-app'
import App from './App'
import { SplashScreen } from './components/splash-screen'
import { ErrorBoundary } from './lib/error-boundary'
import { initTheme } from './lib/theme'
import './index.css'

/**
 * 2026-08-15 — a mentett sötét/világos mód visszaállítása még a React-render előtt.
 * A `dark` osztályt korábban CSAK a Beállítások ablak tette fel kattintáskor, ezért
 * újraindítás után a lelkész sötét módja némán elveszett. A villanásmentes
 * visszaállítást az `index.html` blokkoló szkriptje végzi; ez itt a biztonsági háló
 * (ha az kimaradna), egyben a „Rendszer" mód futás közbeni követése.
 */
initTheme()

/**
 * AppWithSplash — 2026-06-11 (web-paritás): a webapp animált, 5-fázisos
 * splash-ének pixelpontos portja fut indításkor (Hatter + KEREK/EREK címerek
 * + KARTOTEKA logó + "Békesség Istentől!"). A komponens a saját életciklusát
 * maga kezeli (sessionStorage-guard: app-indításonként egyszer fut, ~6,5 mp,
 * fade-del), az App már a háttérben mountol és tölt — a Splash csak overlay.
 */
function AppWithSplash() {
  return (
    <>
      <App />
      <SplashScreen />
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
