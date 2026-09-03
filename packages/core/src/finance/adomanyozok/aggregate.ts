/**
 * ADOMÁNYOZÓK ÉS SZPONZOROK — az összesítés TISZTA magja.
 *
 * Endre 5. kérése (2026-08-27), szó szerint: „Legyen egy új fül: Adományozók és
 * szponzorok. Listázza ki, hogy ki adományozott az adott évben (és visszamenőleg
 * is), mely személyek, mely cégek adtak szponzorpénzt, adományt, ki mennyit és
 * mikor." — és külön kérés: **bankit és készpénzeset egyaránt**.
 *
 * ── A KÓDOK, MÉRVE ────────────────────────────────────────────────────────
 * A 10 kód az EREK hivatalos 2026-os katalógusából jön
 * (`migration-docs/excel-2026-katalogus.json`, 927 kategória), nem emlékezetből.
 * A 2xx kódok (202.04, 203.01) SZÁNDÉKOSAN nincsenek benne: azok KIADÁSOK —
 * amit MI adunk másnak, nem amit kapunk.
 *
 * ── A PERSELY NEM NÉVSOR-TÉTEL (Endre, 2026-09-02) ────────────────────────
 * A perselypénz (101.03) adomány-kategória marad, de az adományozói NÉVSORBÓL
 * kimarad: „az külön tétel". Gyűjtés, nem adományozói befizetés — nincs
 * adományozója, így a fülön csak egy nagy névtelen sorként jelent meg, és
 * felfelé torzította az összesítést. A szűkebb listát az `ADOMANY_NEVSOR_KODOK`
 * adja; a `BankTab` hiányzó-befizető jelzése továbbra is a teljes családot nézi.
 *
 * ── A BESOROLÁS TÉNY, NEM TIPP ────────────────────────────────────────────
 * A bevétel-oldalon NINCS cégnyilvántartás: a `befizetes.forrasa` szabad szöveg,
 * és az `id_szemely` az adomány-kódoknál többnyire üres. Ezért a besorolás NEM
 * névtippelésből, hanem két MÉRHETŐ jelből áll:
 *   · `szemely`   — van `id_szemely`, tehát a tagnyilvántartásból azonosított;
 *   · `szervezet` — a SZÁMADÁSI KÓD maga szervezeti forrás (103.01 segélyszervezet
 *                   / alapítvány, 103.09 szponzor + adó 3,5%, 105.01 egyházi
 *                   intézmény, 105.02 állami intézmény);
 *   · `nevtelen`  — nincs név (a névtelenül leadott borítékok; a PÉNZ nem
 *                   tűnhet el a képből, ezért külön csoportot kap);
 *   · `egyeb`     — van név, de sem regiszter-kapcsolat, sem szervezeti kód.
 *
 * A névminta (SRL/SA/Fundația/…) CSAK másodlagos JELZÉS (`cegGyanu`), külön
 * megjelölve — sosem dönt besorolást. Egy tipp, ami ténynek látszik, rosszabb,
 * mint a nyitott kérdés.
 *
 * ── ÖSSZEVONÁS ────────────────────────────────────────────────────────────
 * Azonos adományozó = azonos `id_szemely`, vagy — ha az nincs — betűre azonos
 * CSOPORT-KULCS NÉV (lásd `adomanyozoKulcsNev`). Fuzzy összevonást
 * SZÁNDÉKOSAN nem végzünk: két hasonló nevű, de KÜLÖNBÖZŐ adományozó néma
 * összeolvasztása rosszabb, mint két külön sor.
 */

import { normalizeNameForMatch } from '../hasonlo-tetel/jaro-winkler'

/** Egy adomány-kategória a hivatalos EREK-katalógusból. */
export interface AdomanyKod {
  kod: string
  nev: string
  /** Igaz, ha a kód maga szervezeti forrást jelöl (nem magánszemélyt). */
  szervezeti: boolean
  /**
   * Igaz, ha a kód az ADOMÁNYOZÓI NÉVSORBA való (Adományozók és szponzorok fül).
   *
   * A perselypénz (101.03) SZÁNDÉKOSAN `false` — Endre szabálya (2026-09-02):
   * „A perselypénzt ne számítsuk az adományozók/szponzorok oldalhoz, az külön
   * tétel." A persely gyűjtés, nem adományozói tétel: definíció szerint nincs
   * adományozója, így a névsorban csak egy nagy „névtelen" sorként jelent meg,
   * és felfelé torzította a fül végösszegét.
   *
   * FIGYELEM: a kód ettől még adomány-kategória marad — a BankTab „hiányzó
   * befizető" jelzése és minden más fogyasztó a TELJES `ADOMANY_KODOK` listát
   * használja. Csak a névsor szűkül.
   */
  nevsorhoz: boolean
}

/**
 * A 10 bevételi adomány/szponzor kód — az `excel-2026-katalogus.json`-ból mérve.
 * A magyar nevek BETŰRE a katalógusból valók, hogy a fül és a Számadás
 * ugyanazt a szót használja.
 *
 * ⚠️ Ez a TELJES kódcsalád. Az adományozói NÉVSORHOZ az `ADOMANY_NEVSOR_KODOK`
 * szűkebb listáját használd (a persely nélkül).
 */
export const ADOMANY_KODOK: readonly AdomanyKod[] = [
  { kod: '101.03', nev: 'Perselypénz', szervezeti: false, nevsorhoz: false },
  { kod: '101.04', nev: 'Adományok hívektől, egyházi intézményektől', szervezeti: false, nevsorhoz: true },
  { kod: '101.05', nev: 'Úrasztali adományok', szervezeti: false, nevsorhoz: true },
  { kod: '102.04', nev: 'Diakóniai célú adományok', szervezeti: false, nevsorhoz: true },
  { kod: '102.05', nev: 'Missziós célú adományok', szervezeti: false, nevsorhoz: true },
  { kod: '102.06', nev: 'Legátumok - adományok teológiai hallgatók támogatására', szervezeti: false, nevsorhoz: true },
  { kod: '103.01', nev: 'Segélyszervezetektől, alapítványoktól, helyi szervezetektől származó adományok', szervezeti: true, nevsorhoz: true },
  { kod: '103.09', nev: 'Szponzortámogatások, adók 3,5 %-a', szervezeti: true, nevsorhoz: true },
  { kod: '105.01', nev: 'Más egyházi intézményektől kapott támogatás', szervezeti: true, nevsorhoz: true },
  { kod: '105.02', nev: 'Állami intézménytől kapott támogatás (APIA, stb.)', szervezeti: true, nevsorhoz: true },
]

/**
 * Az ADOMÁNYOZÓI NÉVSOR kódjai — a persely nélkül.
 *
 * Ezt kéri le az Adományozók és szponzorok fül (web ÉS desktop). Külön
 * konstans, nem szűrés a hívó oldalán: ha a hívó szűrne, a két felület
 * némán széthúzhatna.
 */
export const ADOMANY_NEVSOR_KODOK: readonly AdomanyKod[] = ADOMANY_KODOK.filter((k) => k.nevsorhoz)

const KOD_MAP = new Map(ADOMANY_KODOK.map((k) => [k.kod, k]))
const NEVSOR_KOD_MAP = new Map(ADOMANY_NEVSOR_KODOK.map((k) => [k.kod, k]))

/** Igaz, ha a számadási kód adomány/szponzor bevétel (a TELJES kódcsalád). */
export function adomanyKodE(kod: string | null | undefined): boolean {
  return KOD_MAP.has((kod ?? '').toString().trim())
}

/**
 * Igaz, ha a kód az adományozói NÉVSORBA való (persely nélkül).
 * Az Adományozók és szponzorok fül ezt a szűkebb kaput használja.
 */
export function adomanyNevsorKodE(kod: string | null | undefined): boolean {
  return NEVSOR_KOD_MAP.has((kod ?? '').toString().trim())
}

/** Egy adomány-kód magyar neve (ismeretlennél maga a kód). */
export function adomanyKodNev(kod: string): string {
  return KOD_MAP.get(kod)?.nev ?? kod
}

/**
 * CÉG-GYANÚ: pusztán JELZÉS a névből, sosem besorolás.
 * A minta a normalizált néven fut (kisbetű, ékezet nélkül, írásjelek szóközzé).
 * Az `s a` / `s r l` alakok azért vannak benne, mert a normalizálás az „S.A."
 * és „S.R.L." pontjait szóközre cseréli.
 */
const CEG_MINTA = /(^|\s)(srl|s r l|sa|s a|scs|snc|pfa|sc|fundatia|fundatie|asociatia|asociatie|primaria|consiliul|banca|alapitvany|egyesulet|kft|zrt|bt|nyrt|rt)(\s|$)/

/** Igaz, ha a név cégre/intézményre utal. FIGYELMEZTETŐ JEL, nem tény. */
export function cegGyanusNev(nev: string): boolean {
  const n = adomanyozoKulcsNev(nev)
  if (!n) return false
  return CEG_MINTA.test(n)
}

/**
 * A CSOPORTOSÍTÁSI KULCS neve.
 *
 * A `normalizeNameForMatch` az írásjeleket szóközre cseréli, ezért az „S.A."
 * `s a`-vá, a rövidítés nélkül írt „SA" viszont `sa`-vá válik — ugyanaz a cég
 * KÉT SORRA esne, aszerint hogy a lelkész kitette-e a pontokat. (Mérve: az
 * önellenőrzés pontosan ezen bukott el először.)
 *
 * Ezért az egybetűs token-sorozatokat összeragasztjuk: `s a` → `sa`,
 * `s r l` → `srl`. Az egybetűs tokenek a magyar és román névírásban rövidítés-
 * darabok (S.A., S.R.L., R.T.), nem önálló nevek.
 *
 * ⚠️ SZÁNDÉKOSAN NEM a közös `normalizeNameForMatch`-et bővítjük: azon fut az
 * import-egyeztetés és a hasonló-tétel figyelmeztetés is — egy ott elvégzett
 * változtatás azoknak a küszöbeit is elmozdítaná, észrevétlenül.
 */
export function adomanyozoKulcsNev(nev: string): string {
  const n = normalizeNameForMatch(nev || '')
  if (!n) return ''
  const darabok: string[] = []
  // Igaz, ha az utolsó darab CSUPA egybetűs tokenből épült — csak ilyenhez
  // ragasztunk tovább, hogy egy valódi szó végére ne kerüljön kezdőbetű.
  let elozoRovid = false
  for (const token of n.split(' ')) {
    if (token.length === 1 && elozoRovid) {
      darabok[darabok.length - 1] += token
    } else {
      darabok.push(token)
      elozoRovid = token.length === 1
    }
  }
  return darabok.join(' ')
}

/** Egy nyers adomány-tétel (a lekérdező felület adja). */
export interface AdomanyTetel {
  id: number
  /** ISO nap (YYYY-MM-DD). */
  datum: string
  /** Összeg RON-ban. */
  osszeg: number
  /** A befizető szabad szöveges neve (`forrasa`). */
  nev: string
  /** Tagnyilvántartási azonosító, ha ismert. */
  szemelyId: number | null
  /** Számadási kód (pl. `103.09`). */
  kod: string
  /** Igaz, ha banki (nem készpénzes) tétel — `bankszamla_id IS NOT NULL`. */
  banki: boolean
  iratszam: string | null
  megjegyzes: string | null
}

export type AdomanyozoTipus = 'szemely' | 'szervezet' | 'egyeb' | 'nevtelen'

/** Egy összevont adományozó. */
export interface Adomanyozo {
  /** Stabil csoport-kulcs (`p:<id>` vagy `n:<normalizált név>` vagy `nevtelen`). */
  kulcs: string
  /** A megjelenítendő név (a leggyakoribb eredeti írásmód). */
  nev: string
  tipus: AdomanyozoTipus
  szemelyId: number | null
  /** Csak `egyeb`/`szervezet` esetén értelmes JELZÉS — lásd `cegGyanusNev`. */
  cegGyanu: boolean
  osszesen: number
  keszpenz: number
  bank: number
  /** Hány külön tétel. */
  alkalmak: number
  elsoDatum: string
  utolsoDatum: string
  /** Évenkénti bontás (a „visszamenőleg is" kéréshez). */
  evenkent: Record<number, number>
  /** Kódonkénti bontás. */
  kodonkent: Record<string, number>
  tetelek: AdomanyTetel[]
}

/**
 * A PERSELYPÉNZ külön összesítője.
 *
 * Endre szabálya (2026-09-02): „A perselypénzt ne számítsuk az adományozók/
 * szponzorok oldalhoz, az külön tétel" — majd: „Vedd fel mindegyiket, de legyen
 * külön kategorizálva." Vagyis: a persely OTT VAN a fülön, de SAJÁT
 * kategóriaként; nem kerül be a névsorba, és nem növeli az adományozói
 * végösszegeket. (Gyűjtés, nem adományozói befizetés — nincs adományozója.)
 */
export interface PerselyOsszesito {
  osszeg: number
  alkalmak: number
  keszpenz: number
  bank: number
  /** Évenkénti bontás (a „visszamenőleg is" kéréshez). */
  evenkent: Record<number, number>
  /** A számadási kód és neve — hogy a felület ne írja be kézzel. */
  kod: string
  nev: string
}

/** A teljes összesítő. */
export interface AdomanyozokOsszesito {
  adomanyozok: Adomanyozo[]
  /** Az évek, amelyekre adat van — csökkenő sorrendben. */
  evek: number[]
  /** Kódonkénti végösszeg — CSAK a névsor-kódok (persely nélkül). */
  kodonkent: Array<{ kod: string; nev: string; osszeg: number; alkalmak: number }>
  /** Az adományozói végösszeg — a perselyt NEM tartalmazza. */
  osszesen: number
  keszpenzOsszesen: number
  bankOsszesen: number
  /** Hány adományozó (a névtelen csoport NEM számít bele). */
  adomanyozoDb: number
  /** A perselypénz KÜLÖN — a fenti összegek egyikében sincs benne. */
  persely: PerselyOsszesito
}

const evOf = (datum: string): number => Number((datum || '').slice(0, 4)) || 0

/**
 * Adományozókká vonja össze a nyers tételeket.
 *
 * A sorrend: összeg szerint csökkenő; a névtelen csoport MINDIG a lista végén,
 * hogy ne nyomja el a valódi adományozókat.
 */
export function osszesitAdomanyozok(osszesTetel: AdomanyTetel[]): AdomanyozokOsszesito {
  // ── A PERSELY LEVÁLASZTÁSA — a KÖZÖS MAGBAN, nem a hívóban ──────────────
  // A web és a desktop ugyanezt a függvényt hívja: ha a szűrés a hívó oldalán
  // lenne, a két felület némán széthúzhatna (más végösszeg ugyanarra az évre).
  // A hívók a TELJES `ADOMANY_KODOK` családot kérik le — így a persely nem
  // vész el, csak a saját kategóriájába kerül.
  const tetelek = osszesTetel.filter((t) => adomanyNevsorKodE(t.kod))
  const perselyTetelek = osszesTetel.filter((t) => !adomanyNevsorKodE(t.kod))

  const perselyKod = ADOMANY_KODOK.find((k) => !k.nevsorhoz)?.kod ?? '101.03'
  const persely: PerselyOsszesito = {
    osszeg: 0,
    alkalmak: 0,
    keszpenz: 0,
    bank: 0,
    evenkent: {},
    kod: perselyKod,
    nev: adomanyKodNev(perselyKod),
  }
  for (const t of perselyTetelek) {
    const osszeg = Number.isFinite(t.osszeg) ? t.osszeg : 0
    persely.osszeg += osszeg
    persely.alkalmak += 1
    if (t.banki) persely.bank += osszeg
    else persely.keszpenz += osszeg
    const ev = evOf(t.datum)
    if (ev) persely.evenkent[ev] = (persely.evenkent[ev] ?? 0) + osszeg
  }

  const csoportok = new Map<string, Adomanyozo>()
  // A megjelenítendő névhez a leggyakoribb eredeti írásmódot választjuk:
  // ugyanaz az adományozó szerepelhet „ELECTRICA SA" és „Electrica S.A." alakban.
  const nevSzavazat = new Map<string, Map<string, number>>()

  for (const t of tetelek) {
    const nyersNev = (t.nev || '').trim()
    const normalt = adomanyozoKulcsNev(nyersNev)
    const kulcs = t.szemelyId != null
      ? `p:${t.szemelyId}`
      : normalt
        ? `n:${normalt}`
        : 'nevtelen'

    let cs = csoportok.get(kulcs)
    if (!cs) {
      cs = {
        kulcs,
        nev: kulcs === 'nevtelen' ? 'Névtelen (persely, meg nem nevezett adomány)' : nyersNev,
        tipus: kulcs === 'nevtelen' ? 'nevtelen' : 'egyeb',
        szemelyId: t.szemelyId ?? null,
        cegGyanu: false,
        osszesen: 0,
        keszpenz: 0,
        bank: 0,
        alkalmak: 0,
        elsoDatum: t.datum,
        utolsoDatum: t.datum,
        evenkent: {},
        kodonkent: {},
        tetelek: [],
      }
      csoportok.set(kulcs, cs)
      nevSzavazat.set(kulcs, new Map())
    }

    if (kulcs !== 'nevtelen' && nyersNev) {
      const sz = nevSzavazat.get(kulcs)!
      sz.set(nyersNev, (sz.get(nyersNev) ?? 0) + 1)
    }

    const osszeg = Number.isFinite(t.osszeg) ? t.osszeg : 0
    cs.osszesen += osszeg
    if (t.banki) cs.bank += osszeg
    else cs.keszpenz += osszeg
    cs.alkalmak += 1
    if (t.datum && t.datum < cs.elsoDatum) cs.elsoDatum = t.datum
    if (t.datum && t.datum > cs.utolsoDatum) cs.utolsoDatum = t.datum
    const ev = evOf(t.datum)
    if (ev) cs.evenkent[ev] = (cs.evenkent[ev] ?? 0) + osszeg
    cs.kodonkent[t.kod] = (cs.kodonkent[t.kod] ?? 0) + osszeg
    cs.tetelek.push(t)

    // A besorolás a MÉRHETŐ jelekből: regiszter-kapcsolat > szervezeti kód.
    if (t.szemelyId != null) {
      cs.tipus = 'szemely'
      cs.szemelyId = t.szemelyId
    } else if (cs.tipus !== 'szemely' && cs.tipus !== 'nevtelen' && KOD_MAP.get(t.kod)?.szervezeti) {
      cs.tipus = 'szervezet'
    }
  }

  // Megjelenítendő név + cég-gyanú a végleges néven.
  for (const cs of csoportok.values()) {
    const sz = nevSzavazat.get(cs.kulcs)
    if (sz && sz.size) {
      let legjobb = cs.nev
      let db = -1
      for (const [nev, n] of sz) {
        if (n > db || (n === db && nev.length > legjobb.length)) { legjobb = nev; db = n }
      }
      cs.nev = legjobb
    }
    cs.cegGyanu = cs.tipus !== 'szemely' && cs.tipus !== 'nevtelen' && cegGyanusNev(cs.nev)
    // A tételek dátum szerint, a legfrissebb elöl — a „mikor" kérdésre ez válaszol.
    cs.tetelek.sort((a, b) => b.datum.localeCompare(a.datum))
  }

  const adomanyozok = [...csoportok.values()].sort((a, b) => {
    // A névtelen csoport MINDIG a végén.
    if (a.tipus === 'nevtelen' && b.tipus !== 'nevtelen') return 1
    if (b.tipus === 'nevtelen' && a.tipus !== 'nevtelen') return -1
    return b.osszesen - a.osszesen
  })

  // Az évválasztó a persely éveit IS ismerje: különben egy csak-perselyes évre
  // a fül üres évet kínálna, és a persely-kártya elérhetetlen lenne.
  const evek = [...new Set(osszesTetel.map((t) => evOf(t.datum)).filter(Boolean))].sort((a, b) => b - a)

  const kodAgg = new Map<string, { osszeg: number; alkalmak: number }>()
  for (const t of tetelek) {
    const a = kodAgg.get(t.kod) ?? { osszeg: 0, alkalmak: 0 }
    a.osszeg += Number.isFinite(t.osszeg) ? t.osszeg : 0
    a.alkalmak += 1
    kodAgg.set(t.kod, a)
  }
  const kodonkent = [...kodAgg.entries()]
    .map(([kod, a]) => ({ kod, nev: adomanyKodNev(kod), osszeg: a.osszeg, alkalmak: a.alkalmak }))
    .sort((a, b) => a.kod.localeCompare(b.kod))

  return {
    adomanyozok,
    evek,
    kodonkent,
    osszesen: adomanyozok.reduce((s, a) => s + a.osszesen, 0),
    keszpenzOsszesen: adomanyozok.reduce((s, a) => s + a.keszpenz, 0),
    bankOsszesen: adomanyozok.reduce((s, a) => s + a.bank, 0),
    adomanyozoDb: adomanyozok.filter((a) => a.tipus !== 'nevtelen').length,
    persely,
  }
}
