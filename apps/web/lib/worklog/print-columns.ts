// 2026-07-16 (F3): Hivatalos nyomtatott munkanapló — típus→oszlop katalógus
// + ünnepnaptár.
//
// A hivatalos fekvő A4 nyomtatvány („I. Igehirdetési alkalmak") 7–17. oszlopa
// ugyanazt a jelenlét-adatot tartalmazza: a létszám mindig ABBA az oszlopba
// kerül, amelyik megfelel az alkalom típusának + napjának. Ez a modul adja a
// determinisztikus leképezést: (jellege + dátum + napszak) → oszlop + al-rovat.
// Önellenőrzés: node scripts/selftest-print-columns.mjs
//
// DÖNTÉSI SORREND (classifyForOfficialJournal):
//  (a) 'Úrvacsora'                                    → urvacsora / templomban
//      (a betegnél úrvacsorázók az uv_betegnel mezőből, a generátorban)
//  (b) 'Bibliaóra'                                    → bibliaora / felnott
//      'Ifjúsági bibliaóra (IKE)' | 'Ifjúsági óra'    → bibliaora / ifjusagi
//  (c) 'Bűnbánati istentisztelet'                     → bunbanati
//      (napszak de → reggel, különben este)
//  (d) 'Presbiteri gyűlés' | 'Konfirmáció előkészítő' → presbiteri
//  (e) 'Nőszövetségi összejövetel'                    → noszovetsegi
//  (f) 'Vallásos ünnepély'                            → unnepely
//  (g) kazuáliák + 'Imahét' + 'Egyéb szolgálat'
//      (Keresztelő/Esketés/Temetés/Konfirmáció)       → egyeb
//  (g½) legacy tartalmazás-tesztek (kisbetű + ékezet-normalizált), a (h) ELŐTT:
//      jellege tartalmazza az 'úrvacsora' szót        → urvacsora / templomban
//      jellege tartalmazza a 'bűnbánat' szótövet      → bunbanati (reggel/este)
//      — pl. 'Úrvacsorai istentisztelet', 'Bűnbánati istentisztelet (nagyheti)'
//      különben a (h) ág vasárnapi/hétköznapi oszlopba sorolná őket.
//  (h) istentiszteleti alkalmak (Istentisztelet, Igehirdetés, Imaóra,
//      Esti áhítat, Alkalmi istentisztelet + minden legacy szabad-szöveg,
//      amiben 'istentisztelet'/'igehirdetés'/'imaóra'/'áhítat' szerepel):
//        1. getUnnepInfo(dátum)     → satoros | unnepi (de/du al-rovat)
//        2. vasárnap (getUTCDay===0)→ vasarnapi (de/du al-rovat)
//        3. különben                → hetkoznapi (slot: null)
//  Minden más (ismeretlen jellege, katekézis-/látogatás-típusok) → egyeb
//  (17. oszlop, „Egyéb szolgálat").
//
// Napszak forrása: entry.napszak ?? (entry.du ? 'du' : 'de') — legacy `du`
// boolean fallback. De/du al-rovat: napszak 'du'/'este' → 'du', különben 'de'.
//
// ÜNNEP-BESOROLÁS (getUnnepInfo):
//  sátoros = Karácsony (dec 25–27), Húsvét (vasárnap+hétfő+kedd),
//            Pünkösd (vasárnap+hétfő+kedd) — a harmadnapok (III. napok)
//            az erdélyi gyakorlat szerint szintén sátoros ünnepek
//  ünnepi  = Újév (jan 1), Böjtfő (hamvazószerda = Húsvét−46), Virágvasárnap
//            (Húsvét−7), Nagypéntek (Húsvét−2), Áldozócsütörtök (Húsvét+39),
//            Újkenyér (augusztus utolsó vasárnapja — erdélyi szokás),
//            Reformáció/Újbor (okt 31)
//  A mozgó ünnepek a nyugati Húsvéthoz igazodnak (Gauss/Meeus-computus).
//
// GYERMEK-DÖNTÉS: a hivatalos nyomtatványon nincs gyermek-oszlop — a
// gyermek-jelenlét a hó végi összesítő sorban jelenik meg külön tételként
// (a cellákban csak F/N).

import type { WorklogEntry } from '@/lib/constants/worklog'

export type JournalColumnKey =
  | 'vasarnapi'
  | 'unnepi'
  | 'satoros'
  | 'bunbanati'
  | 'hetkoznapi'
  | 'urvacsora'
  | 'bibliaora'
  | 'presbiteri'
  | 'noszovetsegi'
  | 'unnepely'
  | 'egyeb'

export type JournalSlot =
  | 'de'
  | 'du'
  | 'reggel'
  | 'este'
  | 'felnott'
  | 'ifjusagi'
  | 'templomban'
  | 'betegnel'
  | null

export interface JournalPlacement {
  column: JournalColumnKey
  slot: JournalSlot
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return toIsoDate(d)
}

/**
 * Nyugati (Gergely-naptári) Húsvétvasárnap — Gauss/Meeus/Jones/Butcher-computus.
 * Kimenet: ISO 'YYYY-MM-DD'.
 */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3=március, 4=április
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return toIsoDate(new Date(Date.UTC(year, month - 1, day)))
}

/** Augusztus utolsó vasárnapja (Újkenyér — erdélyi szokás). */
function lastSundayOfAugust(year: number): string {
  const d = new Date(Date.UTC(year, 7, 31))
  d.setUTCDate(31 - d.getUTCDay()) // getUTCDay: 0 = vasárnap
  return toIsoDate(d)
}

/**
 * Ünnep-katalógus: a hivatalos munkanapló 8. (ünnepi) és 9. (sátoros ünnepi)
 * oszlopának besorolása. Nem ünnepnapra null.
 */
export function getUnnepInfo(isoDate: string): { nev: string; tipus: 'satoros' | 'unnepi' } | null {
  const iso = (isoDate || '').slice(0, 10)
  if (!ISO_DATE_RE.test(iso)) return null
  const year = Number(iso.slice(0, 4))
  const mmdd = iso.slice(5)

  // Fix ünnepek
  if (mmdd === '01-01') return { nev: 'Újév', tipus: 'unnepi' }
  if (mmdd === '10-31') return { nev: 'Reformáció', tipus: 'unnepi' }
  if (mmdd === '12-25') return { nev: 'Karácsony', tipus: 'satoros' }
  if (mmdd === '12-26') return { nev: 'Karácsony másodnapja', tipus: 'satoros' }
  if (mmdd === '12-27') return { nev: 'Karácsony harmadnapja', tipus: 'satoros' }

  // Mozgó (Húsvét-alapú) ünnepek
  const husvet = easterSunday(year)
  const mozgo: Array<[string, string, 'satoros' | 'unnepi']> = [
    [addDays(husvet, -46), 'Böjtfő', 'unnepi'],
    [addDays(husvet, -7), 'Virágvasárnap', 'unnepi'],
    [addDays(husvet, -2), 'Nagypéntek', 'unnepi'],
    [husvet, 'Húsvét', 'satoros'],
    [addDays(husvet, 1), 'Húsvét másodnapja', 'satoros'],
    [addDays(husvet, 2), 'Húsvét harmadnapja', 'satoros'],
    [addDays(husvet, 39), 'Áldozócsütörtök', 'unnepi'],
    [addDays(husvet, 49), 'Pünkösd', 'satoros'],
    [addDays(husvet, 50), 'Pünkösd másodnapja', 'satoros'],
    [addDays(husvet, 51), 'Pünkösd harmadnapja', 'satoros'],
  ]
  for (const [datum, nev, tipus] of mozgo) {
    if (datum === iso) return { nev, tipus }
  }

  if (iso === lastSundayOfAugust(year)) return { nev: 'Újkenyér', tipus: 'unnepi' }
  return null
}

// A jellege-egyezések a lib/constants/worklog.ts WORKLOG_TYPES +
// LEGACY_WORKLOG_TYPES listáival szinkronban tartandók.
const BIBLIAORA_IFJUSAGI_TYPES = new Set(['Ifjúsági bibliaóra (IKE)', 'Ifjúsági óra', 'Ifj. vagy IKE bibliaóra'])
const PRESBITERI_TYPES = new Set(['Presbiteri gyűlés', 'Konfirmáció előkészítő', 'Presbiteri bibliaóra', 'Presbiteri felkészítő'])
const EGYEB_TYPES = new Set(['Keresztelő', 'Esketés', 'Temetés', 'Konfirmáció', 'Imahét', 'Egyéb szolgálat'])
const ISTENTISZTELETI_TYPES = new Set(['Istentisztelet', 'Igehirdetés', 'Imaóra', 'Esti áhítat', 'Alkalmi istentisztelet'])

// 2026-08-14 (18. pont): a HIVATALOS 37-es készlet közvetlen leképezése.
// A nevesített típus ERŐSEBB a dátum-heurisztikánál: ha a lelkész „Ünnepi
// i.t."-t választott, az akkor is ünnepi, ha a dátum hétköznapra esik.
const OFFICIAL_FELNOTT_BIBLIAORA = new Set(['Felnőtt bibliaóra', 'Házasok bibliaórája', 'Más bibliaóra 1', 'Más bibliaóra 2', 'Nőszöv. bibliaóra'])
const OFFICIAL_SATOROS = new Set([
  'Húsvét I. it.', 'Húsvét II. it.', 'Húsvét III. it.',
  'Pünkösd I. it.', 'Pünkösd II. it.', 'Pünkösd III. it.',
  'Karácsony I. it.', 'Karácsony II. it.', 'Karácsony III. it.',
])
const OFFICIAL_EGYEB = new Set([
  'F. keresztelő', 'N. keresztelő', 'Keresztelői felkészítő',
  'F. temetés', 'N. temetés', 'Virrasztó',
  'Azonos esketés', 'Vegyes esketés', 'Jegyesbeszélgetés',
  'Digitális alkalmak',
])

/** Napszak-feloldás: az új napszak-mező, legacy fallback a `du` booleanból.
 *  A De.2/Du.2 (EREK 2.2) az oszlop-besorolásnál az alap-vetületére képez —
 *  az ÖSSZEADÓ szabály a jelentés-aggregátor dolga, nem az oszlopé. */
function resolveNapszak(entry: Pick<WorklogEntry, 'napszak' | 'du'>): 'de' | 'du' | 'este' {
  const n = entry.napszak
  if (n === 'de2') return 'de'
  if (n === 'du2') return 'du'
  return n ?? (entry.du ? 'du' : 'de')
}

/** Kisbetűs + ékezet-mentes normalizálás a legacy tartalmazás-tesztekhez. */
function normalizeForMatch(jellege: string): string {
  // NFD-bontás után a kombináló ékezet-jelek (U+0300–U+036F) eltávolítása.
  return jellege.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Legacy szabad-szöveges típusok felismerése az istentiszteleti (h) ághoz. */
function looksLikeIstentisztelet(jellege: string): boolean {
  const j = jellege.toLowerCase()
  return (
    j.includes('istentisztelet') ||
    j.includes('igehirdetés') ||
    j.includes('imaóra') ||
    j.includes('áhítat')
  )
}

/**
 * Determinisztikus típus→oszlop leképezés a hivatalos nyomtatott munkanapló
 * 7–17. oszlopához. A döntési sorrendet lásd a fájl fejlécében.
 */
export function classifyForOfficialJournal(entry: WorklogEntry): JournalPlacement {
  const jellege = (entry.jellege || '').trim()

  // (a0) 2026-08-14: a HIVATALOS 37-es készlet nevesített típusai — a
  // dátum-heurisztika ELŐTT, mert a lelkész kifejezett választása dönt.
  {
    const napszak = resolveNapszak(entry)
    const deDu: JournalSlot = napszak === 'du' || napszak === 'este' ? 'du' : 'de'
    if (jellege === 'Vasárnapi i.t.') return { column: 'vasarnapi', slot: deDu }
    if (jellege === 'Ünnepi i.t.') return { column: 'unnepi', slot: deDu }
    if (OFFICIAL_SATOROS.has(jellege)) return { column: 'satoros', slot: deDu }
    if (jellege === 'Bűnbánati i.t.') {
      return { column: 'bunbanati', slot: napszak === 'de' ? 'reggel' : 'este' }
    }
    if (jellege === 'Hétköznapi i.t.') return { column: 'hetkoznapi', slot: null }
    if (jellege === 'Úrvacsora templomban') return { column: 'urvacsora', slot: 'templomban' }
    if (jellege === 'Betegúrvacsora') return { column: 'urvacsora', slot: 'betegnel' }
    if (OFFICIAL_FELNOTT_BIBLIAORA.has(jellege)) {
      // A Nőszöv. bibliaóra a 15. (nőszövetségi) oszlopba tartozik.
      if (jellege === 'Nőszöv. bibliaóra') return { column: 'noszovetsegi', slot: null }
      return { column: 'bibliaora', slot: 'felnott' }
    }
    if (jellege === 'Szeretetvendégség') return { column: 'unnepely', slot: null }
    if (OFFICIAL_EGYEB.has(jellege)) return { column: 'egyeb', slot: null }
  }

  // (a) Úrvacsora — 12. oszlop (a betegnél rovat a generátorban, uv_betegnel)
  if (jellege === 'Úrvacsora') return { column: 'urvacsora', slot: 'templomban' }

  // (b) Bibliaóra — 13. oszlop, Felnőtt / Ifjúsági (IKE) bontás
  if (jellege === 'Bibliaóra') return { column: 'bibliaora', slot: 'felnott' }
  if (BIBLIAORA_IFJUSAGI_TYPES.has(jellege)) return { column: 'bibliaora', slot: 'ifjusagi' }

  // (c) Bűnbánati istentisztelet — 10. oszlop, Reggel / Este bontás
  if (jellege === 'Bűnbánati istentisztelet') {
    return { column: 'bunbanati', slot: resolveNapszak(entry) === 'de' ? 'reggel' : 'este' }
  }

  // (d) Presbiteri vagy felkészítő — 14. oszlop
  if (PRESBITERI_TYPES.has(jellege)) return { column: 'presbiteri', slot: null }

  // (e) Nőszövetségi összejövetel — 15. oszlop
  if (jellege === 'Nőszövetségi összejövetel') return { column: 'noszovetsegi', slot: null }

  // (f) Vallásos ünnepély — 16. oszlop
  if (jellege === 'Vallásos ünnepély') return { column: 'unnepely', slot: null }

  // (g) kazuáliák + Imahét + Egyéb szolgálat — 17. oszlop
  if (EGYEB_TYPES.has(jellege)) return { column: 'egyeb', slot: null }

  // (g½) legacy tartalmazás-tesztek — a (h) ág ELŐTT, különben pl. az
  // 'Úrvacsorai istentisztelet' / 'Bűnbánati istentisztelet (nagyheti)'
  // szabad-szöveges változatok a vasárnapi/hétköznapi oszlopba csúsznának.
  const normalized = normalizeForMatch(jellege)
  if (normalized.includes('urvacsora')) return { column: 'urvacsora', slot: 'templomban' }
  if (normalized.includes('bunbanat')) {
    return { column: 'bunbanati', slot: resolveNapszak(entry) === 'de' ? 'reggel' : 'este' }
  }

  // (h) istentiszteleti alkalmak: ünnep → vasárnap → hétköznap
  if (ISTENTISZTELETI_TYPES.has(jellege) || (jellege !== '' && looksLikeIstentisztelet(jellege))) {
    const napszak = resolveNapszak(entry)
    const deDu: JournalSlot = napszak === 'du' || napszak === 'este' ? 'du' : 'de'
    const iso = (entry.idopont || '').slice(0, 10)

    const unnep = getUnnepInfo(iso)
    if (unnep) return { column: unnep.tipus, slot: deDu }

    if (ISO_DATE_RE.test(iso) && new Date(`${iso}T00:00:00Z`).getUTCDay() === 0) {
      return { column: 'vasarnapi', slot: deDu }
    }
    return { column: 'hetkoznapi', slot: null }
  }

  // Ismeretlen / nem-istentiszteleti jellege → 17. oszlop (Egyéb szolgálat)
  return { column: 'egyeb', slot: null }
}
