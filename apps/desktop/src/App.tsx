import { HashRouter, Routes, Route } from 'react-router-dom'

import { AuthGate } from './lib/auth-gate'
import { LoginPage } from './pages/login-page'
import { HomePage } from './pages/home-page'
import { DashboardPage } from './pages/dashboard-page'
import { MunkanaploPage } from './pages/munkanaplo-page'
import { PlaceholderPage } from './pages/placeholder-page'

/**
 * Kartotéka Desktop — App gyökér.
 *
 * Route-felállás:
 *   /login        → LoginPage (nyilvános)
 *   /             → HomePage (üdvözlés + KPI-k + gyors linkek)
 *   /dashboard    → HomePage (web-compat, a sidebar "Irányítópult" linkje)
 *   /munkanaplo   → MunkanaploPage
 *   /dev          → DashboardPage (részletes fejlesztői eszközök: sync, outbox,
 *                   device, updater — a Beállítások → Adat&biztonság tab is ide mutat)
 *   /*            → PlaceholderPage (a többi sidebar-modul "Hamarosan")
 */
function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AuthGate />}>
          <Route index element={<HomePage />} />
          <Route path="/dashboard" element={<HomePage />} />
          <Route path="/munkanaplo" element={<MunkanaploPage />} />
          <Route path="/dev" element={<DashboardPage />} />
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
