import Image from 'next/image'
import { LogOut } from 'lucide-react'

import { signOut } from '@/app/(dashboard)/actions'

/**
 * Önálló héj a /valassz-profilt oldalhoz — token-alapú újradizájn (2026-08-09).
 *
 * A korábbi fix amber/teal palettát a mindenkori téma tokenjei váltják
 * (var(--primary)/var(--accent2)/color-mix — az AdminPageHeader mintája
 * szerint), így az oldal mindhárom témát (kert/parokia/zsoltaros) és a dark
 * módot is automatikusan követi. A viselkedés (signOut űrlap) változatlan.
 */
export default function ValasszProfiltLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
      {/* Dekoratív háttér-foltok — téma-tokenekből, dark módban visszafogva */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-80 dark:opacity-40"
      >
        <div
          className="absolute -left-32 -top-32 size-72 rounded-full blur-3xl sm:size-96"
          style={{ background: 'color-mix(in oklab, var(--accent2) 30%, transparent)' }}
        />
        <div
          className="absolute -right-32 top-1/3 size-72 rounded-full blur-3xl sm:size-96"
          style={{ background: 'color-mix(in oklab, var(--primary) 22%, transparent)' }}
        />
        <div
          className="absolute -bottom-32 left-1/4 size-72 rounded-full blur-3xl sm:size-96"
          style={{ background: 'color-mix(in oklab, var(--accent) 18%, transparent)' }}
        />
      </div>

      {/* Fejléc — üveghatású sáv téma-tokenekkel */}
      <header className="border-b border-border/60 bg-card/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-border sm:size-11">
              <Image
                src="/KARTOTEKA_V3.png"
                alt="Kartotéka logó"
                width={36}
                height={36}
                priority
                className="size-7 sm:size-9"
              />
            </div>
            <div className="min-w-0">
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.18em] sm:text-[11px] sm:tracking-[0.24em]"
                style={{
                  color: 'color-mix(in oklab, var(--primary) 65%, var(--muted-foreground))',
                }}
              >
                Kartotéka
              </p>
              <h1 className="font-heading text-base text-foreground sm:text-xl">
                Profil választás
              </h1>
            </div>
          </div>

          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-destructive/25 bg-card/80 px-3 py-2 text-xs font-medium text-destructive transition hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Kijelentkezés"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Kijelentkezés</span>
            </button>
          </form>
        </div>
      </header>

      {/* Fő tartalom */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12 md:py-14">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card/50 py-5 text-center text-xs text-muted-foreground backdrop-blur-sm sm:py-6">
        <p>KARTOTEKA · EREK · {new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}
