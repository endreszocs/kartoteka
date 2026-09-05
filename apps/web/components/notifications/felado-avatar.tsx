/**
 * FELADÓ-AVATAR (2026-09-05) — ikon-chip a küldő típusa szerint.
 *
 * A `profiles` táblán nincs profilkép-oszlop, és a `profiles_read` policy
 * miatt a címzett nem is feltétlenül látná a küldőt — ezért az avatar a
 * biztonságos alap: típus-ikon típusszínnel (FELADO_VISUALS), a név pedig a
 * denormalizált `felado_nev`-ből jön (nem itt, a hívó írja ki).
 *
 * Direktíva-mentes: nincs benne hook, a csengő (kliens) és a szál is használja.
 */

import type { Felado } from '@/lib/notifications/felado'
import { FELADO_TIPUS_CIMKE } from '@/lib/notifications/felado'
import { cn } from '@/lib/utils'

import { getFeladoVisual } from './ertesites-vizualis'

const MERETEK = {
  sm: { chip: 'size-9 rounded-xl', ikon: 'size-4' },
  md: { chip: 'size-10 rounded-xl', ikon: 'size-5' },
  lg: { chip: 'size-11 rounded-2xl', ikon: 'size-5' },
} as const

export function FeladoAvatar({
  felado,
  meret = 'md',
  className,
}: {
  felado: Felado
  meret?: keyof typeof MERETEK
  className?: string
}) {
  const visual = getFeladoVisual(felado.tipus)
  const Ikon = visual.icon
  const m = MERETEK[meret]
  return (
    <span
      role="img"
      aria-label={`${FELADO_TIPUS_CIMKE[felado.tipus]}: ${felado.nev}`}
      title={felado.levezetett ? `${felado.nev} — valószínű feladó (régi üzenetből következtetve)` : felado.nev}
      className={cn('flex shrink-0 items-center justify-center ring-1', m.chip, visual.chip, className)}
    >
      <Ikon className={m.ikon} aria-hidden />
    </span>
  )
}
