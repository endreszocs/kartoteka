/**
 * DesktopShell — a `@kartoteka/ui` `KartotekaShell` előre-bekötött wrapperje.
 *
 * Összeköti a közös layout-ot a desktop-specifikus forrásokkal:
 *   - Auth: Supabase session (`getDesktopSupabase()`)
 *   - Profile: helyi `profiles_local` (M2.4 cache)
 *   - Congregation: helyi `congregations_local` (M6 cache)
 *   - Routing: React Router (`useLocation`, `useNavigate`)
 *   - Link adapter: DesktopLink (react-router-dom wrapper)
 *
 * Használat minden desktop-oldalon:
 *   <DesktopShell>
 *     <... az oldal tartalom ...>
 *   </DesktopShell>
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  ClipboardCheck,
  CreditCard,
  Eye,
  FileSpreadsheet,
  HelpCircle,
  Landmark,
  ListOrdered,
  Receipt,
  Scale,
  ScrollText,
  Trash2,
} from 'lucide-react'

import { KartotekaShell, type MenuItem } from '@kartoteka/ui'
import { GlobalPendingIndicator } from '@kartoteka/ui-app'

/**
 * A Pénzügy menüpont kibontható almenüje a desktop-on (Sprint Q F1.6, v0.7.6).
 * 7 sub-item, a `/penzugy` landing page-t a parent-link adja külön.
 *
 * A sub-item-eknél az icon és gradient nem jelenik meg a UI-on (csak bullet
 * látszik), de a `MenuItem` típus megköveteli őket — ezért ikon-konzisztencia
 * miatt a finance-súgóból ismert ikonokat használjuk.
 */
// 2026-06-11 (Endre sidebar-audit): az Áttekintés/Tranzakciók/Számadás/Tartozások
// almenü-linkek az EGYSÉGES /penzugy tab-oldal horgonyaira mutatnak (mint a
// weben) — korábban külön oldalakra vittek, ami duplikált belépési pontot adott.
// A régi route-ok megmaradnak (közvetlen URL működik), csak a menü egységes.
// 2026-06-11 (paritás #5): Bank / Költségvetés / Monetár / Súgó is felkerült —
// a fülek a web-azonos megosztott komponenssel élnek az egységes /penzugy oldalon.
const DESKTOP_FINANCE_SUBMENU: MenuItem[] = [
  { label: 'Áttekintés', href: '/penzugy#dashboard', icon: Eye, gradient: 'from-blue-400 to-indigo-500' },
  { label: 'Kassza', href: '/penzugy#cashbook', icon: ListOrdered, gradient: 'from-emerald-400 to-green-500' },
  { label: 'Bevétel', href: '/penzugy/befizetes', icon: ArrowUpRight, gradient: 'from-emerald-400 to-green-500' },
  { label: 'Kiadás', href: '/penzugy/kiadas', icon: ArrowDownRight, gradient: 'from-red-400 to-rose-500' },
  { label: 'Bank', href: '/penzugy#bank', icon: Landmark, gradient: 'from-violet-400 to-purple-500' },
  { label: 'Tranzakciók', href: '/penzugy#transactions', icon: ListOrdered, gradient: 'from-blue-400 to-cyan-500' },
  { label: 'Belső mozgás', href: '/penzugy/belsomozgas', icon: ArrowLeftRight, gradient: 'from-violet-400 to-purple-500' },
  { label: 'Költségvetés', href: '/penzugy#budget', icon: ScrollText, gradient: 'from-amber-400 to-orange-500' },
  { label: 'Nyugta', href: '/penzugy/chitanta', icon: Receipt, gradient: 'from-amber-400 to-orange-500' },
  { label: 'Nyugtatömbök', href: '/penzugy/chitanta-tombok', icon: ScrollText, gradient: 'from-amber-400 to-orange-500' },
  { label: 'Számadás', href: '/penzugy#accounting', icon: ClipboardCheck, gradient: 'from-blue-400 to-indigo-500' },
  { label: 'Tartozások', href: '/penzugy#debt', icon: Scale, gradient: 'from-rose-400 to-red-500' },
  { label: 'Bérleti szerződések', href: '/penzugy#rental', icon: Building2, gradient: 'from-amber-400 to-yellow-500' },
  { label: 'Monetár', href: '/penzugy#monetary', icon: CreditCard, gradient: 'from-slate-400 to-slate-600' },
  { label: 'Bank import', href: '/penzugy/bank-import', icon: FileSpreadsheet, gradient: 'from-violet-400 to-purple-500' },
  { label: 'Súgó', href: '/penzugy#sugo', icon: HelpCircle, gradient: 'from-teal-400 to-cyan-500' },
]

// Desktopon még nem létező modulok — a sidebar elrejti őket („halott részek").
const DESKTOP_HIDDEN_MENU_HREFS = [
  '/profile',
  '/admin',
  '/dashboard-egyhazmegye',
  '/dashboard-kerulet',
]

// 2026-08-15 (desktop-paritás 3. szelet): a Kuka a weben a fejléc
// mega-menüjéből nyílik — desktopon nincs ilyen menü, ezért a sidebar
// „Szolgálati adminisztráció" szekciójának végére kerül.
const DESKTOP_EXTRA_OPERATIVE_ITEMS: MenuItem[] = [
  { label: 'Kuka', href: '/kuka', icon: Trash2, gradient: 'from-red-400 to-rose-500' },
]

import { AutoSyncStatusBar } from '../../components/auto-sync-status-bar'
import { ExcelSetupWizard } from '../../components/excel-setup-wizard'
import { SessionStatusIndicator } from '../../components/session-status-indicator'
import { SettingsDialog } from '../../components/settings-dialog'
import { SyncStatusIndicator } from '../../components/sync-status-indicator'
import { getDesktopSupabase } from '../supabase'
import { getDesktopUser } from '../desktop-user'
import { getDbStatus } from '../local-db'
import {
  getLocalOwnCongregation,
  getLocalOwnProfile,
  pullOwnCongregation,
  pullOwnProfile,
  type CongregationLocalRow,
  type ProfileLocalRow,
} from '../sync'
import { DesktopLink } from './router-link'

interface DesktopShellProps {
  children: ReactNode
}

export function DesktopShell({ children }: DesktopShellProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const [user, setUser] = useState<User | null>(null)
  const [userResolved, setUserResolved] = useState(false)
  const [profile, setProfile] = useState<ProfileLocalRow | null>(null)
  const [congregation, setCongregation] = useState<CongregationLocalRow | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined)
  const [excelWizardOpen, setExcelWizardOpen] = useState(false)

  // Bárhonnan megnyitható Beállítások egy adott füllel (pl. Pénzügy →
  // „Excel-könyvelés" hero-gomb → Könyvelés fül). Lazán csatolt custom event.
  useEffect(() => {
    function onOpenSettingsEvent(e: Event) {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab
      setSettingsTab(tab)
      setSettingsOpen(true)
    }
    window.addEventListener('kartoteka:open-settings', onOpenSettingsEvent)
    return () => window.removeEventListener('kartoteka:open-settings', onOpenSettingsEvent)
  }, [])

  // Excel-beállítás varázsló (2026-06-12, Endre #1 Excel-wizard) — ugyanazzal a
  // lazán csatolt event-mintával, mint a Beállítások: a Pénzügy hero-gombja
  // (hiányos előkészítésnél) és a Könyvelés-panel „Varázsló indítása" gombja süti el.
  useEffect(() => {
    function onOpenExcelWizardEvent() {
      setExcelWizardOpen(true)
    }
    window.addEventListener('kartoteka:open-excel-wizard', onOpenExcelWizardEvent)
    return () => window.removeEventListener('kartoteka:open-excel-wizard', onOpenExcelWizardEvent)
  }, [])

  // D12 (2026-08-28, Endre döntése): az Excel write-sync auto-egyeztetése
  // eltérést talált az Excel-főkönyv és a Kartotéka közt — állandó (kézzel
  // zárható) figyelmeztető sáv, a Beállítások → Könyvelés fül felé mutatva.
  const [excelElteres, setExcelElteres] = useState<{ ev: number; lapok: string[] } | null>(null)
  useEffect(() => {
    function onExcelElteres(e: Event) {
      const detail = (e as CustomEvent<{ ev?: number; lapok?: string[] }>).detail
      setExcelElteres({ ev: Number(detail?.ev) || 0, lapok: detail?.lapok ?? [] })
    }
    window.addEventListener('kartoteka:excel-elteres', onExcelElteres)
    return () => window.removeEventListener('kartoteka:excel-elteres', onExcelElteres)
  }, [])

  // P3-20 (audit 2026-08-28): beragadt ('blocked') Excel-főkönyv-sorok —
  // állandó, kézzel zárható sáv, a Beállítások → Könyvelés felé mutatva.
  const [excelBlocked, setExcelBlocked] = useState<number>(0)
  useEffect(() => {
    function onExcelBlocked(e: Event) {
      const darab = Number((e as CustomEvent<{ darab?: number }>).detail?.darab) || 0
      setExcelBlocked(darab)
    }
    window.addEventListener('kartoteka:excel-blocked', onExcelBlocked)
    return () => window.removeEventListener('kartoteka:excel-blocked', onExcelBlocked)
  }, [])

  // Felhasználó feloldása — OFFLINE-barát (2026-06-11 fix): PIN-es belépésnél
  // nincs Supabase session, ezért a getDesktopUser a cache-elt/lokális userre
  // esik vissza. Ha az SEM megy, LÁTHATÓ hibát mutatunk (sosem végtelen töltést).
  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    getDesktopUser()
      .then((resolved) => {
        if (!mounted) return
        setUser(resolved)
        setUserResolved(true)
      })
      .catch(() => {
        if (!mounted) return
        setUserResolved(true)
      })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      // Csak akkor írjuk felül, ha valódi session jött — a null-ra állítás
      // törölné az offline-feloldott usert (INITIAL_SESSION null-lal jön).
      if (session?.user) {
        setUser(session.user)
        setUserResolved(true)
      }
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Lokális profil + gyülekezet betöltése — auto-pull, ha nincs cache-elve
  useEffect(() => {
    if (!user) return
    let mounted = true

    async function loadOrPull() {
      if (!user) return

      // 1. Várunk, amíg a SQLCipher DB megnyílik (max ~3 mp, 150 ms lépésekkel)
      let dbReady = false
      for (let i = 0; i < 20; i++) {
        const status = await getDbStatus().catch(() => null)
        if (status?.opened) {
          dbReady = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      if (!mounted || !dbReady) return

      // 2. Lokális cache olvasás
      const [localP, localC] = await Promise.all([
        getLocalOwnProfile(user.id).catch(() => null),
        getLocalOwnCongregation(user.id).catch(() => null),
      ])
      if (!mounted) return
      setProfile(localP)
      setCongregation(localC)

      // 3. Auto-pull, ha valamelyik hiányzik (első indítás / Ctrl+R)
      const needsProfilePull = !localP
      const needsCongregationPull = !localC
      if (!needsProfilePull && !needsCongregationPull) return

      try {
        if (needsProfilePull) {
          await pullOwnProfile(user.id)
        }
        if (needsCongregationPull) {
          await pullOwnCongregation(user.id)
        }
        // 4. Frissített cache olvasás
        const [freshP, freshC] = await Promise.all([
          getLocalOwnProfile(user.id),
          getLocalOwnCongregation(user.id),
        ])
        if (!mounted) return
        setProfile(freshP)
        setCongregation(freshC)
      } catch {
        // Offline vagy hálózati hiba — a user manuálisan pull-hat majd
        // a DashboardPage Pull-gombjaival. A sidebar a korábbi cache-t mutatja.
      }
    }

    void loadOrPull()
    return () => {
      mounted = false
    }
  }, [user])

  // Sign-out: Supabase signOut + redirect a login-ra
  const handleSignOut = useCallback(async () => {
    const supabase = getDesktopSupabase()
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }, [navigate])

  // Minimal fallback profile, ha a session megvan, de a lokális profil-cache
  // még nincs (első indítás, Pull előtt). Így a header-avatar látszik.
  const effectiveProfile = profile
    ? {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role ?? 'user',
      }
    : user
      ? {
          id: user.id,
          email: user.email ?? null,
          full_name: null,
          role: 'user',
        }
      : null

  // Role-flagek származtatása a profile.role-ból (egyszerűsített; később a
  // profile_roles tábla + scope-resolution is mehet majd ide, ha kell)
  const role = profile?.role ?? 'user'
  const isMasterAdmin = role === 'master_admin'
  const isAdmin = role === 'admin' || role === 'master_admin'
  const isEgyhazkeruletiAdmin = role === 'egyhazkeruleti_admin' || isAdmin
  const isEsperes = role === 'esperes'
  const isKonyvelo = role === 'konyvelo'
  const isSzamvevo = role === 'szamvevo'
  const hasCongregation = Boolean(profile?.congregation_id)
  const activeScope =
    location.pathname.startsWith('/admin')
      ? 'system'
      : location.pathname.startsWith('/dashboard-kerulet')
        ? 'district'
        : location.pathname.startsWith('/dashboard-egyhazmegye')
          ? 'diocese'
          : hasCongregation
            ? 'congregation'
            : null

  // Amíg a feloldás fut (legfeljebb ~4 mp), minimál loading; ha lefutott és
  // NINCS user, LÁTHATÓ hiba + kiút (sosem végtelen „Betöltés…" — 2026-06-11).
  if (!effectiveProfile) {
    if (!userResolved) {
      return (
        <div className="flex h-screen items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        </div>
      )
    }
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-900">
          <p className="font-semibold">Nem sikerült azonosítani a felhasználót.</p>
          <p className="mt-2 text-sm leading-relaxed">
            Offline módban a gépen tárolt profil alapján lépnél be, de az még nem
            töltődött le erre a gépre. Csatlakozz a hálózatra, és jelentkezz be
            egyszer online — utána az offline belépés is működni fog.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-md border border-amber-400 bg-white px-3 py-2 text-sm font-medium hover:bg-amber-100"
              onClick={() => window.location.reload()}
            >
              Újrapróbálás
            </button>
            <button
              type="button"
              className="flex-1 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
              onClick={() => navigate('/login', { replace: true })}
            >
              Online belépés
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* 2026-08-29 (Endre kérése): globális „gondolkodó jel" — minden
          hálózati hívás alatt vékony futó csík a képernyő tetején. */}
      <GlobalPendingIndicator />
      <KartotekaShell
        Link={DesktopLink}
        currentPath={location.pathname}
        logoSrc="/kartoteka-logo.png"
        profile={effectiveProfile}
        congregationId={profile?.congregation_id ?? null}
        congregationName={congregation?.nev_hu ?? congregation?.name ?? null}
        congregationLogo={congregation?.cimer_url ?? null}
        isMasterAdmin={isMasterAdmin}
        isAdmin={isAdmin}
        isEgyhazkeruletiAdmin={isEgyhazkeruletiAdmin}
        isEsperes={isEsperes}
        isKonyvelo={isKonyvelo}
        isSzamvevo={isSzamvevo}
        hasCongregation={hasCongregation}
        isGodMode={false}
        activeScope={activeScope}
        onSignOut={handleSignOut}
        onOpenSettings={() => {
          setSettingsTab(undefined)
          setSettingsOpen(true)
        }}
        financeSubmenu={DESKTOP_FINANCE_SUBMENU}
        hiddenMenuHrefs={DESKTOP_HIDDEN_MENU_HREFS}
        extraOperativeItems={DESKTOP_EXTRA_OPERATIVE_ITEMS}
        // 2026-06-11 (Endre): a session/szinkron jelvények a HEADERBEN élnek —
        // a korábbi lebegő (fixed) pozíció kitakarta a modulok tartalmát.
        headerExtra={
          <div className="hidden items-center gap-2 md:flex">
            <AutoSyncStatusBar position="inline" />
            <SyncStatusIndicator position="inline" />
            <SessionStatusIndicator position="inline" />
          </div>
        }
      >
        {excelElteres && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <div>
              <strong>
                Az Excel-főkönyv és a Kartotéka összege eltér ({excelElteres.ev}. év
                {excelElteres.lapok.length > 0 ? ` — lap: ${excelElteres.lapok.join(', ')}` : ''}).
              </strong>{' '}
              A böngészőben rögzített tételek nem kerülnek az Excelbe — futtasd az
              egyeztetést, és vezesd át a hiányzó sorokat.{' '}
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('kartoteka:open-settings', { detail: { tab: 'konyveles' } }),
                  )
                }}
              >
                Egyeztetés megnyitása
              </button>
            </div>
            <button
              type="button"
              aria-label="Figyelmeztetés bezárása"
              className="shrink-0 rounded p-0.5 text-amber-700 hover:bg-amber-100"
              onClick={() => setExcelElteres(null)}
            >
              ✕
            </button>
          </div>
        )}
        {excelBlocked > 0 && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
          >
            <div>
              <strong>
                {excelBlocked} tétel beragadt az Excel-főkönyv várólistáján.
              </strong>{' '}
              Ezek a sorok nem kerültek be a hivatalos Excelbe — nézd meg az okot, és
              indítsd újra őket.{' '}
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('kartoteka:open-settings', { detail: { tab: 'konyveles' } }),
                  )
                }}
              >
                Várólista megnyitása
              </button>
            </div>
            <button
              type="button"
              aria-label="Figyelmeztetés bezárása"
              className="shrink-0 rounded p-0.5 text-rose-700 hover:bg-rose-100"
              onClick={() => setExcelBlocked(0)}
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </KartotekaShell>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialTab={settingsTab}
        userEmail={effectiveProfile.email}
        publicSiteUrl={
          congregation?.public_slug
            ? `https://kartoteka.erek.ro/gy/${congregation.public_slug}`
            : null
        }
        publicSiteEnabled={congregation?.public_site_enabled === 1}
      />

      {/* Excel-beállítás varázsló (2026-06-12, Endre #1 Excel-wizard) —
          a 'kartoteka:open-excel-wizard' eseményre nyílik. */}
      <ExcelSetupWizard open={excelWizardOpen} onOpenChange={setExcelWizardOpen} />
    </>
  )
}
