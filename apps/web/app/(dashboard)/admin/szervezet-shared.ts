/**
 * SZERVEZETI ÁTTEKINTŐ — típusok és TISZTA döntési logika (2026-08-22, 7. pont).
 *
 * ⚠️ Next.js: a `use server` fájl CSAK async függvényt exportálhat, ezért a
 *    típusok és a szinkron (tiszta) függvények ITT élnek, nem a
 *    `szervezet-actions.ts`-ben.
 *
 * ⚠️ EZ A FÁJL SZÁNDÉKOSAN IMPORT-MENTES. A `scripts/selftest-attekintes.mjs`
 *    közvetlenül betölti (TS → CJS transpile) és állításokat tesz a lenti
 *    tiszta függvényekre. Ha ide valaha projekt-import kerül (`server-only`,
 *    `@/lib/...`), az önteszt LÁTHATÓAN elbukik.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A FÁJL EGYETLEN LEGFONTOSABB SZABÁLYA: „NEM TUDJUK" ≠ 0
 * ════════════════════════════════════════════════════════════════════════════
 * A fa taglétszáma KÉT különböző forrásból jön (K4, 2026-08-16):
 *
 *   · rendszergazda / master → `admin_overview_member_counts()`  (SECURITY INVOKER)
 *   · egyházkerületi admin   → `district_member_counts(p_district_id)` (DEFINER)
 *
 * Ha a kerületi ág a kézenfekvő `admin_overview_member_counts()`-ot hívná, az
 * S1c migráció után NULLA SORT adna — és a fa minden gyülekezetnél „0 tag"-ot
 * mutatna, hibaüzenet nélkül. A nulla MEGNYUGTAT, tehát a néma nulla rosszabb,
 * mint a hiányzó adat.
 *
 * Ezért a tagszám típusa `number | null`, ahol a `null` KIZÁRÓLAG azt jelenti:
 * „nem tudjuk". A `tagszamFelirat()` ilyenkor SOHA nem ír ki számot, és az
 * `osszegTagszam()` egyetlen ismeretlen tagtól is `null`-ra vált — egy részben
 * ismert összeg ugyanolyan hazugság lenne, mint a néma nulla.
 *
 * ⚠️ A HIÁNYZÓ SOR NEM UGYANAZ, MINT AZ ISMERETLEN. Mindkét RPC `GROUP BY`-jal
 *    dolgozik, tehát a 0 élő tagú gyülekezetre EGYÁLTALÁN NEM ad sort. Ha az
 *    RPC LEFUTOTT, a hiányzó sor VALÓDI nulla („üres nyilvántartás") — ezt a
 *    `szervezet-actions.ts` fordítja le, és a felület ki is mondja.
 */

// ────────────────────────────────────────────────────────────────────────────
// A fa csomópontjai
// ────────────────────────────────────────────────────────────────────────────

/** Egy szerepkör-jelvény egy gyülekezetnél: melyik szerep, hányszor. */
export interface FaSzerepJelveny {
  role: string
  /** Csak `role === 'custom'` esetén van értelme. */
  customLabel: string | null
  darab: number
}

/**
 * A `congregations.szervezeti_tipus` értékkészlete (2026-08-25, gyülekezeti
 * egységek).
 *
 * ⚠️ SZÁNDÉKOS MÁSOLATA a `lib/gyulekezet/egysegek-shared.ts` `SzervezetiTipus`
 *    típusának: EZ a fájl import-mentes kell maradjon (a
 *    `scripts/selftest-attekintes.mjs` direktben tölti), projekt-import ide nem
 *    kerülhet. A strukturális típusegyezés miatt a két deklaráció átjárható.
 */
export type FaSzervezetiTipus = 'anya' | 'leany' | 'misszioi'

/**
 * Az anya kartotékán BELÜLI egység (leány/szórvány) — a `gyulekezeti_hierarchia()`
 * RPC `egysegek` jsonb-jéből. Strukturálisan a `HierarchiaEgyseg` megfelelője
 * (lásd a fenti import-mentességi megjegyzést).
 */
export interface FaEgyseg {
  id: string
  nev: string
  tipus: 'leany' | 'szorvany'
  aktiv: boolean
  /**
   * ⚠️ `null` / hiányzó = NEM TUDJUK (a néző hatóköre nem jogosít élő
   * létszámra) — a felület ilyenkor „nem tudjuk"-ot ír, SOHA nem 0-t.
   */
  letszam?: number | null
}

export interface FaGyulekezet {
  id: string
  nev: string
  dioceseId: string | null
  /** ⚠️ `null` = NEM TUDJUK. Sosem írható ki nullaként — lásd a fájl fejlécét. */
  tagszam: number | null
  /** Hány felhasználó tartozik ide (elsődleges gyülekezet VAGY gyülekezeti szerepkör). */
  felhasznalok: number
  szerepek: FaSzerepJelveny[]
  /** `congregations.status = 'active'`. */
  aktiv: boolean
  /** `congregations.last_activity_at` ISO, vagy `null`. */
  utolsoAktivitas: string | null
  /**
   * Hiányzó kötelező törzsadat-mezők nevei.
   *
   * ⚠️ `null` = NEM NÉZTÜK MEG (kerületi admin — K4). A felület ilyenkor a
   *    jelvényt EL SEM HELYEZI; üres tömb viszont azt jelenti: megnéztük, és
   *    minden megvan. A kettő nem keverhető össze.
   */
  hianyzoMezok: string[] | null
  /**
   * Hivatalos szervezeti forma (2026-08-25) — a `gyulekezeti_hierarchia()`
   * RPC-ből. HIÁNYZIK (undefined), ha a migráció még nem futott le vagy az RPC
   * hibázott: a felület ilyenkor jelvényt SEM tesz ki (a hiányt a
   * `SzervezetiFa.hierarchiaUzenet` mondja ki), a fa többi része változatlan.
   */
  szervezetiTipus?: FaSzervezetiTipus
  /** A leány anyaegyházközségének azonosítója; nem-leánynál `null`. */
  anyaId?: string | null
  /** Aktív, jóváhagyott lelkész(ek) neve vesszővel; `null`, ha nincs regisztrált. */
  lelkeszNevek?: string | null
  /** Az anya kartotékán belüli AKTÍV egységek (leány/szórvány). */
  egysegek?: FaEgyseg[]
}

export interface FaEgyhazmegye {
  /** `''` = az „Egyházmegye nélkül" árva-ág pszeudo-azonosítója. */
  id: string
  nev: string
  esperesNev: string | null
  districtId: string | null
  gyulekezetek: FaGyulekezet[]
}

export interface FaKerulet {
  /** `''` = az „Egyházkerület nélkül" árva-ág pszeudo-azonosítója. */
  id: string
  nev: string
  nevRo: string | null
  cimerUrl: string | null
  puspokNev: string | null
  egyhazmegyek: FaEgyhazmegye[]
}

export interface SzervezetiFa {
  keruletek: FaKerulet[]
  /**
   * ⚠️ HA `false`, A TAGSZÁM-OSZLOP NEM IGAZ — a felület LÁTHATÓ hiba-állapotot
   * csinál belőle, nem nullát. (A `tagszam` mezők ilyenkor mind `null`-ok.)
   */
  tagszamElerheto: boolean
  /** Miért nem elérhető a tagszám (a felület kiírja). `null`, ha elérhető. */
  tagszamUzenet: string | null
  /**
   * Néztük-e a kötelező mezőket. Kerületi adminnál `false` (K4: a beállítás- és
   * törzsadat-hiányok nem tartoznak rá), ilyenkor a jelvény EL SEM JELENIK MEG.
   */
  hianyzoMezokElerheto: boolean
  /** Rendszer-szintű (master/teljes) admin-e a néző. */
  rendszergazda: boolean
  /**
   * FAIL-CLOSED: a kerületi adminnak NINCS beállított egyházkerülete, ezért
   * SEMMIT nem mutatunk. ⛔ Ilyenkor SOHA nem eshetünk vissza országos listára
   * — ez a projekt kétszer megélt hibaosztálya (néma teljes szivárgás).
   */
  hatokorUres: boolean
  /** Magyarázat az üres hatókörhöz. `null`, ha a hatókör rendben van. */
  hatokorUzenet: string | null
  /**
   * Elérhető-e a szervezeti hierarchia (típus / anya-kötés / lelkész / egységek
   * — 2026-08-25). Ha `false`, a felület SÁVBAN mondja ki, miért: a némán
   * eltűnő típus-jelvények „minden gyülekezet önálló anya" látszatot keltenének.
   */
  hierarchiaElerheto: boolean
  /**
   * `true` = kifejezetten a `gyulekezeti_hierarchia()` RPC HIÁNYZIK (a
   * 2026-08-25-gyulekezeti-egysegek.sql migráció nem futott le) — a teendő az
   * SQL futtatása. `false` + `hierarchiaElerheto: false` = az RPC létezik, de
   * HIBÁZOTT (a hibaüzenet a `hierarchiaUzenet`-ben).
   */
  hierarchiaHiany: boolean
  /** Magyar magyarázat a figyelmeztető sávba; `null`, ha a hierarchia elérhető. */
  hierarchiaUzenet: string | null
  /** Mikor készült a mérés (ISO) — a felület kiírja. */
  mertAt: string
}

// ────────────────────────────────────────────────────────────────────────────
// „NEM TUDJUK" ≠ 0 — a felirat és az összegzés EGYETLEN helyen
// ────────────────────────────────────────────────────────────────────────────

/** A kiírandó szöveg, ha a tagszám ismeretlen. SOHA nem szám. */
export const TAGSZAM_ISMERETLEN = 'nem tudjuk'

/**
 * Tagszám-felirat. `null` → „nem tudjuk", minden más → magyar tagolású szám.
 *
 * ⚠️ A `0` VALÓDI nulla (üres nyilvántartás), ezért ki IS írjuk — a különbség
 *    a „megnéztük, nincs tag" és a „nem tudtuk megnézni" között pontosan az,
 *    amit ez a függvény őriz.
 */
export function tagszamFelirat(tagszam: number | null): string {
  if (tagszam === null || tagszam === undefined || Number.isNaN(tagszam)) {
    return TAGSZAM_ISMERETLEN
  }
  return tagszam.toLocaleString('hu-HU')
}

/**
 * Tagszámok összege. EGYETLEN ismeretlen tag is `null`-ra viszi az összeget.
 *
 * ⚠️ MIÉRT NEM `reduce((s, x) => s + (x ?? 0), 0)`: az a változat egy ismeretlen
 *    értéket NULLÁNAK számolna bele, és a végén egy MAGABIZTOS, de HAMIS számot
 *    adna — a felület pedig semmilyen jelet nem kapna arról, hogy hazudik.
 *    Üres bemenetre `0` (nincs mit összeadni, ez valódi nulla).
 */
export function osszegTagszam(ertekek: ReadonlyArray<number | null>): number | null {
  let osszeg = 0
  for (const e of ertekek) {
    if (e === null || e === undefined || Number.isNaN(e)) return null
    osszeg += e
  }
  return osszeg
}

// ────────────────────────────────────────────────────────────────────────────
// Csomópont-összegzések — a fejléc-feliratok EGYETLEN forrása
// ────────────────────────────────────────────────────────────────────────────

export interface MegyeOsszeg {
  gyulekezetek: number
  felhasznalok: number
  /** `null` = nem tudjuk (lásd `osszegTagszam`). */
  tagszam: number | null
}

export function megyeOsszeg(megye: Pick<FaEgyhazmegye, 'gyulekezetek'>): MegyeOsszeg {
  return {
    gyulekezetek: megye.gyulekezetek.length,
    felhasznalok: megye.gyulekezetek.reduce((s, g) => s + g.felhasznalok, 0),
    tagszam: osszegTagszam(megye.gyulekezetek.map((g) => g.tagszam)),
  }
}

export interface KeruletOsszeg extends MegyeOsszeg {
  egyhazmegyek: number
}

export function keruletOsszeg(kerulet: Pick<FaKerulet, 'egyhazmegyek'>): KeruletOsszeg {
  const gyulekezetek = kerulet.egyhazmegyek.flatMap((m) => m.gyulekezetek)
  return {
    egyhazmegyek: kerulet.egyhazmegyek.length,
    gyulekezetek: gyulekezetek.length,
    felhasznalok: gyulekezetek.reduce((s, g) => s + g.felhasznalok, 0),
    tagszam: osszegTagszam(gyulekezetek.map((g) => g.tagszam)),
  }
}

/** A teljes fa összegzése — a fejléc stat-chipjeihez. */
export function faOsszeg(keruletek: ReadonlyArray<FaKerulet>): KeruletOsszeg & { keruletek: number } {
  const megyek = keruletek.flatMap((k) => k.egyhazmegyek)
  const gyulekezetek = megyek.flatMap((m) => m.gyulekezetek)
  return {
    keruletek: keruletek.length,
    egyhazmegyek: megyek.length,
    gyulekezetek: gyulekezetek.length,
    felhasznalok: gyulekezetek.reduce((s, g) => s + g.felhasznalok, 0),
    tagszam: osszegTagszam(gyulekezetek.map((g) => g.tagszam)),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Kötelező törzsadat-mezők — CSAK rendszergazdának (K4)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Az a gyülekezeti törzsadat, ami NÉLKÜL a hivatalos nyomtatványok és a
 * pénzügyi bizonylatok hiányosak. A sorrend a felületen is ez marad.
 */
export const KOTELEZO_MEZOK: ReadonlyArray<{ kulcs: string; cimke: string }> = [
  { kulcs: 'nev_hu', cimke: 'Hivatalos magyar név' },
  { kulcs: 'nev_ro', cimke: 'Hivatalos román név' },
  { kulcs: 'adoszam', cimke: 'Adószám (CIF)' },
  { kulcs: 'cim', cimke: 'Cím' },
  { kulcs: 'email', cimke: 'E-mail' },
  { kulcs: 'telefon', cimke: 'Telefon' },
  { kulcs: 'iban', cimke: 'IBAN' },
  { kulcs: 'bank', cimke: 'Bank neve' },
  { kulcs: 'diocese_id', cimke: 'Egyházmegye' },
]

export interface KotelezoMezoForras {
  nev_hu?: string | null
  nev_ro?: string | null
  adoszam?: string | null
  cim?: string | null
  email?: string | null
  telefon?: string | null
  iban?: string | null
  bank?: string | null
  diocese_id?: string | null
}

/**
 * Melyik kötelező mező hiányzik. Csak a nevek jönnek vissza (a felület ezekből
 * ír „N kötelező mező hiányzik" jelvényt + tooltipet).
 *
 * ⚠️ A CSUPA SZÓKÖZ IS HIÁNY. A `''`-t és a `'   '`-t ugyanúgy hiánynak vesszük,
 *    különben egy space-szel „kitöltött" mező zöldre váltana.
 */
export function hianyzoKotelezoMezok(forras: KotelezoMezoForras): string[] {
  const rekord = forras as Record<string, unknown>
  const hianyzik: string[] = []
  for (const m of KOTELEZO_MEZOK) {
    const ertek = rekord[m.kulcs]
    if (ertek === null || ertek === undefined) {
      hianyzik.push(m.cimke)
      continue
    }
    if (typeof ertek === 'string' && ertek.trim() === '') hianyzik.push(m.cimke)
  }
  return hianyzik
}

// ────────────────────────────────────────────────────────────────────────────
// Anya–leány csoportosítás egy egyházmegyén belül (2026-08-25)
// ────────────────────────────────────────────────────────────────────────────

/** A `csoportositAnyakSzerint` egy kimeneti sora — a megjelenítési sorrendben. */
export interface AnyaCsoportSor {
  gyulekezet: FaGyulekezet
  /** `true` = leány, amely a listában szereplő ANYJA alatt, behúzva jelenik meg. */
  leanySorkent: boolean
  /**
   * `true` = leány, amelynek az anyja nincs megadva vagy nincs ebben a listában
   * (pl. másik egyházmegyében van, vagy adathiba) — „árva" jelzést kap.
   */
  arvaLeany: boolean
}

/**
 * A megye gyülekezetei anya-csoportokba rendezve: anya + az alárendelt leányai
 * közvetlenül utána (a leány behúzással az anyja alá kerül). Az anya nélküli
 * leány a saját helyén marad, „árva" jelzéssel.
 *
 * ⚠️ FAIL-CLOSED TELJESSÉG: minden bemeneti sor PONTOSAN EGYSZER jelenik meg a
 *    kimenetben. Ha adathibából (pl. a leány anyja maga is leány) egy sor a fő
 *    menetben kimaradna, a záró menet „árva"-ként akkor is kiteszi — sor ebből
 *    a függvényből NÉMÁN nem veszhet el.
 *
 * Ha a hierarchia-mezők hiányoznak (a migráció még nem futott le), egyetlen sor
 * sem `leany`, tehát a kimenet a bemenet változatlan sorrendje, jelzések nélkül.
 */
export function csoportositAnyakSzerint(
  gyulekezetek: ReadonlyArray<FaGyulekezet>,
): AnyaCsoportSor[] {
  const idk = new Set(gyulekezetek.map((g) => g.id))
  // Leányok az anyjuk szerint — csak ha az anya TÉNYLEG itt van a listában.
  // (Az `anyaId === g.id` ág elvben lehetetlen — DB CHECK —, de adathibánál
  // öncsatolás helyett „árva" jelzést adunk.)
  const leanyokAnyankent = new Map<string, FaGyulekezet[]>()
  for (const g of gyulekezetek) {
    if (g.szervezetiTipus !== 'leany') continue
    const anyaId = g.anyaId ?? null
    if (!anyaId || anyaId === g.id || !idk.has(anyaId)) continue
    const lista = leanyokAnyankent.get(anyaId) ?? []
    lista.push(g)
    leanyokAnyankent.set(anyaId, lista)
  }

  const ki: AnyaCsoportSor[] = []
  const kiirt = new Set<string>()
  for (const g of gyulekezetek) {
    if (kiirt.has(g.id)) continue
    if (g.szervezetiTipus === 'leany') {
      const anyaId = g.anyaId ?? null
      // Ha az anyja itt van a listában, majd ALATTA jelenik meg.
      if (anyaId && anyaId !== g.id && idk.has(anyaId)) continue
      ki.push({ gyulekezet: g, leanySorkent: false, arvaLeany: true })
      kiirt.add(g.id)
      continue
    }
    ki.push({ gyulekezet: g, leanySorkent: false, arvaLeany: false })
    kiirt.add(g.id)
    for (const leany of leanyokAnyankent.get(g.id) ?? []) {
      if (kiirt.has(leany.id)) continue
      ki.push({ gyulekezet: leany, leanySorkent: true, arvaLeany: false })
      kiirt.add(leany.id)
    }
  }
  // Záró teljességi menet — lásd a fejléc-kommentet.
  for (const g of gyulekezetek) {
    if (kiirt.has(g.id)) continue
    ki.push({ gyulekezet: g, leanySorkent: false, arvaLeany: true })
    kiirt.add(g.id)
  }
  return ki
}

// ────────────────────────────────────────────────────────────────────────────
// Keresés — a fa MINDHÁROM szintjén illeszt
// ────────────────────────────────────────────────────────────────────────────

function normal(s: string | null | undefined): string {
  return (s || '').toLowerCase()
}

/**
 * A fa szűrése keresőkifejezésre.
 *
 * SZABÁLY: ha a KERÜLET vagy az EGYHÁZMEGYE neve illeszkedik, az egész ág
 * megmarad (a szülő találata a gyerekeket is behozza) — különben a felhasználó
 * rákeresne az egyházmegyére, és egy ÜRES megyét kapna vissza.
 * Ami sehol nem illeszkedik, az kiesik; az üres kerület/megye nem marad ott.
 *
 * 2026-08-25 óta a gyülekezet-szinten a LELKÉSZ nevére és az EGYSÉGEK
 * (leány/szórvány) nevére is illeszt — ha a hierarchia-mezők hiányoznak, ez az
 * ág egyszerűen sosem talál (undefined → üres szöveg).
 */
export function faSzures(keruletek: ReadonlyArray<FaKerulet>, kereses: string): FaKerulet[] {
  const q = kereses.trim().toLowerCase()
  if (!q) return [...keruletek]

  const eredmeny: FaKerulet[] = []
  for (const k of keruletek) {
    const keruletTalalat =
      normal(k.nev).includes(q) || normal(k.nevRo).includes(q) || normal(k.puspokNev).includes(q)

    const megyek: FaEgyhazmegye[] = []
    for (const m of k.egyhazmegyek) {
      const megyeTalalat =
        keruletTalalat || normal(m.nev).includes(q) || normal(m.esperesNev).includes(q)
      const gyulekezetek = megyeTalalat
        ? m.gyulekezetek
        : m.gyulekezetek.filter(
            (g) =>
              normal(g.nev).includes(q) ||
              normal(g.lelkeszNevek).includes(q) ||
              (g.egysegek ?? []).some((e) => normal(e.nev).includes(q)),
          )
      if (megyeTalalat || gyulekezetek.length > 0) {
        megyek.push({ ...m, gyulekezetek })
      }
    }

    // ⚠️ A `keruletTalalat` ág AKKOR IS megtartja a kerületet, ha egyetlen
    //    egyházmegyéje sincs: a névre keresőnek látnia kell, hogy a kerület
    //    LÉTEZIK, csak üres. Enélkül a keresés „nincs ilyen kerület"-et
    //    sugallna — ami más állítás, mint a „nincs alatta egyházmegye".
    if (keruletTalalat || megyek.length > 0) eredmeny.push({ ...k, egyhazmegyek: megyek })
  }
  return eredmeny
}

// ────────────────────────────────────────────────────────────────────────────
// Rendezés
// ────────────────────────────────────────────────────────────────────────────

export type FaRendezes = 'nev' | 'tagszam' | 'gyulekezet'

/**
 * Gyülekezet-rendezés egy egyházmegyén belül.
 *
 * ⚠️ AZ ISMERETLEN TAGSZÁM A VÉGÉRE KERÜL, NEM A NULLA HELYÉRE. Ha a `null`-t
 *    0-nak vennénk, a „nem tudjuk" gyülekezetek beolvadnának az üresek közé —
 *    és a felület megint azt sugallná, hogy megnéztük.
 */
export function gyulekezetekRendezve(
  gyulekezetek: ReadonlyArray<FaGyulekezet>,
  rendezes: FaRendezes,
): FaGyulekezet[] {
  const masolat = [...gyulekezetek]
  if (rendezes === 'tagszam') {
    return masolat.sort((a, b) => {
      if (a.tagszam === null && b.tagszam === null) return a.nev.localeCompare(b.nev, 'hu')
      if (a.tagszam === null) return 1
      if (b.tagszam === null) return -1
      if (b.tagszam !== a.tagszam) return b.tagszam - a.tagszam
      return a.nev.localeCompare(b.nev, 'hu')
    })
  }
  return masolat.sort((a, b) => a.nev.localeCompare(b.nev, 'hu'))
}

/** Egyházmegye-rendezés egy kerületen belül. */
export function megyekRendezve(
  megyek: ReadonlyArray<FaEgyhazmegye>,
  rendezes: FaRendezes,
): FaEgyhazmegye[] {
  const masolat = [...megyek]
  if (rendezes === 'gyulekezet') {
    return masolat.sort((a, b) => {
      const d = b.gyulekezetek.length - a.gyulekezetek.length
      return d !== 0 ? d : a.nev.localeCompare(b.nev, 'hu')
    })
  }
  if (rendezes === 'tagszam') {
    return masolat.sort((a, b) => {
      const at = megyeOsszeg(a).tagszam
      const bt = megyeOsszeg(b).tagszam
      if (at === null && bt === null) return a.nev.localeCompare(b.nev, 'hu')
      if (at === null) return 1
      if (bt === null) return -1
      if (bt !== at) return bt - at
      return a.nev.localeCompare(b.nev, 'hu')
    })
  }
  return masolat.sort((a, b) => a.nev.localeCompare(b.nev, 'hu'))
}
