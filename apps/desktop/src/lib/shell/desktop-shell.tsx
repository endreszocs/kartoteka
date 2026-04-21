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

import { KartotekaShell } from '@kartoteka/ui'

import { getDesktopSupabase } from '../supabase'
import { getLocalOwnProfile, getLocalOwnCongregation } from '../sync'
import type { ProfileLocalRow, CongregationLocalRow } from '../sync'
import { DesktopLink } from './router-link'

interface DesktopShellProps {
  children: ReactNode
}

export function DesktopShell({ children }: DesktopShellProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProfileLocalRow | null>(null)
  const [congregation, setCongregation] = useState<CongregationLocalRow | null>(null)

  // Supabase auth session betöltése
  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Lokális profil + gyülekezet betöltése
  useEffect(() => {
    if (!user) return
    let mounted = true
    getLocalOwnProfile(user.id)
      .then((p) => {
        if (mounted) setProfile(p)
      })
      .catch(() => {
        // csendes — offline/DB nem nyitott
      })
    getLocalOwnCongregation(user.id)
      .then((c) => {
        if (mounted) setCongregation(c)
      })
      .catch(() => {
        // csendes
      })
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

  // Ha a session még nincs lekérve, jelenítsünk meg minimál loading state-et
  if (!effectiveProfile) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Betöltés…</p>
      </div>
    )
  }

  return (
    <KartotekaShell
      Link={DesktopLink}
      currentPath={location.pathname}
      logoSrc="/EREK.png"
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
      activeScope={hasCongregation ? 'congregation' : null}
      onSignOut={handleSignOut}
    >
      {children}
    </KartotekaShell>
  )
}
