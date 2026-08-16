/**
 * EGYHÁZKERÜLETI ÖSSZESÍTŐ — a számítás TISZTA magja (2026-08-17, kerületi S4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIT ÖSSZESÍT ÉS MIBŐL — A K4 DÖNTÉS HATÁRA
 * ════════════════════════════════════════════════════════════════════════════
 * Endre K4 döntése (2026-08-16, élesben): „A kerület nem írhatja és nem is
 * olvashatja a kerület gyülekezeteinek és egyházmegyéinek az adatait, csak a
 * HIVATALOSAN BEKÜLDÖTT adatokat illetve azoknak az ÖSSZESÍTŐJÉT!"
 *
 * Ezért ez a mag KIZÁRÓLAG a megyei FELTERJESZTÉSEK fagyasztott
 * `snapshot_data`-jából dolgozik (`diocese_felterjesztes`, négy irat-típus:
 * megyei_szamadas, megyei_koltsegvetes, megyei_koltsegvetes_modositas,
 * szamvevoi_osszesito). A megyék KÖNYVEIBE (diocese_befizetes / diocese_kiadas /
 * diocese_koltsegvetes / diocese_annual_reports) sem ez a fájl, sem a hívója
 * nem néz bele — azoknak a policy-knak a kerületi ága 2026-08-16-án meg is
 * szűnt, tehát 0 sort adnának. A `dioceses` TÖRZSADAT (id, name) olvasható: az
 * nem „a megye adata", hanem a feladó neve a borítékon.
 *
 * EBBŐL KÖVETKEZIK, hogy a mag SEMMIT nem kérdez le: a hívó állítja össze a
 * bemenetet (a hatókör TELJES megye-listáját, a felterjesztéseket a
 * pillanatképeikkel és a számadási cél katalógust), a mag pedig csak SZÁMOL.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KÜLÖN, IMPORT-MENTES FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * Ugyanaz a minta, mint a megyei szinten (`lib/diocese/osszesito-core.ts`): a
 * képernyő és — amikor a kerületi felküldés/nyomtatvány megépül — a FAGYASZTOTT
 * hivatalos csomag UGYANEZT az egy számítást hívja. Két külön számítás
 * előbb-utóbb széthúzna, és a képernyőn más szám állna, mint a hivatalos
 * iraton (ez a hibaosztály a gyülekezeti számadásnál 2026-08-11-ig élt).
 *
 * Az import-mentesség egyben azt is lehetővé teszi, hogy a
 * `scripts/selftest-keruleti-osszesito.mjs` önellenőrzés betöltse és
 * lefuttassa. A mag ezért DETERMINISZTIKUS is: nincs benne `new Date()`,
 * `Math.random()` és semmilyen mellékhatás — ugyanarra a bemenetre mindig
 * ugyanaz a kimenet, és a bemenetet SOHA nem írja át (a rendezések másolaton
 * futnak).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A NÉGY SZABÁLY (a megyei magból, MEGYÉKRE alkalmazva)
 * ════════════════════════════════════════════════════════════════════════════
 *  (1) AMI NINCS FELTERJESZTVE, AZ LÁTHATÓAN HIÁNYZIK. A hatókör TELJES
 *      egyházmegye-listájából dolgozunk, nem a felterjesztésekből — különben
 *      egy „kerek" kerületi végösszeg mögött fél kerület hiánya rejtőzne.
 *  (2) A VISSZAKÜLDÖTT ('returned') IRAT NEM SZÁMÍT BELE. Azt épp a kerület
 *      küldte vissza javításra: ha beleszámolnánk, a kerület a saját maga által
 *      megkifogásolt számot összesítené. A megye ilyenkor KÜLÖN, nevesítve
 *      látszik. Ugyanígy nem számít a 'draft' (fel sem küldött vagy visszavont).
 *      ÉS A VEGYES ESET IS NEVESÍTVE VAN: ha ugyanattól a megyétől van érvényes
 *      irat ÉS visszaküldött is, a megye a `bekuldottDeVanVisszakuldott`
 *      listára is felkerül — különben a kerület azt látná, ott minden rendben.
 *  (3) A PILLANATKÉPNEK TÖBB ALAKJA VAN, ÉS A KANONIKUS AZ ERŐSEBB. A megyei
 *      számadás fagyasztott csomagja lehet kanonikus (`income`/`totalIncome`),
 *      régi wizard-alak (`actualIncome`/`totalActualIncome`) vagy alakVerzió 1 —
 *      utóbbinál a FELSŐ SZINT a nyers, ívre NEM szűrt szerver-összesítés, a
 *      hivatalos adat pedig a `kanonikus` alobjektumban van, ezért az MINDIG
 *      erősebb (a nyers csak fallback). A számvevői összesítő lehet burkolt
 *      (`{ alakVerzio, osszesito: {…} }`) vagy csupasz. Ha a mag csak az egyiket
 *      olvasná, a korábbi évek kerületi összesítője 0 lejt mutatna.
 *  (4) A KÖLTSÉGVETÉSNÉL A LEGUTOLSÓ MÓDOSÍTÁS AZ ÉRVÉNYES — KÉT SZINTEN:
 *      (a) irat-szinten a magasabb `modificationNumber`-ű felterjesztés veri az
 *          alacsonyabbat és az alap-költségvetést;
 *      (b) soron belül a `mod3 ?? mod2 ?? modositott ?? tervezett` sorrend.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Bemeneti alakok (a hívó normalizálja rájuk a nyers adatbázis-sorokat)
// ─────────────────────────────────────────────────────────────────────────────

/** A hatókör egy egyházmegyéje — a TELJES lista (nem a felterjesztőkből!). */
export interface OsszesitoEgyhazmegye {
  id: string
  nev: string
}

/**
 * Egy megyei felterjesztés (`diocese_felterjesztes`), összesítéshez normalizálva.
 *
 * `docType` SZÁNDÉKOSAN laza `string`: egy jövőbeli, még ismeretlen irat-típus
 * ne fordítási hibával álljon meg, hanem egyszerűen ne kerüljön bele egyik
 * szakaszba sem (a mag csak a felsorolt típusokat használja).
 */
export interface OsszesitoFelterjesztes {
  dioceseId: string
  docType: string
  /**
   * Az irat éve — OPCIONÁLIS, és ha meg van adva, VÉDŐHÁLÓKÉNT szűrünk rá.
   *
   * MIÉRT ÍGY: a hívó rendes esetben már az adatbázisban egy évre szűr
   * (`.eq('year', ev)`), tehát nem kötelező újra elküldenie. Ha viszont
   * elküldi, a mag ellenőrzi is: egy több évet hozó (átalakított vagy hibás)
   * bemenet SOHA ne keverhessen két év adatát egyetlen hivatalos összesítőbe.
   */
  year?: number | null
  /** Költségvetés-módosításnál 1–3, egyébként 0/null (a tábla 0-t tárol). */
  modificationNumber: number | null
  /** 'draft' | 'submitted' | 'received' | 'returned' */
  status: string
  /** A felküldés időpontja (ISO) — csak döntetlen-bontásra használjuk. */
  submittedAt?: string | null
  /**
   * A FAGYASZTOTT pillanatkép (`diocese_felterjesztes.snapshot_data`): ez az
   * összesítés EGYETLEN adatforrása. A mezőnév szándékosan azonos a megyei mag
   * `OsszesitoBekuldes.snapshot`-jával — a két szint így ugyanazt a szót
   * használja ugyanarra a dologra.
   */
  snapshot: Record<string, unknown> | null
}

/** Egy számadási cél a katalógusból (`szamadasicel`) — a sorok feliratához. */
export interface KodKatalogusTetel {
  kod: string
  nev: string | null
  /** 'B' = bevétel, 'K' = kiadás (a `szamadasicel.type` oszlop értékei). */
  tipus: 'B' | 'K' | null
  sorszam: number | null
}

export interface KeruletiOsszesitoBemenet {
  ev: number
  /** A kerület ÖSSZES egyházmegyéje — ebből derül ki, kinek az adata hiányzik. */
  megyek: OsszesitoEgyhazmegye[]
  felterjesztesek: OsszesitoFelterjesztes[]
  kodKatalogus: KodKatalogusTetel[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Kimeneti alakok
// ─────────────────────────────────────────────────────────────────────────────

/** Egy irat-típus teljességi képe — a fail-closed láthatóság hordozója. */
export interface TipusAllapot {
  /** Felterjesztette és nem lett visszaküldve — az adata BENNE van az összegben. */
  bekuldott: OsszesitoEgyhazmegye[]
  /** Nem terjesztette fel (nincs sora, vagy piszkozat/visszavont) — HIÁNYZIK. */
  hianyzo: OsszesitoEgyhazmegye[]
  /** A kerület javításra visszaküldte — érvénytelen, tehát hiányzónak számít. */
  visszakuldott: OsszesitoEgyhazmegye[]
  /**
   * BEKÜLDÖTT, DE VAN NÁLA JAVÍTÁS ALATT LÉVŐ IRAT IS — a `bekuldott` RÉSZHALMAZA
   * (nem külön ág: az adata benne van az összegben).
   *
   * TÜNET, ami miatt ez a negyedik lista kell (2026-08-17, adverzáriális
   * ellenőrzés): ha ugyanattól a megyétől van ÉRVÉNYES irat ÉS visszaküldött is
   * (pl. az alap költségvetés 'received', az 1. módosítás 'returned'), a megye
   * a `bekuldott` ágra került, és a `visszakuldott` névsorban SEHOL nem jelent
   * meg. A kerület így azt látta, ott minden rendben — pedig javítás alatt van
   * egy irat, és az összegben nem a legutolsó terv áll. A 2. szabály (a
   * visszaküldött irat nevesítve látszik) itt NÉMÁN elmaradt.
   */
  bekuldottDeVanVisszakuldott: OsszesitoEgyhazmegye[]
}

/** Egy kódsor megyénkénti bontása (a hivatalos összesítő ív oszlopai). */
export interface MegyeReszosszeg {
  id: string
  nev: string
  osszeg: number
}

/** Egy összesített számadási/költségvetési sor. */
export interface KodSor {
  kod: string
  nev: string | null
  tipus: 'B' | 'K'
  osszeg: number
  /** Hány egyházmegye szerepeltetett ezen a kódon összeget. */
  megyeSzam: number
  sorszam: number | null
  /** MEGYÉNKÉNTI bontás — enélkül a végösszeg mögött nem látszik, ki mennyit adott. */
  megyenkent: MegyeReszosszeg[]
}

/** Egy egyházmegye saját végösszegei (a részletező táblához). */
export interface MegyeOsszeg {
  id: string
  nev: string
  bevetel: number
  kiadas: number
  egyenleg: number
  /** Költségvetésnél: a MÓDOSÍTOTT tervvel számoltunk-e (soron belüli módosítás). */
  modositassalSzamolt?: boolean
  /**
   * Költségvetésnél: HÁNYADIK módosítás felterjesztéséből származik a szám
   * (0 = az alap költségvetés). Enélkül a kerület nem tudná megmondani, hogy
   * egy megye száma az év eleji terv vagy a legutolsó módosítás.
   */
  modositasSzam?: number
  /**
   * Van-e ennél a megyénél JAVÍTÁS ALATT lévő (visszaküldött) irat ebben a
   * szakaszban — miközben az itt szereplő szám egy KORÁBBI, érvényes
   * felterjesztésből származik.
   *
   * MIÉRT KELL A SORBAN IS (nem elég a szakasz-szintű lista): a részletező
   * táblában a megye sora amúgy „rendben lévőnek" néz ki, holott a szám nem a
   * legutolsó tervet tükrözi. Lásd a `TipusAllapot.bekuldottDeVanVisszakuldott`
   * kommentjét — ugyanaz a 2026-08-17-i tünet.
   */
  vanVisszakuldottIrat: boolean
}

export interface PenzugyiOsszesites {
  bevetelSorok: KodSor[]
  kiadasSorok: KodSor[]
  osszBevetel: number
  osszKiadas: number
  egyenleg: number
  megyenkent: MegyeOsszeg[]
  allapot: TipusAllapot
}

/** Egy megye számvevői összesítőjének kulcs-mutatói (a fagyasztott csomagból). */
export interface SzamvevoiMegyeSor {
  id: string
  nev: string
  /** A megye gyülekezeteinek száma — a megyei összesítő pillanatképe szerint. */
  gyulekezetSzam: number
  /** Hány gyülekezet számadása van BENNE a megyei összesítőben. */
  bekuldottGyulekezetSzam: number
  /**
   * MELYIK gyülekezetek adata hiányzik a megye összesítőjéből — NÉV SZERINT.
   * A hiány így NEM áll meg a megyehatáron: a kerület is látja, hogy egy
   * „kerek" megyei szám mögött hány gyülekezet nem adott be semmit.
   */
  hianyzoGyulekezetek: string[]
  /** A megye által javításra visszaküldött gyülekezeti iratok — NÉV SZERINT. */
  visszakuldottGyulekezetek: string[]
  bevetel: number
  kiadas: number
  egyenleg: number
  koltsegvetesBevetel: number
  koltsegvetesKiadas: number
  leltarTetelSzam: number
  leltarErtek: number
  valasztoFo: number
}

/**
 * EGY KULCS-MUTATÓ a kerületi képhez: a megyék számvevői összesítőiből
 * összegzett szám, felirattal és mértékegységgel.
 *
 * MIÉRT EGY LISTA ÉS NEM CSAK NEVESÍTETT MEZŐK: a felület (és a nyomtatvány)
 * EGY táblában sorolja fel őket, felirat + érték párokként. Ha a feliratokat a
 * képernyő találná ki, a papíron és a képernyőn más név állhatna ugyanarra a
 * számra. A nevesített összegek emellett külön is megvannak (lásd lentebb) —
 * a `mutatok` az azokból épített, MEGJELENÍTÉSRE kész sorrend.
 */
export interface SzamvevoiMutato {
  id: string
  label: string
  /** 'RON', 'db', 'fő' … vagy null, ha a szám önmagában áll. */
  egyseg: string | null
  osszeg: number
  /** Hány egyházmegye adata áll e mögött a szám mögött. */
  megyeSzam: number
}

export interface SzamvevoiOsszesites {
  megyenkent: SzamvevoiMegyeSor[]
  /**
   * A kerületi kulcs-mutatók MEGJELENÍTÉSRE kész listája.
   *
   * ÜRES, ha egyetlen megye sem terjesztett fel számvevői összesítőt — így a
   * felület a „még nincs miből mutatót számolni" mondatot mondhatja a
   * félrevezető, csupa nulla táblázat helyett.
   */
  mutatok: SzamvevoiMutato[]
  /** A kerület gyülekezeteinek száma a felterjesztett összesítők szerint. */
  gyulekezetSzam: number
  /** Hány gyülekezeti SZÁMADÁS van benne a megyei összesítőkben. */
  bekuldottGyulekezetSzam: number
  /**
   * Hány gyülekezeti SZÁMADÁS hiányzik vagy lett visszaküldve.
   *
   * ⚠️ CSAK A SZÁMADÁS — a megyei csomag `szamadas.allapot`-jából számol, a
   * költségvetés/leltár/választók szakaszok állapotát NEM görgeti fel. A
   * felirata (lásd a `mutatok` listát) ezért szűken „gyülekezeti számadás"-t
   * mond: 2026-08-17-ig „gyülekezeti irat" állt ott, ami TÖBBET ígért, mint
   * amennyit a szám takar — a felirat és a szám MONDJON UGYANAZT.
   */
  hianyzoGyulekezetSzam: number
  bevetel: number
  kiadas: number
  egyenleg: number
  koltsegvetesBevetel: number
  koltsegvetesKiadas: number
  leltarTetelSzam: number
  leltarErtek: number
  valasztoFo: number
  allapot: TipusAllapot
}

export interface KeruletiOsszesito {
  ev: number
  /** A hatókör TELJES megye-száma (nem a felterjesztőké). */
  megyeSzam: number
  szamadas: PenzugyiOsszesites
  koltsegvetes: PenzugyiOsszesites
  szamvevoiOsszesito: SzamvevoiOsszesites
}

// ─────────────────────────────────────────────────────────────────────────────
// Belső segédek (tisztán, import nélkül)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A hívó által nem azonosított feladó felirata. MIÉRT NEM NYELJÜK EL: ha egy
 * felterjesztés olyan megyétől jön, ami már nincs a hatókör listájában (pl.
 * átsorolták másik kerülethez), a pénze akkor SEM tűnhet el némán az
 * összegből — láthatóan, ezzel a felirattal jelenik meg.
 */
const ISMERETLEN_MEGYE = 'Ismeretlen egyházmegye'

/** Számmá alakítás — a pénzügyi pillanatképek MINDIG számot tárolnak. */
function szam(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function szamVagy0(v: unknown): number {
  return szam(v) ?? 0
}

/** jsonb-objektum biztonságos kicsomagolása (tömb és null nélkül). */
function objektum(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return v as Record<string, unknown>
}

/** jsonb-térkép → { kód: összeg } (a nem szám értékek kiesnek). */
function kodTerkep(v: unknown): Record<string, number> {
  const forras = objektum(v)
  const out: Record<string, number> = {}
  for (const [k, raw] of Object.entries(forras)) {
    const n = szam(raw)
    if (n !== null) out[String(k)] = n
  }
  return out
}

/** Az első NEM ÜRES kód-térkép (a pillanatkép-alakok sorrendjében). */
function elsoNemUres(...jeloltek: Array<Record<string, number>>): Record<string, number> {
  for (const j of jeloltek) {
    if (Object.keys(j).length > 0) return j
  }
  return {}
}

function osszead(rec: Record<string, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0)
}

/**
 * ÉRVÉNYES FELTERJESZTÉS: a megye véglegesítette és FELKÜLDTE, és a kerület nem
 * küldte vissza javításra.
 *
 * MIÉRT CSAK EZ A KETTŐ: a `diocese_felterjesztes.status` CHECK-je négy értéket
 * enged. A 'draft' vagy fel sem küldött, vagy VISSZAVONT irat (a feloldás-kérés
 * első ága szándékosan 'draft'-ra állítja vissza a sort) — egyik sem hivatalos
 * beküldés. A 'returned' pedig épp attól visszaküldött, hogy a kerület
 * megkifogásolta. Ismeretlen (jövőbeli) státusz FAIL-CLOSED módon szintén nem
 * számít bele: inkább látszódjon hiányzónak, mint hogy egy nem véglegesített
 * szám csendben hivatalos végösszeggé váljon.
 */
function ervenyesStatus(status: string): boolean {
  return status === 'submitted' || status === 'received'
}

function modSzam(f: OsszesitoFelterjesztes): number {
  return Number(f.modificationNumber) || 0
}

/**
 * Melyik a KÉSŐBBI (érvényes) felterjesztés ugyanattól a megyétől?
 *
 * ELSŐ a módosítás-szám (4. szabály: a 2. költségvetés-módosítás veri az 1.-et
 * és az alap tervet), és csak DÖNTETLENNÉL dönt a felküldés ideje. Fordított
 * sorrendben egy régebbi dátumú, de magasabb sorszámú módosítás kieshetne.
 */
function ujabb(a: OsszesitoFelterjesztes, b: OsszesitoFelterjesztes): boolean {
  const am = modSzam(a)
  const bm = modSzam(b)
  if (am !== bm) return am > bm
  return (a.submittedAt || '') > (b.submittedAt || '')
}

/** Név szerinti, majd id szerinti rendezés — stabil és determinisztikus. */
function nevSzerint<T extends { id: string; nev: string }>(a: T, b: T): number {
  return a.nev.localeCompare(b.nev, 'hu') || a.id.localeCompare(b.id)
}

interface AllapotEredmeny {
  allapot: TipusAllapot
  /** A számoláshoz kiválasztott felterjesztés megyénként. */
  ervenyesek: Map<string, OsszesitoFelterjesztes>
  /**
   * MELY megyéknek van EGYÁLTALÁN visszaküldött irata ebben a szakaszban —
   * akkor is, ha emellett van érvényes, beszámított iratuk is. Ebből tudja a
   * megyénkénti tábla a `vanVisszakuldottIrat` jelzőt kitenni.
   */
  visszakuldottIds: Set<string>
}

/**
 * Teljességi kép egy szakaszra: ki terjesztette fel, kinél hiányzik, kié lett
 * visszaküldve. A megye-lista a hatókör TELJES listája (1. szabály), az ÉV
 * szűrése pedig itt történik — így egy több évet hozó hívó sem keverheti
 * össze két év adatát egyetlen összesítőben.
 */
function allapotSzamit(
  ev: number,
  megyek: OsszesitoEgyhazmegye[],
  felterjesztesek: OsszesitoFelterjesztes[],
  tipusok: string[],
): AllapotEredmeny {
  const ervenyesek = new Map<string, OsszesitoFelterjesztes>()
  const visszakuldottIds = new Set<string>()

  for (const f of felterjesztesek) {
    // Az év csak akkor szűr, ha a hívó el is küldte (lásd a mező kommentjét).
    if (f.year != null && Number(f.year) !== ev) continue
    if (!tipusok.includes(f.docType)) continue
    if (ervenyesStatus(f.status)) {
      const elozo = ervenyesek.get(f.dioceseId)
      if (!elozo || ujabb(f, elozo)) ervenyesek.set(f.dioceseId, f)
    } else if (f.status === 'returned') {
      visszakuldottIds.add(f.dioceseId)
    }
  }

  const bekuldott: OsszesitoEgyhazmegye[] = []
  const hianyzo: OsszesitoEgyhazmegye[] = []
  const visszakuldott: OsszesitoEgyhazmegye[] = []
  const bekuldottDeVanVisszakuldott: OsszesitoEgyhazmegye[] = []
  // A hatókör TELJES listáján megyünk végig — ettől tudja megmondani az
  // összesítő, hogy KI nem terjesztett fel (a felterjesztésekből ez nem derülne ki).
  for (const megye of [...megyek].sort(nevSzerint)) {
    if (ervenyesek.has(megye.id)) {
      bekuldott.push(megye)
      // A 2. SZABÁLY NEVESÍTÉSE ITT MARADT EL (2026-08-17-ig): érvényes ÉS
      // visszaküldött irat együtt (alap költségvetés 'received' + 1. módosítás
      // 'returned') esetén a megye csak a beküldöttek közt jelent meg, és a
      // kerület nem látta, hogy javítás alatt van egy irata. Külön, NEVESÍTETT
      // listát kap — az összegből viszont nem esik ki (a korábbi, érvényes
      // irata változatlanul számít).
      if (visszakuldottIds.has(megye.id)) bekuldottDeVanVisszakuldott.push(megye)
    } else if (visszakuldottIds.has(megye.id)) visszakuldott.push(megye)
    else hianyzo.push(megye)
  }

  return {
    allapot: { bekuldott, hianyzo, visszakuldott, bekuldottDeVanVisszakuldott },
    ervenyesek,
    visszakuldottIds,
  }
}

/**
 * A feldolgozandó (érvényes) felterjesztések DETERMINISZTIKUS sorrendben:
 * megye-név, majd id szerint. Így a kimenet független attól, milyen sorrendben
 * érkeztek a sorok az adatbázisból.
 */
function feldolgozandok(
  ervenyesek: Map<string, OsszesitoFelterjesztes>,
  nevMap: Map<string, string>,
): Array<{ id: string; nev: string; felterjesztes: OsszesitoFelterjesztes }> {
  return [...ervenyesek.entries()]
    .map(([id, felterjesztes]) => ({ id, nev: nevMap.get(id) || ISMERETLEN_MEGYE, felterjesztes }))
    .sort(nevSzerint)
}

// ── Pillanatkép-olvasók (3. szabály: TÖBB alak) ──────────────────────────────

/**
 * A MEGYEI SZÁMADÁS fagyasztott csomagja — HÁROM ismert alak:
 *   · kanonikus (alakVerzió 2): `income` / `expense` / `totalIncome` / `totalExpense`;
 *   · régi wizard-alak: `actualIncome` / `actualExpense` / `totalActual*`;
 *   · alakVerzió 1: a FELSŐ SZINT a NYERS szerver-összesítés (junction-FK-id
 *     kulcsokkal, a hivatalos ívre NEM szűrve), a HIVATALOS adat a `kanonikus`
 *     alobjektumban.
 * Mindhármat olvassuk — különben a javítás ELŐTT felküldött megyei számadások
 * kerületi összesítője 0 lejt mutatna (ez a hiba a dokumentumközpontban
 * 2026-08-11-ig élt).
 *
 * ⚠️ A SORRENDET NE FORDÍTSD MEG: a `kanonikus` alobjektum MINDIG erősebb a
 * felső szintnél, és a nyers felső szint csak VÉDŐHÁLÓ.
 *
 * TÜNET, ami ezt a javítást kiváltotta (2026-08-17, adverzáriális ellenőrzés):
 * a mag `s.income` / `s.totalIncome`-mal kezdett, és a `kanonikus` csak fallback
 * volt. Így épp az alakVerzió 1-es csomagoknál — ott, ahol a `kanonikus` ág
 * egyáltalán számít — a NYERS, ívre nem szűrt (tehát a hivatalos íven KÍVÜLI
 * pénzt is tartalmazó) számot vitte volna a kerület HIVATALOS ívére. A repó
 * kanonikus szabálya ennek az ellenkezője, lásd
 * `app/(dashboard)/munkanaplo/lelkeszi-jelentes-actions.ts`: „A sorrend
 * SZÁNDÉKOS: a kanonikus (ív-szűrt, beküldött) érték MINDIG erősebb, mint a
 * felső szintű nyers összesítés."
 *
 * ÉS A VÉGÖSSZEG SEM CSÚSZHAT EL A SOROKTÓL: ha a kód-sorokat a `kanonikus`-ból
 * vettük, a végösszeg NEM eshet vissza a felső szintű nyers összegre (az az
 * íven kívüli tételeket is tartalmazza) — ilyenkor a kanonikus sorok összege a
 * pótlék. Egy hivatalos íven a „hivatalos sorok + nem hivatalos végösszeg"
 * párosítás a legrosszabb kimenet: mindkét szám hihetőnek látszik, és nem
 * egyeznek.
 */
function olvasSzamadas(snap: Record<string, unknown> | null): {
  bevetel: Record<string, number>
  kiadas: Record<string, number>
  osszBevetel: number
  osszKiadas: number
} {
  const s = objektum(snap)
  const kanon = objektum(s.kanonikus)

  // A két szint KÜLÖN olvasva — hogy a végösszegnél is tudjuk, honnan jött a sor.
  const kanonBevetel = elsoNemUres(kodTerkep(kanon.income), kodTerkep(kanon.actualIncome))
  const kanonKiadas = elsoNemUres(kodTerkep(kanon.expense), kodTerkep(kanon.actualExpense))
  const nyersBevetel = elsoNemUres(kodTerkep(s.income), kodTerkep(s.actualIncome))
  const nyersKiadas = elsoNemUres(kodTerkep(s.expense), kodTerkep(s.actualExpense))

  const kanonbolBevetel = Object.keys(kanonBevetel).length > 0
  const kanonbolKiadas = Object.keys(kanonKiadas).length > 0
  const bevetel = kanonbolBevetel ? kanonBevetel : nyersBevetel
  const kiadas = kanonbolKiadas ? kanonKiadas : nyersKiadas

  // A pillanatképben RÖGZÍTETT (aláírt) végösszeg az elsődleges — de a KANONIKUS
  // szintről; a kódonkénti sorok összege csak pótlék, ha a csomag nem hozott
  // végösszeget.
  const kanonOsszBevetel = szam(kanon.totalIncome) ?? szam(kanon.totalActualIncome)
  const kanonOsszKiadas = szam(kanon.totalExpense) ?? szam(kanon.totalActualExpense)
  const nyersOsszBevetel = szam(s.totalIncome) ?? szam(s.totalActualIncome)
  const nyersOsszKiadas = szam(s.totalExpense) ?? szam(s.totalActualExpense)

  let osszBevetel: number
  if (kanonOsszBevetel !== null) osszBevetel = kanonOsszBevetel
  else if (kanonbolBevetel) osszBevetel = osszead(kanonBevetel)
  else osszBevetel = nyersOsszBevetel ?? osszead(bevetel)

  let osszKiadas: number
  if (kanonOsszKiadas !== null) osszKiadas = kanonOsszKiadas
  else if (kanonbolKiadas) osszKiadas = osszead(kanonKiadas)
  else osszKiadas = nyersOsszKiadas ?? osszead(kiadas)

  return { bevetel, kiadas, osszBevetel, osszKiadas }
}

/**
 * A MEGYEI KÖLTSÉGVETÉS fagyasztott csomagja — KÉT ismert alak:
 *   · a BudgetTab `budgetData` térképe (`szamadasicelid` + `tervezett` +
 *     `modositott`/`mod2`/`mod3`), és
 *   · a pótlólagos felküldés `budgetSorok` tömbje (a mentett
 *     `diocese_koltsegvetes` sorok: `tervezett` + `osszeg_mod_1..3`).
 *
 * ÉRVÉNYES ÖSSZEG (4. szabály, soron belül): a LEGKÉSŐBBI kitöltött módosítás,
 * ennek hiányában a tervezett — így az összesítő azt mutatja, ami a megyénél
 * ÉPP érvényben van, nem a rég túlhaladott év eleji tervet.
 */
function olvasKoltsegvetes(snap: Record<string, unknown> | null): {
  sorok: Array<{ kod: string; osszeg: number }>
  modositassalSzamolt: boolean
} {
  const s = objektum(snap)
  const sorok: Array<{ kod: string; osszeg: number }> = []
  let modositassalSzamolt = false

  const nyers = s.budgetData
  if (nyers && typeof nyers === 'object') {
    for (const ertek of Object.values(nyers as Record<string, unknown>)) {
      const r = objektum(ertek)
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

  // PÓTLÁS-alak: a mentett terv-sorokból összeállított csomag.
  const potlas = s.budgetSorok
  if (sorok.length === 0 && Array.isArray(potlas)) {
    for (const ertek of potlas) {
      const r = objektum(ertek)
      const kod = r.szamadasicelid == null ? '' : String(r.szamadasicelid)
      if (!kod) continue
      const mod3 = szam(r.osszeg_mod_3)
      const mod2 = szam(r.osszeg_mod_2)
      const mod1 = szam(r.osszeg_mod_1)
      const ervenyesOsszeg = mod3 ?? mod2 ?? mod1 ?? szam(r.tervezett)
      if (ervenyesOsszeg === null) continue
      if (mod3 !== null || mod2 !== null || mod1 !== null) modositassalSzamolt = true
      sorok.push({ kod, osszeg: ervenyesOsszeg })
    }
  }

  return { sorok, modositassalSzamolt }
}

/**
 * A SZÁMVEVŐI ÖSSZESÍTŐ fagyasztott csomagja — KÉT ismert alak:
 *   · burkolt: `{ alakVerzio, keszult, egyhazmegye, osszesito: MegyeiOsszesito }`
 *     (ezt küldi fel a megyei `veglegesitEsFelkuldOsszesito`), és
 *   · csupasz: maga a `MegyeiOsszesito` objektum.
 * A burkolat felismerése tartalmi: van-e benne `szamadas` szakasz.
 */
function olvasSzamvevoiCsomag(snap: Record<string, unknown> | null): Record<string, unknown> {
  const s = objektum(snap)
  const belso = objektum(s.osszesito)
  if (Object.keys(belso).length > 0) return belso
  return s
}

/** Név-lista kiolvasása egy pillanatkép-beli gyülekezet-tömbből. */
function nevekListabol(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const nevek: string[] = []
  for (const elem of v) {
    if (typeof elem === 'string') {
      if (elem.trim()) nevek.push(elem)
      continue
    }
    const o = objektum(elem)
    const nev = typeof o.nev === 'string' ? o.nev : typeof o.name === 'string' ? o.name : ''
    if (nev.trim()) nevek.push(nev)
  }
  return nevek
}

// ── Kód-halmozók ─────────────────────────────────────────────────────────────

interface KodHalmoz {
  osszeg: number
  /** megyeId → az adott megye része ezen a kódon. */
  megyek: Map<string, number>
}

function halmozoba(
  halmoz: Map<string, KodHalmoz>,
  kod: string,
  megyeId: string,
  osszeg: number,
): void {
  const elozo = halmoz.get(kod)
  if (!elozo) {
    halmoz.set(kod, { osszeg, megyek: new Map([[megyeId, osszeg]]) })
    return
  }
  elozo.osszeg += osszeg
  elozo.megyek.set(megyeId, (elozo.megyek.get(megyeId) ?? 0) + osszeg)
}

/** Kód-halmozó → rendezett sor-lista, a katalógus nevével és sorrendjével. */
function sorokBol(
  halmoz: Map<string, KodHalmoz>,
  katalogus: Map<string, KodKatalogusTetel>,
  tipus: 'B' | 'K',
  nevMap: Map<string, string>,
): KodSor[] {
  const sorok: KodSor[] = []
  for (const [kod, ertek] of halmoz) {
    const kat = katalogus.get(kod)
    sorok.push({
      kod,
      nev: kat?.nev ?? null,
      tipus,
      osszeg: ertek.osszeg,
      megyeSzam: ertek.megyek.size,
      sorszam: kat?.sorszam ?? null,
      megyenkent: [...ertek.megyek.entries()]
        .map(([id, osszeg]) => ({ id, nev: nevMap.get(id) || ISMERETLEN_MEGYE, osszeg }))
        .sort(nevSzerint),
    })
  }
  // A hivatalos ív sorrendje a katalógus `sorszam`-a; ismeretlen kód a végére,
  // kód szerint rendezve (így sosem tűnik el egy sor sem).
  return sorok.sort((a, b) => {
    if (a.sorszam !== null && b.sorszam !== null && a.sorszam !== b.sorszam) {
      return a.sorszam - b.sorszam
    }
    if (a.sorszam !== null && b.sorszam === null) return -1
    if (a.sorszam === null && b.sorszam !== null) return 1
    return a.kod.localeCompare(b.kod, 'hu')
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// A fő számítás
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A kerület egy évének ÖSSZESÍTŐJE az egyházmegyék felterjesztett
 * (véglegesített) iratainak fagyasztott pillanatképeiből.
 *
 * Determinisztikus és mellékhatás-mentes: ugyanarra a bemenetre mindig ugyanaz
 * a kimenet, és a bemenet objektumait nem írja át.
 */
export function szamitKeruletiOsszesito(bemenet: KeruletiOsszesitoBemenet): KeruletiOsszesito {
  const { ev, megyek, felterjesztesek, kodKatalogus } = bemenet
  const katalogus = new Map(kodKatalogus.map((k) => [k.kod, k]))
  const nevMap = new Map(megyek.map((m) => [m.id, m.nev]))

  // ── Megyei számadás ───────────────────────────────────────────────────────
  const szamadasAll = allapotSzamit(ev, megyek, felterjesztesek, ['megyei_szamadas'])
  const bevHalmoz = new Map<string, KodHalmoz>()
  const kiaHalmoz = new Map<string, KodHalmoz>()
  const szamadasMegyenkent: MegyeOsszeg[] = []
  let szamadasBevetel = 0
  let szamadasKiadas = 0
  for (const { id, nev, felterjesztes } of feldolgozandok(szamadasAll.ervenyesek, nevMap)) {
    const olvasott = olvasSzamadas(felterjesztes.snapshot)
    for (const [kod, osszeg] of Object.entries(olvasott.bevetel)) halmozoba(bevHalmoz, kod, id, osszeg)
    for (const [kod, osszeg] of Object.entries(olvasott.kiadas)) halmozoba(kiaHalmoz, kod, id, osszeg)
    szamadasBevetel += olvasott.osszBevetel
    szamadasKiadas += olvasott.osszKiadas
    szamadasMegyenkent.push({
      id,
      nev,
      bevetel: olvasott.osszBevetel,
      kiadas: olvasott.osszKiadas,
      egyenleg: olvasott.osszBevetel - olvasott.osszKiadas,
      vanVisszakuldottIrat: szamadasAll.visszakuldottIds.has(id),
    })
  }

  // ── Megyei költségvetés (alap + módosítások; a LEGUTOLSÓ az érvényes) ─────
  const kvAll = allapotSzamit(ev, megyek, felterjesztesek, [
    'megyei_koltsegvetes',
    'megyei_koltsegvetes_modositas',
  ])
  const kvBevHalmoz = new Map<string, KodHalmoz>()
  const kvKiaHalmoz = new Map<string, KodHalmoz>()
  const kvMegyenkent: MegyeOsszeg[] = []
  let kvBevetel = 0
  let kvKiadas = 0
  for (const { id, nev, felterjesztes } of feldolgozandok(kvAll.ervenyesek, nevMap)) {
    const olvasott = olvasKoltsegvetes(felterjesztes.snapshot)
    let megyeBev = 0
    let megyeKia = 0
    for (const sor of olvasott.sorok) {
      const kat = katalogus.get(sor.kod)
      // A bevétel/kiadás besorolás a KATALÓGUSBÓL jön (a pillanatkép nem tárolja).
      // Ismeretlen kódot SOHA nem teszünk vaktában a kiadás-oldalra: a bevétel-
      // táblában, láthatóan marad — a néma elnyelés lenne a legrosszabb.
      if (kat?.tipus === 'K') {
        halmozoba(kvKiaHalmoz, sor.kod, id, sor.osszeg)
        megyeKia += sor.osszeg
      } else {
        halmozoba(kvBevHalmoz, sor.kod, id, sor.osszeg)
        megyeBev += sor.osszeg
      }
    }
    kvBevetel += megyeBev
    kvKiadas += megyeKia
    kvMegyenkent.push({
      id,
      nev,
      bevetel: megyeBev,
      kiadas: megyeKia,
      egyenleg: megyeBev - megyeKia,
      modositassalSzamolt: olvasott.modositassalSzamolt,
      modositasSzam: modSzam(felterjesztes),
      // ITT A LEGÉLESEBB: az alap terv 'received', az 1. módosítás 'returned' —
      // a szám az ALAP tervé, tehát NEM a legutolsó tervet tükrözi.
      vanVisszakuldottIrat: kvAll.visszakuldottIds.has(id),
    })
  }

  // ── Számvevői összesítők (a megyék ÖSSZESÍTŐI — K4 szerint ez a másik forrás) ─
  const szvAll = allapotSzamit(ev, megyek, felterjesztesek, ['szamvevoi_osszesito'])
  const szvMegyenkent: SzamvevoiMegyeSor[] = []
  const mezoOsszeg = new Map<string, { label: string; egyseg: string | null; osszeg: number; megyeSzam: number }>()
  let gyulekezetSzam = 0
  let bekuldottGyulekezetSzam = 0
  let hianyzoGyulekezetSzam = 0
  let szvBevetel = 0
  let szvKiadas = 0
  let szvKvBevetel = 0
  let szvKvKiadas = 0
  let leltarTetelSzam = 0
  let leltarErtek = 0
  let valasztoFo = 0
  for (const { id, nev, felterjesztes } of feldolgozandok(szvAll.ervenyesek, nevMap)) {
    const csomag = olvasSzamvevoiCsomag(felterjesztes.snapshot)
    const szamadas = objektum(csomag.szamadas)
    const szAllapot = objektum(szamadas.allapot)
    const koltsegvetes = objektum(csomag.koltsegvetes)
    const leltar = objektum(csomag.vagyonleltar)
    const valasztok = objektum(csomag.valasztok)

    const megyeGyulekezetSzam = szamVagy0(csomag.gyulekezetSzam)
    const bentGyulekezetek = nevekListabol(szAllapot.bekuldott)
    const hianyzoGyulekezetek = nevekListabol(szAllapot.hianyzo)
    const visszakuldottGyulekezetek = nevekListabol(szAllapot.visszakuldott)
    const bevetel = szamVagy0(szamadas.osszBevetel)
    const kiadas = szamVagy0(szamadas.osszKiadas)
    const kvBev = szamVagy0(koltsegvetes.osszBevetel)
    const kvKia = szamVagy0(koltsegvetes.osszKiadas)
    const tetelSzam = szamVagy0(leltar.tetelSzam)
    const ertek = szamVagy0(leltar.konyvSzerintiErtek)
    const fo = szamVagy0(valasztok.fo)

    gyulekezetSzam += megyeGyulekezetSzam
    bekuldottGyulekezetSzam += bentGyulekezetek.length
    // A visszaküldött gyülekezeti irat a megyei összesítőben SEM szerepel, ezért
    // a kerület felé is hiányként számít — különben a kerület azt hinné, hogy
    // csak a „nem küldte be" gyülekezetek adata maradt ki.
    hianyzoGyulekezetSzam += hianyzoGyulekezetek.length + visszakuldottGyulekezetek.length
    szvBevetel += bevetel
    szvKiadas += kiadas
    szvKvBevetel += kvBev
    szvKvKiadas += kvKia
    leltarTetelSzam += tetelSzam
    leltarErtek += ertek
    valasztoFo += fo

    szvMegyenkent.push({
      id,
      nev,
      gyulekezetSzam: megyeGyulekezetSzam,
      bekuldottGyulekezetSzam: bentGyulekezetek.length,
      hianyzoGyulekezetek,
      visszakuldottGyulekezetek,
      bevetel,
      kiadas,
      egyenleg: bevetel - kiadas,
      koltsegvetesBevetel: kvBev,
      koltsegvetesKiadas: kvKia,
      leltarTetelSzam: tetelSzam,
      leltarErtek: ertek,
      valasztoFo: fo,
    })

    // A hivatalos Adatlap mutatói (lélekszám, keresztelés stb.) — a megyék
    // összesítőiből felfelé görgetve. A felirat a pillanatképből jön, mert a
    // kerületnek nincs saját mező-katalógusa a hívóban.
    const jelentes = objektum(csomag.lelkesziJelentes)
    if (Array.isArray(jelentes.mezok)) {
      for (const nyersMezo of jelentes.mezok) {
        const m = objektum(nyersMezo)
        const mezoId = m.id == null ? '' : String(m.id)
        if (!mezoId) continue
        const ertekSzam = szam(m.osszeg)
        if (ertekSzam === null) continue
        const elozo = mezoOsszeg.get(mezoId)
        if (elozo) {
          elozo.osszeg += ertekSzam
          elozo.megyeSzam += 1
        } else {
          mezoOsszeg.set(mezoId, {
            label: typeof m.label === 'string' && m.label ? m.label : mezoId,
            egyseg: typeof m.egyseg === 'string' ? m.egyseg : null,
            osszeg: ertekSzam,
            megyeSzam: 1,
          })
        }
      }
    }
  }

  // ── A kulcs-mutatók MEGJELENÍTÉSRE kész listája ───────────────────────────
  //
  // FAIL-CLOSED: ha egyetlen megye sem terjesztett fel összesítőt, a lista
  // ÜRES marad. Egy csupa nulla mutató-tábla azt sugallná, hogy a kerületben
  // nincs se lélek, se pénz — pedig valójában nincs MIBŐL számolni, és a
  // felület ezt a mondatot mondja ki helyette.
  const szvMegyeSzam = szvMegyenkent.length
  const mutatok: SzamvevoiMutato[] =
    szvMegyeSzam === 0
      ? []
      : [
          { id: 'kerulet.gyulekezetSzam', label: 'Gyülekezetek száma', egyseg: null, osszeg: gyulekezetSzam },
          {
            id: 'kerulet.bekuldottGyulekezetSzam',
            label: 'Ebből beküldött gyülekezeti számadás',
            egyseg: null,
            osszeg: bekuldottGyulekezetSzam,
          },
          {
            id: 'kerulet.hianyzoGyulekezetSzam',
            // A FELIRAT PONTOSAN ANNYIT MOND, AMENNYIT A SZÁM TAKAR: ez a mutató
            // KIZÁRÓLAG a megyei csomag `szamadas.allapot`-jából számol.
            // 2026-08-17-ig „…gyülekezeti irat" állt itt — az általánosítás azt
            // ígérte, hogy a költségvetés/leltár/választók hiánya is benne van.
            label: 'Hiányzó vagy visszaküldött gyülekezeti számadás',
            egyseg: null,
            osszeg: hianyzoGyulekezetSzam,
          },
          { id: 'kerulet.bevetel', label: 'Gyülekezeti bevételek összesen', egyseg: 'RON', osszeg: szvBevetel },
          { id: 'kerulet.kiadas', label: 'Gyülekezeti kiadások összesen', egyseg: 'RON', osszeg: szvKiadas },
          { id: 'kerulet.egyenleg', label: 'Gyülekezeti egyenleg', egyseg: 'RON', osszeg: szvBevetel - szvKiadas },
          {
            id: 'kerulet.koltsegvetesBevetel',
            label: 'Gyülekezeti költségvetés — tervezett bevétel',
            egyseg: 'RON',
            osszeg: szvKvBevetel,
          },
          {
            id: 'kerulet.koltsegvetesKiadas',
            label: 'Gyülekezeti költségvetés — tervezett kiadás',
            egyseg: 'RON',
            osszeg: szvKvKiadas,
          },
          { id: 'kerulet.leltarTetelSzam', label: 'Vagyonleltári tételek', egyseg: 'db', osszeg: leltarTetelSzam },
          {
            id: 'kerulet.leltarErtek',
            label: 'Vagyonleltár könyv szerinti értéke',
            egyseg: 'RON',
            osszeg: leltarErtek,
          },
          { id: 'kerulet.valasztoFo', label: 'Választói névjegyzék', egyseg: 'fő', osszeg: valasztoFo },
        ].map((m) => ({ ...m, megyeSzam: szvMegyeSzam }))

  // A hivatalos Adatlap mutatói a listA VÉGÉRE, a mutató AZONOSÍTÓJA szerint
  // rendezve (I.1, I.10, …): a hivatalos ív sorrendjét a kerületnek nincs miből
  // tudnia, az id viszont determinisztikus és a megyék között azonos.
  for (const [id, m] of [...mezoOsszeg.entries()].sort((a, b) => a[0].localeCompare(b[0], 'hu'))) {
    mutatok.push({ id, label: m.label, egyseg: m.egyseg, osszeg: m.osszeg, megyeSzam: m.megyeSzam })
  }

  return {
    ev,
    megyeSzam: megyek.length,
    szamadas: {
      bevetelSorok: sorokBol(bevHalmoz, katalogus, 'B', nevMap),
      kiadasSorok: sorokBol(kiaHalmoz, katalogus, 'K', nevMap),
      osszBevetel: szamadasBevetel,
      osszKiadas: szamadasKiadas,
      egyenleg: szamadasBevetel - szamadasKiadas,
      megyenkent: szamadasMegyenkent,
      allapot: szamadasAll.allapot,
    },
    koltsegvetes: {
      bevetelSorok: sorokBol(kvBevHalmoz, katalogus, 'B', nevMap),
      kiadasSorok: sorokBol(kvKiaHalmoz, katalogus, 'K', nevMap),
      osszBevetel: kvBevetel,
      osszKiadas: kvKiadas,
      egyenleg: kvBevetel - kvKiadas,
      megyenkent: kvMegyenkent,
      allapot: kvAll.allapot,
    },
    szamvevoiOsszesito: {
      megyenkent: szvMegyenkent,
      mutatok,
      gyulekezetSzam,
      bekuldottGyulekezetSzam,
      hianyzoGyulekezetSzam,
      bevetel: szvBevetel,
      kiadas: szvKiadas,
      egyenleg: szvBevetel - szvKiadas,
      koltsegvetesBevetel: szvKvBevetel,
      koltsegvetesKiadas: szvKvKiadas,
      leltarTetelSzam,
      leltarErtek,
      valasztoFo,
      allapot: szvAll.allapot,
    },
  }
}

/** A `hianyOsszefoglalo` viselkedés-kapcsolói (mind OPCIONÁLIS). */
export interface HianyOsszefoglaloOpciok {
  /**
   * Bekerüljenek-e a NEVEK a mondatba. Alapértelmezés: `true` (visszafelé
   * kompatibilis — így hívja a nyomtatvány és az önellenőrzés).
   *
   * `false`-szal a mondat csak a SZÁMOKAT mondja ki. MIÉRT KELL: az összesítő
   * lapon a mondat egy színes doboz TETEJÉN áll, alatta pedig ott van a két
   * külön felsorolás („Nem terjesztette fel: …" / „Javításra visszaküldve: …").
   * Ha a mondat is felsorolná a neveket, ugyanaz a névsor kétszer állna a
   * dobozban — a lap ezért ilyenkor a nevek nélküli alakot kéri.
   */
  nevekkel?: boolean
}

/**
 * EGY MONDAT arról, mi hiányzik egy szakaszból — a felület minden feliratához
 * innen.
 *
 * MIÉRT ITT: ha minden kártya és minden nyomtatvány a maga
 * `allapot.hianyzo.length > 0 ? … : …` kifejezését írná meg, ugyanarra az
 * összesítőre más-más mondatot látna a püspöki hivatal — ez a hibaosztály a
 * felküldés-állapotnál (`felterjesztes-allapot-core.ts`) egyszer már megtörtént.
 *
 * HÁROM dolgot mond ki, mindig ebben a sorrendben:
 *   (1) ki NEM terjesztette fel,
 *   (2) kinek az iratát küldte a kerület javításra vissza (nem számít bele),
 *   (3) kinél van JAVÍTÁS ALATT irat úgy, hogy közben egy korábbi, érvényes
 *       felterjesztése BENNE van az összegben (lásd
 *       `TipusAllapot.bekuldottDeVanVisszakuldott`). A (3) nélkül az ilyen megye
 *       teljesen rendben lévőnek látszott — pedig a szám nem a legutolsó
 *       tervet tükrözi.
 *
 * @returns `null`, ha MINDEN megye adata benne van, és nincs javítás alatt lévő
 *   irat sem (ilyenkor nincs mit mondani).
 */
export function hianyOsszefoglalo(
  allapot: TipusAllapot,
  opciok?: HianyOsszefoglaloOpciok,
): string | null {
  const nevekkel = opciok?.nevekkel !== false
  const hianyzoNevek = allapot.hianyzo.map((m) => m.nev)
  const visszakuldottNevek = allapot.visszakuldott.map((m) => m.nev)
  // VÉDŐHÁLÓ: a negyedik lista 2026-08-17-en került be. Egy régebbi, három
  // mezős állapot-objektum (pl. egy fagyasztott csomagból visszaolvasva) ne
  // dobjon kivételt egy hivatalos irat kinyomtatásakor.
  const javitasAlattNevek = (allapot.bekuldottDeVanVisszakuldott ?? []).map((m) => m.nev)
  if (
    hianyzoNevek.length === 0 &&
    visszakuldottNevek.length === 0 &&
    javitasAlattNevek.length === 0
  ) {
    return null
  }

  /** „…: A, B." vagy nevek nélkül „…." — a hívó dönti el (lásd az opciót). */
  const nevsor = (nevek: string[]) => (nevekkel ? `: ${nevek.join(', ')}.` : '.')

  const mondatok: string[] = []
  if (hianyzoNevek.length > 0) {
    mondatok.push(
      `${hianyzoNevek.length} egyházmegye adata hiányzik ebből az összesítőből` +
        nevsor(hianyzoNevek),
    )
  }
  if (visszakuldottNevek.length > 0) {
    mondatok.push(
      `${visszakuldottNevek.length} irat javításra visszaküldve (ezért nem számít bele)` +
        nevsor(visszakuldottNevek),
    )
  }
  if (javitasAlattNevek.length > 0) {
    mondatok.push(
      `${javitasAlattNevek.length} egyházmegyénél javítás alatt van egy irat, ezért itt a ` +
        `korábbi, érvényes felterjesztésük szerepel` +
        nevsor(javitasAlattNevek),
    )
  }
  return mondatok.join(' ')
}
