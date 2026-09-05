/**
 * PROGRAM ⇄ NAPTÁRI ÉV METSZETE (2026-09-05, cal-print-11 — P3-utómunka).
 *
 * ⛔ MI VOLT A HIBA: a `getProgramsForYear` év-szűrője a KEZDŐ napot nézte
 *    (`datum` az év első és utolsó napja között). Az előző év végén kezdődő,
 *    NEM ismétlődő, többnapos program (pl. szilveszteri ifjúsági tábor:
 *    dec. 30. – jan. 2.) így az új évben SEHOL nem volt — sem a csempén, sem
 *    az éves programterven —, pedig jan. 1–2-án zajlik. Az ismétlődő
 *    sorozatokat egy külön, 5 évre visszanéző lekérdezés hozta; a többnapos
 *    EGYSZERI programot semmi.
 *
 * A HELYES SZABÁLY: a program akkor tartozik az évhez, ha az INTERVALLUMA
 * metszi az évet — a kezdő nap legfeljebb az év utolsó napja, ÉS a záró nap
 * (ha nincs záró nap: a kezdő nap) legalább az év első napja.
 *
 * ⚠️ EZ A FÁJL DIREKTÍVA-MENTES (se 'use server', se 'use client'): a
 *    szerver-akció innen veszi a PostgREST-szűrő ALAKJÁT, az őrszem
 *    (selftest-naptar-retegek.mjs) pedig a JS-predikátumot futtatja ugyanarra
 *    a szabályra — EGY igazságforrás, két alak. A két alak egyenértékű: ha a
 *    `datum_vege` NULL, a PostgREST `or` első ága NULL → a `datum` dönt,
 *    pontosan úgy, ahogy `programZaroNapja` a kezdő napra esik vissza.
 */

export interface ProgramIntervallum {
  /** 'YYYY-MM-DD' */
  datum: string
  /** 'YYYY-MM-DD' vagy üres — többnapos programnál az utolsó nap. */
  datum_vege?: string | null
}

/** Az év első és utolsó napja 'YYYY-MM-DD' alakban (szöveges összehasonlításhoz). */
export function evHatarai(ev: number): { elso: string; utolso: string } {
  return { elso: `${ev}-01-01`, utolso: `${ev}-12-31` }
}

/**
 * A program tényleges záró napja: a `datum_vege`, ha a kezdő nap UTÁN van;
 * különben a kezdő nap (egynapos program, vagy hibás — kezdő előtti — záró nap).
 */
export function programZaroNapja(p: ProgramIntervallum): string {
  return p.datum_vege && p.datum_vege > p.datum ? p.datum_vege : p.datum
}

/** Metszi-e a program intervalluma a naptári évet. */
export function programMetsziEvet(p: ProgramIntervallum, ev: number): boolean {
  const { elso, utolso } = evHatarai(ev)
  return p.datum <= utolso && programZaroNapja(p) >= elso
}

/**
 * UGYANEZ a szabály PostgREST-szűrő alakban a `getProgramsForYear` számára:
 *   .lte('datum', datumLegfeljebb)   — a kezdő nap legfeljebb az év vége
 *   .or(vagySzuro)                   — a záró VAGY a kezdő nap legalább az év eleje
 */
export function programEvMetszetSzuro(ev: number): { datumLegfeljebb: string; vagySzuro: string } {
  const { elso, utolso } = evHatarai(ev)
  return { datumLegfeljebb: utolso, vagySzuro: `datum_vege.gte.${elso},datum.gte.${elso}` }
}
