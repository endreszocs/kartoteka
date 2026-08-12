/**
 * 14 NAPOS MENTÉS-PULZUS — mikro-csík (2026-08-12).
 *
 * SZERVER-KOMPONENS. NULLA extra lekérdezés: a `computeCoverage()` ezt a
 * tömböt eddig is kiszámolta minden admin-oldalbetöltéskor, csak a
 * `computeBannerHealth()` eldobta.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WCAG 1.4.1 — AZ ÁLLAPOT SOHA NEM CSAK SZÍN
 * ════════════════════════════════════════════════════════════════════════════
 * Négy állapot, NÉGY KÜLÖNBÖZŐ JEL, mindegyik kiírt magyarázattal a jelmagyarázatban:
 *   ✓  igazolt   — minden várt hatókörnek van ellenőrzött mentése
 *   !  hiányos   — hibás vagy hiányzó mentés volt aznap
 *   ?  ismeretlen— nem tudjuk, hány hatókörnek kellett volna mentés
 *   ·  nem volt  — a rendszer akkor még nem létezett (NEM hiba)
 * Szürkeárnyalatos nyomtatásban és színtévesztéssel is megkülönböztethető.
 *
 * A csík MAGA `aria-hidden`; a képernyőolvasó egy összefoglaló mondatot kap,
 * mert 14 cella felolvasása használhatatlan lenne.
 */

import type { Ag, MentesPulzusNap } from '@/app/(dashboard)/admin/overview-shared'

type Allapot = 'igazolt' | 'hianyos' | 'ismeretlen' | 'nem_volt'

function allapota(n: MentesPulzusNap): Allapot {
  if (!n.letezett) return 'nem_volt'
  if (n.varhato <= 0) return 'ismeretlen'
  if (n.hibas > 0 || n.igazolt < n.varhato) return 'hianyos'
  return 'igazolt'
}

const JEL: Record<Allapot, string> = {
  igazolt: '✓',
  hianyos: '!',
  ismeretlen: '?',
  nem_volt: '·',
}

const SZOVEG: Record<Allapot, string> = {
  igazolt: 'igazolt',
  hianyos: 'hiányos vagy hibás',
  ismeretlen: 'nem tudjuk',
  nem_volt: 'a rendszer még nem létezett',
}

/** Téma-tokenek, sehol hardkódolt hex. */
const STILUS: Record<Allapot, { hatter: string; szin: string; keret: string }> = {
  igazolt: {
    hatter: 'color-mix(in oklab, var(--accent) 26%, transparent)',
    szin: 'var(--foreground)',
    keret: '1px solid color-mix(in oklab, var(--accent) 55%, var(--border))',
  },
  hianyos: {
    hatter: 'color-mix(in oklab, var(--destructive) 16%, transparent)',
    szin: 'var(--foreground)',
    keret: '2px solid var(--destructive)',
  },
  ismeretlen: {
    hatter: 'transparent',
    szin: 'var(--muted-foreground)',
    keret: '1px dashed var(--muted-foreground)',
  },
  nem_volt: {
    hatter: 'transparent',
    szin: 'var(--muted-foreground)',
    keret: '1px solid var(--border)',
  },
}

export function MentesPulzusCsik({ ag }: { ag: Ag<MentesPulzusNap[]> }) {
  // Jogosultsági kérdésnél a csík EL SEM JELENIK — az nem hiba, csak nem
  // az ő dolga. Minden más esetben KIMONDJUK, hogy nem tudjuk.
  if (!ag.ok && ag.fajta === 'nincs_jog') return null
  if (!ag.ok) {
    return (
      <p
        role="alert"
        className="mt-3 rounded-xl border-2 border-[var(--destructive)] px-2.5 py-2 text-xs leading-snug text-foreground"
      >
        A 14 napos mentés-pulzus most nem olvasható, ezért NEM tudjuk, hogy a napi mentés
        folyamatosan futott-e.
      </p>
    )
  }
  if (ag.adat.length === 0) return null

  const igazoltak = ag.adat.filter((n) => allapota(n) === 'igazolt').length
  const hianyosak = ag.adat.filter((n) => allapota(n) === 'hianyos').length

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Az elmúlt {ag.adat.length} nap
      </p>

      <div className="mt-1.5 flex flex-wrap gap-1" aria-hidden>
        {ag.adat.map((n) => {
          const a = allapota(n)
          const st = STILUS[a]
          return (
            <span
              key={n.nap}
              title={`${n.nap} — ${SZOVEG[a]}${n.varhato > 0 ? ` (${n.igazolt}/${n.varhato})` : ''}`}
              className="flex size-6 items-center justify-center rounded-md text-[11px] font-bold leading-none"
              style={{ background: st.hatter, color: st.szin, border: st.keret }}
            >
              {JEL[a]}
            </span>
          )
        })}
      </div>

      <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
        <span aria-hidden>✓ igazolt · ! hiányos · · még nem létezett</span>
        <span className="sr-only">
          Az elmúlt {ag.adat.length} napból {igazoltak} napon volt teljes, igazolt mentés,
          {hianyosak > 0 ? ` ${hianyosak} napon hiányos vagy hibás.` : ' hiányos nap nem volt.'}
        </span>
      </p>
    </div>
  )
}
