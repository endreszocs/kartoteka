/**
 * EGYHÁZMEGYEI ÖSSZESÍTŐ — a számítás TISZTA magja (2026-08-15).
 *
 * MIÉRT KÜLÖN, IMPORT-MENTES FÁJL: ezt a számítást KÉT helyről hívjuk —
 *   (1) a képernyő olvasó akciója (`getMegyeiOsszesito`), és
 *   (2) a felküldés, ami a FAGYASZTOTT pillanatképet készíti
 *       (`veglegesitEsFelkuldOsszesito`).
 * Ha a kettő külön számolna, előbb-utóbb SZÉTHÚZNA: a képernyőn más szám
 * állna, mint a felküldött hivatalos csomagban — pontosan az a hibaosztály,
 * ami 2026-08-11-ig a gyülekezeti számadásnál élt („két pillanatkép, két
 * különböző szám ugyanarra az évre"). Egy számítás, egy forrás.
 * Az import-mentesség egyben azt is lehetővé teszi, hogy a
 * `scripts/selftest-osszesito.mjs` önellenőrzés betöltse és lefuttassa.
 *
 * FAIL-CLOSED ALAPELV: ami nincs beküldve, az LÁTHATÓAN HIÁNYZIK, nem némán
 * nulla. Az összesítő minden szakasza megnevezi, mely gyülekezetek adata
 * hiányzik belőle, és melyeket küldött vissza az egyházmegye javításra —
 * különben az esperes egy „kerek" összesítőt terjesztene fel, amiből fél
 * megye kimaradt.
 *
 * Kánon 90.§: a számvevő a megye gyülekezeteinek zárszámadását és
 * költségvetését „kellő időben ÖSSZESÍTI" — ez a fájl az összesítés számtana.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Bemeneti alakok (a hívó normalizálja rájuk a nyers adatbázis-sorokat)
// ─────────────────────────────────────────────────────────────────────────────

/** A hatókör egy gyülekezete — a TELJES lista (nem a beküldőkből származtatva). */
export interface OsszesitoGyulekezet {
  id: string
  nev: string
}

/**
 * Egy beküldés a `document_submissions`-ből, összesítéshez normalizálva.
 *
 * `lelkesziMezok`: a lelkészi jelentés pillanatképéből MÁR FELOLDOTT
 * (felülírás > auto > kézi, magyar szám-alakkal is) számértékek. A feloldás
 * a kanonikus `mezoErtek` + `parseHuSzam` helperekkel a hívóban történik —
 * itt csak összegzés van, hogy ez a mag import-mentes maradhasson.
 */
export interface OsszesitoBekuldes {
  congregationId: string
  documentType: string
  modificationNumber: number | null
  status: string
  submittedAt: string | null
  snapshot: Record<string, unknown> | null
  lelkesziMezok?: Record<string, number | null> | null
}

/** Egy számadási cél a katalógusból (`szamadasicel`) — a sorok feliratához. */
export interface KodKatalogusTetel {
  kod: string
  nev: string | null
  /** 'B' = bevétel, 'K' = kiadás (a `szamadasicel.type` oszlop értékei). */
  tipus: 'B' | 'K' | null
  sorszam: number | null
}

/** Egy lelkészi jelentés mutató a katalógusból (`JELENTES_MEZOK`). */
export interface MezoKatalogusTetel {
  id: string
  label: string
  egyseg?: string | null
}

export interface OsszesitoBemenet {
  ev: number
  gyulekezetek: OsszesitoGyulekezet[]
  bekuldesek: OsszesitoBekuldes[]
  kodKatalogus: KodKatalogusTetel[]
  mezoKatalogus: MezoKatalogusTetel[]
  /**
   * A már felküldött összesítő időpontja (ISO) — ha van. Ebből derül ki, hogy
   * a felküldés ÓTA érkezett-e újabb gyülekezeti irat (ilyenkor a felküldött
   * csomag már nem teljes, és ezt ki KELL mondani).
   */
  felkuldveEkkor?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Kimeneti alakok
// ─────────────────────────────────────────────────────────────────────────────

/** Egy irat-típus teljességi képe — a fail-closed láthatóság hordozója. */
export interface TipusAllapot {
  /** Beküldött (és nem visszaküldött) — ezek adata BENNE van az összegben. */
  bekuldott: OsszesitoGyulekezet[]
  /** Nem küldte be — az összegből HIÁNYZIK. */
  hianyzo: OsszesitoGyulekezet[]
  /** Az egyházmegye javításra visszaküldte — érvénytelen, tehát hiányzónak számít. */
  visszakuldott: OsszesitoGyulekezet[]
}

/** Egy összesített számadási/költségvetési sor. */
export interface KodSor {
  kod: string
  nev: string | null
  tipus: 'B' | 'K'
  osszeg: number
  /** Hány gyülekezet szerepeltetett ezen a kódon összeget (0 fölött). */
  gyulekezetSzam: number
  sorszam: number | null
}

/** Egy gyülekezet saját végösszegei (a részletező táblához). */
export interface GyulekezetOsszeg {
  id: string
  nev: string
  bevetel: number
  kiadas: number
  egyenleg: number
  /** Költségvetésnél: a MÓDOSÍTOTT terv értékeivel számoltunk-e. */
  modositassalSzamolt?: boolean
}

export interface PenzugyiOsszesites {
  bevetelSorok: KodSor[]
  kiadasSorok: KodSor[]
  osszBevetel: number
  osszKiadas: number
  egyenleg: number
  gyulekezetenkent: GyulekezetOsszeg[]
  allapot: TipusAllapot
}

export interface LeltarOsszesites {
  tetelSzam: number
  konyvSzerintiErtek: number
  jelenlegiErtek: number
  gyulekezetenkent: Array<{ id: string; nev: string; tetelSzam: number; ertek: number }>
  allapot: TipusAllapot
}

export interface ValasztokOsszesites {
  fo: number
  gyulekezetenkent: Array<{ id: string; nev: string; fo: number }>
  allapot: TipusAllapot
}

export interface JelentesOsszesites {
  mezok: Array<{ id: string; label: string; egyseg: string | null; osszeg: number; adatSzam: number }>
  allapot: TipusAllapot
}

export interface MegyeiOsszesito {
  ev: number
  gyulekezetSzam: number
  szamadas: PenzugyiOsszesites
  koltsegvetes: PenzugyiOsszesites
  vagyonleltar: LeltarOsszesites
  valasztok: ValasztokOsszesites
  lelkesziJelentes: JelentesOsszesites
  /**
   * Hány gyülekezeti irat érkezett a felküldött összesítő UTÁN. > 0 esetén a
   * felküldött csomag már nem tükrözi a valóságot — a felület ezt kimondja,
   * és felajánlja a feloldás (visszavonás) útját.
   */
  felkuldesUtaniBekuldesek: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Belső segédek (tisztán, import nélkül)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Számmá alakítás. A pénzügyi pillanatképek MINDIG számot tárolnak (a
 * program számolta), ezért itt nincs magyar szám-alak értelmezés — a lelkészi
 * jelentés szöveges mezőit a hívó oldja fel a kanonikus `parseHuSzam`-mal.
 */
function szam(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function szamVagy0(v: unknown): number {
  return szam(v) ?? 0
}

/** jsonb-térkép → { kód: összeg } (a nem szám értékek kiesnek). */
function kodTerkep(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, number> = {}
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const n = szam(raw)
    if (n !== null) out[String(k)] = n
  }
  return out
}

/**
 * ÉRVÉNYES BEKÜLDÉS: a gyülekezet véglegesítette és beküldte, és az
 * egyházmegye NEM küldte vissza javításra.
 *
 * MIÉRT ZÁR KI A 'returned': a visszaküldött irat épp attól visszaküldött,
 * hogy hibás — ha beleszámolnánk az összesítőbe, a megye a saját maga által
 * megkifogásolt számot terjesztené fel. Ilyenkor a gyülekezet a HIÁNYZÓK közt
 * (külön, „visszaküldve" felirattal) jelenik meg.
 */
function ervenyes(status: string): boolean {
  return status === 'submitted' || status === 'received' || status === 'reviewed' || status === 'finalized'
}

/** A típus szerinti beküldések gyülekezetenként, a LEGFRISSEBB beküldéssel. */
function bekuldesekTipusra(
  bekuldesek: OsszesitoBekuldes[],
  tipus: string,
): Map<string, OsszesitoBekuldes> {
  const map = new Map<string, OsszesitoBekuldes>()
  for (const b of bekuldesek) {
    if (b.documentType !== tipus) continue
    const elozo = map.get(b.congregationId)
    if (!elozo) {
      map.set(b.congregationId, b)
      continue
    }
    // Egy (gyülekezet, év, típus, módosítás) kulcson egy sor él, de a
    // költségvetés-módosításoknál több sor is lehet — a legfrissebb dönt.
    const ujabb = (b.submittedAt || '') > (elozo.submittedAt || '')
    if (ujabb) map.set(b.congregationId, b)
  }
  return map
}

/**
 * Teljességi kép egy típusra: ki küldte be, kinél hiányzik, kié lett
 * visszaküldve. A gyülekezet-lista a hatókör TELJES listája — így a „ki nem
 * adta be" kérdés megválaszolható.
 */
function allapotSzamit(
  gyulekezetek: OsszesitoGyulekezet[],
  bekuldesek: OsszesitoBekuldes[],
  tipusok: string[],
): { allapot: TipusAllapot; ervenyesek: Map<string, OsszesitoBekuldes> } {
  const ervenyesek = new Map<string, OsszesitoBekuldes>()
  const visszakuldottIds = new Set<string>()
  for (const tipus of tipusok) {
    for (const [congId, b] of bekuldesekTipusra(bekuldesek, tipus)) {
      if (ervenyes(b.status)) {
        const elozo = ervenyesek.get(congId)
        if (!elozo || (b.submittedAt || '') > (elozo.submittedAt || '')) ervenyesek.set(congId, b)
      } else if (b.status === 'returned') {
        visszakuldottIds.add(congId)
      }
    }
  }
  const bekuldott: OsszesitoGyulekezet[] = []
  const hianyzo: OsszesitoGyulekezet[] = []
  const visszakuldott: OsszesitoGyulekezet[] = []
  for (const gy of gyulekezetek) {
    if (ervenyesek.has(gy.id)) bekuldott.push(gy)
    else if (visszakuldottIds.has(gy.id)) visszakuldott.push(gy)
    else hianyzo.push(gy)
  }
  return { allapot: { bekuldott, hianyzo, visszakuldott }, ervenyesek }
}

/**
 * A számadás pillanatképének KÉT ismert alakja (2026-08-11, 6. kör P0):
 * a wizard `actualIncome/actualExpense/totalActual*` kulcsokkal küldött, a
 * kanonikus alak `income/expense/total*` kulcsokkal. A régi beküldések miatt
 * MINDKETTŐT olvasnunk kell — különben a megyei összesítő 0 lejt mutatna
 * azokra az évekre, amikor a papíron valós összegek álltak.
 */
function olvasSzamadas(snap: Record<string, unknown> | null): {
  bevetel: Record<string, number>
  kiadas: Record<string, number>
  osszBevetel: number
  osszKiadas: number
} {
  const s = snap || {}
  const bevetel = Object.keys(kodTerkep(s.income)).length
    ? kodTerkep(s.income)
    : kodTerkep(s.actualIncome)
  const kiadas = Object.keys(kodTerkep(s.expense)).length
    ? kodTerkep(s.expense)
    : kodTerkep(s.actualExpense)
  const sum = (rec: Record<string, number>) => Object.values(rec).reduce((a, b) => a + b, 0)
  return {
    bevetel,
    kiadas,
    osszBevetel: szam(s.totalIncome) ?? szam(s.totalActualIncome) ?? sum(bevetel),
    osszKiadas: szam(s.totalExpense) ?? szam(s.totalActualExpense) ?? sum(kiadas),
  }
}

/**
 * A költségvetés pillanatképe: `budgetData` térkép, soronként
 * `szamadasicelid` + `tervezett` (+ `modositott`/`mod2`/`mod3`).
 *
 * ÉRVÉNYES ÖSSZEG: a LEGKÉSŐBBI kitöltött módosítás, ennek hiányában a
 * tervezett. Így az összesítő azt mutatja, ami a gyülekezetnél ÉPP érvényben
 * van — nem az év eleji, rég túlhaladott tervet.
 */
function olvasKoltsegvetes(snap: Record<string, unknown> | null): {
  sorok: Array<{ kod: string; osszeg: number }>
  modositassalSzamolt: boolean
} {
  const s = snap || {}
  const nyers = s.budgetData
  const sorok: Array<{ kod: string; osszeg: number }> = []
  let modositassalSzamolt = false
  if (nyers && typeof nyers === 'object') {
    for (const ertek of Object.values(nyers as Record<string, unknown>)) {
      if (!ertek || typeof ertek !== 'object') continue
      const r = ertek as Record<string, unknown>
      const kod = r.szamadasicelid == null ? '' : String(r.szamadasicelid)
      if (!kod) continue
      const mod3 = szam(r.mod3)
      const mod2 = szam(r.mod2)
      const mod1 = szam(r.modositott)
      const terv = szam(r.tervezett)
      const ervenyesOsszeg = mod3 ?? mod2 ?? mod1 ?? terv
      if (ervenyesOsszeg === null) continue
      if (mod3 !== null || mod2 !== null || mod1 !== null) modositassalSzamolt = true
      sorok.push({ kod, osszeg: ervenyesOsszeg })
    }
  }
  // PÓTLÁSKÉNT: a megyei felküldő „budgetSorok" alakja (mentett sorokból).
  const potlas = s.budgetSorok
  if (sorok.length === 0 && Array.isArray(potlas)) {
    for (const ertek of potlas) {
      if (!ertek || typeof ertek !== 'object') continue
      const r = ertek as Record<string, unknown>
      const kod = r.szamadasicelid == null ? '' : String(r.szamadasicelid)
      if (!kod) continue
      const ervenyesOsszeg =
        szam(r.osszeg_mod_3) ?? szam(r.osszeg_mod_2) ?? szam(r.osszeg_mod_1) ?? szam(r.tervezett)
      if (ervenyesOsszeg === null) continue
      sorok.push({ kod, osszeg: ervenyesOsszeg })
    }
  }
  return { sorok, modositassalSzamolt }
}

/** Kód-halmozó → rendezett sor-lista, a katalógus nevével és sorrendjével. */
function sorokBol(
  halmoz: Map<string, { osszeg: number; gyulekezetSzam: number }>,
  katalogus: Map<string, KodKatalogusTetel>,
  tipus: 'B' | 'K',
): KodSor[] {
  const sorok: KodSor[] = []
  for (const [kod, ertek] of halmoz) {
    const kat = katalogus.get(kod)
    sorok.push({
      kod,
      nev: kat?.nev ?? null,
      tipus,
      osszeg: ertek.osszeg,
      gyulekezetSzam: ertek.gyulekezetSzam,
      sorszam: kat?.sorszam ?? null,
    })
  }
  // A hivatalos ív sorrendje a katalógus `sorszam`-a; ismeretlen kód a végére,
  // kód szerint rendezve (így sosem tűnik el egy sor sem).
  return sorok.sort((a, b) => {
    if (a.sorszam !== null && b.sorszam !== null && a.sorszam !== b.sorszam) return a.sorszam - b.sorszam
    if (a.sorszam !== null && b.sorszam === null) return -1
    if (a.sorszam === null && b.sorszam !== null) return 1
    return a.kod.localeCompare(b.kod, 'hu')
  })
}

function halmozoba(
  halmoz: Map<string, { osszeg: number; gyulekezetSzam: number }>,
  kod: string,
  osszeg: number,
): void {
  const elozo = halmoz.get(kod)
  if (elozo) {
    elozo.osszeg += osszeg
    elozo.gyulekezetSzam += 1
  } else {
    halmoz.set(kod, { osszeg, gyulekezetSzam: 1 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A fő számítás
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A megye egy évének ÖSSZESÍTŐJE a gyülekezetek beküldött (véglegesített)
 * iratainak fagyasztott pillanatképeiből.
 *
 * Determinisztikus és mellékhatás-mentes: ugyanarra a bemenetre mindig
 * ugyanaz a kimenet — ezért használhatja a képernyő ÉS a felküldött hivatalos
 * pillanatkép is ugyanazt az eredményt.
 */
export function szamitMegyeiOsszesito(bemenet: OsszesitoBemenet): MegyeiOsszesito {
  const { ev, gyulekezetek, bekuldesek, kodKatalogus, mezoKatalogus } = bemenet
  const katalogus = new Map(kodKatalogus.map((k) => [k.kod, k]))
  const nevMap = new Map(gyulekezetek.map((gy) => [gy.id, gy.nev]))

  // ── Számadás ──────────────────────────────────────────────────────────────
  const szamadasAll = allapotSzamit(gyulekezetek, bekuldesek, ['szamadas'])
  const bevHalmoz = new Map<string, { osszeg: number; gyulekezetSzam: number }>()
  const kiaHalmoz = new Map<string, { osszeg: number; gyulekezetSzam: number }>()
  const szamadasGyulekezetenkent: GyulekezetOsszeg[] = []
  let szamadasBevetel = 0
  let szamadasKiadas = 0
  for (const [congId, b] of szamadasAll.ervenyesek) {
    const olvasott = olvasSzamadas(b.snapshot)
    for (const [kod, osszeg] of Object.entries(olvasott.bevetel)) halmozoba(bevHalmoz, kod, osszeg)
    for (const [kod, osszeg] of Object.entries(olvasott.kiadas)) halmozoba(kiaHalmoz, kod, osszeg)
    szamadasBevetel += olvasott.osszBevetel
    szamadasKiadas += olvasott.osszKiadas
    szamadasGyulekezetenkent.push({
      id: congId,
      nev: nevMap.get(congId) || 'Ismeretlen gyülekezet',
      bevetel: olvasott.osszBevetel,
      kiadas: olvasott.osszKiadas,
      egyenleg: olvasott.osszBevetel - olvasott.osszKiadas,
    })
  }

  // ── Költségvetés (alap + módosítások; a legfrissebb érvényes csomag) ──────
  const kvAll = allapotSzamit(gyulekezetek, bekuldesek, ['koltsegvetes', 'koltsegvetes_modositas'])
  const kvBevHalmoz = new Map<string, { osszeg: number; gyulekezetSzam: number }>()
  const kvKiaHalmoz = new Map<string, { osszeg: number; gyulekezetSzam: number }>()
  const kvGyulekezetenkent: GyulekezetOsszeg[] = []
  let kvBevetel = 0
  let kvKiadas = 0
  for (const [congId, b] of kvAll.ervenyesek) {
    const olvasott = olvasKoltsegvetes(b.snapshot)
    let gyBev = 0
    let gyKia = 0
    for (const sor of olvasott.sorok) {
      const kat = katalogus.get(sor.kod)
      // Ismeretlen típusú kód: a KIADÁS oldalra soha nem tesszük vaktában —
      // a bevétel/kiadás besorolás a katalógusból jön; ha nincs, külön,
      // „besorolatlan" kódként a bevétel-táblában látszik, hogy szem előtt
      // legyen (némán elnyelni a legrosszabb).
      if (kat?.tipus === 'K') {
        halmozoba(kvKiaHalmoz, sor.kod, sor.osszeg)
        gyKia += sor.osszeg
      } else {
        halmozoba(kvBevHalmoz, sor.kod, sor.osszeg)
        gyBev += sor.osszeg
      }
    }
    kvBevetel += gyBev
    kvKiadas += gyKia
    kvGyulekezetenkent.push({
      id: congId,
      nev: nevMap.get(congId) || 'Ismeretlen gyülekezet',
      bevetel: gyBev,
      kiadas: gyKia,
      egyenleg: gyBev - gyKia,
      modositassalSzamolt: olvasott.modositassalSzamolt,
    })
  }

  // ── Vagyonleltári jelentés ────────────────────────────────────────────────
  const leltarAll = allapotSzamit(gyulekezetek, bekuldesek, ['vagyonleltar'])
  let tetelSzam = 0
  let konyvSzerintiErtek = 0
  let jelenlegiErtek = 0
  const leltarGyulekezetenkent: Array<{ id: string; nev: string; tetelSzam: number; ertek: number }> = []
  for (const [congId, b] of leltarAll.ervenyesek) {
    const s = b.snapshot || {}
    const db = szamVagy0(s.itemCount)
    const konyv = szamVagy0(s.totalBookValue)
    const jelen = szamVagy0(s.totalCurrentValue)
    tetelSzam += db
    konyvSzerintiErtek += konyv
    jelenlegiErtek += jelen
    leltarGyulekezetenkent.push({
      id: congId,
      nev: nevMap.get(congId) || 'Ismeretlen gyülekezet',
      tetelSzam: db,
      ertek: konyv,
    })
  }

  // ── Választók névjegyzéke ─────────────────────────────────────────────────
  const valasztokAll = allapotSzamit(gyulekezetek, bekuldesek, ['valasztok_nevjegyzeke'])
  let valasztoFo = 0
  const valasztokGyulekezetenkent: Array<{ id: string; nev: string; fo: number }> = []
  for (const [congId, b] of valasztokAll.ervenyesek) {
    const fo = szamVagy0((b.snapshot || {}).voterCount)
    valasztoFo += fo
    valasztokGyulekezetenkent.push({
      id: congId,
      nev: nevMap.get(congId) || 'Ismeretlen gyülekezet',
      fo,
    })
  }

  // ── Lelkészi jelentés (a hivatalos Adatlap mutatói) ───────────────────────
  const jelentesAll = allapotSzamit(gyulekezetek, bekuldesek, ['lelkeszi_jelentes'])
  const mezoOsszeg = new Map<string, { osszeg: number; adatSzam: number }>()
  for (const [, b] of jelentesAll.ervenyesek) {
    const mezok = b.lelkesziMezok || {}
    for (const kat of mezoKatalogus) {
      const ertek = szam(mezok[kat.id])
      if (ertek === null) continue
      const elozo = mezoOsszeg.get(kat.id)
      if (elozo) {
        elozo.osszeg += ertek
        elozo.adatSzam += 1
      } else {
        mezoOsszeg.set(kat.id, { osszeg: ertek, adatSzam: 1 })
      }
    }
  }

  // ── „A felküldés óta érkezett-e újabb irat?" ──────────────────────────────
  let felkuldesUtaniBekuldesek = 0
  if (bemenet.felkuldveEkkor) {
    for (const b of bekuldesek) {
      if (!ervenyes(b.status)) continue
      if ((b.submittedAt || '') > bemenet.felkuldveEkkor) felkuldesUtaniBekuldesek += 1
    }
  }

  return {
    ev,
    gyulekezetSzam: gyulekezetek.length,
    szamadas: {
      bevetelSorok: sorokBol(bevHalmoz, katalogus, 'B'),
      kiadasSorok: sorokBol(kiaHalmoz, katalogus, 'K'),
      osszBevetel: szamadasBevetel,
      osszKiadas: szamadasKiadas,
      egyenleg: szamadasBevetel - szamadasKiadas,
      gyulekezetenkent: szamadasGyulekezetenkent.sort((a, b) => a.nev.localeCompare(b.nev, 'hu')),
      allapot: szamadasAll.allapot,
    },
    koltsegvetes: {
      bevetelSorok: sorokBol(kvBevHalmoz, katalogus, 'B'),
      kiadasSorok: sorokBol(kvKiaHalmoz, katalogus, 'K'),
      osszBevetel: kvBevetel,
      osszKiadas: kvKiadas,
      egyenleg: kvBevetel - kvKiadas,
      gyulekezetenkent: kvGyulekezetenkent.sort((a, b) => a.nev.localeCompare(b.nev, 'hu')),
      allapot: kvAll.allapot,
    },
    vagyonleltar: {
      tetelSzam,
      konyvSzerintiErtek,
      jelenlegiErtek,
      gyulekezetenkent: leltarGyulekezetenkent.sort((a, b) => a.nev.localeCompare(b.nev, 'hu')),
      allapot: leltarAll.allapot,
    },
    valasztok: {
      fo: valasztoFo,
      gyulekezetenkent: valasztokGyulekezetenkent.sort((a, b) => a.nev.localeCompare(b.nev, 'hu')),
      allapot: valasztokAll.allapot,
    },
    lelkesziJelentes: {
      mezok: mezoKatalogus
        .filter((kat) => mezoOsszeg.has(kat.id))
        .map((kat) => ({
          id: kat.id,
          label: kat.label,
          egyseg: kat.egyseg ?? null,
          osszeg: mezoOsszeg.get(kat.id)?.osszeg ?? 0,
          adatSzam: mezoOsszeg.get(kat.id)?.adatSzam ?? 0,
        })),
      allapot: jelentesAll.allapot,
    },
    felkuldesUtaniBekuldesek,
  }
}
