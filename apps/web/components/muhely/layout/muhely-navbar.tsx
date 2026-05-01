'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Home, MessageCircle, Trophy, ArrowLeft, Menu, X } from 'lucide-react'
import { MuhelyUserBadge } from './muhely-user-badge'
import { useState } from 'react'
import type { MissionLevel } from '@/lib/missions/gamification'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

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
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
            {/* Brand — Kartotéka logó (sablon szerint 44×44, transzparens háttér).
                Kattintásra megnyitja a sidebar Sheet-et (a fő rendszer mintájára). */}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-2.5 shrink-0 rounded-xl transition hover:bg-muted/50 px-2 -mx-2"
              aria-label="Oldalsáv megjelenítése"
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
            </button>

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

      {/* Sidebar Sheet — a Kartotéka-logóra kattintva nyílik meg.
          Tartalmazza a Missziós Műhely saját nav-ját + visszalépést a fő rendszerre. */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="w-[280px] border-r-0 p-0 bg-[var(--sidebar)] text-[var(--sidebar-foreground)]"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Missziós Műhely menü</SheetTitle>

          {/* Brand-fejléc — sablon-szerű 108×108 Kartotéka logó */}
          <div className="flex flex-col items-center gap-2 px-5 pb-4 pt-6">
            <Image
              src="/kartoteka-logo.png"
              alt="Kartotéka"
              width={88}
              height={88}
              className="size-[88px] object-contain drop-shadow-[0_12px_22px_rgba(0,0,0,0.28)]"
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/68">
              Missziós Műhely
            </span>
          </div>

          {/* Nav lista — a sablon SidebarItem mintájára */}
          <nav className="px-2.5 pb-2 space-y-0.5">
            <p className="px-3.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
              Műhely
            </p>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`group relative flex w-full items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium transition ${
                    active
                      ? 'bg-white/12 text-white font-semibold'
                      : 'text-white/78 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r"
                      style={{ background: 'var(--accent2)' }}
                    />
                  )}
                  <Icon className="size-[18px] shrink-0" style={active ? { color: 'var(--accent2)' } : undefined} />
                  <span className="flex-1 truncate leading-tight">{item.label}</span>
                </Link>
              )
            })}

            <p className="px-3.5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
              Kartotéka rendszer
            </p>
            <Link
              href="/dashboard"
              onClick={() => setSidebarOpen(false)}
              className="group flex w-full items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium text-white/78 hover:bg-white/8 hover:text-white transition"
            >
              <ArrowLeft className="size-[18px] shrink-0" />
              <span className="flex-1 truncate leading-tight">Vissza az irányítópultra</span>
            </Link>
          </nav>
        </SheetContent>
      </Sheet>

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
