'use client'

/**
 * 2026-07-10 (S2 #9): közös pénzügyi betöltő-állapot — kinagyított, lüktető
 * KARTOTEKA logóval és futó állapotsávval. A logót a platform-wrapper adja
 * (web: /kartoteka-icon.png); ha nincs, semleges helyőrző lüktet.
 */
export function FinanceLoadingState({
  label,
  logoSrc,
}: {
  /** Pl. "Költségvetés betöltése…" */
  label: string
  /** A logó URL-je (web: '/kartoteka-icon.png'). Opcionális — desktop fallback. */
  logoSrc?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      {logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt="KARTOTEKA"
          className="size-24 animate-pulse rounded-3xl drop-shadow-md"
        />
      ) : (
        <div className="size-24 animate-pulse rounded-3xl bg-teal-100" />
      )}
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="h-1.5 w-64 overflow-hidden rounded-full bg-slate-100">
        <div className="finance-loading-bar h-full w-1/3 rounded-full bg-teal-500" />
      </div>
      <style>{`
        .finance-loading-bar { animation: finance-loading-slide 1.2s ease-in-out infinite; }
        @keyframes finance-loading-slide {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(310%); }
        }
      `}</style>
    </div>
  )
}
