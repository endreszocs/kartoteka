/**
 * Pénzügyi tábla → hivatalos Excel-export (Adatok_2025.xlsx oszloprend).
 *
 * A Kassza / Bank / Tranzakciók fülek a megjelenített (szűrt) sorokat ebbe a
 * KÖZÖS, hivatalos oszloprendbe képezik, majd a platform-réteg (web: SheetJS,
 * desktop: SheetJS) tölti le `.xlsx`-ként. A cél: az export **újraimportálható**
 * legyen — ezért az oszlopok 1:1 megfelelnek az `Adatok_2025.xlsx` banki/kassza
 * lapjainak fejlécével (lásd `A`–`F` és `Kassza` lap r4 sora):
 *
 *   Dátum | Iratszám | Irattip. | Név |
 *   Bev. - Összeg | Bevétel - Költ.vet. név |
 *   Kiad. - Összeg | Kiadás - költ.vet. név | Megjegyzés
 *
 * Tiszta függvény — NEM importál platform-API-t (web + desktop egyaránt).
 *
 * ⚠️ ISMERT KORLÁT (2026-08-27, mérve) — BELSŐ MOZGÁS SOROK ÚJRAIMPORTJA:
 * A `celNev` a rendszer GENERIKUS kategórianeve (pl. „Készpénzletétel a kasszáról
 * a banki számlára"). A hivatalos Excel viszont SZÁMLAFÜGGŐ nevet vár
 * („Készpénzletétel a(z) A számlára"), és NÉV szerint keresi ki a kódot
 * (`VLOOKUP(I&K, fi, 2, FALSE)`). Egy visszaimportált belső-mozgás sor ezért a
 * kód-oszlopban `#N/A`-t adna — LÁTHATÓ hiba, nem néma, de kézi javítást igényel.
 *
 * MIÉRT NINCS ITT MEGOLDVA: a helyes névhez a bankszámla → Excel BETŰ-LAP (A–T)
 * párosítás kell, amit maga a mag is külön, megerősített lépésben old fel
 * (`packages/core/src/finance/excel/row-builder.ts` + a 840 tételes
 * `belso-mozgas-nevek.ts`). Ez a modul viszont SZÁNDÉKOSAN nem importál a
 * core-ból (platform-függetlenség). A teljes megoldás tehát a betű-párosítás
 * kiterjesztése ide — külön kör.
 *
 * ADDIG IS: a Kassza/Bank fül a belső mozgás sorokat a Megjegyzés oszlopban
 * megjelöli („Belső mozgás — párosítva" / „Várakozik…"), tehát az exportban
 * felismerhetők.

/** A hivatalos Adatok_2025.xlsx oszlop-fejléce (kassza + banki lapok r4 sora). */
export const FINANCE_EXPORT_HEADERS = [
  'Dátum',
  'Iratszám',
  'Irattip.',
  'Név',
  'Bev. - Összeg',
  'Bevétel - Költ.vet. név',
  'Kiad. - Összeg',
  'Kiadás - költ.vet. név',
  'Megjegyzés',
] as const

/** Egy exportálandó sor — a fülek a megjelenített soraikat erre képezik. */
export interface FinanceExportLine {
  datum: string
  iratszam: string
  irattipus: string
  /** Partner (bevételnél a forrás, kiadásnál az átvevő). */
  nev: string
  type: 'income' | 'expense'
  osszeg: number
  /** Költségvetési cél (jogcím) neve. */
  celNev: string
  megjegyzes: string
}

/** ISO/timestamp dátum → yyyy-mm-dd (a hivatalos fájl szöveges dátumot vár). */
function normDate(d: string): string {
  return String(d || '').slice(0, 10)
}

/**
 * Sorok → kétdimenziós tömb (aoa) a hivatalos oszloprendben.
 * A bevétel/kiadás összeg + cél a sor típusa szerint a megfelelő oszlopba kerül,
 * a másik oldal üresen marad (ahogy a hivatalos Excelben is).
 *
 * 2026-07-10 (ÚJ #2): az export MINDIG dátum szerint NÖVEKVŐ (év elejétől év
 * végéig), függetlenül a fül aktuális UI-rendezésétől — a hivatalos kasszakönyv
 * időrendjét követve. A bemenetet nem mutáljuk (másolaton rendezünk).
 */
export function buildFinanceExportAoa(
  lines: FinanceExportLine[],
): (string | number)[][] {
  const sorted = [...lines].sort((a, b) => normDate(a.datum).localeCompare(normDate(b.datum)))
  const body = sorted.map((l): (string | number)[] => {
    const isIncome = l.type === 'income'
    const amount = Number(l.osszeg) || 0
    return [
      normDate(l.datum),
      l.iratszam || '',
      l.irattipus || '',
      l.nev || '',
      isIncome ? amount : '',
      isIncome ? l.celNev || '' : '',
      !isIncome ? amount : '',
      !isIncome ? l.celNev || '' : '',
      l.megjegyzes || '',
    ]
  })
  return [[...FINANCE_EXPORT_HEADERS], ...body]
}

/** Fájlnév-barát időbélyeg nélküli alap (a hívó fűzi hozzá az évet/szűrőt). */
export function financeExportFilename(prefix: string, year: number | string): string {
  const safe = String(prefix).replace(/[^\p{L}\p{N}_-]+/gu, '_')
  return `${safe}_${year}.xlsx`
}
