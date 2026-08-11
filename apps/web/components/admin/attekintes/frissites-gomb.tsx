'use client'

/**
 * „Frissítés" gomb az admin ÁTTEKINTÉS fejlécében (2026-08-12).
 *
 * ⚠️ MIÉRT VAN EGYÁLTALÁN GOMB. Az oldal SOHA nem frissül magától: a számok
 * nem változhatnak meg a lelkész szeme előtt, és a csempék nem rendezhetik át
 * magukat az ujja alatt. Ha friss képet akar, azt Ő kéri.
 *
 * A köteg 60 másodpercre gyorsítótárazva van (minden admin-belépéskor betölt
 * ez az oldal) — ez a gomb üríti a gyorsítótárat, majd újratölt.
 */

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { frissitAdminAttekintes } from '@/app/(dashboard)/admin/overview-actions'

export function FrissitesGomb({ mertAt }: { mertAt: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const ido = (() => {
    const d = new Date(mertAt)
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
  })()

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ido && (
        <span className="text-xs text-muted-foreground">Mérve: {ido}</span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await frissitAdminAttekintes()
            router.refresh()
            toast.success('Az áttekintés frissítve.')
          })
        }
        aria-label="Az áttekintés adatainak frissítése"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        <RefreshCw className={`size-4 ${pending ? 'animate-spin' : ''}`} aria-hidden />
        {pending ? 'Frissítés…' : 'Frissítés'}
      </button>
    </div>
  )
}
