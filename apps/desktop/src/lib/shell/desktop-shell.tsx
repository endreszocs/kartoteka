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
  ClipboardCheck,
  Eye,
  FileSpreadsheet,
  ListOrdered,
  Receipt,
  Scale,
  ScrollText,
} from 'lucide-react'

import { KartotekaShell, type MenuItem } from '@kartoteka/ui'

/**
 * A Pénzügy menüpont kibontható almenüje a desktop-on (Sprint Q F1.6, v0.7.6).
 * 7 sub-item, a `/penzugy` landing page-t a parent-link adja külön.
 *
 * A sub-item-eknél az icon és gradient nem jelenik meg a UI-on (csak bullet
 * látszik), de a `MenuItem` típus megköveteli őket — ezért ikon-konzisztencia
 * miatt a finance-súgóból ismert ikonokat használjuk.
 */
const DESKTOP_FINANCE_SUBMENU: MenuItem[] = [
  { label: 'Áttekintés', href: '/penzugy/attekintes', icon: Eye, gradient: 'from-blue-400 to-indigo-500' },
  { label: 'Bevétel', href: '/penzugy/befizetes', icon: ArrowUpRight, gradient: 'from-emerald-400 to-green-500' },
  { label: 'Kiadás', href: '/penzugy/kiadas', icon: ArrowDownRight, gradient: 'from-red-400 to-rose-500' },
  { label: 'Tranzakciók', href: '/penzugy/tranzakciok', icon: ListOrdered, gradient: 'from-blue-400 to-cyan-500' },
  { label: 'Belső mozgás', href: '/penzugy/belsomozgas', icon: ArrowLeftRight, gradient: 'from-violet-400 to-purple-500' },
  { label: 'Nyugta', href: '/penzugy/chitanta', icon: Receipt, gradient: 'from-amber-400 to-orange-500' },
  { label: 'Nyugtatömbök', href: '/penzugy/chitanta-tombok', icon: ScrollText, gradient: 'from-amber-400 to-orange-500' },
  { label: 'Számadás', href: '/penzugy/szamadas', icon: ClipboardCheck, gradient: 'from-blue-400 to-indigo-500' },
  { label: 'Tartozások', href: '/penzugy/tartozasok', icon: Scale, gradient: 'from-rose-400 to-red-500' },
  { label: 'Bank import', href: '/penzugy/bank-import', icon: FileSpreadsheet, gradient: 'from-violet-400 to-purple-500' },
]

import { SettingsDialog } from '../../components/settings-dialog'
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
        onOpenSettings={() => setSettingsOpen(true)}
        financeSubmenu={DESKTOP_FINANCE_SUBMENU}
      >
        {children}
      </KartotekaShell>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        userEmail={effectiveProfile.email}
        publicSiteUrl={
          congregation?.public_slug
            ? `https://kartoteka.erek.ro/gy/${congregation.public_slug}`
            : null
        }
        publicSiteEnabled={congregation?.public_site_enabled === 1}
      />
    </>
  )
}
