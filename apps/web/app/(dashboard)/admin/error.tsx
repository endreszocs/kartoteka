'use client'

import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Admin route-szegmens error boundary (2026-07-11 redesign).
 * Korábban semmilyen error.tsx nem volt — bármely szerver/render-hiba a
 * Next.js gyári angol hibaképernyőjére futott. Innentől magyar, márkázott
 * hibapanel jelenik meg, újrapróbálás-gombbal.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin] route error:', error)
  }, [error])

  return (
    <div className="card-raised mx-auto max-w-xl p-6 text-center sm:p-8">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h1 className="mt-4 font-heading text-xl text-foreground sm:text-2xl">
        Hiba történt az admin felület betöltésekor
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Váratlan hiba lépett fel. Próbáld újra — ha a hiba többször is előjön,
        jelezd a rendszer üzemeltetőjének.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-muted-foreground/70">
          Hibaazonosító: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
      <div className="mt-5 flex justify-center">
        <Button onClick={reset} size="lg">
          <RotateCcw data-icon="inline-start" />
          Újrapróbálás
        </Button>
      </div>
    </div>
  )
}
