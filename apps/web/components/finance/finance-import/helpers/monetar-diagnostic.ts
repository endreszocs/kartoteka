/**
 * Monetar fül diagnosztika — kasszaegyenleg-ellenőrzés.
 *
 * A hivatalos EREK könyvelési Excel "Monetar" füle a gyülekezet év végi
 * készpénz-leltárát mutatja két formátumban:
 *
 *   - Sor 1: "Kasszaegyenleg: " | <RON érték> | <különbség>
 *     pl. "Kasszaegyenleg:" | 6463.74 | 0.26
 *   - Sor 2: "Készpénzegyenleg összesen:" | <címlet-alapú érték>
 *     pl. "Készpénzegyenleg összesen:" | 6464
 *   - Sor 3: header ("Pénznemek" | "Darabszám" | "Összeg")
 *   - Sor 4-15: címletek (500, 200, 100, 50, 20, 10, 5, 1, 0.5, 0.1, 0.05, 0.01)
 *
 * A 6463.74 a Kassza fülön kalkulált egyenleg (nyitó + bevétel - kiadás), a
 * 6464 pedig a tényleges címlet-darabszám-szorzat. A 0.26 RON eltérés a
 * pénztár-naplóban valós eltérést jelez (pl. 0.50 lej-es érme nem találása).
 *
 * A v1-ben **nem írunk** a `monetar` táblába — csak diagnosztikai panelt
 * mutatunk az import-wizard előnézet-lépésén.
 *
 * 2026-05-02 (Fázis 2): teljes parser-implementáció.
 */

import type { ParsedSheet } from '@/lib/import/excel-parser'

export interface MonetarDiagnostic {
  /** Monetar fülön szereplő "Kasszaegyenleg" érték (vagy null) */
  monetarKasszaEgyenleg: number | null
  /** Címlet-alapú számolt összeg (Excel "Készpénzegyenleg összesen" érték) */
  cimletAlapuOsszeg: number | null
  /** A Kassza fülből kalkulált záró-egyenleg (nyitó + bev - kia) */
  kalkulaltZaroEgyenleg: number
  /** monetarKasszaEgyenleg - kalkulaltZaroEgyenleg (előjeles), vagy null */
  elteresKasszaval: number | null
  /** monetarKasszaEgyenleg - cimletAlapuOsszeg (Monetar belső eltérés) */
  elteresCimlettel: number | null
  /** Címletenkénti felbontás */
  cimletek: Array<{ ertek: number; darabszam: number; osszeg: number }>
  /** Pasztorális hangnemű figyelmeztetések */
  warnings: string[]
}

/** ±1 banán a kerekítéshez (egy fillér) */
const TOLERANCE_RON = 0.01

/**
 * Diagnosztikai jelentés a Monetar fül és a Kassza-kalkuláció eltéréséről.
 */
export function diagnoseMonetar(
  monetarSheet: ParsedSheet | null,
  kasszaTotalIncome: number,
  kasszaTotalExpense: number,
  nyitoEgyenleg: number,
): MonetarDiagnostic {
  const kalkulaltZaroEgyenleg = nyitoEgyenleg + kasszaTotalIncome - kasszaTotalExpense

  if (!monetarSheet) {
    return {
      monetarKasszaEgyenleg: null,
      cimletAlapuOsszeg: null,
      kalkulaltZaroEgyenleg,
      elteresKasszaval: null,
      elteresCimlettel: null,
      cimletek: [],
      warnings: [
        'A Monetar fül nincs a fájlban — nem tudjuk ellenőrizni az év végi egyenleget.',
      ],
    }
  }

  const warnings: string[] = []

  // A `transformSheet` után a sorok már `_dbColumn → érték` map-ek, de a
  // Monetar fül szabálytalan — nincsenek értelmes fejlécek a 0-1. sorban.
  // Ezért közvetlenül a `monetarSheet.rows` indexei alapján olvasunk.
  // A ParsedSheet `rows` egy `Array<Record<string, ...>>`, de a Monetar fülön
  // a fejléc-detekció valszínűleg eltéveszt. Ezért a parser inputja
  // valamelyest "nyers" lesz — robosztus megközelítéssel keresünk.
  const monetarKasszaEgyenleg = findKasszaEgyenleg(monetarSheet)
  const cimletAlapuOsszeg = findCimletAlapuOsszeg(monetarSheet)
  const cimletek = parseCimletRows(monetarSheet)

  // Címlet-szorzás-ellenőrzés
  const sumFromCimletek = cimletek.reduce((s, c) => s + c.osszeg, 0)
  if (
    cimletAlapuOsszeg !== null &&
    Math.abs(cimletAlapuOsszeg - sumFromCimletek) > TOLERANCE_RON
  ) {
    warnings.push(
      `A Monetar fülön a "Készpénzegyenleg összesen" (${cimletAlapuOsszeg.toFixed(2)} RON) nem egyezik a címlet-soros szorzatok összegével (${sumFromCimletek.toFixed(2)} RON).`,
    )
  }

  // Eltérések
  let elteresKasszaval: number | null = null
  if (monetarKasszaEgyenleg !== null) {
    elteresKasszaval = round2(monetarKasszaEgyenleg - kalkulaltZaroEgyenleg)
    if (Math.abs(elteresKasszaval) > TOLERANCE_RON) {
      warnings.push(
        `A Monetar fülön szereplő kasszaegyenleg (${monetarKasszaEgyenleg.toFixed(2)} RON) ${elteresKasszaval > 0 ? 'nagyobb' : 'kisebb'} ${Math.abs(elteresKasszaval).toFixed(2)} RON-nal a Kassza-fülből kalkulált záró-egyenlegnél (${kalkulaltZaroEgyenleg.toFixed(2)} RON).`,
      )
    }
  } else {
    warnings.push(
      'Nem találom a Monetar fülön a "Kasszaegyenleg" sort — kihagyjuk a kassza-egyezés ellenőrzést.',
    )
  }

  let elteresCimlettel: number | null = null
  if (monetarKasszaEgyenleg !== null && cimletAlapuOsszeg !== null) {
    elteresCimlettel = round2(monetarKasszaEgyenleg - cimletAlapuOsszeg)
    if (Math.abs(elteresCimlettel) > TOLERANCE_RON) {
      warnings.push(
        `A Monetar fülön belül eltérés van a kasszaegyenleg (${monetarKasszaEgyenleg.toFixed(2)} RON) és a címlet-alapú összeg (${cimletAlapuOsszeg.toFixed(2)} RON) között: ${elteresCimlettel.toFixed(2)} RON.`,
      )
    }
  }

  return {
    monetarKasszaEgyenleg,
    cimletAlapuOsszeg,
    kalkulaltZaroEgyenleg: round2(kalkulaltZaroEgyenleg),
    elteresKasszaval,
    elteresCimlettel,
    cimletek,
    warnings,
  }
}

/**
 * A Monetar fül "Kasszaegyenleg:" sorából kiolvassa a számértéket.
 * Bárhol állhat a sorban — a parser minden sort végigfut.
 */
function findKasszaEgyenleg(sheet: ParsedSheet): number | null {
  for (const row of sheet.rows) {
    const values = Object.values(row)
    const hasLabel = values.some(
      (v) => typeof v === 'string' && /Kasszaegyenleg/i.test(v),
    )
    if (hasLabel) {
      // Az első nem-null szám a sorban
      const num = values.find((v) => typeof v === 'number' && Number.isFinite(v))
      if (typeof num === 'number') return num
    }
  }
  return null
}

/**
 * A Monetar fül "Készpénzegyenleg összesen:" sorából kiolvassa a számértéket.
 */
function findCimletAlapuOsszeg(sheet: ParsedSheet): number | null {
  for (const row of sheet.rows) {
    const values = Object.values(row)
    const hasLabel = values.some(
      (v) => typeof v === 'string' && /Készpénzegyenleg/i.test(v),
    )
    if (hasLabel) {
      const num = values.find((v) => typeof v === 'number' && Number.isFinite(v))
      if (typeof num === 'number') return num
    }
  }
  return null
}

/**
 * Címlet-sorok kigyűjtése: { érték, darabszám, összeg }.
 */
function parseCimletRows(
  sheet: ParsedSheet,
): Array<{ ertek: number; darabszam: number; osszeg: number }> {
  const result: Array<{ ertek: number; darabszam: number; osszeg: number }> = []
  for (const row of sheet.rows) {
    const values = Object.values(row).filter((v): v is number =>
      typeof v === 'number' && Number.isFinite(v),
    )
    // Egy címlet-sor: 1, 2 vagy 3 szám (érték + opcionális darabszám + összeg)
    if (values.length >= 2 && values.length <= 3) {
      const ertek = values[0]
      // Csak az ismert címletek
      if ([500, 200, 100, 50, 20, 10, 5, 1, 0.5, 0.1, 0.05, 0.01].includes(ertek)) {
        let darabszam = 0
        let osszeg = 0
        if (values.length === 3) {
          darabszam = values[1]
          osszeg = values[2]
        } else if (values.length === 2) {
          // pl. "500 | 0" = nincs 500-as bankjegy
          osszeg = values[1]
          darabszam = osszeg / ertek
        }
        result.push({ ertek, darabszam, osszeg })
      }
    }
  }
  return result
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/* ───────────────────────────────────────────────────────────────────────
 * @testdata — manuális smoke test (Fázis 2)
 *
 * A 2025-ös Adatok_2025.xlsx Monetar lapján:
 *   monetarKasszaEgyenleg = 6463.74 (R1[3])
 *   cimletAlapuOsszeg = 6464 (R2[3])
 *   címletek: 500×0, 200×7, 100×25, 50×19, 20×3, 10×116, 5×62, 1×84, 0.5×0, 0.1×0, 0.05×0, 0.01×0
 *
 * Ha nyitóEgyenleg=12519.86, totalIncome=50000, totalExpense=56056.12:
 *   kalkulaltZaroEgyenleg = 12519.86 + 50000 - 56056.12 = 6463.74
 *   elteresKasszaval = 0.00 → nincs warning
 *   elteresCimlettel = 6463.74 - 6464 = -0.26 → warning ("0.26 RON kisebb")
 * ─────────────────────────────────────────────────────────────────────── */
