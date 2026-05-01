'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Church, HardDrive, HelpCircle, LogOut, Menu, Settings, Shield, Sparkles, Trash2, User } from 'lucide-react'
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
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-2xl border border-white/70 bg-white/78 text-slate-600 shadow-[0_16px_34px_-24px_rgba(16,70,63,0.38)] transition hover:bg-white hover:text-primary"
            aria-label="Segítség és támogatás"
            title="Segítség és támogatás"
          >
            <HelpCircle className="size-[18px]" />
          </button>

          <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />

          <NotificationBellRefined userId={profile.id} />

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
