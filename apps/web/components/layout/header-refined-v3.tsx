'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ChevronDown, Church, HardDrive, HelpCircle, Landmark, LogOut, RotateCcw, Settings, Shield, Trash2, User } from 'lucide-react'
import { SupportDialog } from '@/components/layout/support-dialog'
import { SettingsDialog } from '@/components/modals/settings-dialog'

import { signOut } from '@/app/(dashboard)/actions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Profile } from '@/lib/types/auth'

import { NotificationBellRefined } from './notification-bell-refined'
import { OfflineMenuItemBadge } from '@/components/offline/offline-menu-item-badge'
import { ProfileSwitcher } from './profile-switcher'
import type { ProfileRoleRow } from '@/lib/profile-roles/types'

interface HeaderProps {
  profile: Profile
  congregationName: string | null
  congregationLogo: string | null
  /** A gyülekezet egyházmegyéjének neve — congregation scope-ban a chip secondary felirata. */
  congregationDioceseName?: string | null
  profileRoles?: ProfileRoleRow[]
  activeProfileRoleId?: string | null
  scopeNames?: Record<string, string>
  /** Az aktív UI-kontextus scope-ja (multi-role rendszer Fázis 4).
   *  A bal-felső chip felirata ehhez igazodik:
   *  - system → "Rendszergazdai felület" / "Kartotéka rendszer"
   *  - district → "Egyházkerületi felület" / "Erdélyi Református Egyházkerület"
   *  - diocese → egyházmegye neve / "Erdélyi Református Egyházkerület"
   *  - congregation (vagy null) → congregationName / "Erdélyi Református Egyházkerület"
   */
  activeScope?: 'system' | 'district' | 'diocese' | 'congregation' | null
  /** Az aktív kontextus scope_id-jához tartozó név (egyházmegye esetén). */
  activeScopeName?: string | null
  /** Optional: gyülekezeti publikus oldal állapota a Beállítások dialog-hoz */
  publicSiteUrl?: string | null
  publicSiteEnabled?: boolean
  onOpenProfile?: () => void
  onOpenCongregation?: () => void
  onOpenGodMode?: () => void
  onToggleMobileMenu: () => void
  /** Sidebar collapse/expand toggle — a Kartotéka-ikonra kattintásra. */
  onToggleSidebar?: () => void
}

function getRoleLabel(role: string) {
  const roleLabels: Record<string, string> = {
    admin: 'Kerületi admin',
    esperes: 'Esperes',
    master_admin: 'Főadmin',
    pastor: 'Lelkipásztor',
    user: 'Felhasználó',
  }

  return roleLabels[role] || role.replace(/_/g, ' ')
}

export function HeaderRefinedV3({
  profile,
  congregationName,
  congregationLogo,
  congregationDioceseName = null,
  profileRoles = [],
  activeProfileRoleId = null,
  scopeNames = {},
  activeScope = null,
  activeScopeName = null,
  publicSiteUrl = null,
  publicSiteEnabled = false,
  onOpenProfile,
  onOpenCongregation,
  onOpenGodMode,
  onToggleMobileMenu,
  onToggleSidebar,
}: HeaderProps) {
  const hasMultipleRoles = profileRoles.length > 1
  const [signingOut, setSigningOut] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const router = useRouter()

  const fullName = profile.full_name || profile.email || 'Lelkipásztor'
  const initials = fullName
    .split(' ')
    .map((name) => name[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
  const roleLabel = getRoleLabel(profile.role)

  // Scope-tudatos chip-felirat (bal-felső sarok). Endre kérése (2026-05-03):
  // az admin felületen NE "Várakozás a jóváhagyásra" / "Erdélyi Református
  // Egyházkerület" jelenjen meg — hanem a tényleges aktív kontextus.
  const contextChip = (() => {
    if (activeScope === 'system') {
      return {
        primary: 'Rendszergazdai felület',
        secondary: 'Kartotéka rendszer',
      }
    }
    if (activeScope === 'district') {
      return {
        primary: 'Egyházkerületi felület',
        secondary: activeScopeName || 'Erdélyi Református Egyházkerület',
      }
    }
    if (activeScope === 'diocese') {
      return {
        primary: activeScopeName || 'Egyházmegyei felület',
        secondary: 'Erdélyi Református Egyházkerület',
      }
    }
    // congregation (vagy null) — gyülekezet neve / egyházmegye neve
    // (Endre kérése 2026-05-03: a kerület helyett a gyülekezet egyházmegyéje
    // szerepeljen másodlagosként, mert lelkészi nézetben ez a releváns.)
    return {
      primary: congregationName || 'Várakozás a jóváhagyásra',
      secondary: congregationDioceseName || 'Erdélyi Református Egyházkerület',
    }
  })()

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <header className="sticky top-0 z-30 h-16 shrink-0 border-b border-border bg-background/74 backdrop-blur-2xl">
      <div className="flex h-full items-center justify-between gap-3.5 px-4 lg:px-7">
        <div className="flex min-w-0 items-center gap-3.5">
          {/* Mobile-only Kartotéka-ikonos menu-toggle. A Kartotéka oldalakon a
              sidebar desktop-on állandóan látszik (lg:flex), így itt nincs
              szükség desktop toggle-re — ezért `lg:hidden`. */}
          <button
            onClick={onToggleMobileMenu}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition hover:bg-muted/70 lg:hidden"
            aria-label="Menü megnyitása"
            title="Menü megnyitása"
          >
            <Image
              src="/kartoteka-logo.png"
              alt="Kartotéka"
              width={24}
              height={24}
              className="size-6 object-contain"
              priority
            />
          </button>

          {/* Sablon-szerű "input-szerű" gyülekezet chip — címer + 2 sor szöveg */}
          <div className="flex min-w-0 items-center gap-3 rounded-[10px] border border-border bg-card px-3.5 py-1.5">
            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: 'var(--accent)' }}>
              {congregationLogo ? (
                <div
                  aria-hidden="true"
                  className="size-full bg-cover bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${congregationLogo})` }}
                />
              ) : (
                <Church className="size-5 text-white" />
              )}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate font-heading text-[14.5px] font-semibold text-foreground">
                {contextChip.primary}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {contextChip.secondary}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-[10px] bg-muted text-foreground transition hover:bg-muted/70"
            aria-label="Segítség és támogatás"
            title="Segítség és támogatás"
          >
            <HelpCircle className="size-[17px]" />
          </button>

          <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />

          <NotificationBellRefined userId={profile.id} />

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-xl bg-muted px-2.5 py-1.5 transition outline-none hover:bg-muted/70">
              <Avatar className="h-8 w-8">
                <AvatarFallback
                  className="text-[13px] font-semibold text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left leading-tight sm:block">
                <p className="text-[12.5px] font-semibold text-foreground">{fullName}</p>
                <p className="text-[10.5px] text-muted-foreground">{roleLabel}</p>
              </div>
              <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="w-72 rounded-[1.4rem] border border-border bg-popover p-2 shadow-lg backdrop-blur-xl"
            >
              {hasMultipleRoles && (
                <>
                  <ProfileSwitcher
                    activeProfileRoleId={activeProfileRoleId}
                    profileRoles={profileRoles}
                    scopeNames={scopeNames}
                  />
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={onOpenProfile} className="gap-3 rounded-xl py-2.5">
                <User className="size-4 text-primary/70" />
                Profil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenCongregation} className="gap-3 rounded-xl py-2.5">
                <Church className="size-4 text-primary/70" />
                Gyülekezetünk
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push('/offline')}
                className="gap-3 rounded-xl py-2.5"
              >
                <HardDrive className="size-4 text-primary/70" />
                <span className="flex-1">Offline mentés</span>
                <OfflineMenuItemBadge />
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push('/kuka')}
                className="gap-3 rounded-xl py-2.5"
              >
                <Trash2 className="size-4 text-primary/70" />
                <span className="flex-1">Kuka</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setSettingsOpen(true)}
                className="gap-3 rounded-xl py-2.5"
              >
                <Settings className="size-4 text-primary/70" />
                Beállítások
              </DropdownMenuItem>

              {/* Beállító varázslók szekció — Endre kérése (2026-05-04):
                  külön menüpontok a két varázslóhoz, ha utólag adatokat
                  szeretnénk javítani. */}
              <DropdownMenuSeparator />
              <div className="px-3 pt-2 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Beállító varázslók
                </p>
              </div>
              <DropdownMenuItem
                onClick={async () => {
                  if (
                    !window.confirm(
                      'Újraindítjuk a kezdő beállító varázslót — a meglévő adataid megmaradnak, csak újra végigmehetsz az 5 lépésen (pl. ha javítani szeretnél). Folytatod?',
                    )
                  ) {
                    return
                  }
                  const { restartWelcomeWizard } = await import('@/app/(setup)/welcome/actions')
                  const { toast } = await import('sonner')
                  const result = await restartWelcomeWizard()
                  if ('error' in result && result.error) {
                    toast.error(result.error)
                    return
                  }
                  toast.success('Varázsló újraindítva — átirányítunk.')
                  router.push('/welcome')
                }}
                className="gap-3 rounded-xl py-2.5"
              >
                <RotateCcw className="size-4 text-primary/70" />
                <div className="flex flex-col">
                  <span>Kezdő beállító varázsló</span>
                  <span className="text-[10px] text-muted-foreground">5 lépés: gyülekezet, lelkész, pénzügy</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  window.dispatchEvent(new Event('kartoteka:open-congregation-setup-wizard'))
                }}
                className="gap-3 rounded-xl py-2.5"
              >
                <Landmark className="size-4 text-primary/70" />
                <div className="flex flex-col">
                  <span>Gyülekezet-beállítás</span>
                  <span className="text-[10px] text-muted-foreground">Alapadatok, cím, elérhetőség, banki adatok</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onOpenGodMode && (
                <DropdownMenuItem onClick={onOpenGodMode} className="gap-3 rounded-xl py-2.5 text-red-600">
                  <Shield className="size-4" />
                  Rendszergazdai mód
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
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

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        publicSiteUrl={publicSiteUrl}
        publicSiteEnabled={publicSiteEnabled}
        userEmail={profile.email}
      />
    </header>
  )
}
