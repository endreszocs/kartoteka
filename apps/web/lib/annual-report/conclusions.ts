/**
 * Következtetés-motor az Éves beszámoló prezentációjához (2026-08-10).
 *
 * A korábbi `buildConclusions()` (components/presentation/analytics.ts) legfeljebb
 * 8 fix „megállapítást" gyártott, mindig mindet, kategória-választás nélkül, és
 * egyetlen év adatából is trendet állított. Ez a modul a helyére lép:
 *
 *   - KATEGÓRIÁNKÉNT ad RÖVID TÁVÚ (mit jelent ez most, mi a teendő az idén) és
 *     HOSSZÚ TÁVÚ (mit vetít előre, mire készüljön a gyülekezet) következtetést;
 *   - minden mondat MEGALAPOZOTT: a `basis` mező kiírja, milyen számokból
 *     született (a vetítésen és a nyomtatásban is látszik);
 *   - ha nincs elég adat, NEM talál ki trendet: `dataQuality: 'insufficient'` és
 *     „ehhez több év adata szükséges" — az egy évből visszafelé extrapolálás
 *     (a régi modul hibája) itt kizárt;
 *   - tiszta (mellékhatás-mentes) függvények: ugyanaz az input mindig ugyanazt
 *     az outputot adja, így a Studio, a kivetítő és a nyomtatás is azonos szöveget lát.
 *
 * A felhasználó a Studio „Prezentáció kiegészítők" ablakában pipálja ki, mely
 * kategóriákhoz kér következtetést (lásd: PresentationOptions.conclusionCategories).
 */

import type { PresentationData } from '@/app/(dashboard)/eves-jelentes/prezentacio/actions'

// ──────────────────────────────────────────────────────────────
// Típusok
// ──────────────────────────────────────────────────────────────

export type ConclusionCategory =
  | 'letszam'
  | 'korosztaly'
  | 'anyakonyv'
  | 'alkalmak'
  | 'urvacsora'
  | 'katekezis'
  | 'programok'
  | 'penzugy'
  | 'egyhazfenntartas'
  | 'adomany'
  | 'leltar'
  | 'celok'

export type ConclusionHorizon = 'short' | 'long'

export type ConclusionDirection = 'up' | 'down' | 'stable' | 'unknown'

/** Az adat megbízhatósága — a dián jelzést kap, hogy a lelkész tudja, mit mond ki. */
export type ConclusionQuality = 'measured' | 'estimated' | 'insufficient'

export interface ConclusionItem {
  horizon: ConclusionHorizon
  direction: ConclusionDirection
  /** Rövid, vetíthető címsor. */
  headline: string
  /** 1-3 mondat pásztori hangvételű kifejtés. */
  detail: string
  /** Milyen számokra épül (mindig kiírjuk — ez teszi ellenőrizhetővé). */
  basis: string
  quality: ConclusionQuality
}

export interface CategoryConclusion {
  category: ConclusionCategory
  label: string
  pillar: 1 | 2 | 3
  /** Van-e legalább egy értelmes következtetés (a dia csak ezeket rendereli). */
  available: boolean
  /** Ha nincs (elég) adat: emberi magyarázat a Studio jelölőnégyzeténél. */
  note?: string
  short?: ConclusionItem
  long?: ConclusionItem
}

export interface ConclusionCategoryMeta {
  key: ConclusionCategory
  label: string
  pillar: 1 | 2 | 3
  /** Rövid magyarázat a jelölőnégyzet mellé. */
  hint: string
}

/** A kategória-katalógus — a Studio jelölőnégyzeteinek forrása is ez. */
export const CONCLUSION_CATEGORIES: ConclusionCategoryMeta[] = [
  { key: 'letszam', label: 'Taglétszám és közösség', pillar: 1, hint: 'Lélekszám, családok, be- és elköltözés.' },
  { key: 'korosztaly', label: 'Korosztályi összetétel', pillar: 1, hint: 'Korfa: gyermekek, középkorúak, idősek aránya.' },
  { key: 'anyakonyv', label: 'Anyakönyvi események', pillar: 1, hint: 'Keresztelés, konfirmáció, esketés, temetés — természetes szaporulat.' },
  { key: 'alkalmak', label: 'Istentiszteleti alkalmak és látogatottság', pillar: 2, hint: 'Alkalmak száma és átlagos jelenlét a munkanaplóból.' },
  { key: 'urvacsora', label: 'Úrvacsorával élők', pillar: 2, hint: 'Templomi és betegnél kiszolgáltatott úrvacsora.' },
  { key: 'katekezis', label: 'Katekézis, gyermek- és ifjúsági munka', pillar: 2, hint: 'Vallásórák, ifjúsági alkalmak, gyermek-jelenlét.' },
  { key: 'programok', label: 'Gyülekezeti programok', pillar: 2, hint: 'Tervezett programok száma és teljesülése.' },
  { key: 'penzugy', label: 'Pénzügyi egyensúly', pillar: 3, hint: 'Bevétel, kiadás, éves egyenleg.' },
  { key: 'egyhazfenntartas', label: 'Egyházfenntartói járulék', pillar: 3, hint: 'Fizetők aránya és a hátralékos kör.' },
  { key: 'adomany', label: 'Adományok és bevételszerkezet', pillar: 3, hint: 'Az adományjellegű bevételek aránya.' },
  { key: 'leltar', label: 'Leltár és egyházi vagyon', pillar: 3, hint: 'Nyilvántartott tételek és értékük.' },
  { key: 'celok', label: 'Célok teljesülése', pillar: 3, hint: 'A megadott számszerű célok és a tényadatok.' },
]

export const ALL_CONCLUSION_CATEGORIES: ConclusionCategory[] = CONCLUSION_CATEGORIES.map((c) => c.key)
export const ALL_CONCLUSION_HORIZONS: ConclusionHorizon[] = ['short', 'long']

// ──────────────────────────────────────────────────────────────
// Segédfüggvények — formázás, trend
// ──────────────────────────────────────────────────────────────

const NBSP = ' '

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('hu')
}
function fmtRon(n: number): string {
  return `${Math.round(n).toLocaleString('hu')}${NBSP}RON`
}
/** Százalék magyar tizedesvesszővel (a toFixed pontot adna). */
function fmtPct(n: number, digits = 0): string {
  return `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(digits).replace('.', ',')}%`
}
/** Előjel nélküli százalék — olyan mondatokba, ahol a szó hordozza az irányt
 *  („3,2%-kal fogy" és nem „−3,2%-kal fogy"). */
function fmtPctAbs(n: number, digits = 0): string {
  return `${Math.abs(n).toFixed(digits).replace('.', ',')}%`
}
function signed(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('hu')}`
}
/** Tizedes szám magyar vesszővel (a toFixed pontot adna: „0.4" → „0,4"). */
function fmtDec(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',')
}
function changePct(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/** Least-squares meredekség (x = év, y = érték). */
export function linearRegression(points: Array<{ x: number; y: number }>): { slope: number; intercept: number } {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0 }
  const sumX = points.reduce((s, d) => s + d.x, 0)
  const sumY = points.reduce((s, d) => s + d.y, 0)
  const sumXY = points.reduce((s, d) => s + d.x * d.y, 0)
  const sumX2 = points.reduce((s, d) => s + d.x * d.x, 0)
  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) return { slope: 0, intercept: sumY / n }
  const slope = (n * sumXY - sumX * sumY) / denominator
  return { slope, intercept: (sumY - slope * sumX) / n }
}

interface Trend {
  ok: boolean
  /** Hány év hordoz tényleges (nem nulla) adatot. */
  usableYears: number
  slope: number
  /** Éves átlagos változás a szint %-ában. */
  slopePct: number
  direction: ConclusionDirection
  firstYear: number
  lastYear: number
  firstValue: number
  lastValue: number
  totalChangePct: number | null
}

/**
 * Trend a nem-nulla évekből. LEGALÁBB 3 ilyen év kell — enélkül `ok:false`,
 * és a hívó „ehhez több év adata szükséges" mondatot ad vissza. (A régi
 * modul 1 mért év + 4 nulla évből is meredekséget számolt.)
 */
function trendOf(series: Array<{ year: number; value: number }>, threshold = 1.5): Trend {
  const usable = series.filter((p) => p.value !== 0)
  const empty: Trend = {
    ok: false, usableYears: usable.length, slope: 0, slopePct: 0, direction: 'unknown',
    firstYear: series[0]?.year ?? 0, lastYear: series[series.length - 1]?.year ?? 0,
    firstValue: 0, lastValue: 0, totalChangePct: null,
  }
  if (usable.length < 3) return empty
  const { slope } = linearRegression(usable.map((p) => ({ x: p.year, y: p.value })))
  const mean = usable.reduce((s, p) => s + p.value, 0) / usable.length
  const slopePct = mean !== 0 ? (slope / Math.abs(mean)) * 100 : 0
  const first = usable[0]
  const last = usable[usable.length - 1]
  return {
    ok: true,
    usableYears: usable.length,
    slope,
    slopePct,
    direction: slopePct > threshold ? 'up' : slopePct < -threshold ? 'down' : 'stable',
    firstYear: first.year,
    lastYear: last.year,
    firstValue: first.value,
    lastValue: last.value,
    totalChangePct: changePct(last.value, first.value),
  }
}

/** Egységes „nincs elég adat" hosszú távú elem. */
function insufficientLong(what: string, basis: string): ConclusionItem {
  return {
    horizon: 'long',
    direction: 'unknown',
    headline: 'Ehhez több év adata szükséges',
    detail: `${what} Egyetlen év alapján nem vonunk le hosszú távú következtetést — legalább három év rögzített adata kell hozzá. Ahogy évről évre gyűlnek a bejegyzések, ez a megállapítás magától megjelenik.`,
    basis,
    quality: 'insufficient',
  }
}

function meta(key: ConclusionCategory): ConclusionCategoryMeta {
  return CONCLUSION_CATEGORIES.find((c) => c.key === key)!
}

function none(key: ConclusionCategory, note: string): CategoryConclusion {
  const m = meta(key)
  return { category: key, label: m.label, pillar: m.pillar, available: false, note }
}

function pack(
  key: ConclusionCategory,
  short: ConclusionItem | undefined,
  long: ConclusionItem | undefined,
  note?: string,
): CategoryConclusion {
  const m = meta(key)
  return {
    category: key,
    label: m.label,
    pillar: m.pillar,
    available: !!(short || long),
    note,
    short,
    long,
  }
}

// ──────────────────────────────────────────────────────────────
// Kategória-építők
// ──────────────────────────────────────────────────────────────

function buildLetszam(d: PresentationData): CategoryConclusion {
  const yoy = d.members.yearOverYear
  if (!yoy.length || d.members.totalActive === 0) {
    return none('letszam', 'Nincs nyilvántartott (látható, élő) gyülekezeti tag — a lélekszám nem értelmezhető.')
  }
  const cur = yoy[yoy.length - 1]?.count ?? 0
  // Ha az előző évre 0-t „tudunk" (nincs adat, nem tényleges nulla), NEM
  // hasonlítunk — különben az egész létszám növekménynek látszana.
  const prevRaw = yoy.length >= 2 ? yoy[yoy.length - 2].count : null
  const prev = prevRaw && prevRaw > 0 ? prevRaw : null
  const diff = prev === null ? null : cur - prev
  const f = d.members.flowByYear[d.members.flowByYear.length - 1]
  const quality: ConclusionQuality = d.members.estimated ? 'estimated' : 'measured'
  const estNote = d.members.estimated
    ? ' A korábbi évek értéke a tagság-mozgás bejegyzéseiből visszaszámolt becslés.'
    : ''

  const short: ConclusionItem = {
    horizon: 'short',
    direction: diff === null ? 'unknown' : diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable',
    headline:
      diff === null
        ? `A gyülekezet lélekszáma ${fmtNum(cur)} fő`
        : diff > 0
          ? `Növekvő lélekszám (${signed(diff)} fő)`
          : diff < 0
            ? `Csökkenő lélekszám (${signed(diff)} fő)`
            : 'Változatlan lélekszám',
    detail:
      diff === null
        ? `A gyülekezet ${fmtNum(cur)} lelket tart nyilván, ${fmtNum(d.members.families)} háztartásban. Az idei teendő a nyilvántartás pontosítása: a be- és elköltözések rögzítése teszi majd összehasonlíthatóvá a következő évet.${estNote}`
        : diff > 0
          ? `A nyilvántartott lélekszám ${fmtNum(diff)} fővel nőtt, jelenleg ${fmtNum(cur)} fő ${fmtNum(d.members.families)} háztartásban. Érdemes az idén név szerint felkeresni a beköltözőket és bekapcsolni őket a közösség életébe, amíg friss a kapcsolat.${estNote}`
          : diff < 0
            ? `A nyilvántartott lélekszám ${fmtNum(Math.abs(diff))} fővel csökkent, jelenleg ${fmtNum(cur)} fő ${fmtNum(d.members.families)} háztartásban. Az idei legfontosabb teendő a fogyás okainak megkülönböztetése: a temetés más pásztori választ kíván, mint az elköltözés vagy az elhidegülés.${estNote}`
            : `A lélekszám nem változott az előző évhez képest: ${fmtNum(cur)} fő ${fmtNum(d.members.families)} háztartásban. A stabilitás jó alap — az idén a meglévő kapcsolatok elmélyítésére van tér.${estNote}`,
    basis:
      prev === null
        ? `${d.year}: ${fmtNum(cur)} fő · ${fmtNum(d.members.families)} háztartás`
        : `${d.year}: ${fmtNum(cur)} fő · ${d.year - 1}: ${fmtNum(prev)} fő · beköltözés ${fmtNum(f?.movedIn ?? 0)} / elköltözés ${fmtNum(f?.movedOut ?? 0)}`,
    quality,
  }

  const t = trendOf(yoy.map((p) => ({ year: p.year, value: p.count })))
  const long: ConclusionItem = !t.ok
    ? insufficientLong(
        'A lélekszám alakulásához csak töredékes év-adat áll rendelkezésre.',
        `Értékelhető évek: ${t.usableYears} (legalább 3 kell)`,
      )
    : {
        horizon: 'long',
        direction: t.direction,
        headline:
          t.direction === 'up'
            ? `Hosszú távon gyarapodó közösség (${fmtPct(t.slopePct, 1)}/év)`
            : t.direction === 'down'
              ? `Hosszú távon fogyó közösség (${fmtPct(t.slopePct, 1)}/év)`
              : 'Hosszú távon stabil lélekszám',
        detail:
          t.direction === 'up'
            ? `${t.firstYear} óta évi átlagban ${fmtPctAbs(t.slopePct, 1)}-kal nő a nyilvántartott lélekszám. Ha ez a tendencia tart, a gyülekezetnek a befogadás feltételeire érdemes készülnie: hittanos csoportok, ülőhely, gondozói körzetek újraosztása.${estNote}`
            : t.direction === 'down'
              ? `${t.firstYear} óta évi átlagban ${fmtPctAbs(t.slopePct, 1)}-kal fogy a nyilvántartott lélekszám (${fmtNum(t.firstValue)} → ${fmtNum(t.lastValue)} fő). Ez nem egyetlen év kérdése: hosszabb távon a szolgálati terhek, a fenntartható költségvetés és a körzetek beosztásának újragondolását vetíti előre. A missziói és pásztori jelenlét megerősítése ma a legfontosabb ellensúly.${estNote}`
              : `${t.firstYear} óta a lélekszám lényegében változatlan (${fmtNum(t.firstValue)} → ${fmtNum(t.lastValue)} fő). A közösség mérete kiszámítható, így hosszabb távra is tervezhető a szolgálat és a költségvetés.${estNote}`,
        basis: `${t.firstYear}: ${fmtNum(t.firstValue)} fő → ${t.lastYear}: ${fmtNum(t.lastValue)} fő${t.totalChangePct !== null ? ` (${fmtPct(t.totalChangePct, 1)})` : ''}`,
        quality,
      }

  return pack('letszam', short, long)
}

function buildKorosztaly(d: PresentationData): CategoryConclusion {
  const groups = d.members.ageGroups
  const known = groups.reduce((s, g) => s + g.count, 0)
  if (known === 0) {
    return none('korosztaly', 'Egyetlen tagnál sincs rögzített születési dátum — a korfa nem számolható.')
  }
  const [gyermek, fiatal, kozep, idos] = groups.map((g) => g.count)
  const share = (n: number) => (known > 0 ? (n / known) * 100 : 0)
  const gyermekPct = share(gyermek)
  const idosPct = share(idos)
  const coverage = d.members.totalActive > 0 ? (known / d.members.totalActive) * 100 : 0
  const coverageNote = coverage < 80
    ? ` A tagság ${fmtPct(100 - coverage)}-ánál hiányzik a születési dátum, ezért a kép hiányos — a nyilvántartás kiegészítése pontosítaná.`
    : ''

  const short: ConclusionItem = {
    horizon: 'short',
    direction: gyermekPct >= idosPct ? 'up' : 'down',
    headline:
      gyermekPct >= idosPct
        ? `Fiatalos korfa (0-18: ${fmtPct(gyermekPct)})`
        : `Idősödő korfa (66+: ${fmtPct(idosPct)})`,
    detail:
      gyermekPct >= idosPct
        ? `A ${d.year}. év végén ${fmtNum(gyermek)} gyermek és fiatalkorú (${fmtPct(gyermekPct)}) tartozik a gyülekezethez, míg ${fmtNum(idos)} a 66 év felettiek száma. Az idén ez a hittanos és ifjúsági szolgálat erősítését teszi indokolttá — ott van a legtöbb megszólítható lélek.${coverageNote}`
        : `A ${d.year}. év végén a tagság ${fmtPct(idosPct)}-a 66 év feletti (${fmtNum(idos)} fő), miközben ${fmtNum(gyermek)} a gyermek és fiatalkorú. Az idei teendő kettős: a beteg- és idősgondozás megszervezése, valamint a fiatal családok tudatos megszólítása.${coverageNote}`,
    basis: `0-18: ${fmtNum(gyermek)} · 19-40: ${fmtNum(fiatal)} · 41-65: ${fmtNum(kozep)} · 66+: ${fmtNum(idos)} (ismert születési dátum: ${fmtNum(known)} fő)`,
    quality: 'measured',
  }

  // Hosszú táv: a korfa önmagában előrevetítő — nem kell hozzá több év.
  const utanpotlasArany = idos > 0 ? gyermek / idos : gyermek > 0 ? Infinity : 0
  const long: ConclusionItem = {
    horizon: 'long',
    direction: utanpotlasArany >= 1 ? 'up' : utanpotlasArany >= 0.5 ? 'stable' : 'down',
    headline:
      utanpotlasArany >= 1
        ? 'Az utánpótlás fedezi a korosodást'
        : utanpotlasArany >= 0.5
          ? 'Szűkös, de meglévő utánpótlás'
          : 'Az utánpótlás elmarad a korosodástól',
    detail:
      utanpotlasArany >= 1
        ? `Minden 66 év feletti tagra ${utanpotlasArany === Infinity ? 'több' : fmtDec(utanpotlasArany)} gyermek/fiatal jut. Ha ez megmarad, a gyülekezet a következő évtizedben is meg tudja újítani önmagát — a hosszú távú feladat a fiatalok gyülekezetben tartása a konfirmáció után.`
        : utanpotlasArany >= 0.5
          ? `Minden 66 év feletti tagra ${fmtDec(utanpotlasArany)} gyermek/fiatal jut. Ez évtizedes távlatban lassú fogyást vetít előre; a konfirmáció utáni évek és a fiatal családok megtartása dönti el, hogy a mérleg melyik irányba billen.`
          : `Minden 66 év feletti tagra mindössze ${fmtDec(utanpotlasArany)} gyermek/fiatal jut. Ez a korfa a következő évtizedben a temetések számának emelkedését és a lélekszám fogyását vetíti előre. Hosszú távon érdemes már most készülni rá: a szolgálati és fenntartási terhek arányosítása, a szórvány-gondozás megszervezése és a fiatal családok felé nyitás nem halasztható.`,
    basis: `Gyermek/fiatal (0-18): ${fmtNum(gyermek)} · Idős (66+): ${fmtNum(idos)} · arány: ${utanpotlasArany === Infinity ? '—' : fmtDec(utanpotlasArany, 2)}`,
    quality: 'measured',
  }

  return pack('korosztaly', short, long)
}

function buildAnyakonyv(d: PresentationData): CategoryConclusion {
  const a = d.anyakonyv
  const osszes = a.keresztelo + a.konfirmacio + a.esketes + a.temetes
  const byYear = a.byYear
  const hadKorabban = byYear.some((y) => y.keresztelo + y.konfirmacio + y.esketes + y.temetes > 0)
  if (osszes === 0 && !hadKorabban) {
    return none('anyakonyv', 'Nincs rögzített anyakönyvi esemény sem a tárgyévben, sem a megelőző években.')
  }
  const netto = a.keresztelo - a.temetes

  const short: ConclusionItem = osszes === 0
    ? {
        horizon: 'short',
        direction: 'stable',
        headline: 'Esemény nélküli év az anyakönyvben',
        detail: `A ${d.year}. évben nem került bejegyzés az anyakönyvekbe. Ha volt szolgálat, amely lemaradt, érdemes még az idén pótolni — az anyakönyv a gyülekezet hivatalos emlékezete.`,
        basis: `Keresztelés 0 · Konfirmáció 0 · Esketés 0 · Temetés 0`,
        quality: 'measured',
      }
    : {
        horizon: 'short',
        direction: netto > 0 ? 'up' : netto < 0 ? 'down' : 'stable',
        headline:
          netto > 0
            ? `Természetes gyarapodás (${signed(netto)} fő)`
            : netto < 0
              ? `Természetes fogyás (${signed(netto)} fő)`
              : 'Egyensúlyban a keresztelés és a temetés',
        detail:
          netto > 0
            ? `A ${d.year}. évben ${fmtNum(a.keresztelo)} keresztelés mellett ${fmtNum(a.temetes)} temetés volt: a gyülekezet természetes úton gyarapodott. Az idei folytatás a megkeresztelt gyermekek családjainak kísérése, hogy a keresztelésből gyülekezeti kapcsolat legyen.`
            : netto < 0
              ? `A ${d.year}. évben ${fmtNum(a.keresztelo)} keresztelés mellett ${fmtNum(a.temetes)} temetés volt, így a gyülekezet természetes úton ${fmtNum(Math.abs(netto))} fővel fogyott. Ez a legtöbb erdélyi gyülekezet valósága; az idei teendő a gyászolók pásztori kísérése és a keresztelésre való hívogatás a fiatal családok körében.`
              : `A ${d.year}. évben a keresztelések és a temetések száma megegyezett (${fmtNum(a.keresztelo)}–${fmtNum(a.temetes)}). A közösség természetes úton se nem fogyott, se nem gyarapodott.`,
        basis: `Keresztelés ${fmtNum(a.keresztelo)} · Konfirmáció ${fmtNum(a.konfirmacio)} · Esketés ${fmtNum(a.esketes)} · Temetés ${fmtNum(a.temetes)}`,
        quality: 'measured',
      }

  const naturalSeries = byYear.map((y) => ({ year: y.year, value: y.keresztelo + y.temetes }))
  const t = trendOf(naturalSeries)
  const osszNetto = byYear.reduce((s, y) => s + (y.keresztelo - y.temetes), 0)
  const long: ConclusionItem = !t.ok
    ? insufficientLong(
        'Az anyakönyvi események több éves összevetéséhez kevés a rögzített év.',
        `Értékelhető évek: ${t.usableYears} (legalább 3 kell)`,
      )
    : {
        horizon: 'long',
        direction: osszNetto > 0 ? 'up' : osszNetto < 0 ? 'down' : 'stable',
        headline:
          osszNetto > 0
            ? `${byYear.length} év alatt ${signed(osszNetto)} fő természetes gyarapodás`
            : osszNetto < 0
              ? `${byYear.length} év alatt ${signed(osszNetto)} fő természetes fogyás`
              : `${byYear.length} év alatt egyensúlyban`,
        detail:
          osszNetto < 0
            ? `${byYear[0].year} és ${byYear[byYear.length - 1].year} között összesen ${fmtNum(byYear.reduce((s, y) => s + y.keresztelo, 0))} keresztelés és ${fmtNum(byYear.reduce((s, y) => s + y.temetes, 0))} temetés történt. A tartós különbség azt jelenti, hogy a gyülekezet önmagából nem pótolja a fogyást: hosszabb távon a beköltözők befogadása és a peremen élők visszahívása tartja fenn a közösséget. Érdemes ezzel számolni a lelkészi szolgálat és a fenntartás tervezésénél.`
            : osszNetto > 0
              ? `${byYear[0].year} és ${byYear[byYear.length - 1].year} között ${fmtNum(byYear.reduce((s, y) => s + y.keresztelo, 0))} keresztelés és ${fmtNum(byYear.reduce((s, y) => s + y.temetes, 0))} temetés történt. A tartósan pozitív mérleg a fiatal családok jelenlétét mutatja — hosszabb távon a gyermek- és ifjúsági szolgálat kapacitását érdemes ehhez igazítani.`
              : `${byYear[0].year} és ${byYear[byYear.length - 1].year} között a keresztelések és a temetések száma kiegyenlítette egymást. A közösség természetes utánpótlása épp fedezi a veszteséget — bármelyik irányba billen, azt korán észre lehet venni.`,
        basis: byYear.map((y) => `${y.year}: ${y.keresztelo}/${y.temetes}`).join(' · ') + ' (keresztelés/temetés)',
        quality: 'measured',
      }

  return pack('anyakonyv', short, long)
}

function buildAlkalmak(d: PresentationData): CategoryConclusion {
  const at = d.attendance
  if (!at.hasData || at.worshipOccasions === 0) {
    return none(
      'alkalmak',
      'A tárgyévre nincs munkanapló-bejegyzés istentiszteleti alkalomról — a látogatottság nem számolható.',
    )
  }
  const by = at.byYear
  const prev = by.length >= 2 ? by[by.length - 2] : null
  const delta = prev && prev.worshipAvg > 0 ? changePct(at.worshipAvg, prev.worshipAvg) : null
  const aranyLelekszam = d.members.totalAtYear > 0 ? (at.worshipAvg / d.members.totalAtYear) * 100 : null

  const short: ConclusionItem = {
    horizon: 'short',
    direction: delta === null ? 'unknown' : delta > 3 ? 'up' : delta < -3 ? 'down' : 'stable',
    headline:
      delta === null
        ? `Átlagosan ${fmtNum(at.worshipAvg)} fő alkalmanként`
        : delta > 3
          ? `Növekvő látogatottság (+${fmtPctAbs(delta)})`
          : delta < -3
            ? `Csökkenő látogatottság (${fmtPct(delta)})`
            : 'Kiegyensúlyozott látogatottság',
    detail: `A ${d.year}. évben ${fmtNum(at.worshipOccasions)} istentiszteleti alkalmon összesen ${fmtNum(at.worshipTotal)} jelenlévőt tartottunk számon, alkalmanként átlagosan ${fmtNum(at.worshipAvg)} főt${aranyLelekszam !== null ? `, ami a lélekszám ${fmtPct(aranyLelekszam)}-a` : ''}. ${
      delta === null
        ? 'Előző évi összevetés még nincs; az idei bejegyzések pontos vezetése teszi majd mérhetővé a változást.'
        : delta > 3
          ? 'A növekedésért hálát adhatunk — érdemes megfigyelni, mely alkalmak vonzottak többeket, és azokat tudatosan erősíteni.'
          : delta < -3
            ? 'A csökkenés okait érdemes a presbitériummal közösen átgondolni: időpont, hirdetés, ünnepi alkalmak rendje, illetve a hívogatás gyakorlata mind befolyásolja.'
            : 'A részvétel kiszámítható; ez jó alap arra, hogy az idén a mélységre — a bibliaórás és közösségi alkalmakra — kerüljön a hangsúly.'
    }`,
    basis: `${d.year}: ${fmtNum(at.worshipAvg)} fő/alkalom · ${fmtNum(at.worshipOccasions)} alkalom${prev ? ` · ${prev.year}: ${fmtNum(prev.worshipAvg)} fő/alkalom` : ''}`,
    quality: 'measured',
  }

  const t = trendOf(by.map((y) => ({ year: y.year, value: y.worshipAvg })))
  const long: ConclusionItem = !t.ok
    ? insufficientLong(
        'A látogatottság több éves trendjéhez kevés év munkanaplója van kitöltve.',
        `Értékelhető évek: ${t.usableYears} (legalább 3 kell)`,
      )
    : {
        horizon: 'long',
        direction: t.direction,
        headline:
          t.direction === 'up'
            ? `Évek óta erősödő jelenlét (${fmtPct(t.slopePct, 1)}/év)`
            : t.direction === 'down'
              ? `Évek óta lassuló jelenlét (${fmtPct(t.slopePct, 1)}/év)`
              : 'Évek óta állandó jelenlét',
        detail:
          t.direction === 'up'
            ? `${t.firstYear} óta ${fmtNum(t.firstValue)} főről ${fmtNum(t.lastValue)} főre emelkedett az átlagos alkalmankénti jelenlét. Ha ez folytatódik, hosszabb távon a templomtér, a kántori és a gyermekmegőrző szolgálat kapacitását érdemes hozzáigazítani.`
            : t.direction === 'down'
              ? `${t.firstYear} óta ${fmtNum(t.firstValue)} főről ${fmtNum(t.lastValue)} főre csökkent az átlagos alkalmankénti jelenlét. Ez a lassú apadás rendszerint nem egy döntésen múlik, hanem a korosodáson és a szokások változásán. Hosszú távon az alkalmak rendjének átgondolása (kevesebb, de erősebb alkalom), a szórvány elérése és a személyes hívogatás rendszeresítése ad rá választ.`
              : `${t.firstYear} óta az átlagos jelenlét lényegében változatlan (${fmtNum(t.firstValue)} → ${fmtNum(t.lastValue)} fő). A gyülekezet magja szilárd; hosszú távon ennek a magnak a szolgálatba állítása hozhat növekedést.`,
        basis: by.map((y) => `${y.year}: ${y.worshipAvg}`).join(' · ') + ' (fő/alkalom)',
        quality: 'measured',
      }

  return pack('alkalmak', short, long)
}

function buildUrvacsora(d: PresentationData): CategoryConclusion {
  const at = d.attendance
  if (!at.hasUvData) {
    return none(
      'urvacsora',
      'A munkanaplóban nincs kitöltve az úrvacsorázók rovata (templomban / betegnél), ezért erről nem születik következtetés.',
    )
  }
  if (at.uvTotal === 0) {
    return none('urvacsora', 'A tárgyévben nincs rögzített úrvacsorázó — az adat 0, így nincs mit értékelni.')
  }
  const by = at.byYear
  const prev = by.length >= 2 ? by[by.length - 2] : null
  const delta = prev && prev.uvTotal > 0 ? changePct(at.uvTotal, prev.uvTotal) : null
  const aranyTagsag = d.members.totalAtYear > 0 ? (at.uvTotal / d.members.totalAtYear) * 100 : null

  const short: ConclusionItem = {
    horizon: 'short',
    direction: delta === null ? 'unknown' : delta > 3 ? 'up' : delta < -3 ? 'down' : 'stable',
    headline: `${fmtNum(at.uvTotal)} úrvacsorával élő a ${d.year}. évben`,
    detail: `Az év folyamán ${fmtNum(at.uvTemplomban)} fő élt úrvacsorával a templomban, ${fmtNum(at.uvBetegnel)} fő pedig betegnél vagy háznál${aranyTagsag !== null ? `; ez a nyilvántartott lélekszám ${fmtPct(aranyTagsag)}-ának felel meg` : ''}. ${
      at.uvBetegnel === 0
        ? 'Betegnél idén nem történt kiszolgáltatás — érdemes végiggondolni, van-e olyan idős vagy beteg testvér, akihez az idén el kellene vinni az úrasztalát.'
        : 'A betegek és idősek házi úrvacsorája a gyülekezet gondoskodásának egyik legbeszédesebb jele; érdemes az idén is tervezetten, az ünnepek előtt megszervezni.'
    }`,
    basis: `Templomban ${fmtNum(at.uvTemplomban)} · betegnél ${fmtNum(at.uvBetegnel)} · összesen ${fmtNum(at.uvTotal)}${prev ? ` · ${prev.year}: ${fmtNum(prev.uvTotal)}` : ''}`,
    quality: 'measured',
  }

  const t = trendOf(by.map((y) => ({ year: y.year, value: y.uvTotal })))
  const long: ConclusionItem = !t.ok
    ? insufficientLong(
        'Az úrvacsorázók számának trendjéhez kevés év adata van rögzítve.',
        `Értékelhető évek: ${t.usableYears} (legalább 3 kell)`,
      )
    : {
        horizon: 'long',
        direction: t.direction,
        headline:
          t.direction === 'up'
            ? 'Növekvő úrvacsorai közösség'
            : t.direction === 'down'
              ? 'Fogyó úrvacsorai közösség'
              : 'Állandó úrvacsorai közösség',
        detail:
          t.direction === 'down'
            ? `${t.firstYear} óta ${fmtNum(t.firstValue)}-ről ${fmtNum(t.lastValue)}-re csökkent az úrvacsorával élők száma. Ez a szám a gyülekezet lelki magját méri, ezért a fogyása hosszú távon komolyabb jelzés, mint a látogatottságé. Az úrvacsorára készítő alkalmak (bűnbánati hét, előkészítő) megerősítése és a betegek rendszeres felkeresése ad rá választ.`
            : t.direction === 'up'
              ? `${t.firstYear} óta ${fmtNum(t.firstValue)}-ről ${fmtNum(t.lastValue)}-re nőtt az úrvacsorával élők száma. A gyülekezet lelki magja erősödik — hosszú távon erre a magra lehet építeni a szolgálatokat és a gondozói körzeteket.`
              : `${t.firstYear} óta az úrvacsorával élők száma nagyjából állandó (${fmtNum(t.firstValue)} → ${fmtNum(t.lastValue)}). A gyülekezet lelki magja kitartó; hosszú távon a következő nemzedék bevonása a kérdés.`,
        basis: by.map((y) => `${y.year}: ${y.uvTotal}`).join(' · '),
        quality: 'measured',
      }

  return pack('urvacsora', short, long)
}

function buildKatekezis(d: PresentationData): CategoryConclusion {
  const at = d.attendance
  const konf = d.anyakonyv.konfirmacio
  if (!at.hasData || (at.catechesisOccasions === 0 && at.childrenTotal === 0)) {
    return none(
      'katekezis',
      'Nincs rögzített katekétikai alkalom és gyermek-jelenlét a tárgyévben — a gyermek- és ifjúsági munkáról nem születik következtetés.',
    )
  }
  const by = at.byYear
  const prev = by.length >= 2 ? by[by.length - 2] : null
  const atlag = at.catechesisOccasions > 0 ? Math.round(at.catechesisTotal / at.catechesisOccasions) : 0

  const short: ConclusionItem = {
    horizon: 'short',
    direction:
      prev && prev.catechesisOccasions > 0
        ? at.catechesisOccasions > prev.catechesisOccasions
          ? 'up'
          : at.catechesisOccasions < prev.catechesisOccasions
            ? 'down'
            : 'stable'
        : 'unknown',
    headline: `${fmtNum(at.catechesisOccasions)} katekétikai alkalom, ${fmtNum(at.childrenTotal)} gyermek-jelenlét`,
    detail: `A ${d.year}. évben ${fmtNum(at.catechesisOccasions)} vallásórát, ifjúsági és gyermekalkalmat tartottunk, összesen ${fmtNum(at.catechesisTotal)} résztvevővel (átlag ${fmtNum(atlag)} fő), és ${fmtNum(konf)} fiatal konfirmált. ${
      at.catechesisOccasions === 0
        ? 'Katekétikai alkalom nem került a munkanaplóba — ha volt ilyen szolgálat, a bejegyzés pótlása fontos, mert ez a gyülekezet jövője.'
        : konf === 0
          ? 'Idén nem volt konfirmáció; érdemes még ebben az évben számba venni, hány gyermek éri el a konfirmációi kort, és személyesen hívni a családokat.'
          : 'A konfirmáltakat érdemes még az idén bekapcsolni egy ifjúsági közösségbe — a legtöbb gyülekezet itt veszíti el a fiatalokat.'
    }`,
    basis: `Alkalom ${fmtNum(at.catechesisOccasions)} · jelenlét ${fmtNum(at.catechesisTotal)} · gyermek-jelenlét ${fmtNum(at.childrenTotal)} · konfirmált ${fmtNum(konf)}`,
    quality: 'measured',
  }

  const t = trendOf(by.map((y) => ({ year: y.year, value: y.childrenTotal })))
  const long: ConclusionItem = !t.ok
    ? insufficientLong(
        'A gyermek- és ifjúsági jelenlét trendjéhez kevés év munkanaplója van kitöltve.',
        `Értékelhető évek: ${t.usableYears} (legalább 3 kell)`,
      )
    : {
        horizon: 'long',
        direction: t.direction,
        headline:
          t.direction === 'up'
            ? 'Erősödő gyermek- és ifjúsági jelenlét'
            : t.direction === 'down'
              ? 'Fogyó gyermek- és ifjúsági jelenlét'
              : 'Állandó gyermek- és ifjúsági jelenlét',
        detail:
          t.direction === 'down'
            ? `${t.firstYear} óta ${fmtNum(t.firstValue)}-ről ${fmtNum(t.lastValue)}-re esett a gyermekek éves jelenléte. A gyermekek száma tíz-tizenöt év múlva a gyülekezet felnőtt magját jelenti, ezért ez a legkorábbi előjelzője a jövőbeli fogyásnak. Hosszú távon a hittanoktatás iskolai jelenléte, a családok megszólítása és a nyári tábor rendszeressé tétele fordíthat rajta.`
            : t.direction === 'up'
              ? `${t.firstYear} óta ${fmtNum(t.firstValue)}-ről ${fmtNum(t.lastValue)}-re nőtt a gyermekek éves jelenléte. Ez a gyülekezet legbiztatóbb hosszú távú jele: érdemes már most gondoskodni a szolgálattevők utánpótlásáról és a gyermekek számára alkalmas térről.`
              : `${t.firstYear} óta a gyermekek éves jelenléte lényegében állandó (${fmtNum(t.firstValue)} → ${fmtNum(t.lastValue)}). A folytonosság megvan; hosszú távon a konfirmáció utáni korosztály megtartása a kulcskérdés.`,
        basis: by.map((y) => `${y.year}: ${y.childrenTotal}`).join(' · ') + ' (gyermek-jelenlét)',
        quality: 'measured',
      }

  return pack('katekezis', short, long)
}

function buildProgramok(d: PresentationData): CategoryConclusion {
  const p = d.programs
  const hadKorabban = p.byYear.some((y) => y.total > 0)
  if (p.total === 0 && !hadKorabban) {
    return none('programok', 'Nincs rögzített gyülekezeti program — a programtervező még nincs használatban.')
  }
  const rate = Math.round(p.completionRate)
  const short: ConclusionItem = p.total === 0
    ? {
        horizon: 'short',
        direction: 'unknown',
        headline: 'A tárgyévre nem került program a tervezőbe',
        detail: `Korábbi években voltak rögzített programok, a ${d.year}. évre azonban egy sem. Ha voltak alkalmak, a beírásuk az idén is segítené a tervezést és a beszámolót.`,
        basis: p.byYear.map((y) => `${y.year}: ${y.total}`).join(' · '),
        quality: 'measured',
      }
    : {
        horizon: 'short',
        direction: rate >= 80 ? 'up' : rate >= 50 ? 'stable' : 'down',
        headline: `${fmtNum(p.total)} program, ${rate}% teljesült`,
        detail: `A ${d.year}. évre ${fmtNum(p.total)} programot terveztünk, ebből ${fmtNum(p.completed)} valósult meg. ${
          rate >= 80
            ? 'A tervezés és a megvalósítás közel van egymáshoz — a gyülekezet tartja, amit vállal.'
            : rate >= 50
              ? 'A tervek fele-kétharmada valósult meg; az idén érdemes kevesebbet, de biztosabban vállalni, és a felelősöket előre megnevezni.'
              : 'A tervezett alkalmak nagyobb része elmaradt vagy nem lett lezárva a nyilvántartásban. Az idei első lépés annak tisztázása, hogy tervezési vagy adminisztrációs elmaradásról van-e szó.'
        }`,
        basis: `Tervezett ${fmtNum(p.total)} · megvalósult ${fmtNum(p.completed)} · arány ${rate}%`,
        quality: 'measured',
      }

  const t = trendOf(p.byYear.map((y) => ({ year: y.year, value: y.total })))
  const long: ConclusionItem = !t.ok
    ? insufficientLong(
        'A programok több éves összevetéséhez kevés év adata van rögzítve.',
        `Értékelhető évek: ${t.usableYears} (legalább 3 kell)`,
      )
    : {
        horizon: 'long',
        direction: t.direction,
        headline:
          t.direction === 'up'
            ? 'Bővülő programkínálat'
            : t.direction === 'down'
              ? 'Szűkülő programkínálat'
              : 'Állandó programkínálat',
        detail:
          t.direction === 'up'
            ? `${t.firstYear} óta évről évre több program kerül a tervbe (${fmtNum(t.firstValue)} → ${fmtNum(t.lastValue)}). A bővülés hosszú távon csak akkor tartható, ha a szolgálattevők köre is bővül — érdemes tudatosan bevonni és képezni önkénteseket.`
            : t.direction === 'down'
              ? `${t.firstYear} óta csökken a tervezett programok száma (${fmtNum(t.firstValue)} → ${fmtNum(t.lastValue)}). Ez lehet tudatos egyszerűsítés is; ha nem az, hosszú távon a közösségi élet szűkülését jelzi.`
              : `${t.firstYear} óta a programok száma állandó (${fmtNum(t.firstValue)} → ${fmtNum(t.lastValue)}). A gyülekezet éves ritmusa kialakult és kiszámítható.`,
        basis: p.byYear.map((y) => `${y.year}: ${y.total}`).join(' · '),
        quality: 'measured',
      }

  return pack('programok', short, long)
}

function buildPenzugy(d: PresentationData): CategoryConclusion {
  const f = d.finance
  const by = f.byYear
  if (f.totalIncome === 0 && f.totalExpense === 0) {
    return none('penzugy', 'A tárgyévre nincs rögzített bevétel és kiadás — a pénzügyi egyensúly nem értékelhető.')
  }
  const prev = by.length >= 2 ? by[by.length - 2] : null
  const incomeDelta = prev ? changePct(f.totalIncome, prev.income) : null
  const surplus = f.surplus
  const fedezet = f.totalExpense > 0 ? (f.totalIncome / f.totalExpense) * 100 : null

  const short: ConclusionItem = {
    horizon: 'short',
    direction: surplus > 0 ? 'up' : surplus < 0 ? 'down' : 'stable',
    headline:
      surplus > 0
        ? `Többlettel zárt év (${signed(Math.round(surplus))}${NBSP}RON)`
        : surplus < 0
          ? `Hiánnyal zárt év (${signed(Math.round(surplus))}${NBSP}RON)`
          : 'Nullszaldós év',
    detail: `A ${d.year}. évben ${fmtRon(f.totalIncome)} bevétel mellett ${fmtRon(f.totalExpense)} kiadás keletkezett${fedezet !== null ? `, a bevétel a kiadás ${fmtPct(fedezet)}-át fedezte` : ''}. ${
      surplus > 0
        ? 'A többlet a jövő évi vállalások fedezete; érdemes a presbitériummal megnevezni, mire különítjük el (javítás, tartalék, diakónia), hogy ne olvadjon el észrevétlenül.'
        : surplus < 0
          ? 'A hiányt a tartalék fedezte. Az idei teendő a nagyobb kiadási tételek átnézése és annak eldöntése, hogy egyszeri beruházásról volt-e szó, vagy tartós többletköltségről, amelyre bevételi oldalon is választ kell adni.'
          : 'A bevétel pontosan fedezte a kiadást; tartalék nem képződött, ezért egy váratlan javítás azonnal érzékeny helyzetet teremtene.'
    }${incomeDelta !== null ? ` A bevétel az előző évhez képest ${fmtPct(incomeDelta, 1)}-kal változott.` : ''}`,
    basis: `Bevétel ${fmtRon(f.totalIncome)} · kiadás ${fmtRon(f.totalExpense)} · egyenleg ${signed(Math.round(surplus))}${NBSP}RON${prev ? ` · ${prev.year} bevétel ${fmtRon(prev.income)}` : ''}`,
    quality: 'measured',
  }

  // Pénznél magasabb küszöb (3%/év): az ennél kisebb elmozdulás inflációs zaj.
  const ti = trendOf(by.map((y) => ({ year: y.year, value: y.income })), 3)
  const te = trendOf(by.map((y) => ({ year: y.year, value: y.expense })), 3)
  const long: ConclusionItem = !ti.ok
    ? insufficientLong(
        'A pénzügyi trendhez legalább három olyan év kell, amelyben van könyvelt tétel.',
        `Értékelhető évek: ${ti.usableYears} (legalább 3 kell)`,
      )
    : {
        horizon: 'long',
        direction: te.ok && te.slopePct > ti.slopePct + 3 ? 'down' : ti.direction,
        headline:
          te.ok && te.slopePct > ti.slopePct + 3
            ? 'A kiadások gyorsabban nőnek, mint a bevételek'
            : ti.direction === 'up'
              ? `Évek óta bővülő bevétel (${fmtPct(ti.slopePct, 1)}/év)`
              : ti.direction === 'down'
                ? `Évek óta szűkülő bevétel (${fmtPct(ti.slopePct, 1)}/év)`
                : 'Évek óta kiszámítható gazdálkodás',
        detail:
          te.ok && te.slopePct > ti.slopePct + 3
            ? `${ti.firstYear} óta a bevétel évi ${fmtPct(ti.slopePct, 1)}, a kiadás évi ${fmtPct(te.slopePct, 1)} ütemben változott (előjelesen). Ha ez így marad, a nyitott olló néhány éven belül tartós hiányt okoz. Hosszú távon két irányban van mozgástér: az egyházfenntartói járulék és az adományok tudatos építése, illetve a fenntartási költségek (fűtés, világítás, javítás) átgondolása.`
            : ti.direction === 'up'
              ? `${ti.firstYear} óta a bevétel ${fmtRon(ti.firstValue)}-ról ${fmtRon(ti.lastValue)}-ra emelkedett. A gyarapodás lehetőséget ad hosszabb távú vállalásra (felújítás, alapítvány, diakóniai szolgálat) — érdemes többéves tervet készíteni rá, hogy ne évente újratárgyalt kérdés legyen.`
              : ti.direction === 'down'
                ? `${ti.firstYear} óta a bevétel ${fmtRon(ti.firstValue)}-ról ${fmtRon(ti.lastValue)}-ra csökkent. Hosszú távon ez a fenntartható működés kérdését veti fel: időben érdemes megvizsgálni az épületek fenntartási költségeit, a pályázati lehetőségeket és az egyházfenntartói járulék rendszerét.`
                : `${ti.firstYear} óta a bevétel és a kiadás együtt mozog, jelentős kilengés nélkül. Ez kiszámítható gazdálkodást jelent; hosszabb távon a tartalék tudatos képzése adhat mozgásteret a nagyobb felújításokhoz.`,
        basis: by.map((y) => `${y.year}: ${Math.round(y.income).toLocaleString('hu')}/${Math.round(y.expense).toLocaleString('hu')}`).join(' · ') + ' (bevétel/kiadás, RON)',
        quality: 'measured',
      }

  return pack('penzugy', short, long)
}

function buildEgyhazfenntartas(d: PresentationData): CategoryConclusion {
  const e = d.finance.egyhazfenntartas
  if (e.activeAdults === 0) {
    return none('egyhazfenntartas', 'Nincs nyilvántartott felnőtt (18 év feletti) tag, ezért a fizetési arány nem számolható.')
  }
  if (e.paidMembers === 0) {
    return none(
      'egyhazfenntartas',
      'A tárgyévre egyetlen egyházfenntartói befizetés sincs kötelezettségi évvel rögzítve — az arány nem értelmezhető.',
    )
  }
  const rate = Math.round(e.paymentRate)
  const hatralek = Math.max(0, e.activeAdults - e.paidMembers)
  const tulfizetes = e.paymentRateRaw > 100

  const short: ConclusionItem = {
    horizon: 'short',
    direction: rate >= 70 ? 'up' : rate >= 40 ? 'stable' : 'down',
    headline: tulfizetes
      ? 'A fizetők száma meghaladja a nyilvántartott felnőtteket'
      : rate >= 70
        ? `Erős egyházfenntartás (${rate}%)`
        : rate >= 40
          ? `Közepes teljesítés (${rate}%)`
          : `Alacsony teljesítés (${rate}%)`,
    detail: tulfizetes
      ? `A ${d.year}. évre ${fmtNum(e.paidMembers)} személy nevén érkezett befizetés, miközben ${fmtNum(e.activeAdults)} felnőtt tagot tartunk nyilván. A kettő eltérése rendszerint nyilvántartási kérdés: gyermek vagy már elköltözött hozzátartozó nevére könyvelt családi befizetés. Az idei teendő a tagnyilvántartás és a befizetői lista egyeztetése — ettől lesz hiteles ez a mutató.`
      : `A ${d.year}. évre ${fmtNum(e.activeAdults)} felnőtt tagból ${fmtNum(e.paidMembers)} rendezte az egyházfenntartói járulékot (${rate}%), ${fmtNum(hatralek)} személy hátraléka maradt nyitva. ${
          rate >= 70
            ? 'A tagság döntő része hordozza a gyülekezet terheit — érdemes ezt a beszámolóban hálásan kimondani, és a hátralékosokat személyesen, nem levélben megkeresni.'
            : rate >= 40
              ? 'Az arány közepes: a hátralékos kör nagyobb részét jellemzően néhány személyes látogatás rendezi. Érdemes a presbiterekkel körzetenként felosztani a megkeresést.'
              : 'Az alacsony arány mögött legtöbbször nem elutasítás, hanem elmaradt kapcsolattartás áll. Az idei legfontosabb lépés a körzetenkénti pásztori látogatás megszervezése, és annak tisztázása, ki az, aki valóban nem tud fizetni.'
        }`,
    basis: `${fmtNum(e.paidMembers)} fizető / ${fmtNum(e.activeAdults)} felnőtt tag${tulfizetes ? ` (nyers arány ${Math.round(e.paymentRateRaw)}%)` : ` = ${rate}%`}`,
    quality: 'measured',
  }

  const t = trendOf(e.paidByYear.map((y) => ({ year: y.year, value: y.paidMembers })))
  const long: ConclusionItem = !t.ok
    ? insufficientLong(
        'A fizetők arányának trendjéhez legalább három év befizetési adata szükséges.',
        `Értékelhető évek: ${t.usableYears} (legalább 3 kell)`,
      )
    : {
        horizon: 'long',
        direction: t.direction,
        headline:
          t.direction === 'up'
            ? 'Évről évre többen veszik ki a részüket'
            : t.direction === 'down'
              ? 'Évről évre kevesebben fizetnek'
              : 'Állandó fizetői kör',
        detail:
          t.direction === 'down'
            ? `${t.firstYear} óta ${fmtNum(t.firstValue)}-ről ${fmtNum(t.lastValue)}-re csökkent a járulékot fizetők száma. Ez hosszú távon a gyülekezet önfenntartó képességét érinti: ha a fizetői kör tovább szűkül, a fenntartási költségeket egyre kevesebben viselik. Érdemes többéves tervet készíteni a hátralékok kezelésére és a fiatal felnőttek bevonására.`
            : t.direction === 'up'
              ? `${t.firstYear} óta ${fmtNum(t.firstValue)}-ről ${fmtNum(t.lastValue)}-re nőtt a járulékot fizetők száma. A teherviselés köre szélesedik, ami hosszú távon stabil alapot ad — érdemes a bizalmat az elszámolás nyilvánosságával viszonozni.`
              : `${t.firstYear} óta a fizetők száma állandó (${fmtNum(t.firstValue)} → ${fmtNum(t.lastValue)}). A gyülekezet gazdasági magja kiszámítható; hosszú távon a nemzedékváltás — a fiatal felnőttek belépése a fizetői körbe — a kérdés.`,
        basis: e.paidByYear.map((y) => `${y.year}: ${y.paidMembers}`).join(' · ') + ' (fizető személy)',
        quality: 'measured',
      }

  return pack('egyhazfenntartas', short, long)
}

function buildAdomany(d: PresentationData): CategoryConclusion {
  const f = d.finance
  if (f.totalIncome === 0) {
    return none('adomany', 'A tárgyévre nincs rögzített bevétel, ezért a bevételszerkezet nem elemezhető.')
  }
  const ratio = f.donationRatio
  const top = f.incomeByCategory[0]
  const topShare = top && f.totalIncome > 0 ? (Math.abs(top.amount) / f.totalIncome) * 100 : 0

  const short: ConclusionItem = {
    horizon: 'short',
    direction: ratio >= 30 ? 'up' : ratio >= 10 ? 'stable' : 'down',
    headline: `Az adományok a bevétel ${fmtPct(ratio)}-át adják`,
    detail: `A ${d.year}. évi ${fmtRon(f.totalIncome)} bevételből ${fmtRon(f.donationTotal)} érkezett adomány, persely és gyűjtés formájában.${
      top ? ` A legnagyobb egyetlen bevételi jogcím a(z) „${top.name}” (${fmtPct(topShare)}).` : ''
    } ${
      topShare > 60
        ? 'A bevétel nagy része egyetlen forráson múlik; az idén érdemes végiggondolni, mi történne, ha ez a forrás kiesne.'
        : ratio >= 30
          ? 'Az adományok jelentős aránya élő, áldozatkész közösséget mutat — érdemes az adakozás céljait konkrétan megnevezni, mert az emberek a látható célra adnak szívesebben.'
          : 'Az adományok aránya szerény; egy-egy megnevezett célra (harang, orgona, tetőjavítás, diakónia) meghirdetett gyűjtés az idén is meglepően jó eredményt hozhat.'
    }`,
    basis: `Adomány ${fmtRon(f.donationTotal)} / összes bevétel ${fmtRon(f.totalIncome)} = ${fmtPct(ratio)}`,
    quality: 'measured',
  }

  const t = trendOf(f.donationByYear.map((y) => ({ year: y.year, value: y.ratio })))
  const long: ConclusionItem = !t.ok
    ? insufficientLong(
        'Az adomány-arány trendjéhez legalább három év befizetési adata szükséges.',
        `Értékelhető évek: ${t.usableYears} (legalább 3 kell)`,
      )
    : {
        horizon: 'long',
        direction: t.direction,
        headline:
          t.direction === 'up'
            ? 'Erősödő adakozó készség'
            : t.direction === 'down'
              ? 'Gyengülő adakozó készség'
              : 'Állandó adakozó készség',
        detail:
          t.direction === 'up'
            ? `${t.firstYear} óta ${fmtPct(t.firstValue)}-ról ${fmtPct(t.lastValue)}-ra emelkedett az adományok aránya. A gyülekezet egyre inkább a saját áldozatvállalásából él, ami hosszú távon a legbiztosabb alap — érdemes az elszámolást minden évben nyilvánossá tenni, mert a bizalom tartja fenn ezt.`
            : t.direction === 'down'
              ? `${t.firstYear} óta ${fmtPct(t.firstValue)}-ról ${fmtPct(t.lastValue)}-ra csökkent az adományok aránya, tehát a gyülekezet egyre inkább külső forrásokra (támogatás, pályázat) támaszkodik. Hosszú távon ez sérülékennyé tesz; a saját adakozás építése lassú, de tartós munka.`
              : `${t.firstYear} óta az adományok aránya kiegyensúlyozott (${fmtPct(t.firstValue)} → ${fmtPct(t.lastValue)}). A bevételszerkezet kiszámítható, ami hosszabb távú tervezést tesz lehetővé.`,
        basis: f.donationByYear.map((y) => `${y.year}: ${Math.round(y.ratio)}%`).join(' · '),
        quality: 'measured',
      }

  return pack('adomany', short, long)
}

function buildLeltar(d: PresentationData): CategoryConclusion {
  const l = d.leltar
  if (!l.hasData) {
    return none(
      'leltar',
      'A leltár még üres — a gyülekezeti vagyon tételeinek felvitele után születik erről következtetés.',
    )
  }
  const top = l.byCategory[0]
  const topShare = top && l.totalValue > 0 ? (top.value / l.totalValue) * 100 : 0
  const missingShare = l.itemCount > 0 ? (l.missingValueCount / l.itemCount) * 100 : 0

  const short: ConclusionItem = {
    horizon: 'short',
    direction: missingShare > 25 ? 'down' : 'stable',
    headline: `${fmtNum(l.itemCount)} leltári tétel, ${fmtRon(l.totalValue)} nyilvántartott érték`,
    detail: `A gyülekezet ${fmtNum(l.itemCount)} tételt tart nyilván ${fmtNum(l.byCategory.length)} kategóriában, összesen ${fmtRon(l.totalValue)} beszerzési értéken.${
      top ? ` A legnagyobb tétel-csoport: ${top.name} (${fmtPct(topShare)}).` : ''
    } ${
      missingShare > 25
        ? `A tételek ${fmtPct(missingShare)}-ánál hiányzik a beszerzési érték, ezért az összeg a valóságosnál alacsonyabb. Az idei teendő ezek pótlása — enélkül a vagyonmérleg nem használható sem biztosításhoz, sem esperesi jelentéshez.`
        : 'A nyilvántartás lényegében teljes. Az idén elég az év közbeni beszerzéseket és selejtezéseket folyamatosan vezetni.'
    }`,
    basis: `${fmtNum(l.itemCount)} tétel · ${fmtRon(l.totalValue)} · hiányzó érték: ${fmtNum(l.missingValueCount)} tételnél`,
    quality: 'measured',
  }

  // A leltár pillanatkép (nincs év-dimenziója), ezért a hosszú táv nem trend,
  // hanem a vagyonkezelés elvi következménye — ezt nyíltan ki is mondjuk.
  const long: ConclusionItem = {
    horizon: 'long',
    direction: 'stable',
    headline: 'A vagyon megőrzése folyamatos gondoskodást kíván',
    detail: `A leltár pillanatképet ad, nem idősort, ezért itt nem trendet, hanem a vagyonkezelés következményét mondjuk ki. A ${fmtRon(l.totalValue)} nyilvántartott érték karbantartást, biztosítást és időszakos felülvizsgálatot igényel; az épületek és a nagyobb értékű tárgyak (orgona, harang, tetőszerkezet) állapotromlása lassú, de kikerülhetetlen. Hosszú távon érdemes évente elkülöníteni egy összeget felújítási tartalékként, és a leltárt kétévente tételesen egyeztetni.`,
    basis: `Kategóriák: ${l.byCategory.slice(0, 4).map((c) => `${c.name} (${fmtNum(c.count)})`).join(' · ')}`,
    quality: 'measured',
  }

  return pack('leltar', short, long)
}

function buildCelok(d: PresentationData, actualOf: (metrika: string) => number | null): CategoryConclusion {
  const numeric = (d.goals || []).filter((g) => g.metrika && g.celertek != null)
  if (numeric.length === 0) {
    return none(
      'celok',
      'A tárgyévre nincs számszerű cél megadva (Studio → „Célok”), ezért a teljesülésről nem születik következtetés.',
    )
  }
  const rows = numeric
    .map((g) => {
      const actual = actualOf(g.metrika as string)
      if (actual === null) return null
      return { metrika: g.metrika as string, target: Number(g.celertek), actual, met: actual >= Number(g.celertek) }
    })
    .filter(Boolean) as Array<{ metrika: string; target: number; actual: number; met: boolean }>
  if (rows.length === 0) {
    return none('celok', 'A megadott célokhoz nem tartozik kiszámítható tényadat.')
  }
  const met = rows.filter((r) => r.met).length

  const short: ConclusionItem = {
    horizon: 'short',
    direction: met === rows.length ? 'up' : met === 0 ? 'down' : 'stable',
    headline: `${met} / ${rows.length} cél teljesült`,
    detail: `A ${d.year}. évre ${fmtNum(rows.length)} számszerű célt tűztünk ki, ebből ${fmtNum(met)} teljesült. ${
      met === rows.length
        ? 'A vállalások beváltak; az idén érdemes egy fokkal magasabbra tenni a mércét, vagy új területen célt kitűzni.'
        : met === 0
          ? 'Egyik cél sem teljesült. Ez legtöbbször nem hanyagság, hanem túl ambiciózus tervezés jele — érdemes kevesebb, de elérhető célt megnevezni, felelőssel és határidővel együtt.'
          : 'A célok egy része teljesült. Az el nem érteknél érdemes megnézni, a cél volt-e irreális, vagy a hozzá rendelt szolgálat maradt el.'
    }`,
    basis: rows.map((r) => `${r.metrika}: ${fmtNum(r.actual)}/${fmtNum(r.target)}`).join(' · '),
    quality: 'measured',
  }

  const long: ConclusionItem = {
    horizon: 'long',
    direction: 'stable',
    headline: 'A célkitűzés akkor hasznos, ha évről évre visszamérjük',
    detail: `Egy év célteljesítése önmagában még nem trend. Ha a gyülekezet minden évben megfogalmaz néhány számszerű célt, három év múlva már látszani fog, mely területeken képes tartósan növekedni, és hol ütközik a valós korlátaiba. Érdemes a célokat a presbitériummal együtt kimondani, és a következő beszámolóban visszatérni rájuk.`,
    basis: `${d.year}: ${met}/${rows.length} teljesült cél`,
    quality: rows.length >= 3 ? 'measured' : 'insufficient',
  }

  return pack('celok', short, long)
}

// ──────────────────────────────────────────────────────────────
// Fő belépési pont
// ──────────────────────────────────────────────────────────────

export interface BuildConclusionsOptions {
  categories?: readonly ConclusionCategory[]
  horizons?: readonly ConclusionHorizon[]
  /** A cél-metrikák tényértékét a hívó adja (goal-metrics katalógus). */
  goalActual?: (metrika: string) => number | null
}

/**
 * Kategóriánkénti rövid és hosszú távú következtetések.
 *
 * Opciók nélkül MINDEN kategóriát visszaad (a nem elérhetőket `available:false`
 * jelzéssel) — a Studio jelölőnégyzet-listája ezt használja. Szűrve pedig csak
 * a kipipált kategóriákat és horizontokat.
 */
export function buildCategoryConclusions(
  data: PresentationData,
  options?: BuildConclusionsOptions,
): CategoryConclusion[] {
  const wanted = options?.categories ?? ALL_CONCLUSION_CATEGORIES
  const horizons = options?.horizons ?? ALL_CONCLUSION_HORIZONS
  const goalActual = options?.goalActual ?? (() => null)

  const builders: Record<ConclusionCategory, () => CategoryConclusion> = {
    letszam: () => buildLetszam(data),
    korosztaly: () => buildKorosztaly(data),
    anyakonyv: () => buildAnyakonyv(data),
    alkalmak: () => buildAlkalmak(data),
    urvacsora: () => buildUrvacsora(data),
    katekezis: () => buildKatekezis(data),
    programok: () => buildProgramok(data),
    penzugy: () => buildPenzugy(data),
    egyhazfenntartas: () => buildEgyhazfenntartas(data),
    adomany: () => buildAdomany(data),
    leltar: () => buildLeltar(data),
    celok: () => buildCelok(data, goalActual),
  }

  return ALL_CONCLUSION_CATEGORIES
    .filter((key) => wanted.includes(key))
    .map((key) => {
      const built = builders[key]()
      const short = horizons.includes('short') ? built.short : undefined
      const long = horizons.includes('long') ? built.long : undefined
      return { ...built, short, long, available: built.available && !!(short || long) }
    })
}

/** A megadott pillérhez tartozó kategóriák (a diák pillérenként bontanak). */
export function conclusionCategoriesOfPillar(pillar: 1 | 2 | 3): ConclusionCategory[] {
  return CONCLUSION_CATEGORIES.filter((c) => c.pillar === pillar).map((c) => c.key)
}
