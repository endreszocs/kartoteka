'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Home, Lightbulb, MessageCircle, Trophy, ArrowLeft, Sparkles, Menu, X } from 'lucide-react'
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
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-emerald-100/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand */}
            <Link
              href="/misszios-muhely"
              className="flex items-center gap-2.5 shrink-0"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="font-heading text-xl font-semibold text-slate-800 hidden sm:inline">
                Missziós Műhely
              </span>
            </Link>

            {/* Desktop navigation */}
            <div className="hidden lg:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                      ${active
                        ? 'bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                )
              })}
            </div>

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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden md:inline">Kartotéka</span>
              </Link>

              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-emerald-100/50 bg-white/95 backdrop-blur-lg">
            <div className="px-4 py-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors
                      ${active
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-slate-600 hover:bg-slate-50'
                      }
                    `}
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
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-slate-200/60 safe-area-pb">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[64px]
                  ${active ? 'text-emerald-600' : 'text-slate-400'}
                `}
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
