/**
 * BELSŐ MOZGÁS — kanonikus kódok és irány→kódpár leképezés (2026-08-27).
 *
 * SZÁNDÉKOSAN IMPORT NÉLKÜLI, tiszta modul: így önállóan fordítható és
 * FUTTATHATÓ teszttel bizonyítható (scripts/selftest-belso-mozgas-kodpar.mjs),
 * nem csak szövegkereséssel.
 *
 * ── MIÉRT KELLETT (élesben elsülő adathiba) ───────────────────────────────
 * A banki import belső mozgás ága a varázslótól kapott EGYETLEN `categoryId`-t
 * írta a pár MINDKÉT oldalára: egyszer `id_befizetescel`-ként, egyszer
 * `id_kiadascel`-ként. Ez KÉT KÜLÖN TÁBLA, KÉT KÜLÖN azonosító-térrel.
 * Ráadásul a varázsló belső mozgásnál MINDIG a kiadás-listát adja, tehát a
 * kapott szám egy `kiadascel.id` — a bevétel-oldal FK-jába írva vagy hibára
 * fut, vagy NÉMÁN teljesen más befizetési célra mutat.
 *
 * ── A LEKÉPEZÉS HELYESSÉGE — három független forrásból igazolva ────────────
 * 1. A hivatalos EREK Excel szemantikája (Adatok_2025.xlsx, Hibak katalógus):
 *      400.01 = „Készpénzletétel a(z) A számlára"   → Kassza lap KIADÁS
 *      301.01 = „Készpénzletétel a kasszából - A"   → A lap BEVÉTEL
 *      300.01 = „Készpénzfelvétel a(z) A számláról" → Kassza lap BEVÉTEL
 *      401.01 = „Készpénzfelvétel a kasszába - A"   → A lap KIADÁS
 * 2. Az ÉLŐ junction-táblák (2026-08-27-i mérés): befizetescel 300.01→183,
 *    301.01→181, 402.02→185; kiadascel 400.01→80, 401.01→81, 402.02→85.
 *    Mind a hat kód feloldható, tehát egyik irány sem marad cél nélkül.
 * 3. A kézi rögzítő (actions.ts saveInternalTransfer) BETŰRE ugyanezt a
 *    párosítást használja: letételnél 301.01/400.01, felvételnél 300.01/401.01.
 */

/** Az app kanonikus belső-mozgás kódjai. */
export const BELSO_MOZGAS_KANONIKUS_KODOK = [
  '300.01',
  '301.01',
  '400.01',
  '401.01',
  '402.02',
] as const

export type BelsoMozgasKodpar = { bevKod: string; kiaKod: string }

/**
 * A belső mozgás irányához tartozó kanonikus kódpár.
 *
 * @param isKasszaTarget  a másik oldal a KASSZA (true) vagy egy másik BANK (false)
 * @param isBankToKassza  a pénz a bankból MEGY (true) vagy a bankba ÉRKEZIK (false)
 */
export function belsoMozgasKodpar(
  isKasszaTarget: boolean,
  isBankToKassza: boolean,
): BelsoMozgasKodpar {
  // Bank ↔ bank: az app kanonikus kódja egyetlen 402.02, mindkét oldalon.
  // (Az Excel ezt irányonként KÉT külön néven tartja — a leképezés az
  //  Excel-export határán történik, nem a DB-ben.)
  if (!isKasszaTarget) return { bevKod: '402.02', kiaKod: '402.02' }
  // Bankból a kasszába (FELVÉT): a kassza KAP (300.01), a bank AD (401.01).
  if (isBankToKassza) return { bevKod: '300.01', kiaKod: '401.01' }
  // A kasszából a bankba (LETÉT): a bank KAP (301.01), a kassza AD (400.01).
  return { bevKod: '301.01', kiaKod: '400.01' }
}
