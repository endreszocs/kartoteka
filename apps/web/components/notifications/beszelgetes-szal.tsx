'use client'

/**
 * A SZÁL — EGY FELADÓ ÜZENETEI BUBORÉKOKBAN (2026-09-05, D4).
 *
 * Időrend NÖVEKVŐ (régi fent, új lent), betöltéskor az aljára görget — mint
 * egy üzenetküldő. Dátum-elválasztó pirulák („Ma" / „Tegnap" / dátum,
 * Europe/Bucharest). A `?uzenet=<id>` mélylink a buborékhoz görget és a
 * `.mentes-horgony-villan` osztállyal villantja (kartoteka.css).
 *
 * ⚠️ NINCS setState effektben: a görgetés DOM-művelet, a kiemelés osztály-
 *    kapcsolás — mindkettő ref-en át, állapot nélkül.
 */

import { useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, Archive, CheckCheck, CheckCircle2, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { datumElvalaszto, elozoNapKulcs, napiBlokkok, type Beszelgetes, type SzalSzuro } from '@/lib/notifications/beszelgetesek'
import { FELADO_TIPUS_CIMKE } from '@/lib/notifications/felado'
import { bukarestiNapKulcs } from '@/lib/utils/idopont-bukarest'
import { cn } from '@/lib/utils'

import { FeladoAvatar } from './felado-avatar'
import { UzenetBuborek, type UzenetMuveletek } from './uzenet-buborek'

export function BeszelgetesSzal({
  beszelgetes,
  szuro,
  kiemeltId,
  fut,
  muveletek,
  onMindOlvasott,
  onArchivumValt,
  onVissza,
  className,
}: {
  beszelgetes: Beszelgetes | null
  szuro: SzalSzuro
  kiemeltId: string | null
  fut: boolean
  muveletek: UzenetMuveletek
  /** A szál összes olvasatlanja olvasottnak. */
  onMindOlvasott: () => void
  onArchivumValt: () => void
  /** Mobil: vissza a beszélgetés-listához. */
  onVissza: () => void
  className?: string
}) {
  const gorgetoRef = useRef<HTMLDivElement | null>(null)

  // A „tegnap" a „ma" kulcsából, tisztán — renderben nincs óra-hívás
  // (react-hooks/purity: a Date.now renderben tilos).
  const maKulcs = bukarestiNapKulcs()
  const tegnapKulcs = elozoNapKulcs(maKulcs)
  const blokkok = useMemo(() => (beszelgetes ? napiBlokkok(beszelgetes.sorok) : []), [beszelgetes])

  const kulcs = beszelgetes?.kulcs ?? null
  const sorokSzama = beszelgetes?.sorok.length ?? 0

  /**
   * Görgetés: mélylinknél a buborékhoz (+ villantás), különben a szál aljára.
   * Szál-váltáskor és új sor érkezésekor fut újra.
   */
  useEffect(() => {
    const gorgeto = gorgetoRef.current
    if (!gorgeto) return
    const cel = kiemeltId ? document.getElementById(`uzenet-${kiemeltId}`) : null
    if (cel && gorgeto.contains(cel)) {
      cel.scrollIntoView({ block: 'center' })
      cel.classList.add('mentes-horgony-villan')
      const t = setTimeout(() => cel.classList.remove('mentes-horgony-villan'), 2400)
      return () => clearTimeout(t)
    }
    gorgeto.scrollTop = gorgeto.scrollHeight
  }, [kulcs, kiemeltId, sorokSzama])

  if (!beszelgetes) {
    return (
      <section className={cn('card-raised flex min-h-[20rem] flex-col', className)} aria-label="Szál">
        <div className="lg:hidden">
          <VisszaGomb onVissza={onVissza} />
        </div>
        <UresSzal szuro={szuro} />
      </section>
    )
  }

  const { felado } = beszelgetes

  return (
    <section
      className={cn('card-raised flex min-h-0 flex-col overflow-hidden', className)}
      aria-label={`Szál: ${felado.nev}`}
    >
      {/* ── Fejléc ── */}
      <header className="shrink-0 border-b border-border/70 bg-gradient-to-b from-secondary/60 to-card px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <div className="lg:hidden">
            <VisszaGomb onVissza={onVissza} kompakt />
          </div>
          <FeladoAvatar felado={felado} meret="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-heading text-[15px] leading-tight text-foreground">{felado.nev}</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {FELADO_TIPUS_CIMKE[felado.tipus]}
              {felado.levezetett ? ' · valószínű feladó' : ''}
              {' · '}
              {beszelgetes.olvasatlan > 0 ? (
                <span className="font-semibold text-foreground">{beszelgetes.olvasatlan} olvasatlan</span>
              ) : (
                'nincs olvasatlan'
              )}
              {' · '}
              {beszelgetes.sorok.length} üzenet
            </p>
          </div>
          {fut ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Mentés…" /> : null}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {beszelgetes.olvasatlan > 0 && szuro !== 'archivalt' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={fut}
              onClick={onMindOlvasott}
              className="min-h-11 gap-1.5"
              aria-label="A szál összes üzenetének olvasottnak jelölése"
            >
              <CheckCheck className="size-4" aria-hidden />
              Összes olvasottnak
            </Button>
          ) : null}
          <Button
            type="button"
            variant={szuro === 'archivalt' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onArchivumValt}
            aria-pressed={szuro === 'archivalt'}
            className="min-h-11 gap-1.5"
          >
            <Archive className="size-4" aria-hidden />
            {szuro === 'archivalt' ? 'Archívum — vissza a friss üzenetekhez' : 'Archívum'}
          </Button>
        </div>
      </header>

      {/* ── Törzs: dátum-elválasztók + buborékok ── */}
      <div
        ref={gorgetoRef}
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
        role="log"
        aria-live="polite"
      >
        <ol className="space-y-3" role="list">
          {blokkok.map((b) => (
            <li key={b.napKulcs} className="space-y-3">
              <div className="sticky top-0 z-10 flex justify-center py-1">
                <span className="rounded-full border border-border/70 bg-card/95 px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur">
                  {datumElvalaszto(b.napKulcs, maKulcs, tegnapKulcs)}
                </span>
              </div>
              <ul className="space-y-2.5" role="list">
                {b.sorok.map((s) => (
                  <li key={s.id} className="flex">
                    <UzenetBuborek sor={s} fut={fut} kiemelt={kiemeltId === s.id} muveletek={muveletek} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        {/* ⚠️ Az archiválás nem törlés — és ezt ki is mondjuk. */}
        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
          {szuro === 'archivalt'
            ? 'Archivált üzenetek — a buborék menüjéből bármikor visszahozhatók.'
            : 'Az üzenetek innen nem tűnnek el maguktól. Az archiválás nem törlés: a buborék menüjéből az Archívumba kerül, ahonnan visszahozható.'}
        </p>
      </div>
    </section>
  )
}

function VisszaGomb({ onVissza, kompakt = false }: { onVissza: () => void; kompakt?: boolean }) {
  return (
    <button
      type="button"
      onClick={onVissza}
      aria-label="Vissza az üzenetek listájához"
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-foreground',
        kompakt ? '-ml-2 px-2' : 'mx-3 mt-2 px-2',
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      {kompakt ? null : 'Üzenetek'}
    </button>
  )
}

function UresSzal({ szuro }: { szuro: SzalSzuro }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-400/25">
        <CheckCircle2 className="size-6" aria-hidden />
      </div>
      <p className="mt-3.5 text-sm font-semibold text-foreground">
        {szuro === 'archivalt' ? 'Az archívum üres' : szuro === 'olvasatlan' ? 'Nincs olvasatlan üzenet' : 'Tiszta a postaláda'}
      </p>
      <p className="mt-1 max-w-[22rem] text-xs leading-relaxed text-muted-foreground">
        {szuro === 'archivalt'
          ? 'Amit archiválsz, ide kerül — és innen bármikor visszahozható.'
          : szuro === 'olvasatlan'
            ? 'Minden üzenetet elolvastál. A „Mind" szűrővel a korábbiakat is látod.'
            : 'Ha új történik a gyülekezet körül, itt jelezzük. Válassz egy feladót a listából.'}
      </p>
    </div>
  )
}
