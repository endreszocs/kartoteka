import { HashRouter, Routes, Route } from 'react-router-dom'

import { AuthGate } from './lib/auth-gate'
import { LoginPage } from './pages/login-page'
import { HomePage } from './pages/home-page'
import { AnyakonyvPage } from './pages/anyakonyv-page'
import { BankImportPage } from './pages/bank-import-page'
import { LeltarPage } from './pages/leltar-page'
import { IktatoPage } from './pages/iktato-page'
import { JegyzokonyvekPage } from './pages/jegyzokonyvek-page'
import { JegyzokonyvDetailPage } from './pages/jegyzokonyv-detail-page'
import { SirhelyekPage } from './pages/sirhelyek-page'
import { EvesJelentesPage } from './pages/eves-jelentes-page'
import { BefizetesPage } from './pages/befizetes-page'
import { BelsomozgasPage } from './pages/belsomozgas-page'
import { ChitantaPage } from './pages/chitanta-page'
import { ChitantaTombokPage } from './pages/chitanta-tombok-page'
import { DashboardPage } from './pages/dashboard-page'
import { FamiliesPage } from './pages/families-page'
import { KiadasPage } from './pages/kiadas-page'
import { MembersPage } from './pages/members-page'
import { MunkanaploPage } from './pages/munkanaplo-page'
import { PenzugyDashboardPage } from './pages/penzugy-dashboard-page'
import { PenzugyLandingPage } from './pages/penzugy-landing-page'
import { PinEntryPage } from './pages/pin-entry-page'
import { PinSetupPage } from './pages/pin-setup-page'
import { PlaceholderPage } from './pages/placeholder-page'

/**
 * Kartotéka Desktop — App gyökér.
 *
 * Route-felállás:
 *   /login        → LoginPage (nyilvános)
 *   /pin-entry    → PIN-entry (offline-mode, A-M6.9) — nyilvános, de
 *                   csak akkor éri el a user, ha nincs session de van PIN-hash
 *   /pin-setup    → PIN-setup (A-M6.9) — sikeres online login után, ha nincs PIN
 *   /             → HomePage (üdvözlés + KPI-k + gyors linkek) — auth-gate mögött
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
        <Route path="/pin-entry" element={<PinEntryPage />} />
        <Route path="/pin-setup" element={<PinSetupPage />} />
        <Route element={<AuthGate />}>
          <Route index element={<HomePage />} />
          <Route path="/dashboard" element={<HomePage />} />
          <Route path="/munkanaplo" element={<MunkanaploPage />} />
          <Route path="/penzugy" element={<PenzugyLandingPage />} />
          <Route path="/penzugy/attekintes" element={<PenzugyDashboardPage />} />
          <Route path="/penzugy/befizetes" element={<BefizetesPage />} />
          <Route path="/penzugy/kiadas" element={<KiadasPage />} />
          <Route path="/penzugy/belsomozgas" element={<BelsomozgasPage />} />
          <Route path="/penzugy/chitanta" element={<ChitantaPage />} />
          <Route path="/penzugy/chitanta-tombok" element={<ChitantaTombokPage />} />
          <Route path="/penzugy/bank-import" element={<BankImportPage />} />
          <Route path="/tagnyilvantartas" element={<MembersPage />} />
          <Route path="/csaladok" element={<FamiliesPage />} />
          <Route path="/anyakonyv" element={<AnyakonyvPage />} />
          <Route path="/leltar" element={<LeltarPage />} />
          <Route path="/iktato" element={<IktatoPage />} />
          <Route path="/jegyzokonyvek" element={<JegyzokonyvekPage />} />
          <Route path="/jegyzokonyvek/:id" element={<JegyzokonyvDetailPage />} />
          <Route path="/sirhelyek" element={<SirhelyekPage />} />
          <Route path="/eves-jelentes" element={<EvesJelentesPage />} />
          <Route path="/dev" element={<DashboardPage />} />
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
