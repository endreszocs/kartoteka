/**
 * Adatvédelmi napló — AKADÁLY-PANEL (2026-08-23).
 *
 * Egyetlen helyen fogalmazza meg, MIÉRT nincs lista. A négy ok gyökeresen
 * különbözik, ezért négy külön mondat kell:
 *
 *   · `tabla_hianyzik`      — a kód előbb ment élesbe, mint az SQL. NEM hiba.
 *   · `kerulet_nem_lathatja`— K4 döntés (2026-08-16): a kerület nem olvassa a
 *                             gyülekezetek személyes adatait.
 *   · `hatokor_ismeretlen`  — nem tudjuk, mit láthatna → fail-closed.
 *   · `adatbazis_hiba`      — valódi hiba, HANGOSAN.
 *
 * ⚠️ Ami itt tilos: mindegyikre ugyanaz a „Nincs találat." Az üres lista és a
 * meghiúsult lekérdezés összemosása a projekt visszatérő hibaosztálya.
 */

import { AlertTriangle, DatabaseZap, Info, ShieldQuestion } from 'lucide-react'

import type { AdatvedelemAkadaly } from '@/app/(dashboard)/admin/adatvedelem-shared'
import { ADATVEDELEM_SQL_FAJL } from '@/app/(dashboard)/admin/adatvedelem-shared'

interface AkadalyPanelProps {
  akadaly: AdatvedelemAkadaly
  uzenet?: string | null
}

const META: Record<
  Exclude<AdatvedelemAkadaly, 'nincs_akadaly'>,
  { cim: string; ikon: typeof Info; hangulat: 'semleges' | 'figyelem' | 'veszely' }
> = {
  tabla_hianyzik: {
    cim: 'Ez a napló még nincs bekapcsolva',
    ikon: DatabaseZap,
    hangulat: 'semleges',
  },
  kerulet_nem_lathatja: {
    cim: 'Kerületi szinten ez a napló nem látható',
    ikon: ShieldQuestion,
    hangulat: 'semleges',
  },
  hatokor_ismeretlen: {
    cim: 'A hatókört most nem tudjuk feloldani',
    ikon: AlertTriangle,
    hangulat: 'figyelem',
  },
  nincs_jogosultsag: {
    cim: 'Ehhez a naplóhoz nincs jogosultságod',
    ikon: ShieldQuestion,
    hangulat: 'semleges',
  },
  adatbazis_hiba: {
    cim: 'Az adatbázis nem válaszolt',
    ikon: AlertTriangle,
    hangulat: 'veszely',
  },
}

const HANGULAT_OSZTALY: Record<'semleges' | 'figyelem' | 'veszely', string> = {
  semleges: 'bg-muted/50 ring-border text-muted-foreground',
  figyelem:
    'bg-amber-50 ring-amber-500/25 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-400/30',
  veszely:
    'bg-rose-50 ring-rose-500/20 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-400/30',
}

export function AkadalyPanel({ akadaly, uzenet }: AkadalyPanelProps) {
  if (akadaly === 'nincs_akadaly') return null
  const meta = META[akadaly]
  const Ikon = meta.ikon

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl p-4 ring-1 ring-inset sm:flex-row sm:p-5 ${HANGULAT_OSZTALY[meta.hangulat]}`}
      role="status"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background/60 ring-1 ring-inset ring-border">
        <Ikon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 space-y-1.5">
        <p className="font-heading text-base text-foreground">{meta.cim}</p>
        {uzenet ? <p className="text-sm leading-relaxed">{uzenet}</p> : null}
        {akadaly === 'tabla_hianyzik' ? (
          <p className="text-xs leading-relaxed opacity-80">
            A rendszergazda teendője: futtassa le a{' '}
            <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-[11px] ring-1 ring-inset ring-border">
              {ADATVEDELEM_SQL_FAJL}
            </code>{' '}
            fájlt a Supabase SQL-szerkesztőjében. Amíg ez nem történik meg, az oldal nyugodtan
            nyitva hagyható — semmi nem romlik el tőle.
          </p>
        ) : null}
      </div>
    </div>
  )
}
