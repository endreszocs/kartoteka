// 2026-07-16 (F4/S1): Munkanapló év-statisztika — PURE számítási mag.
//
// Bemenet: egy teljes év (nem lapozott) munkanapló-sorai (WorklogEntry[]).
// Kimenet: WorklogStatisztika — szolgálat-típus bontás, ének-gyakoriság,
// alapige-gyakoriság és Károli-lefedettség (vers-szinten, mind a 66 könyvre).
// Önellenőrzés: node scripts/selftest-worklog-stats.mjs
//
// TUDATOS DÖNTÉSEK:
//  - PURE: se DOM, se fetch, se Supabase — a hívó tölti az adatot, ez csak
//    számol. Egy menetben megy végig a sorokon (O(n) a bejegyzés-számban),
//    a törölt (deleted) sorok MINDENHOL kimaradnak.
//  - Az énekes csomagból SEMMIT nem importál: az ének-statisztika itt csak
//    azonosító-szintű ('153', '400b'); a cím/szakasz-dúsítást a UI végzi a
//    @kartoteka/enekeskonyv dynamic importjával (a 608 KB-os korpusz miatt
//    ide statikus import TILOS).
//  - A @kartoteka/biblia statikus import — kicsi (parser + ~5 KB katalógus).
//  - atlagJelenlet: a jelenlétet TÉNYLEGESEN rögzítő alkalmak átlaga (ahol a
//    jelenlét > 0) — a jelenlét nélküli legacy sorok nem hígítják az átlagot;
//    null, ha a típus egyetlen alkalmán sincs jelenlét. Egy tizedesre kerekítve.
//  - igehelyek: a TELJES gyakoriság-lista db szerint csökkenő sorrendben —
//    a "top N" vágás a megjelenítő dolga (slice).
//  - napszak fallback a legacy sorokra: napszak ?? (du ? 'du' : 'de') —
//    azonos a print-columns.ts szabályával.

import { categorizeWorklogEntry, type WorklogEntry } from '@/lib/constants/worklog'
import {
  coverage,
  expandToVerseIds,
  formatReference,
  getVerseCounts,
  parseMultiReference,
} from '@kartoteka/biblia'

// ── Kontraktus-típusok (S1 számítás ↔ S2 megjelenítés közös nyelve) ──────────

export interface TipusStat {
  /** Szolgálat típusa (jellege); '(típus nélkül)' ha a sorban üres. */
  jellege: string
  /** Alkalmak száma. */
  db: number
  /** Össz-jelenlét: jelenlet_osszesen ha > 0, különben ferfi+no+gyermek. */
  osszJelenlet: number
  /** Átlag-jelenlét a jelenlétet rögzítő alkalmakon (1 tizedes); null ha nincs ilyen. */
  atlagJelenlet: number | null
  ferfi: number
  no: number
  gyermek: number
  /** Napszak-bontás (alkalom-darab): délelőtt / délután / este. */
  deDb: number
  duDb: number
  esteDb: number
  /** 12 elem: alkalom-darabszám hónaponként (index 0 = január). */
  havonta: number[]
}

export interface EnekStat {
  /** Normalizált ének-azonosító ('153', '400b'). */
  azonosito: string
  /** Hány alkalmon szerepelt. */
  db: number
  /** Az utolsó éneklés időpontja (ISO, a sor idopont-ja); '' ha egyik sornak sincs dátuma. */
  utolsoDatum: string
}

export interface IgehelyStat {
  /** Kanonikus alak (formatReference), pl. 'Jn 3,16' — az írásmód-változatok összeolvadnak. */
  hivatkozas: string
  db: number
}

export interface KonyvLefedettseg {
  /** Kanonikus könyvkód, pl. 'GEN'. */
  book: string
  /** A könyv összes verse a Károli-katalógusban. */
  osszVers: number
  /** Az évben érintett (felolvasott/textusként vett) egyedi versek száma. */
  erintett: number
  /** erintett / osszVers, két tizedesre kerekített százalék. */
  szazalek: number
}

export interface WorklogStatisztika {
  /** Szolgálat-kategóriájú alkalmak típusonként, db szerint csökkenő. */
  tipusok: TipusStat[]
  /** Minden kategória énekei, db szerint csökkenő (teljes lista). */
  enekek: EnekStat[]
  /** Alapige-hivatkozások gyakorisága, db szerint csökkenő (teljes lista — a top N a UI dolga). */
  igehelyek: IgehelyStat[]
  /** Mind a 66 könyv, bibliai sorrendben (alapige + bibliaolvasás együtt). */
  konyvek: KonyvLefedettseg[]
  /** Össz-lefedettség a teljes Károli-korpuszra (31126 vers). */
  lefedettseg: { osszes: number; erintett: number; szazalek: number }
  /** Amit a parser nem értett (diagnosztika; a TELJES duplikátum-mentes lista — a bemenet évente korlátos, cap nincs). */
  ertelmezhetetlenIgehelyek: string[]
}

// ── Ének-tokenizáló ──────────────────────────────────────────────────────────

/**
 * Ének-mező → normalizált azonosító-lista: '153, 25, 400b' → ['153','25','400b'].
 *
 * SZEGMENS-ALAPÚ feldolgozás:
 *  1. Bontás előbb vessző / pontosvessző mentén SZEGMENSEKRE.
 *  2. Egy szegmensre először a szóköz-toleráns TELJES-szegmens minta próbál
 *     illeszkedni: szám + opcionális egybetűs változat-jel ('400 b', '400/ b',
 *     '400. b', '400/B', '400B' → mind '400b') + opcionális versszak-jelölés,
 *     ami LEVÁGÓDIK ('153/1-3', '265:1', '396/4' → '153', '265', '396').
 *  3. Ha nem illik: a szegmens szóköz mentén tokenekre bomlik; ha MINDEN token
 *     szám-szerű ének-token, mind bekerül (a '153 25 430' szóközös lista
 *     működik); ha BÁRMELY token nem az, a TELJES szegmens kimarad — így a
 *     'Halleluja 68' 68-a NEM válik tévesen ERE-énekké, és az 'Ifjúsági
 *     énekek' szabad szöveg is némán kimarad. Ez szándékos: a statisztika
 *     csak az azonosítható énekeket számolja.
 *  A vezető nullák lekopnak, a változat-betű kisbetűsítve ('090' → '90').
 */

/** Teljes-szegmens minta: szóköz-toleráns azonosító + levágandó versszak-jelölés. */
const ENEK_SZEGMENS_MINTA = /^(\d+)\s*[/.\-]?\s*([a-zA-Z])?(?:\s*[/:.]\s*\d+(?:[-–]\d+)?)?\.?$/
/** Token-minta: azonosító + opcionális (szorosan tapadó) versszak-jelölés. */
const ENEK_TOKEN_MINTA = /^(\d+)(?:[/.\-]?([a-zA-Z]))?(?:[/:.]\d+(?:[-–]\d+)?)?\.?$/

export function parseEnekTokens(enekek: string | null | undefined): string[] {
  if (!enekek) return []
  const out: string[] = []
  const push = (szam: string, betu: string | undefined) => {
    out.push(`${parseInt(szam, 10)}${betu ? betu.toLowerCase() : ''}`)
  }
  for (const nyers of enekek.split(/[,;]+/)) {
    const szegmens = nyers.trim()
    if (!szegmens) continue
    const teljes = szegmens.match(ENEK_SZEGMENS_MINTA)
    if (teljes) {
      push(teljes[1], teljes[2])
      continue
    }
    // Szóközös lista: csak akkor számít, ha MINDEN tokenje ének-szerű —
    // különben az egész szegmens kimarad (pl. 'Halleluja 68')
    const talalatok = szegmens.split(/\s+/).map((t) => t.match(ENEK_TOKEN_MINTA))
    if (talalatok.some((m) => !m)) continue
    for (const m of talalatok) push(m![1], m![2])
  }
  return out
}

// ── Belső segédek ────────────────────────────────────────────────────────────

/** Az érintett hónap indexe (0 = január), vagy null ha nincs/értelmezhetetlen dátum. */
function honapIndex(idopont: string | null | undefined): number | null {
  if (!idopont) return null
  // ISO-forma gyors útja — időzóna-független (a Date a 'YYYY-MM-DD'-t UTC-ként
  // értelmezné, ami éjfél körül hónapot csúsztathatna)
  const m = /^(\d{4})-(\d{2})/.exec(idopont)
  if (m) {
    const h = parseInt(m[2], 10)
    return h >= 1 && h <= 12 ? h - 1 : null
  }
  const d = new Date(idopont)
  return Number.isNaN(d.getTime()) ? null : d.getMonth()
}

/** Egy alkalom jelenléte: jelenlet_osszesen ha > 0, különben a F/N/Gy összege. */
function effektivJelenlet(e: WorklogEntry): number {
  if (typeof e.jelenlet_osszesen === 'number' && e.jelenlet_osszesen > 0) {
    return e.jelenlet_osszesen
  }
  return (e.jelenlet_ferfi ?? 0) + (e.jelenlet_no ?? 0) + (e.jelenlet_gyermek ?? 0)
}

/** Napszak a legacy `du` boolean fallbackkel (azonos a print-columns.ts szabályával). */
function effektivNapszak(e: WorklogEntry): 'de' | 'du' | 'este' {
  if (e.napszak === 'de' || e.napszak === 'du' || e.napszak === 'este') return e.napszak
  return e.du ? 'du' : 'de'
}

/** Ének-azonosítók természetes sorrendje: szám szerint, azonos számon betű szerint. */
function enekAzonositoSorrend(a: string, b: string): number {
  const na = parseInt(a, 10)
  const nb = parseInt(b, 10)
  if (na !== nb) return na - nb
  return a < b ? -1 : a > b ? 1 : 0
}

interface TipusGyujto {
  jellege: string
  db: number
  osszJelenlet: number
  /** Hány alkalmon volt tényleges (>0) jelenlét — az átlag nevezője. */
  jelenletesDb: number
  ferfi: number
  no: number
  gyermek: number
  deDb: number
  duDb: number
  esteDb: number
  havonta: number[]
}

// ── Fő számítás ──────────────────────────────────────────────────────────────

/**
 * Egy év munkanapló-soraiból a teljes statisztika. Pure függvény, egy menet
 * az entries-en — nagy évfolyamra (több ezer sor) is gyors.
 */
export function computeWorklogStatistics(yearEntries: WorklogEntry[]): WorklogStatisztika {
  const tipusGyujto = new Map<string, TipusGyujto>()
  const enekGyujto = new Map<string, { db: number; utolsoDatum: string }>()
  const igehelyGyujto = new Map<string, number>()
  /** Az évben érintett versek közös halmaza (alapige + bibliaolvasás együtt). */
  const erintettVersek = new Set<string>()
  const hibasIgehelyek = new Set<string>()

  const addHibas = (raw: string) => {
    const tisztitott = raw.trim()
    if (tisztitott) hibasIgehelyek.add(tisztitott)
  }

  /**
   * Egy igehely-mező feldolgozása (több, ';'-vel tagolt szakasz is lehet benne):
   * a lefedettségbe minden érvényes szakasz beszámít; a gyakoriság-számlálóba
   * csak akkor, ha ez alapige-mező (szamitGyakorisagba).
   */
  const feldolgozIgehelyMezot = (mezo: string | null | undefined, szamitGyakorisagba: boolean) => {
    const szoveg = (mezo ?? '').trim()
    if (!szoveg) return
    for (const res of parseMultiReference(szoveg)) {
      if (!res.ok) {
        if (res.error.code !== 'ures') addHibas(res.error.raw)
        continue
      }
      if (szamitGyakorisagba) {
        const kulcs = formatReference(res.segments)
        igehelyGyujto.set(kulcs, (igehelyGyujto.get(kulcs) ?? 0) + 1)
      }
      for (const id of expandToVerseIds(res.segments)) erintettVersek.add(id)
    }
  }

  for (const e of yearEntries) {
    if (e.deleted) continue

    // 2. Énekek — MINDEN kategória sorából
    const idopont = e.idopont ?? ''
    for (const azonosito of parseEnekTokens(e.enekek)) {
      const acc = enekGyujto.get(azonosito)
      if (acc) {
        acc.db++
        if (idopont > acc.utolsoDatum) acc.utolsoDatum = idopont
      } else {
        enekGyujto.set(azonosito, { db: 1, utolsoDatum: idopont })
      }
    }

    // 3. Igehelyek — az alapige a gyakoriságba ÉS a lefedettségbe,
    //    a bibliaolvasás csak a lefedettségbe számít
    feldolgozIgehelyMezot(e.alapige, true)
    feldolgozIgehelyMezot(e.bibliaolvasas, false)

    // 1. Típus-statisztika — csak a szolgálat-kategória
    if (categorizeWorklogEntry(e) !== 'szolgalat') continue
    const jellege = (e.jellege ?? '').trim() || '(típus nélkül)'
    let t = tipusGyujto.get(jellege)
    if (!t) {
      t = {
        jellege,
        db: 0,
        osszJelenlet: 0,
        jelenletesDb: 0,
        ferfi: 0,
        no: 0,
        gyermek: 0,
        deDb: 0,
        duDb: 0,
        esteDb: 0,
        havonta: new Array<number>(12).fill(0),
      }
      tipusGyujto.set(jellege, t)
    }
    t.db++
    const jelen = effektivJelenlet(e)
    t.osszJelenlet += jelen
    if (jelen > 0) t.jelenletesDb++
    t.ferfi += e.jelenlet_ferfi ?? 0
    t.no += e.jelenlet_no ?? 0
    t.gyermek += e.jelenlet_gyermek ?? 0
    const napszak = effektivNapszak(e)
    if (napszak === 'du') t.duDb++
    else if (napszak === 'este') t.esteDb++
    else t.deDb++
    const honap = honapIndex(e.idopont)
    if (honap !== null) t.havonta[honap]++
  }

  // ── Rendezett kimenetek ──

  const tipusok: TipusStat[] = Array.from(tipusGyujto.values())
    .map(({ jelenletesDb, ...t }) => ({
      ...t,
      atlagJelenlet:
        jelenletesDb > 0 ? Math.round((t.osszJelenlet / jelenletesDb) * 10) / 10 : null,
    }))
    .sort((a, b) => b.db - a.db || a.jellege.localeCompare(b.jellege, 'hu'))

  const enekek: EnekStat[] = Array.from(enekGyujto.entries())
    .map(([azonosito, acc]) => ({ azonosito, db: acc.db, utolsoDatum: acc.utolsoDatum }))
    .sort((a, b) => b.db - a.db || enekAzonositoSorrend(a.azonosito, b.azonosito))

  const igehelyek: IgehelyStat[] = Array.from(igehelyGyujto.entries())
    .map(([hivatkozas, db]) => ({ hivatkozas, db }))
    .sort((a, b) => b.db - a.db || a.hivatkozas.localeCompare(b.hivatkozas, 'hu'))

  // Könyvenkénti bontás: az érintett versek szétosztása könyvkód szerint
  // (a vers-azonosító 'KÖNYVKÓD.fejezet.vers' alakú — lásd @kartoteka/biblia types.ts)
  const erintettKonyvenkent = new Map<string, number>()
  for (const id of erintettVersek) {
    const kod = id.slice(0, id.indexOf('.'))
    erintettKonyvenkent.set(kod, (erintettKonyvenkent.get(kod) ?? 0) + 1)
  }

  const verseCounts = getVerseCounts()
  const konyvek: KonyvLefedettseg[] = verseCounts.order.map((code) => {
    const osszVers = (verseCounts.counts[code] ?? []).reduce((a, b) => a + b, 0)
    const erintett = erintettKonyvenkent.get(code) ?? 0
    return {
      book: code,
      osszVers,
      erintett,
      szazalek: osszVers > 0 ? Math.round((erintett / osszVers) * 10000) / 100 : 0,
    }
  })

  const lefedettseg = coverage(erintettVersek)

  return {
    tipusok,
    enekek,
    igehelyek,
    konyvek,
    lefedettseg: {
      osszes: lefedettseg.osszes,
      erintett: lefedettseg.erintett,
      szazalek: lefedettseg.szazalek,
    },
    ertelmezhetetlenIgehelyek: Array.from(hibasIgehelyek),
  }
}
