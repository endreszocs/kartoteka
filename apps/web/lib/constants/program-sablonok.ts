// ── Program-sablonok a határidőnaplóhoz (2026-08-25) ─────────────────────────
// A minden gyülekezetben szokásos, visszatérő programok egy-kattintásos
// előtöltése az Új program ablakban (program-dialog.tsx). A `sablonFelismeres`
// függvényt a lelkészi jelentés javaslat-motorja is használja — a fájl útvonala
// és a függvény neve/szignatúrája NEM változhat egyeztetés nélkül.

import type { ProgramTipus, ProgramPrioritas } from '@/lib/constants/dashboard'

export type SablonKulcs = 'vbh' | 'fit7' | 'imahet'

export interface ProgramSablon {
  kulcs: SablonKulcs
  cim: string
  tipus: ProgramTipus
  /** A program hossza napokban — datum_vege = datum + (napok − 1). */
  napok: number
  /** Csak akkor állítjuk, ha a sablon kifejezetten előírja (Imahét: 'fontos'). */
  prioritas?: ProgramPrioritas
  /** A Megjegyzés-mező előtöltése. */
  megjegyzes: string
  /** A chip-gomb emojija. */
  emoji: string
  /** 1 mondatos magyarázat — a chip `title`-attribútuma (mini súgó). */
  leiras: string
  /**
   * A LÁTOGATÓNAK szánt ismertető — a program „Leírás" mezőjét tölti elő,
   * és ez jelenik meg a gyülekezet nyilvános weboldalán (ha ki van téve).
   *
   * ⚠️ SZÁNDÉKOSAN KÜLÖN a `leiras`-tól (az a chip súgója, a szerkesztőnek
   * szól: „a záró dátum automatikusan kitöltődik") és a `megjegyzes`-től
   * (az belső jegyzet). Egy hivatalos gyülekezeti oldalra nem való sem a
   * felület használati útmutatója, sem a belső jegyzet.
   */
  nyilvanos_leiras: string
}

export const PROGRAM_SABLONOK: ProgramSablon[] = [
  {
    kulcs: 'vbh',
    cim: 'Vakációs Bibliahét',
    tipus: 'gyerekprogram',
    napok: 5,
    megjegyzes: 'Vallásórás gyerekeknek szóló 5 napos program (KOEN vagy más program szerint).',
    emoji: '⛺',
    leiras: 'Vallásórás gyerekeknek szóló 5 napos nyári program — a kezdő dátumból a záró dátum automatikusan kitöltődik.',
    nyilvanos_leiras: 'Egy héten át délelőttönként várjuk az iskolás gyermekeket bibliai történetekkel, énektanulással, kézműves foglalkozással és közös játékkal. Szeretettel hívunk minden gyermeket!',
  },
  {
    kulcs: 'fit7',
    cim: 'FIT7 ifjúsági hét',
    tipus: 'ifjusagi',
    napok: 5,
    megjegyzes: 'Konfirmandus és konfirmáció utáni korosztálynak szóló 5 napos program.',
    emoji: '🎯',
    leiras: 'Konfirmandus és konfirmáció utáni korosztálynak szóló 5 napos ifjúsági hét — a szervezés szintje (gyülekezeti / egyházmegyei) a megjegyzésbe kerül.',
    nyilvanos_leiras: 'Öt napos ifjúsági hét a konfirmandus és a konfirmáció utáni korosztálynak: közös alkalmak, beszélgetések, játék és sok élmény. Minden fiatalt szeretettel várunk!',
  },
  {
    kulcs: 'imahet',
    cim: 'Egyetemes imahét',
    tipus: 'istentisztelet',
    napok: 8,
    prioritas: 'fontos',
    megjegyzes: '',
    emoji: '🙏',
    leiras: 'Az egyetemes imahét 8 napos alkalomsorozata — a napi vendéglelkész-beosztás megadható, és a mentéskor munkanapló-sorok is készülhetnek belőle.',
    nyilvanos_leiras: 'Nyolc estén át közösen imádkozunk a keresztyének egységéért. Minden alkalmon vendég szolgálattevő hirdeti az igét — szeretettel várunk mindenkit.',
  },
]

// ── FIT7 szervezési szint ────────────────────────────────────────────────────

export const FIT7_SZINTEK = [
  { value: 'gyulekezeti', label: 'Gyülekezeti' },
  { value: 'egyhazmegyei', label: 'Egyházmegyei' },
  { value: 'mindketto', label: 'Mindkettő' },
] as const

export type Fit7Szint = (typeof FIT7_SZINTEK)[number]['value']

/** A megjegyzésbe kerülő 'Szervezés: …' sor a választott szinthez. */
export function fit7SzervezesSor(szint: Fit7Szint): string {
  if (szint === 'mindketto') return 'Szervezés: gyülekezeti és egyházmegyei'
  if (szint === 'egyhazmegyei') return 'Szervezés: egyházmegyei'
  return 'Szervezés: gyülekezeti'
}

/**
 * A megjegyzés 'Szervezés: …' sorának frissítése (ha van), vagy hozzáfűzése
 * (ha még nincs) — a FIT7 mini szint-választó ezt hívja minden váltásnál.
 */
export function fit7MegjegyzesFrissit(megjegyzes: string, szint: Fit7Szint): string {
  const sor = fit7SzervezesSor(szint)
  const szoveg = megjegyzes || ''
  if (/^Szervezés: .*$/m.test(szoveg)) {
    return szoveg.replace(/^Szervezés: .*$/m, sor)
  }
  return szoveg ? `${szoveg}\n${sor}` : sor
}

// ── Sablon-felismerés a program címéből ──────────────────────────────────────

/**
 * Név-minta alapú sablon-felismerés — kézzel beírt címekre is működik.
 * A lelkészi jelentés javaslat-motorja is EZT importálja: a szignatúra
 * (`cim: string` → `'vbh' | 'fit7' | 'imahet' | null`) rögzített kontraktus.
 */
export function sablonFelismeres(cim: string): 'vbh' | 'fit7' | 'imahet' | null {
  const c = (cim || '').toLowerCase()
  if (c.includes('bibliahét')) return 'vbh'
  if (c.includes('fit7')) return 'fit7'
  if (c.includes('imahét') || c.includes('imahet')) return 'imahet'
  return null
}

// ── Dátum-segédek (időzóna-biztos: UTC-alapú naptári számolás) ───────────────

const ISO_DATUM = /^(\d{4})-(\d{2})-(\d{2})$/

function napPlusz(iso: string, napok: number): string {
  const m = ISO_DATUM.exec(iso)
  if (!m) return ''
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + napok))
  return d.toISOString().slice(0, 10)
}

/**
 * A sablon záró dátuma a kezdő dátumból: datum + (napok − 1) nap.
 * Érvénytelen kezdő dátumra üres sztringet ad (a mező üresen marad).
 */
export function sablonZaroDatum(datum: string, napok: number): string {
  return napPlusz(datum, Math.max(1, napok) - 1)
}

/**
 * A kezdő→záró dátum közti napok listája (YYYY-MM-DD), legfeljebb `max` darab
 * — az Imahét napi vendéglelkész-beosztásának sorai. Érvénytelen vagy fordított
 * tartományra üres lista.
 */
export function napokListaja(datum: string, datumVege: string, max = 9): string[] {
  if (!ISO_DATUM.test(datum) || !ISO_DATUM.test(datumVege) || datumVege < datum) return []
  const napok: string[] = []
  let aktualis = datum
  while (aktualis && aktualis <= datumVege && napok.length < max) {
    napok.push(aktualis)
    aktualis = napPlusz(aktualis, 1)
  }
  return napok
}
