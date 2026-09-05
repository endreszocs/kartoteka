'use client'

/**
 * Emlékeztető sáv: „az asztali alkalmazás jóváhagyásra vár" (2026-09-05).
 *
 * Akkor jelenik meg, ha a böngészőben ott a kérés-azonosító sütije — vagyis a
 * lelkész az asztali appból érkezett, de a bejelentkezés (jelszó vagy Google)
 * a kezdőlapra vitte. A jóváhagyó oldalon magán a sáv nem látszik.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, MonitorSmartphone } from 'lucide-react'

export function DesktopKapcsolasSav() {
  const pathname = usePathname()
  if (pathname?.startsWith('/desktop-kapcsolas')) return null
  return (
    <Link
      href="/desktop-kapcsolas"
      className="mb-4 flex min-h-12 items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-foreground transition hover:bg-primary/15"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <MonitorSmartphone className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="font-semibold">Az asztali alkalmazás jóváhagyásra vár.</strong>{' '}
        <span className="text-muted-foreground">Hasonlítsd össze az ellenőrző kódot, és kapcsold össze a gépet a fiókoddal.</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-primary" />
    </Link>
  )
}
