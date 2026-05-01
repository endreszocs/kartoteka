'use client'

import Image from 'next/image'

interface RouteLoadingScreenProps {
  /** A betöltött modul neve — pl. "Tagnyilvántartás", "Pénzügy". */
  module?: string
  /** Felirat a logó alatt (alapértelmezett: "Erdélyi Református Egyházkerület"). */
  subtitle?: string
  /** Üzenet — egy mondat a betöltési folyamat hangulatáról. */
  message?: string
}

export function RouteLoadingScreen({
  module = 'Kartotéka',
  subtitle = 'Erdélyi Református Egyházkerület',
  message = 'A modul betöltése folyamatban van, az adatok hamarosan megérkeznek.',
}: RouteLoadingScreenProps) {
  return (
    <div className="card-raised relative isolate overflow-hidden p-6">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at top left, color-mix(in oklab, var(--accent) 22%, transparent), transparent 15rem), radial-gradient(circle at top right, color-mix(in oklab, var(--primary) 16%, transparent), transparent 17rem)',
        }}
      />
      <div
        aria-hidden
        className="absolute -left-8 -top-8 -z-10 h-28 w-28 rounded-full blur-3xl"
        style={{ background: 'color-mix(in oklab, var(--accent) 30%, transparent)' }}
      />
      <div
        aria-hidden
        className="absolute -bottom-8 -right-8 -z-10 h-28 w-28 rounded-full blur-3xl"
        style={{ background: 'color-mix(in oklab, var(--primary) 30%, transparent)' }}
      />

      <div className="flex min-h-[46vh] flex-col items-center justify-center gap-5 text-center">
        {/* Logó pulzáló glow-val */}
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-[-10px] animate-pulse rounded-[1.8rem] blur-md"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in oklab, var(--accent2) 25%, transparent), color-mix(in oklab, var(--card) 10%, transparent), color-mix(in oklab, var(--primary) 20%, transparent))',
            }}
          />
          <div className="relative flex size-20 items-center justify-center rounded-[1.7rem] border border-border bg-card shadow-[0_24px_40px_-24px_rgba(16,70,63,0.4)]">
            <Image src="/kartoteka-logo.png" alt="Kartotéka" width={64} height={64} className="object-contain" priority />
          </div>
        </div>

        {/* Cím-blokk */}
        <div className="max-w-xl">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.28em]"
            style={{ color: 'color-mix(in oklab, var(--primary) 68%, transparent)' }}
          >
            {subtitle}
          </p>
          <h2 className="mt-2 font-heading text-3xl text-foreground md:text-4xl">
            {module}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
            {message}
          </p>

          {/* 3 bouncing dot — a `BrandLoadingScreen` mintára. */}
          <div className="mt-5 flex items-center justify-center gap-2">
            <span
              className="size-2 animate-bounce rounded-full"
              style={{ background: 'color-mix(in oklab, var(--accent) 75%, transparent)', animationDelay: '-0.2s' }}
            />
            <span
              className="size-2 animate-bounce rounded-full"
              style={{ background: 'color-mix(in oklab, var(--accent2) 80%, transparent)', animationDelay: '-0.1s' }}
            />
            <span
              className="size-2 animate-bounce rounded-full"
              style={{ background: 'color-mix(in oklab, var(--primary) 75%, transparent)' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
