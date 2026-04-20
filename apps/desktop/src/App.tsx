import { HashRouter, Routes, Route } from 'react-router-dom'

import { AuthGate } from './lib/auth-gate'
import { LoginPage } from './pages/login-page'
import { DashboardPage } from './pages/dashboard-page'

/**
 * Kartotéka Desktop — App gyökér.
 *
 * Router: HashRouter (Tauri-biztonságos, nem ütközik a `tauri://` vagy
 * `file://` protokollal).
 *
 * Route-felállás:
 *   /login   → LoginPage (nyilvános)
 *   /        → AuthGate → DashboardPage (védett, session kötelező)
 *
 * Az M2-től a védett zónában lesznek a tényleges modulok
 * (/ tagok, /penzugy, /anyakonyv, stb.).
 */
function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGate />}>
          <Route index element={<DashboardPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
