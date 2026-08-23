/**
 * print-loading-core — a nyomtatási központok betöltés-állapotának TISZTA magja
 * (2026-08-22, észrevételek 8. pont).
 *
 * ─── MIÉRT KÜLÖN FÁJL ────────────────────────────────────────────────────────
 *
 * A `BudgetPrintDialogBody` és a `FinancePrintDialogBody` eddig KÉTÁLLAPOTÚ
 * volt: `loading ? 'Adatok betöltése…' : semmi`. Ebből a lelkész két, EGÉSZEN
 * MÁS helyzetet nem tudott megkülönböztetni:
 *   · a betöltés SIKERÜLT, de az évhez nincs egyetlen költségvetési sor sem
 *     (a nyomtatvány elkészül, minden terv-oszlopa nulla) — és
 *   · a betöltés HIBÁRA futott (a nyomtatvány szintén nullákkal készülne, csak
 *     itt a nullák NEM a valóságot tükrözik).
 * Mindkettőnél ugyanaz látszott: a felirat eltűnt, a gomb aktív maradt, és egy
 * ÜRES terv-oszlopú, mégis aláírható hivatalos ívet lehetett kinyomtatni.
 *
 * Ez a modul IMPORT-MENTES és React-mentes: a `scripts/selftest-print-betoltes.mjs`
 * őrszem közvetlenül transpile-olja és teszteli (a projekt selftest-mintája
 * szerint — tiszta magot tesztelünk, nem render-fát).
 *
 * ⚠️ A modul a NYOMTATVÁNY TARTALMÁHOZ nem nyúl: kizárólag a bal panel
 *    visszajelzését és a gombok fail-closed tiltását vezeti le.
 */

/** A betöltés négy ága. A `tolt` és a `hiba` egyaránt TILTJA a nyomtatást. */
export type PrintBetoltesAllapot =
  | { fazis: 'tolt' }
  | { fazis: 'kesz'; darab: number }
  | { fazis: 'ures' }
  | { fazis: 'hiba'; uzenet: string }

/** A betöltő callback-ek közös eredmény-alakja (`{ data?, error? }`). */
export interface PrintBetoltesEredmeny<T> {
  data?: T[] | null
  error?: string | null
}

/** Induló állapot — minden betöltés ezzel kezdődik. */
export const BETOLTES_TOLT: PrintBetoltesAllapot = { fazis: 'tolt' }

/** Ha a hiba nem hordoz üzenetet, ez megy a felületre (soha nem üres string). */
export const ISMERETLEN_BETOLTES_HIBA = 'A betöltés váratlan hibával állt le.'

/**
 * A betöltő callback eredményéből NÉGYÁGÚ állapotot derivál.
 *
 * Szándékosan `null`/`undefined`-tűrő: egy hanyag wrapper `undefined`-et is
 * visszaadhat, és ilyenkor sem eshetünk vissza „kész, 0 sor"-ra — az ugyanaz a
 * néma nulla lenne, ami ellen az egész javítás készült.
 */
export function derivalBetoltesAllapot<T>(
  res: PrintBetoltesEredmeny<T> | null | undefined,
): PrintBetoltesAllapot {
  if (res == null) return { fazis: 'hiba', uzenet: ISMERETLEN_BETOLTES_HIBA }
  const hiba = res.error == null ? '' : String(res.error).trim()
  if (hiba.length > 0) return { fazis: 'hiba', uzenet: hiba }
  const darab = Array.isArray(res.data) ? res.data.length : 0
  return darab === 0 ? { fazis: 'ures' } : { fazis: 'kesz', darab }
}

/**
 * Elutasított promise (`.catch`) → hiba-állapot. A `.then()` mellé KÖTELEZŐ
 * `.catch()`: enélkül egy dobó wrappernél a „tölt" állapot ÖRÖKRE bent ragad,
 * és a felirat sosem tűnik el (ez volt a `worklog`/`voter` dialógusok tünete).
 */
export function hibaAllapotbol(err: unknown): { fazis: 'hiba'; uzenet: string } {
  if (err instanceof Error && err.message.trim().length > 0) {
    return { fazis: 'hiba', uzenet: err.message.trim() }
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return { fazis: 'hiba', uzenet: err.trim() }
  }
  return { fazis: 'hiba', uzenet: ISMERETLEN_BETOLTES_HIBA }
}

/**
 * FAIL-CLOSED gomb-tiltás. A régi kód CSAK a töltést fogta (`disabled={loading}`),
 * a hibát nem — hibás betöltés után tehát ki lehetett nyomtatni egy ÜRES
 * terv-oszlopú, aláírható hivatalos ívet. Az `ures` NEM tilt: az valós,
 * ismert állapot (az évhez tényleg nincs terv), és a papír őszinte lesz.
 */
export function nyomtatasTiltva(allapot: PrintBetoltesAllapot): boolean {
  return allapot.fazis === 'tolt' || allapot.fazis === 'hiba'
}

/** Az `ures` ág magyarázata — a nyomtatvány elkészül, de nullákkal. */
export function uresBetoltesUzenet(ev: number): string {
  return (
    `A(z) ${ev}. évhez még nincs rögzített költségvetési sor. ` +
    'A nyomtatvány elkészül, de minden terv-oszlopa nulla lesz.'
  )
}

/** A bal panel egysoros visszajelzése — mind a négy ágra. */
export function budgetBetoltesUzenet(allapot: PrintBetoltesAllapot, ev: number): string {
  switch (allapot.fazis) {
    case 'tolt':
      return 'Adatok betöltése...'
    case 'kesz':
      return `Betöltve: ${allapot.darab} költségvetési sor (${ev})`
    case 'ures':
      return uresBetoltesUzenet(ev)
    case 'hiba':
      return `A költségvetési sorok betöltése nem sikerült: ${allapot.uzenet}`
  }
}
