'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu,
  X,
  Home,
  Newspaper,
  BookOpen,
  Users,
  UserRoundCheck,
  ChevronRight,
} from 'lucide-react'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { PublicCrest } from './public-crest'

interface Props {
  slug: string
  displayName: string
  crestImageUrl?: string | null
  primaryColor: string
  primaryOnSurfaceColor: string
  inkColor: string
  memberPortalEnabled?: boolean
  /**
   * 2026-08-10 — sötét (fotós) fejlécen világos trigger. A filmszerű téma
   * fejléce a hero fölött lebeg, ott a `--public-ink` sötét-sötéten volt.
   */
  tone?: 'surface' | 'onDark'
}

function normalizePathname(pathname: string): string {
  if (pathname === '/') return pathname
  return pathname.replace(/\/+$/, '')
}

function isActivePath(pathname: string, href: string, isHome = false): boolean {
  const currentPath = normalizePathname(pathname)
  if (isHome) return currentPath === href
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

export function PublicMobileNav({
  slug,
  displayName,
  crestImageUrl,
  primaryColor,
  primaryOnSurfaceColor,
  inkColor,
  memberPortalEnabled = false,
  tone = 'surface',
}: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setOpen(false)
    })
    return () => {
      cancelled = true
    }
  }, [pathname])

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false)
    }

    desktopQuery.addEventListener('change', closeOnDesktop)
    return () => desktopQuery.removeEventListener('change', closeOnDesktop)
  }, [])

  const items = [
    {
      href: `/gy/${slug}`,
      label: 'Kezdőlap',
      icon: Home,
      desc: 'Főoldal és hírek',
      isHome: true,
    },
    {
      href: `/gy/${slug}/posts`,
      label: 'Hírek',
      icon: Newspaper,
      desc: 'Bejegyzések és aktualitások',
    },
    {
      href: `/gy/${slug}/magazin`,
      label: 'Magazin',
      icon: BookOpen,
      desc: 'Gyülekezeti újság',
    },
    {
      href: `/gy/${slug}/rolunk`,
      label: 'Rólunk',
      icon: Users,
      desc: 'Bemutatkozás',
    },
    ...(memberPortalEnabled
      ? [{
          href: `/gy/${slug}/tagi-portal`,
          label: 'Tagi portál',
          icon: UserRoundCheck,
          desc: 'Belépés és tagi regisztráció',
        }]
      : []),
  ]

  return (
    <div className="lg:hidden">
      {/* A modal Sheet kezeli az Escape-et, a fokuszcsapdat es a scroll-lock cleanupot. */}
      <Sheet open={open} onOpenChange={setOpen} modal>
        <SheetTrigger
          render={
            <button
              ref={triggerRef}
              type="button"
              className={
                tone === 'onDark'
                  ? 'inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full border border-white/35 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent motion-reduce:transition-none'
                  : 'inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-xl transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--public-accent-ink)] focus-visible:ring-offset-2 motion-reduce:transition-none'
              }
              style={
                tone === 'onDark'
                  ? undefined
                  : { color: 'var(--public-ink, #1e293b)' }
              }
              aria-label="Navigációs menü megnyitása"
            />
          }
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </SheetTrigger>

        <SheetContent
          side="right"
          role="dialog"
          aria-modal="true"
          showCloseButton={false}
          initialFocus={closeButtonRef}
          finalFocus={triggerRef}
          className="w-[min(88vw,22rem)] max-w-none gap-0 overflow-hidden border-l-0 bg-white p-0 text-slate-900 motion-reduce:transform-none motion-reduce:transition-none sm:max-w-sm"
          data-public-mobile-nav-dialog=""
          style={
            {
              '--public-primary': primaryColor,
              '--public-primary-on-surface': primaryOnSurfaceColor,
              '--public-ink': inkColor,
            } as CSSProperties
          }
        >
          <div
            className="flex items-center justify-between gap-3 px-5 py-5 text-white"
            style={{
              background:
                'linear-gradient(135deg, var(--public-primary, #14514b) 0%, color-mix(in srgb, var(--public-primary, #14514b) 80%, #000) 100%)',
            }}
          >
            <div className="flex min-w-0 items-center gap-3">
              {/* 2026-08-10: object-contain pajzs-keret — a magas arányú
                  református címereket az object-cover levágta. */}
              <PublicCrest
                src={crestImageUrl}
                name={displayName}
                size={44}
                shape="shield"
                tone="onDark"
              />
              <div className="min-w-0">
                <SheetTitle className="truncate font-heading text-base font-semibold leading-tight text-white">
                  {displayName}
                </SheetTitle>
                <SheetDescription className="mt-1 text-xs text-white/85">
                  Gyülekezeti weboldal navigációja
                </SheetDescription>
              </div>
            </div>

            <SheetClose
              render={
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="inline-flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--public-primary)] motion-reduce:transition-none"
                  aria-label="Navigációs menü bezárása"
                />
              }
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </SheetClose>
          </div>

          <nav
            aria-label="Fő navigáció"
            className="flex-1 overflow-y-auto overscroll-contain p-3"
          >
            {items.map((item) => {
              const Icon = item.icon
              const isActive = isActivePath(pathname, item.href, item.isHome)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className="mb-1 flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left no-underline transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--public-primary-on-surface)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                  style={{
                    backgroundColor: isActive
                      ? 'color-mix(in srgb, var(--public-primary, #14514b) 9%, transparent)'
                      : undefined,
                  }}
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: isActive
                        ? 'var(--public-primary, #14514b)'
                        : '#f1f5f9',
                      color: isActive ? '#fff' : '#64748b',
                    }}
                    aria-hidden="true"
                  >
                    <Icon className="h-[1.125rem] w-[1.125rem]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-[0.95rem] font-semibold"
                      style={{
                        color: isActive
                          ? 'var(--public-primary-on-surface, #14514b)'
                          : '#1e293b',
                      }}
                    >
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">{item.desc}</span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-slate-300"
                    aria-hidden="true"
                  />
                </Link>
              )
            })}
          </nav>

          <div className="border-t border-slate-100 bg-white px-5 py-4 text-center text-[0.7rem] text-slate-500">
            Működik a <span className="font-semibold text-slate-500">Kartotéka</span>{' '}
            rendszerrel
          </div>

          <style>{`
            [data-slot='sheet-overlay'] {
              background-color: rgba(15, 23, 42, 0.52) !important;
              backdrop-filter: blur(4px);
              -webkit-backdrop-filter: blur(4px);
            }

            @media (prefers-reduced-motion: reduce) {
              [data-slot='sheet-overlay'],
              [data-public-mobile-nav-dialog] {
                animation: none !important;
                transition: none !important;
              }
            }
          `}</style>
        </SheetContent>
      </Sheet>
    </div>
  )
}
