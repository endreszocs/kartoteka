'use client'

/**
 * Kartotéka header — platform-agnosztikus port a web `HeaderRefinedV3`-ból.
 *
 * Az alap-port tartalma:
 *   - Hamburger gomb (mobile menu toggle)
 *   - Brand logo (gyülekezet címere, ha van)
 *   - "Szolgálati tér" subtitle + gyülekezetnév
 *   - User avatar (inicializálás) + dropdown menü
 *     - Profile megnyitás
 *     - Gyülekezet megnyitás
 *     - Sign out
 *
 * Későbbi session-ben hozzáadni (jelenleg kihagyva):
 *   - NotificationBellRefined (saját értesítés-pull rendszer kell)
 *   - ProfileSwitcher (multi-role desktop-oldalon is működnie kell)
 *   - SupportDialog, SettingsDialog (saját form-ok)
 *   - Offline-mentés, Kuka, Admin override, God-mode gombok
 */

import { useState, type ReactNode } from 'react'
import {
  ChevronDown,
  Church,
  HelpCircle,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  User,
} from 'lucide-react'

import { Avatar, AvatarFallback } from '../components/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/dropdown-menu'

// ─────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────

export interface HeaderProfile {
  id: string
  email: string | null
  full_name: string | null
  role: string
}

export interface KartotekaHeaderProps {
  profile: HeaderProfile
  congregationName: string | null
  congregationLogo: string | null

  /** Sign-out kezelés (web: Server Action, desktop: Supabase.auth.signOut + navigate). */
  onSignOut: () => Promise<void> | void

  /** Profil dialog megnyitás (opcionális — ha null, a menüből kimarad). */
  onOpenProfile?: () => void
  /** Gyülekezet dialog megnyitás (opcionális). */
  onOpenCongregation?: () => void
  /** Help-panel megnyitás (opcionális — később saját Dialog). */
  onOpenHelp?: () => void
  /** Beállítások dialog megnyitás (opcionális). */
  onOpenSettings?: () => void
  /** Mobile-menu toggle — a parent state-et módosít. */
  onToggleMobileMenu: () => void
  /**
   * Extra tartalom a header jobb oldali gomb-sávjába (a súgó-gomb elé) —
   * pl. session/szinkron státusz-jelvények (desktop, 2026-06-11). Opcionális,
   * a web változatlanul működik nélküle.
   */
  headerExtra?: ReactNode
}

// Role-label egyszerűsítés — a web-oldali `getRoleLabel` másolata.
function getRoleLabel(role: string): string {
  const roleLabels: Record<string, string> = {
    admin: 'Kerületi admin',
    esperes: 'Esperes',
    master_admin: 'Főadmin',
    pastor: 'Lelkipásztor',
    user: 'Felhasználó',
  }
  return roleLabels[role] || role.replace(/_/g, ' ')
}

// ─────────────────────────────────────────────────────────────────────────
// Komponens
// ─────────────────────────────────────────────────────────────────────────

export function KartotekaHeader({
  profile,
  congregationName,
  congregationLogo,
  onSignOut,
  onOpenProfile,
  onOpenCongregation,
  onOpenHelp,
  onOpenSettings,
  onToggleMobileMenu,
  headerExtra,
}: KartotekaHeaderProps) {
  const [signingOut, setSigningOut] = useState(false)

  const fullName = profile.full_name || profile.email || 'Lelkipásztor'
  const initials = fullName
    .split(' ')
    .map((name) => name[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
  const roleLabel = getRoleLabel(profile.role)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await onSignOut()
    } finally {
      // Sign-out után a parent-nek kellene redirect-elnie, de ha nem tört meg,
      // akkor reseteljük az állapotot.
      setSigningOut(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-white/60 bg-background/74 backdrop-blur-2xl">
      <div className="flex min-h-16 items-center justify-between gap-3 px-3 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onToggleMobileMenu}
            className="inline-flex size-10 items-center justify-center rounded-2xl border border-white/70 bg-white/72 text-slate-700 shadow-[0_12px_28px_-22px_rgba(16,70,63,0.45)] transition hover:bg-white lg:hidden"
            aria-label="Menü megnyitása"
          >
            <Menu className="size-5" />
          </button>

          <div className="hidden size-11 items-center justify-center overflow-hidden rounded-2xl border border-white/70 bg-white/80 shadow-[0_14px_30px_-20px_rgba(16,70,63,0.32)] sm:flex">
            {congregationLogo ? (
              <div
                aria-hidden="true"
                className="size-full bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${congregationLogo})` }}
              />
            ) : (
              <Church className="size-5 text-primary" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-primary/70">
              Szolgálati tér
            </p>
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="min-w-0 truncate font-heading text-xl leading-none text-slate-800 sm:text-2xl">
                {congregationName || 'Várakozás a jóváhagyásra'}
              </h2>
              <span className="hidden items-center gap-1 rounded-full bg-accent/16 px-2.5 py-1 text-[11px] font-medium text-primary/85 md:inline-flex">
                <Sparkles className="size-3.5" />
                Átlátható központ
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {headerExtra}
          {onOpenHelp && (
            <button
              type="button"
              onClick={onOpenHelp}
              className="inline-flex size-10 items-center justify-center rounded-2xl border border-white/70 bg-white/78 text-slate-600 shadow-[0_16px_34px_-24px_rgba(16,70,63,0.38)] transition hover:bg-white hover:text-primary"
              aria-label="Segítség és támogatás"
              title="Segítség és támogatás"
            >
              <HelpCircle className="size-[18px]" />
            </button>
          )}

          {/* TODO: NotificationBell + ProfileSwitcher a későbbi session-ben */}

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-[1.2rem] border border-white/70 bg-white/78 px-2.5 py-2 shadow-[0_16px_34px_-24px_rgba(16,70,63,0.38)] transition outline-none hover:bg-white">
              <div className="hidden text-right sm:block">
                <p className="text-[13px] font-semibold leading-tight text-slate-700">{fullName}</p>
                <p className="text-[11px] leading-tight text-primary/70">{roleLabel}</p>
              </div>
              <Avatar className="h-10 w-10 ring-2 ring-white/75">
                <AvatarFallback className="bg-gradient-to-br from-amber-500 via-orange-500 to-teal-600 text-sm font-bold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="w-72 rounded-[1.4rem] border-white/70 bg-[rgba(255,255,255,0.95)] p-2 shadow-[0_24px_50px_-30px_rgba(16,70,63,0.44)] backdrop-blur-xl"
            >
              {onOpenProfile && (
                <DropdownMenuItem onClick={onOpenProfile} className="gap-3 rounded-xl py-2.5">
                  <User className="size-4 text-primary/70" />
                  Profil
                </DropdownMenuItem>
              )}
              {onOpenCongregation && (
                <DropdownMenuItem onClick={onOpenCongregation} className="gap-3 rounded-xl py-2.5">
                  <Church className="size-4 text-primary/70" />
                  Gyülekezetünk
                </DropdownMenuItem>
              )}
              {(onOpenProfile || onOpenCongregation) && <DropdownMenuSeparator />}
              {onOpenSettings && (
                <DropdownMenuItem onClick={onOpenSettings} className="gap-3 rounded-xl py-2.5">
                  <Settings className="size-4 text-primary/70" />
                  Beállítások
                </DropdownMenuItem>
              )}
              {onOpenSettings && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={handleSignOut}
                disabled={signingOut}
                className="gap-3 rounded-xl py-2.5 text-red-600"
              >
                <LogOut className="size-4" />
                {signingOut ? 'Kijelentkezés...' : 'Kijelentkezés'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
