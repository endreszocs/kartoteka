import { HashRouter, Routes, Route } from 'react-router-dom'

import { AuthGate } from './lib/auth-gate'
import { LoginPage } from './pages/login-page'
import { DashboardPage } from './pages/dashboard-page'
import { PlaceholderPage } from './pages/placeholder-page'

/**
 * Kartotéka Desktop — App gyökér.
 *
 * Router: HashRouter (Tauri-biztonságos, nem ütközik a `tauri://` vagy
 * `file://` protokollal).
 *
 * Route-felállás:
 *   /login   → LoginPage (nyilvános)
 *   /        → AuthGate → DashboardPage (a "Saját gyülekezet" + "Tagok" cards)
 *   /dashboard → Ugyanaz (web-compat, a sidebar "Irányítópult" linkje)
 *   /*       → PlaceholderPage (minden még nem implementált modul)
 *
 * A DesktopShell (sidebar + header + page-shell chrome) minden védett
 * oldalon ott van, ami a `DesktopShell` komponenst használja.
 */
function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGate />}>
          <Route index element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
