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
import { huOraPercBukarest } from '@/lib/utils/idopont-bukarest'

export function FrissitesGomb({ mertAt }: { mertAt: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  // 2026-08-12: a KÖZÖS, Europe/Bucharest-re szögezett formázó. Ez a felirat a
  // csempéken szereplő „ma 08:12 (10 órája)" szövegek VONATKOZTATÁSI PONTJA —
  // ha a kettő más zónában készülne, a lap önmagával kerülne ellentmondásba.
  const ido = (() => {
    const d = new Date(mertAt)
    return Number.isNaN(d.getTime()) ? null : huOraPercBukarest(d)
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
        className="kt-fokusz inline-flex min-h-11 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted/70 hover:text-foreground disabled:opacity-60"
      >
        <RefreshCw className={`size-4 ${pending ? 'animate-spin' : ''}`} aria-hidden />
        {pending ? 'Frissítés…' : 'Frissítés'}
      </button>
    </div>
  )
}
