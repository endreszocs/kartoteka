'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, BookOpen, Home, Lightbulb, Sprout, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MissionLevel } from '@/lib/missions/gamification'
import { MuhelyUserBadge } from './muhely-user-badge'

type NavItem = {
  label: string
  shortLabel: string
  href: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Kezdőlap', shortLabel: 'Kezdőlap', href: '/misszios-muhely', icon: Home },
  { label: 'Ötletasztal', shortLabel: 'Ötletek', href: '/misszios-muhely/forum', icon: Lightbulb },
  { label: 'Műhelypolc', shortLabel: 'Műhelypolc', href: '/misszios-muhely/segedanyagok', icon: BookOpen },
  { label: 'Jelvényeim', shortLabel: 'Jelvényeim', href: '/misszios-muhely/jutalmak', icon: Trophy },
]

interface MuhelyNavbarProps {
  viewer: {
    fullName: string
    avatarUrl: string | null
    level: MissionLevel
    points: number
    percent: number
  }
}

function isCurrentRoute(pathname: string, href: string) {
  if (href === '/misszios-muhely') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MuhelyNavbar({ viewer }: MuhelyNavbarProps) {
  const pathname = usePathname()
  const shouldReduceMotion = useReducedMotion()

  const hoverMotion = shouldReduceMotion ? undefined : { y: -1 }
  const tapMotion = shouldReduceMotion ? undefined : { scale: 0.98 }

  return (
    <>
      <Link
        href="/dashboard"
        className="muhely-back-link"
        aria-label="Vissza a Kartotéka adminisztrációs felületére"
      >
        <ArrowLeft aria-hidden="true" />
        <span className="muhely-back-copy">Vissza a Kartotékába</span>
      </Link>

      <header className="muhely-navbar">
        <div className="muhely-navbar-inner">
          <Link href="/misszios-muhely" className="muhely-brand" aria-label="Missziós Műhely kezdőlap">
            <span className="muhely-brand-mark" aria-hidden="true">
              <Sprout size={19} strokeWidth={1.7} />
            </span>
            <span className="muhely-brand-copy">
              <span className="muhely-brand-title">Missziós Műhely</span>
              <span className="muhely-brand-subtitle">Lelkipásztori alkotótér</span>
            </span>
          </Link>

          <nav className="muhely-desktop-nav" aria-label="Missziós Műhely főmenü">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = isCurrentRoute(pathname, item.href)

              return (
                <motion.div
                  key={item.href}
                  className="muhely-nav-motion-item"
                  whileHover={hoverMotion}
                  whileTap={tapMotion}
                >
                  <Link
                    href={item.href}
                    className="muhely-nav-link"
                    data-active={active}
                    aria-current={active ? 'page' : undefined}
                  >
                    {active && (
                      <motion.span
                        className="muhely-nav-active-line"
                        layoutId="muhely-desktop-active"
                        transition={
                          shouldReduceMotion
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 420, damping: 34 }
                        }
                        aria-hidden="true"
                      />
                    )}
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </motion.div>
              )
            })}
          </nav>

          <MuhelyUserBadge
            fullName={viewer.fullName}
            avatarUrl={viewer.avatarUrl}
            level={viewer.level}
            points={viewer.points}
            percent={viewer.percent}
          />
        </div>
      </header>

      <nav className="muhely-mobile-nav" aria-label="Missziós Műhely mobilmenü">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = isCurrentRoute(pathname, item.href)

          return (
            <motion.div
              key={item.href}
              className="muhely-mobile-nav-item"
              whileTap={tapMotion}
            >
              <Link
                href={item.href}
                className="muhely-mobile-nav-link"
                data-active={active}
                aria-current={active ? 'page' : undefined}
              >
                {active && (
                  <motion.span
                    className="muhely-mobile-active-pill"
                    layoutId="muhely-mobile-active"
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 34 }
                    }
                    aria-hidden="true"
                  />
                )}
                <Icon aria-hidden="true" />
                <span>{item.shortLabel}</span>
              </Link>
            </motion.div>
          )
        })}
      </nav>
    </>
  )
}
