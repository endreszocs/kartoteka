'use client'

import { signOut } from '@/app/(dashboard)/actions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { NotificationBell } from './notification-bell'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Profile } from '@/lib/types/auth'
import { useState } from 'react'
import { Menu, User, Church, Shield, LogOut } from 'lucide-react'

interface HeaderProps {
  profile: Profile
  congregationName: string | null
  congregationLogo: string | null
  onOpenProfile?: () => void
  onOpenCongregation?: () => void
  onOpenGodMode?: () => void
  onToggleMobileMenu: () => void
}

export function Header({ profile, congregationName, congregationLogo, onOpenProfile, onOpenCongregation, onOpenGodMode, onToggleMobileMenu }: HeaderProps) {
  const [signingOut, setSigningOut] = useState(false)

  const fullName = profile.full_name || profile.email || 'Lelkipásztor'
  const initials = fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  return (
    <header className="h-14 bg-white border-b border-slate-200/60 flex items-center justify-between px-4 lg:px-6 shrink-0 sticky top-0 z-30" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
      {/* Bal oldal — hamburger + gyülekezet */}
      <div className="flex items-center gap-3">
        {/* Hamburger — csak mobilon */}
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Menü megnyitása"
        >
          <Menu className="w-5 h-5 text-slate-600" />
        </button>

        {congregationLogo && (
          <div
            aria-hidden="true"
            className="hidden h-8 w-8 rounded-lg shadow-sm sm:block"
            style={{
              backgroundImage: `url(${congregationLogo})`,
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: 'cover',
            }}
          />
        )}
        <h2 className="text-sm font-semibold text-slate-700 truncate max-w-[180px] sm:max-w-none">
          {congregationName || 'Várakozás a jóváhagyásra...'}
        </h2>
      </div>

      {/* Jobb oldal */}
      <div className="flex items-center gap-1.5">
        <NotificationBell userId={profile.id} />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100/80 transition-colors outline-none">
            <div className="text-right hidden sm:block">
              <p className="text-[13px] font-medium text-slate-700 leading-tight">{fullName}</p>
              <p className="text-[10px] text-slate-400 leading-tight capitalize">{profile.role}</p>
            </div>
            <Avatar className="h-8 w-8" style={{ boxShadow: '0 2px 6px rgba(59,130,246,0.2), inset 0 1px 0 rgba(255,255,255,0.3)' }}>
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-xl border-slate-200/60 p-1.5">
            <DropdownMenuItem onClick={onOpenProfile} className="rounded-lg gap-2.5 py-2.5">
              <User className="w-4 h-4 text-slate-400" /> Profil szerkesztése
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenCongregation} className="rounded-lg gap-2.5 py-2.5">
              <Church className="w-4 h-4 text-slate-400" /> Gyülekezetünk
            </DropdownMenuItem>
            {onOpenGodMode && (
              <><DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenGodMode} className="rounded-lg gap-2.5 py-2.5 text-red-600">
                <Shield className="w-4 h-4" /> God Mode
              </DropdownMenuItem></>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} disabled={signingOut} className="rounded-lg gap-2.5 py-2.5 text-red-600">
              <LogOut className="w-4 h-4" /> {signingOut ? 'Kijelentkezés...' : 'Kijelentkezés'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
