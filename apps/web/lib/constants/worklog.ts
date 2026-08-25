export const WORKLOG_CATEGORIES = ['szolgalat', 'katekezis', 'latogatas'] as const
export type WorklogCategory = typeof WORKLOG_CATEGORIES[number]

// 2026-07-11: közös persely/RON-formázó — a munkanapló minden pénz-kiírása
// (fülek, év-összkép, jelentés) ezt használja. Kimenet: '1 234,56'.
const RON_FORMAT = new Intl.NumberFormat('hu-HU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatRon(n: number): string {
  return RON_FORMAT.format(Number(n) || 0)
}

export const WORKLOG_CATEGORY_LABELS: Record<WorklogCategory, string> = {
  szolgalat: 'Szolgálat', katekezis: 'Katekézis', latogatas: 'Látogatás',
}

// 2026-07-11 (F2): napszak-opciók — a legacy `du` boolean finomítása.
// 2026-08-14 (18. pont, EREK-spec 2.2): + De.2 / Du.2 — ha egy napon délelőtt
// (ill. délután) TÖBB istentisztelet van, a másodikat így kell jelölni. A
// jelölés SZÁMÍT: De.2-vel a résztvevők ÖSSZEADÓDNAK (100+200 → 300), nélküle
// a rendszer átlagol (150) — ez a templomlátogatási százalék alapja.
// Adat-kontraktus: du = napszak 'du' VAGY 'du2' (a mentés szinkronban tartja).
export const NAPSZAK_OPTIONS = [
  { value: 'de', label: 'Délelőtt' },
  { value: 'du', label: 'Délután' },
  { value: 'este', label: 'Este' },
  { value: 'de2', label: 'De. 2. — második délelőtti' },
  { value: 'du2', label: 'Du. 2. — második délutáni' },
] as const

export type Napszak = (typeof NAPSZAK_OPTIONS)[number]['value']

/** A napszak alap-vetülete (de2 → de, du2 → du) — bontásokhoz, kijelzéshez. */
export function napszakAlap(n: string | null | undefined): 'de' | 'du' | 'este' | null {
  if (n === 'de' || n === 'du' || n === 'este') return n
  if (n === 'de2') return 'de'
  if (n === 'du2') return 'du'
  return null
}

/** A legacy `du` boolean kontraktusa: délutáni-e a napszak (du VAGY du2). */
export function napszakDelutani(n: string | null | undefined): boolean {
  return n === 'du' || n === 'du2'
}

// 2026-06-12 (Endre #3-4 munkanapló): a kazuáliák (Keresztelő, Esketés,
// Temetés, Konfirmáció) bekerültek a szolgálati típusok közé — az anyakönyvi
// rögzítés automatikus munkanapló-bejegyzései így a Szolgálat fülön és a
// jelentésekben is megjelennek. (A hivatalos Excel "Szolgálat jellege"
// oszlopa is ide sorolja őket.)
// 2026-07-11: a 'Bibliaóra' korábban a szolgalat ÉS a katekezis listában is
// szerepelt. A hivatalos nyomtatott munkanapló 13. oszlopa szerint a bibliaóra
// Felnőtt / Ifjúsági (IKE) bontású → a szolgalat listában marad a 'Bibliaóra'
// (felnőtt alkalom), a katekezisben 'Ifjúsági bibliaóra (IKE)' lett.
// 2026-07-16 (F3): a hivatalos nyomtatott munkanapló oszlopaihoz hiányzó
// típusok felvétele: 'Bűnbánati istentisztelet' (10. oszlop), 'Presbiteri
// gyűlés' (14.), 'Nőszövetségi összejövetel' (15.), 'Vallásos ünnepély' (16.),
// 'Imahét' (17. Egyéb szolgálat). Sorrend: istentiszteleti alkalmak elöl,
// gyülekezeti alkalmak középen, kazuáliák hátul, 'Egyéb szolgálat' a végén.
// A típus→oszlop leképezés: lib/worklog/print-columns.ts.
// 2026-08-14 (18. pont): a HIVATALOS EREK-készlet (IT 66/2023 ív, kanonikus
// nevekkel: 37 szolgálat + 11 katekézis + 2 látogatás) — ÚJ rögzítéshez a
// legördülők EZT kínálják. A régi (2026 előtti) típusnevek a
// LEGACY_WORKLOG_TYPES-ban élnek tovább: APPEND-ONLY elv — meglévő sor
// jellege-értéke SOHA nem változik, a besorolás (categorizeWorklogEntry) és a
// hivatalos ív oszlop-leképezése (print-columns.ts) mindkét készletet ismeri.
export const WORKLOG_TYPES: Record<WorklogCategory, string[]> = {
  szolgalat: [
    'Vasárnapi i.t.', 'Ünnepi i.t.', 'Bűnbánati i.t.', 'Hétköznapi i.t.',
    'Úrvacsora templomban', 'Betegúrvacsora',
    'Felnőtt bibliaóra', 'Ifj. vagy IKE bibliaóra', 'Presbiteri bibliaóra',
    'Nőszöv. bibliaóra', 'Házasok bibliaórája', 'Más bibliaóra 1', 'Más bibliaóra 2',
    'F. keresztelő', 'N. keresztelő', 'Keresztelői felkészítő',
    'F. temetés', 'N. temetés', 'Virrasztó',
    'Azonos esketés', 'Vegyes esketés', 'Jegyesbeszélgetés',
    'Digitális alkalmak', 'Imahét',
    'Húsvét I. it.', 'Húsvét II. it.', 'Húsvét III. it.',
    'Pünkösd I. it.', 'Pünkösd II. it.', 'Pünkösd III. it.',
    'Karácsony I. it.', 'Karácsony II. it.', 'Karácsony III. it.',
    'Vallásos ünnepély', 'Szeretetvendégség', 'Presbiteri felkészítő',
    'Egyéb szolgálat',
  ],
  katekezis: [
    'Vallásóra 1. csoport', 'Vallásóra 2. csoport', 'Vallásóra 3. csoport',
    'Vallásóra 4. csoport', 'Vallásóra 5. csoport',
    'Elsőéves konf. felkészítő', 'Másodéves konf. felkészítő',
    'Gyermekistentisztelet', 'Vasárnapi iskola',
    'VBH – Vakációs Bibliahét', 'Egyéb foglalkozás',
  ],
  latogatas: ['Családlátogatás', 'Beteglátogatás'],
}

// A 2026 előtti rögzítések típusnevei — megjelenítéshez/besoroláshoz. Új
// rögzítésnél már nem kínáljuk, de a meglévő sorok érintetlenek maradnak.
export const LEGACY_WORKLOG_TYPES: Record<WorklogCategory, string[]> = {
  szolgalat: ['Istentisztelet', 'Igehirdetés', 'Úrvacsora', 'Bűnbánati istentisztelet', 'Bibliaóra', 'Imaóra', 'Esti áhítat', 'Alkalmi istentisztelet', 'Presbiteri gyűlés', 'Nőszövetségi összejövetel', 'Keresztelő', 'Esketés', 'Temetés', 'Konfirmáció'],
  katekezis: ['Ifjúsági bibliaóra (IKE)', 'Hittan', 'Vallásóra', 'Kátéóra', 'Konfirmáció előkészítő', 'Ifjúsági óra', 'Gyermek foglalkozás', 'Egyéb katekézis'],
  latogatas: ['Kórházlátogatás', 'Idősek otthona', 'Börtönlátogatás', 'Egyéb látogatás'],
}

/** Hivatalos + legacy típusok együtt — a besorolás és a szűrők készlete. */
export const ALL_WORKLOG_TYPES: Record<WorklogCategory, string[]> = {
  szolgalat: [...WORKLOG_TYPES.szolgalat, ...LEGACY_WORKLOG_TYPES.szolgalat],
  katekezis: [...WORKLOG_TYPES.katekezis, ...LEGACY_WORKLOG_TYPES.katekezis],
  latogatas: [...WORKLOG_TYPES.latogatas, ...LEGACY_WORKLOG_TYPES.latogatas],
}

/**
 * 2026-06-12: KÖZÖS kategorizáló — a munkanapló-fülek, a nyomtatási modul és
 * a jelentések is ezt használják.
 *
 * Szabály:
 *  1. ha a `kategoria` kifejezetten 'katekezis' vagy 'latogatas' → azt
 *     használjuk (ezek nem lehetnek DB-default értékek, tehát tudatosan
 *     lettek beállítva);
 *  2. különben a `jellege` típuslisták döntenek (a kategoria oszlop DEFAULT
 *     'szolgalat'-tal jött létre, ezért a legacy soroknál nem megbízható);
 *  3. alapértelmezés: 'szolgalat'.
 */
export function categorizeWorklogEntry(e: { kategoria?: string | null; jellege?: string | null }): WorklogCategory {
  if (e.kategoria === 'katekezis' || e.kategoria === 'latogatas') return e.kategoria
  // 2026-08-14 (18. pont): a hivatalos ÉS a legacy készletet is ismerjük —
  // a régi sorok besorolása nem változhat a taxonómia-bővítéstől.
  for (const cat of WORKLOG_CATEGORIES) {
    if (e.jellege && ALL_WORKLOG_TYPES[cat].includes(e.jellege)) return cat
  }
  return 'szolgalat'
}

// FONTOS: a mezőnevek a valódi DB séma (munkanaplo tábla) szerintiek.
// A korábbi `leiras`/`resztvevok_*`/`igehely`/`szolgalatvezeto`/`id_szemely`/`id_csalad`
// mezők NEM léteztek a sémában — helyette: `bibliaolvasas`/`alapige`/`enekek`/
// `jelenlet_*`/`szolgalt`/`mediapath`/`kategoria`/`du`/`id_jellege`.
export interface WorklogEntry {
  id: number
  /** Optimista zároláshoz (DB bump-trigger lépteti); régi/offline sorokon hiányozhat. */
  revision?: number | null
  idopont: string | null
  kategoria: string | null
  jellege: string | null
  id_jellege: string | null
  bibliaolvasas: string | null
  alapige: string | null
  cim: string | null
  enekek: string | null
  jelenlet_ferfi: number | null
  jelenlet_no: number | null
  jelenlet_gyermek: number | null
  jelenlet_osszesen: number
  szolgalt: string | null
  persely: number | null
  megjegyzes: string | null
  mediapath: string | null
  du: boolean
  // 2026-07-11 (F2): új oszlopok (migráció: napszak + úrvacsorázók) — régi
  // sorokon / még nem migrált DB-n hiányozhatnak, ezért opcionálisak.
  napszak?: 'de' | 'du' | 'este' | 'de2' | 'du2' | null
  uv_templomban?: number | null
  uv_betegnel?: number | null
  // 2026-08-25 (gyülekezeti egységek): az alkalom helyszíne — a
  // gyulekezeti_egysegek tábla sorára mutat; NULL/hiányzó = anyaközpont.
  // A 2026-08-25-gyulekezeti-egysegek.sql migráció előtt az oszlop nem létezik.
  egyseg_id?: string | null
  deleted: boolean
  congregation_id: string | null
}
