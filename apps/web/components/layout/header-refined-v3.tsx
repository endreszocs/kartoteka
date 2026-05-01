'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Church, HardDrive, HelpCircle, LogOut, Menu, Settings, Shield, Trash2, User } from 'lucide-react'
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
  profileRoles?: ProfileRoleRow[]
  activeProfileRoleId?: string | null
  scopeNames?: Record<string, string>
  /** Optional: gyülekezeti publikus oldal állapota a Beállítások dialog-hoz */
  publicSiteUrl?: string | null
  publicSiteEnabled?: boolean
  onOpenProfile?: () => void
  onOpenCongregation?: () => void
  onOpenGodMode?: () => void
  onToggleMobileMenu: () => void
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
  profileRoles = [],
  activeProfileRoleId = null,
  scopeNames = {},
  publicSiteUrl = null,
  publicSiteEnabled = false,
  onOpenProfile,
  onOpenCongregation,
  onOpenGodMode,
  onToggleMobileMenu,
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

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <header className="sticky top-0 z-30 h-16 shrink-0 border-b border-border bg-background/74 backdrop-blur-2xl">
      <div className="flex h-full items-center justify-between gap-3.5 px-4 lg:px-7">
        <div className="flex min-w-0 items-center gap-3.5">
          <button
            onClick={onToggleMobileMenu}
            className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-card text-foreground transition hover:bg-muted lg:hidden"
            aria-label="Menü megnyitása"
          >
            <Menu className="size-5" />
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
                {congregationName || 'Várakozás a jóváhagyásra'}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                Erdélyi Református Egyházkerület
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
