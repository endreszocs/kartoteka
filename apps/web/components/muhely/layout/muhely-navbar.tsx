'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Home, MessageCircle, Trophy, ArrowLeft, Menu, X } from 'lucide-react'
import { MuhelyUserBadge } from './muhely-user-badge'
import { useState } from 'react'
import type { MissionLevel } from '@/lib/missions/gamification'

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Kezdőlap', href: '/misszios-muhely', icon: Home },
  { label: 'Segédanyagok', href: '/misszios-muhely/segedanyagok', icon: BookOpen },
  { label: 'Fórum', href: '/misszios-muhely/forum', icon: MessageCircle },
  { label: 'Jutalmak', href: '/misszios-muhely/jutalmak', icon: Trophy },
]

interface MuhelyNavbarProps {
  viewer: {
    fullName: string
    level: MissionLevel
    points: number
    percent: number
  }
}

export function MuhelyNavbar({ viewer }: MuhelyNavbarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  function isActive(href: string) {
    if (href === '/misszios-muhely') return pathname === '/misszios-muhely'
    return pathname.startsWith(href)
  }

  return (
    <>
      <nav
        className="sticky top-0 z-50 backdrop-blur-md border-b border-border"
        style={{ background: 'color-mix(in oklab, var(--background) 60%, transparent)' }}
      >
        <div className="w-full px-4 sm:px-6 lg:px-7">
          <div className="flex items-center gap-4 sm:gap-[18px] h-16">
            {/* Brand — Kartotéka logó (sablon szerint 44×44, transzparens háttér) */}
            <Link
              href="/misszios-muhely"
              className="flex items-center gap-2.5 shrink-0"
              aria-label="Missziós Műhely kezdőlap"
            >
              <div className="flex h-11 w-11 items-center justify-center">
                <Image
                  src="/kartoteka-logo.png"
                  alt="Kartotéka"
                  width={44}
                  height={44}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>

              {/* Modul-név — kicsi, uppercase, letterSpacing 1.6 (sablon MMTopbar) */}
              <span
                className="hidden sm:inline-flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                <span aria-hidden style={{ color: 'var(--accent2)' }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 19c0-7 4-13 14-13-1 9-6 13-13 13M5 19c2-3 5-5 9-7" />
                  </svg>
                </span>
                Missziós Műhely
              </span>
            </Link>

            {/* Desktop navigation */}
            <div className="hidden lg:flex items-center gap-1 ml-4">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                    style={active ? { color: 'var(--accent2)', boxShadow: '0 2px 6px color-mix(in oklab, var(--accent2) 22%, transparent)' } : undefined}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                )
              })}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Right side */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:block">
                <MuhelyUserBadge
                  level={viewer.level}
                  points={viewer.points}
                  percent={viewer.percent}
                />
              </div>

              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden md:inline">Kartotéka</span>
              </Link>

              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
                aria-label={mobileOpen ? 'Menü bezárása' : 'Menü megnyitása'}
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-border bg-popover backdrop-blur-lg">
            <div className="px-4 py-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-card text-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                    style={active ? { color: 'var(--accent2)' } : undefined}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Mobile bottom tab bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-popover/90 backdrop-blur-xl border-t border-border safe-area-pb">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[64px] ${
                  active ? '' : 'text-muted-foreground'
                }`}
                style={active ? { color: 'var(--accent2)' } : undefined}
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
