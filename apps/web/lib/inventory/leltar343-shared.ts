/**
 * Leltar 3_43 — a hivatalos egyházmegyei leltár-munkafüzet (Beke Tivadar,
 * Kézdi-Orbai Református Egyházmegye, verzió 3.43) KÖZÖS, tiszta leképező
 * rétege (2026-08-26).
 *
 * MIT TUD: a munkafüzet lapjainak/oszlopainak szemantikáját, a Súgó szerinti
 * alapértelmezéseket (hó→1, nap→1, mennyiség→1, felelős→intézményvezető), a
 * „Helyszín - Felelős" összevont oszlop szét-/összerakását, a negatív sorok
 * (részleges kivezetés, ill. alapeszköznél le-/felértékelés) értelmezését,
 * valamint az EXPORT sor-építést.
 *
 * MIÉRT TISZTA MODUL: nincs IO, nincs React — a szerver-akció (import), a
 * kliens-export és a selftest ugyanabból a szabálykészletből dolgozik.
 *
 * A munkafüzet szerkezeti tényei (a 3.43-as sablonból visszafejtve):
 *   - 7 kategória-lap + Cimlap + Penztar_Beruhazas a kitöltendő; a többi lap
 *     (Hibak, Fisa, Leltariv, Vagyonleltari_jel, A_P, Torolt_felvett, Reg_Inv)
 *     KÉPLETEKKEL SZÁRMAZTATOTT — azokhoz nem nyúlunk.
 *   - adatsorok az 5. sortól; D=sorszám (előre kitöltve), E=Megnevezés
 *     (Könyveknél: Szerző), F=Megjegyzés (Könyveknél: Cím), G=„Helyszín -
 *     Felelős" (legördülő a Cimlap katalógusából), H=Leltári szám,
 *     I/J/K=Beszerzés év/hó/nap, L=Beszerzési érték (a SOR teljes értéke!),
 *     M=Mennyiség, N=Mértékegység, O=Beszerzési irat, P/Q/R=Törlés év/hó/nap,
 *     S=Törlési irat száma, típusa, indoklás; Alapeszközöknél még:
 *     T=Használati idő évben, U=Alapeszköz típusa (HG 2139/2004 főcsoport).
 *   - az érvényesítések lapkapacitása: Csekély/Alapeszköz/Könyvek 1500. sorig,
 *     a többi lap 200. sorig (5-től számítva 1496, ill. 196 tétel).
 */

import type { InventoryCategory, InventoryItem } from '@kartoteka/ui-app'
import { getAlapeszkozCsoportFromKod } from '@kartoteka/ui-app'

// ---------------------------------------------------------------------------
// Lapok
// ---------------------------------------------------------------------------

export const LELTAR343_CIMLAP = 'Cimlap'
export const LELTAR343_PENZTAR = 'Penztar_Beruhazas'

export const LELTAR343_SZARMAZTATOTT_LAPOK = [
  'Hibak',
  'Fisa',
  'Leltariv',
  'Vagyonleltari_jel',
  'A_P',
  'Torolt_felvett',
  'Reg_Inv',
] as const

export interface Leltar343Lap {
  /** A lap pontos neve a munkafüzetben. */
  sheet: string
  /** A Kartotéka kategória-kulcsa. */
  category: InventoryCategory
  /** Magyar cím a felülethez. */
  cimke: string
  /**
   * Hány tételsor van ELŐRE LÉTREHOZVA a sablonban (D-sorszámmal és beviteli
   * cellákkal). A lap adat-területe az 5. sortól a (4+kapacitás). sorig tart —
   * FONTOS: a Csekely lap 3005. sorától belső TÜKÖR-segédterület kezdődik
   * (a többi lap tartalmát másolja képletekkel), amit az importnak NEM szabad
   * adatnak néznie; a lapvédelem miatt a kitöltő sem tud e területen kívül
   * tételt rögzíteni.
   */
  kapacitas: number
  /** Van-e T (használati idő) és U (típus) oszlop (csak Alapeszkozok). */
  alapeszkozOszlopok: boolean
}

export const LELTAR343_KATEGORIA_LAPOK: Leltar343Lap[] = [
  { sheet: 'Csekely_erteku_targyak', category: 'csekely', cimke: 'Csekély értékű leltári tárgyak', kapacitas: 1496, alapeszkozOszlopok: false },
  { sheet: 'Alapeszkozok', category: 'alapeszkoz', cimke: 'Alapeszközök', kapacitas: 496, alapeszkozOszlopok: true },
  { sheet: 'Telkek_foldek_erdok', category: 'telek', cimke: 'Telkek, földek, erdők', kapacitas: 196, alapeszkozOszlopok: false },
  { sheet: 'Konyvek', category: 'konyv', cimke: 'Könyvek', kapacitas: 1496, alapeszkozOszlopok: false },
  { sheet: 'Kegyszerek', category: 'kegyszer', cimke: 'Kegyszerek', kapacitas: 196, alapeszkozOszlopok: false },
  { sheet: 'Karpjegyek_reszvenyek', category: 'karpotlasi', cimke: 'Kárpótlási jegyek, részvények', kapacitas: 196, alapeszkozOszlopok: false },
  { sheet: 'Bizomanyi', category: 'bizomanyi', cimke: 'Bizományi', kapacitas: 196, alapeszkozOszlopok: false },
]

/**
 * Leltar 3_43 munkafüzet felismerése a lapnevekből: legalább 4 kategória-lap
 * ÉS a Cimlap együtt — kézzel készített, hasonló nevű fájl így nem téveszt.
 */
export function isLeltar343Workbook(sheetNames: string[]): boolean {
  const nevek = new Set(sheetNames.map(n => n.trim()))
  const talalat = LELTAR343_KATEGORIA_LAPOK.filter(l => nevek.has(l.sheet)).length
  return talalat >= 4 && nevek.has(LELTAR343_CIMLAP)
}

// ---------------------------------------------------------------------------
// Alapeszköz-főcsoportok (a munkafüzet SAJÁT szövegei — az U oszlop
// legördülője CSAK ezeket fogadja el, ezért exportnál betűre ezeket írjuk,
// beleértve a sablon „Tehnikai" írásmódját is)
// ---------------------------------------------------------------------------

export const ALAPESZKOZ_CSOPORT_NEVEK: Record<1 | 2 | 3, string> = {
  1: 'Épületek',
  2: 'Tehnikai és szállítóeszközök, állatok, ültetvények',
  3: 'Bútorzat, irodai felszerelés, védő berendezések, más alapeszközök',
}

function egyszerusit(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/** A munkafüzet U oszlopának szövege → főcsoport (1/2/3); ismeretlen → null. */
export function alapeszkozCsoportFromNev(nev?: string | null): 1 | 2 | 3 | null {
  const token = egyszerusit(String(nev || ''))
  if (!token) return null
  for (const csoport of [1, 2, 3] as const) {
    if (egyszerusit(ALAPESZKOZ_CSOPORT_NEVEK[csoport]) === token) return csoport
  }
  // Tolerancia az élő kitöltések felé: az első szó dönt (épület…/technikai…/
  // tehnikai…/bútor…) — de csak egyértelmű előtagra.
  if (token.startsWith('epulet')) return 1
  if (token.startsWith('tehnikai') || token.startsWith('technikai')) return 2
  if (token.startsWith('butor')) return 3
  return null
}

// ---------------------------------------------------------------------------
// „Helyszín - Felelős" összevont oszlop
// ---------------------------------------------------------------------------

export const HELYSZIN_FELELOS_ELVALASZTO = ' - '

/**
 * A Cimlap D-oszlopának képletével azonos összefűzés: `E&" - "&F`, ahol
 * E = helyszín (üresen `- `), F = felelős (üresen az intézményvezető, annak
 * hiányában ` - `). Exportnál és a katalógus-egyeztetésnél is EZT használjuk,
 * hogy a legördülő érvényesítése ne jelezzen hibát.
 */
export function joinHelyszinFelelos(
  helyszin?: string | null,
  felelos?: string | null,
  intezmenyvezeto?: string | null,
): string {
  const e = (helyszin || '').trim() || '- '
  const f = (felelos || '').trim() || (intezmenyvezeto || '').trim() || ' - '
  return `${e}${HELYSZIN_FELELOS_ELVALASZTO}${f}`
}

/**
 * A G oszlop értéke → { helyszin, felelos }. Elsőbbség a Cimlap-katalógus
 * pontos egyezésének (a hívó a katalógusból épített térképet ad át); ennek
 * híján az UTOLSÓ ` - ` elválasztónál vágunk (a felelős-név ritkábban
 * tartalmaz ilyet, mint egy helyszín). A sablon `- ` / ` - ` helykitöltői
 * üresre fordulnak.
 */
export function splitHelyszinFelelos(
  ertek?: string | null,
  katalogus?: Map<string, { helyszin: string | null; felelos: string | null }>,
): { helyszin: string | null; felelos: string | null } {
  const nyers = (ertek || '').trim()
  if (!nyers) return { helyszin: null, felelos: null }

  const talalat = katalogus?.get(nyers)
  if (talalat) return { helyszin: talalat.helyszin, felelos: talalat.felelos }

  const tisztit = (resz: string): string | null => {
    const t = resz.trim()
    return !t || t === '-' ? null : t
  }

  const utolso = nyers.lastIndexOf(HELYSZIN_FELELOS_ELVALASZTO)
  if (utolso === -1) return { helyszin: tisztit(nyers), felelos: null }
  return {
    helyszin: tisztit(nyers.slice(0, utolso)),
    felelos: tisztit(nyers.slice(utolso + HELYSZIN_FELELOS_ELVALASZTO.length)),
  }
}

// ---------------------------------------------------------------------------
// Dátumok (év/hó/nap ↔ ISO)
// ---------------------------------------------------------------------------

/**
 * Év/hó/nap → ISO dátum a Súgó alapértelmezéseivel (hó→1, nap→1). Érvénytelen
 * év → null (a munkafüzet Hibak-lapja is hibának tekinti). A hónapon túllógó
 * nap a hónap utolsó napjára áll (a Súgó a napot amúgy is közelítőnek tekinti).
 */
export function osszerakDatum(
  ev?: number | null,
  ho?: number | null,
  nap?: number | null,
): string | null {
  const y = Number(ev)
  if (!Number.isInteger(y) || y < 1000 || y > 2200) return null
  let m = Number(ho)
  if (!Number.isInteger(m) || m < 1 || m > 12) m = 1
  let d = Number(nap)
  if (!Number.isInteger(d) || d < 1) d = 1
  const utolsoNap = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (d > utolsoNap) d = utolsoNap
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** ISO dátum → { ev, ho, nap } (exporthoz); hibásnál null. */
export function szetszedDatum(iso?: string | null): { ev: number; ho: number; nap: number } | null {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return { ev: Number(m[1]), ho: Number(m[2]), nap: Number(m[3]) }
}

// ---------------------------------------------------------------------------
// IMPORT — nyers sorok feldolgozása
// ---------------------------------------------------------------------------

export interface Leltar343NyersSor {
  /** Excel-sorszám (5-től). */
  sor: number
  /** E oszlop (Könyveknél a SZERZŐ). */
  eOszlop: string | null
  /** F oszlop (Megjegyzés; Könyveknél a CÍM). */
  fOszlop: string | null
  /** G oszlop — „Helyszín - Felelős". */
  helyszinFelelos: string | null
  /** H oszlop — leltári szám. */
  leltariSzam: string | null
  ev: number | null
  ho: number | null
  nap: number | null
  /** L oszlop — a sor TELJES beszerzési értéke (nem egységár!). */
  ertek: number | null
  mennyiseg: number | null
  mertekegyseg: string | null
  beszerzesiIrat: string | null
  torlesEv: number | null
  torlesHo: number | null
  torlesNap: number | null
  /** S oszlop — törlési irat száma, típusa, indoklás (egyben). */
  torlesSzoveg: string | null
  /** T oszlop (csak Alapeszkozok). */
  hasznalatiIdo: number | null
  /** U oszlop (csak Alapeszkozok). */
  tipusNev: string | null
}

/** Egy importálható tétel a DB kanonikus mezőnevein (insert-kész váz). */
export interface Leltar343Rekord {
  lap: string
  sor: number
  kategoria: InventoryCategory
  megnevezes: string
  szerzo: string | null
  megjegyzes: string | null
  leltari_szam: string | null
  helyszin: string | null
  felelos_neve: string | null
  beszerzes_datuma: string | null
  /** EGYSÉGÁR (a munkafüzet L oszlopa / mennyiség). */
  beszerzesi_ertek: number
  mennyiseg: number
  mertekegyseg: string
  beszerzes_bizonylat: string | null
  torles_datuma: string | null
  torles_bizonylat: string | null
  is_deleted: boolean
  hasznalati_ido_ev: number | null
  alapeszkoz_csoport: 1 | 2 | 3 | null
  ertek_modositas: number
  ertek_modositas_megjegyzes: string | null
}

/**
 * GÉPI hibakód (2026-08-27, javító-varázsló kör).
 *
 * MIÉRT KELL: a magyar `uzenet` a lelkésznek szól, de a varázsló javító
 * lépésének azt kell tudnia, MELYIK mezőt kell javíttatni és milyen feloldás
 * kínálható. Szöveg-egyeztetésre építeni (`uzenet.includes('duplikált')`)
 * néma hibaosztály lenne — egy fogalmazási javítás kioltaná a javító-utat.
 */
export type Leltar343HibaKod =
  | 'hianyzo_megnevezes'
  | 'duplikalt_tetel'
  | 'ismetlodo_ertek_nelkul'
  | 'negativ_alap_nelkul'
  | 'konyv_cim_hianyzik'
  | 'hibas_mennyiseg'
  | 'hianyzo_ertek'
  | 'hianyzo_datum'
  | 'ismeretlen_alapeszkoz_tipus'

export interface Leltar343Hiba {
  lap: string
  sor: number
  uzenet: string
  /** 2026-08-27: gépi kód a javító-varázslóhoz (a régi hívók nem használják). */
  kod?: Leltar343HibaKod
  /**
   * 2026-08-27: a nyers Excel-sor — CSAK az ELUTASÍTOTT (rekordot nem adó)
   * soroknál töltjük ki, hogy a varázsló szerkeszthető űrlapot tudjon
   * építeni belőle. A többi hiba/figyelmeztetés sorához már tartozik rekord.
   */
  nyers?: Leltar343NyersSor
}

export interface Leltar343LapEredmeny {
  rekordok: Leltar343Rekord[]
  hibak: Leltar343Hiba[]
  figyelmeztetesek: Leltar343Hiba[]
}

function uresSor(s: Leltar343NyersSor): boolean {
  return (
    !s.eOszlop && !s.fOszlop && !s.helyszinFelelos && !s.leltariSzam &&
    s.ev == null && s.ertek == null && s.mennyiseg == null &&
    !s.beszerzesiIrat && s.torlesEv == null && !s.torlesSzoveg &&
    s.hasznalatiIdo == null && !s.tipusNev
  )
}

function kerekit2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Egy kategória-lap nyers sorai → importálható rekordok, a Súgó szabályaival:
 *   - alapértelmezések: hó→1, nap→1, mennyiség→1, mértékegység→db;
 *   - ISMÉTLŐDŐ kulcsú sor (azonos megnevezés + leltári szám):
 *       · Alapeszkozok lapon = LE-/FELÉRTÉKELÉS (±L) → `ertek_modositas`;
 *       · más lapon negatív értékkel/mennyiséggel = RÉSZLEGES/TELJES
 *         KIVEZETÉS → mennyiség-csökkentés, ill. törlés-mezők;
 *       · más lapon pozitívan = hangos hiba (duplikátum);
 *   - a törlés-oszlopokkal (P/Q/R) kitöltött alapsor = kivezetett tétel
 *     (`is_deleted`, a sor a Súgó szerint SOSEM törlődik).
 */
export function feldolgozLeltar343Lap(params: {
  lap: Leltar343Lap
  sorok: Leltar343NyersSor[]
  helyszinKatalogus?: Map<string, { helyszin: string | null; felelos: string | null }>
}): Leltar343LapEredmeny {
  const { lap, sorok, helyszinKatalogus } = params
  const rekordok: Leltar343Rekord[] = []
  const hibak: Leltar343Hiba[] = []
  const figyelmeztetesek: Leltar343Hiba[] = []
  const kulcsTerkep = new Map<string, Leltar343Rekord>()

  const kulcs = (megnevezes: string, szam: string | null) =>
    `${egyszerusit(megnevezes)}|${egyszerusit(String(szam || ''))}`

  for (const s of sorok) {
    if (uresSor(s)) continue

    const konyvLap = lap.category === 'konyv'
    // Könyveknél E=Szerző, F=Cím — a megnevezés a CÍM.
    const megnevezes = ((konyvLap ? s.fOszlop : s.eOszlop) || '').trim()
    const szerzo = konyvLap ? (s.eOszlop || '').trim() || null : null
    const megjegyzes = konyvLap ? null : (s.fOszlop || '').trim() || null

    if (!megnevezes) {
      if (konyvLap && szerzo) {
        // Csak szerző van, cím nincs — importáljuk a szerzőt megnevezésként,
        // de hangosan jelezzük (a munkafüzet Hibak-lapja is szólna érte).
        figyelmeztetesek.push({ lap: lap.sheet, sor: s.sor, kod: 'konyv_cim_hianyzik', uzenet: 'A könyv címe (F oszlop) hiányzik — a szerző került a megnevezésbe.' })
      } else {
        hibak.push({ lap: lap.sheet, sor: s.sor, kod: 'hianyzo_megnevezes', nyers: s, uzenet: 'Hiányzó megnevezés — a sor kimaradt.' })
        continue
      }
    }
    const vegsoMegnevezes = megnevezes || szerzo || ''

    const k = kulcs(vegsoMegnevezes, s.leltariSzam)
    const alap = kulcsTerkep.get(k)
    const ertek = s.ertek == null ? null : Number(s.ertek)

    if (alap) {
      // — Ismétlődő kulcs: módosító sor —
      if (lap.category === 'alapeszkoz') {
        const delta = Number(ertek || 0) || 0
        if (delta === 0) {
          hibak.push({ lap: lap.sheet, sor: s.sor, kod: 'ismetlodo_ertek_nelkul', nyers: s, uzenet: 'Ismétlődő alapeszköz-sor érték nélkül — a sor kimaradt.' })
          continue
        }
        alap.ertek_modositas = kerekit2(alap.ertek_modositas + delta)
        const mikor = s.ev ? ` (${s.ev}.)` : ''
        const irat = (s.beszerzesiIrat || s.torlesSzoveg || '').trim()
        const jegyzet = `${delta > 0 ? 'Felértékelés' : 'Leértékelés'}: ${delta > 0 ? '+' : ''}${delta} lej${mikor}${irat ? `, ${irat}` : ''}`
        alap.ertek_modositas_megjegyzes = alap.ertek_modositas_megjegyzes
          ? `${alap.ertek_modositas_megjegyzes} · ${jegyzet}`
          : jegyzet
        continue
      }

      const mennyisegDelta = s.mennyiseg == null ? null : Number(s.mennyiseg)
      const negativ = (ertek != null && ertek < 0) || (mennyisegDelta != null && mennyisegDelta < 0)
      if (!negativ) {
        hibak.push({ lap: lap.sheet, sor: s.sor, kod: 'duplikalt_tetel', nyers: s, uzenet: `Duplikált tétel (azonos megnevezés és leltári szám: „${vegsoMegnevezes}") — a sor kimaradt.` })
        continue
      }
      // Részleges/teljes kivezetés: a levont darabszám (ha nincs megadva, a
      // teljes mennyiség megy ki).
      const levon = mennyisegDelta != null ? Math.abs(mennyisegDelta) : alap.mennyiseg
      const marad = kerekit2(alap.mennyiseg - levon)
      const kivezetesDatum =
        osszerakDatum(s.torlesEv, s.torlesHo, s.torlesNap) ||
        osszerakDatum(s.ev, s.ho, s.nap)
      const kivezetesIrat = (s.torlesSzoveg || s.beszerzesiIrat || '').trim() || null
      if (marad <= 0) {
        alap.is_deleted = true
        alap.torles_datuma = kivezetesDatum
        alap.torles_bizonylat = kivezetesIrat
      } else {
        alap.mennyiseg = marad
        const jegyzet = `Részleges kivezetés: -${levon} ${alap.mertekegyseg}${kivezetesDatum ? ` (${kivezetesDatum})` : ''}${kivezetesIrat ? `, ${kivezetesIrat}` : ''}`
        alap.megjegyzes = alap.megjegyzes ? `${alap.megjegyzes} · ${jegyzet}` : jegyzet
      }
      continue
    }

    // — Új tétel (alapsor) —
    if (ertek != null && ertek < 0) {
      hibak.push({ lap: lap.sheet, sor: s.sor, kod: 'negativ_alap_nelkul', nyers: s, uzenet: 'Negatív értékű sor, amelynek nincs meg az eredeti (pozitív) tétele — a sor kimaradt.' })
      continue
    }

    let mennyiseg = s.mennyiseg == null ? 1 : Number(s.mennyiseg)
    if (!(mennyiseg > 0)) {
      figyelmeztetesek.push({ lap: lap.sheet, sor: s.sor, kod: 'hibas_mennyiseg', uzenet: `Hibás mennyiség (${s.mennyiseg}) — 1 darabbal importáltuk.` })
      mennyiseg = 1
    }

    const teljesErtek = Number(ertek || 0) || 0
    if (teljesErtek <= 0) {
      figyelmeztetesek.push({ lap: lap.sheet, sor: s.sor, kod: 'hianyzo_ertek', uzenet: 'Hiányzó vagy 0 beszerzési érték — a tétel 0 értékkel került be (a munkafüzet Hibak-lapja is jelezné).' })
    }

    const beszerzesDatuma = osszerakDatum(s.ev, s.ho, s.nap)
    if (!beszerzesDatuma) {
      figyelmeztetesek.push({ lap: lap.sheet, sor: s.sor, kod: 'hianyzo_datum', uzenet: 'Hiányzó/hibás beszerzési év — a tétel dátum nélkül került be.' })
    }

    const { helyszin, felelos } = splitHelyszinFelelos(s.helyszinFelelos, helyszinKatalogus)

    const torlesDatum = osszerakDatum(s.torlesEv, s.torlesHo, s.torlesNap)
    const torlesSzoveg = (s.torlesSzoveg || '').trim() || null

    let csoport: 1 | 2 | 3 | null = null
    if (lap.alapeszkozOszlopok) {
      csoport = alapeszkozCsoportFromNev(s.tipusNev)
      if (!csoport && (s.tipusNev || '').trim()) {
        figyelmeztetesek.push({ lap: lap.sheet, sor: s.sor, kod: 'ismeretlen_alapeszkoz_tipus', uzenet: `Ismeretlen alapeszköz-típus: „${s.tipusNev}" — a főcsoport üresen maradt.` })
      }
    }

    const rekord: Leltar343Rekord = {
      lap: lap.sheet,
      sor: s.sor,
      kategoria: lap.category,
      megnevezes: vegsoMegnevezes,
      szerzo,
      megjegyzes,
      leltari_szam: (s.leltariSzam || '').trim() || null,
      helyszin,
      felelos_neve: felelos,
      beszerzes_datuma: beszerzesDatuma,
      beszerzesi_ertek: mennyiseg > 0 ? kerekit2(teljesErtek / mennyiseg) : teljesErtek,
      mennyiseg,
      mertekegyseg: (s.mertekegyseg || '').trim() || 'db',
      beszerzes_bizonylat: (s.beszerzesiIrat || '').trim() || null,
      torles_datuma: torlesDatum,
      torles_bizonylat: torlesSzoveg,
      is_deleted: Boolean(torlesDatum),
      hasznalati_ido_ev: lap.alapeszkozOszlopok && s.hasznalatiIdo != null && Number(s.hasznalatiIdo) > 0
        ? Math.round(Number(s.hasznalatiIdo))
        : null,
      alapeszkoz_csoport: csoport,
      ertek_modositas: 0,
      ertek_modositas_megjegyzes: null,
    }

    kulcsTerkep.set(k, rekord)
    rekordok.push(rekord)
  }

  return { rekordok, hibak, figyelmeztetesek }
}

// ---------------------------------------------------------------------------
// EXPORT — tételek → munkafüzet-sorok
// ---------------------------------------------------------------------------

export interface Leltar343ExportCella {
  /** Oszlopbetű (E..U). */
  col: string
  /** Cella-érték (szám vagy szöveg). */
  v: string | number
}

export interface Leltar343ExportSor {
  /** Excel-sorszám (5-től). */
  r: number
  cellak: Leltar343ExportCella[]
}

function leltariSzamSuffix(szam?: string | null): number {
  const m = String(szam || '').match(/-(\d+)$/)
  return m ? parseInt(m[1]) : Number.MAX_SAFE_INTEGER
}

/**
 * Egy kategória-lap export-sorai a Kartotéka tételeiből.
 *
 * SZABÁLYOK:
 *   - a kivezetett tételek IS mennek (P/Q/R/S kitöltve) — a Súgó szerint a sor
 *     sosem törlődik; a Kukába dobott, de kivezetési adat NÉLKÜLI tételek
 *     viszont kimaradnak (azok nem kivezetések, hanem szemét);
 *   - L = egységár × mennyiség (a munkafüzet a SOR teljes értékét várja);
 *   - értékmódosítás (le-/felértékelés) NEM külön ±sorként megy (a munkafüzet
 *     hibaellenőrzője a 0 mennyiségű sort hibának jelölné), hanem a Megjegyzés
 *     oszlopban, szövegesen — a kezelő a Fisa-lapon vezeti át;
 *   - Könyveknél E=Szerző, F=Cím.
 */
export function epitLeltar343ExportSorok(params: {
  lap: Leltar343Lap
  items: InventoryItem[]
  intezmenyvezeto?: string | null
}): { sorok: Leltar343ExportSor[]; kapacitasFelett: number } {
  const { lap, items, intezmenyvezeto } = params

  const lapTetelek = items
    .filter(item => item.kategoria_key === lap.category)
    .filter(item => !item.deleted || Boolean(item.torles_datuma))
    .sort((a, b) => {
      const d = leltariSzamSuffix(a.leltari_szam) - leltariSzamSuffix(b.leltari_szam)
      if (d !== 0) return d
      return (a.megnevezes || '').localeCompare(b.megnevezes || '', 'hu')
    })

  const sorok: Leltar343ExportSor[] = []

  lapTetelek.forEach((item, index) => {
    const r = 5 + index
    const cellak: Leltar343ExportCella[] = []
    const push = (col: string, v: string | number | null | undefined) => {
      if (v == null || v === '') return
      if (typeof v === 'number' && !Number.isFinite(v)) return
      cellak.push({ col, v })
    }

    const megjegyzesReszek: string[] = []
    if (lap.category !== 'konyv' && item.megjegyzes) megjegyzesReszek.push(item.megjegyzes)
    if (item.ertek_modositas) {
      const elojel = item.ertek_modositas > 0 ? '+' : ''
      megjegyzesReszek.push(
        `Értékmódosítás: ${elojel}${kerekit2(item.ertek_modositas)} lej${item.ertek_modositas_megjegyzes ? ` (${item.ertek_modositas_megjegyzes})` : ''}`,
      )
    }

    if (lap.category === 'konyv') {
      push('E', item.szerzo || '')
      push('F', item.megnevezes)
    } else {
      push('E', item.megnevezes)
      push('F', megjegyzesReszek.join(' · '))
    }

    if (item.helyszin || item.felelos_nev) {
      push('G', joinHelyszinFelelos(item.helyszin, item.felelos_nev, intezmenyvezeto))
    }
    push('H', item.leltari_szam)

    const beszerzes = szetszedDatum(item.beszerzes_datuma)
    if (beszerzes) {
      push('I', beszerzes.ev)
      push('J', beszerzes.ho)
      push('K', beszerzes.nap)
    }

    const mennyiseg = Number(item.mennyiseg || 1) || 1
    push('L', kerekit2((Number(item.beszerzes_erteke || 0) || 0) * mennyiseg))
    push('M', mennyiseg)
    push('N', item.mertekegyseg || 'db')
    push('O', item.beszerzes_bizonylat)

    const torles = szetszedDatum(item.torles_datuma)
    if (torles) {
      push('P', torles.ev)
      push('Q', torles.ho)
      push('R', torles.nap)
      const sSzoveg = [item.torles_bizonylat, item.torles_indoklasa].filter(Boolean).join(', ')
      push('S', sSzoveg)
    }

    if (lap.alapeszkozOszlopok) {
      push('T', item.hasznalati_ido || null)
      const csoport = (item.alapeszkoz_csoport as 1 | 2 | 3 | null) || getAlapeszkozCsoportFromKod(item.katalogus_kod)
      if (csoport) push('U', ALAPESZKOZ_CSOPORT_NEVEK[csoport])
    }

    sorok.push({ r, cellak })
  })

  return {
    sorok,
    kapacitasFelett: Math.max(0, lapTetelek.length - lap.kapacitas),
  }
}

/**
 * A Cimlap helyszín/felelős katalógusa a tételekből: az AKTÍV tételek
 * (helyszín, felelős) párjai, előfordulás szerinti sorrendben, legfeljebb 100
 * pár (B8:C107 — ennyi fér a sablonba).
 */
export function epitHelyszinFelelosParok(
  items: InventoryItem[],
): Array<{ helyszin: string | null; felelos: string | null }> {
  const latott = new Set<string>()
  const parok: Array<{ helyszin: string | null; felelos: string | null }> = []
  for (const item of items) {
    if (item.deleted) continue
    const helyszin = (item.helyszin || '').trim() || null
    const felelos = (item.felelos_nev || '').trim() || null
    if (!helyszin && !felelos) continue
    const kulcs = `${egyszerusit(helyszin || '')}|${egyszerusit(felelos || '')}`
    if (latott.has(kulcs)) continue
    latott.add(kulcs)
    parok.push({ helyszin, felelos })
    if (parok.length >= 100) break
  }
  return parok
}
