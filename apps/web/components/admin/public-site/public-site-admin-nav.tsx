import Link from 'next/link'
import { FileText, LayoutDashboard, Newspaper, Settings2, UsersRound } from 'lucide-react'

import { cn } from '@/lib/utils'

export type PublicSiteAdminSection =
  | 'overview'
  | 'posts'
  | 'magazine'
  | 'memberPortal'
  | 'settings'

interface PublicSiteAdminNavProps {
  active: PublicSiteAdminSection
  canWrite: boolean
}

const NAV_ITEMS = [
  {
    key: 'overview',
    label: 'Áttekintés',
    href: '/publikus-oldal',
    icon: LayoutDashboard,
    requiresWrite: false,
  },
  {
    key: 'posts',
    label: 'Bejegyzések',
    href: '/publikus-oldal/bejegyzesek',
    icon: FileText,
    requiresWrite: false,
  },
  {
    key: 'magazine',
    label: 'Magazin',
    href: '/publikus-oldal/magazin',
    icon: Newspaper,
    requiresWrite: true,
  },
  {
    key: 'memberPortal',
    label: 'Tagi portál',
    href: '/publikus-oldal/tagi-portal',
    icon: UsersRound,
    requiresWrite: true,
  },
  {
    key: 'settings',
    label: 'Beállítások',
    href: '/publikus-oldal/beallitasok',
    icon: Settings2,
    requiresWrite: true,
  },
] as const

/**
 * URL-alapú modulnavigáció. A route-ok külön Server Componentként töltődnek,
 * ezért az áttekintő nem küldi le a rejtett szerkesztők teljes kliens-payloadját.
 */
export function PublicSiteAdminNav({ active, canWrite }: PublicSiteAdminNavProps) {
  const visibleItems = NAV_ITEMS.filter((item) => !item.requiresWrite || canWrite)

  return (
    <nav aria-label="Gyülekezeti weboldal kezelőfelülete" className="overflow-x-auto pb-1">
      <ul className="flex min-w-max gap-2 sm:grid sm:min-w-0 sm:grid-cols-5">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive = item.key === active

          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 min-w-32 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20 focus-visible:ring-offset-2',
                  isActive
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
