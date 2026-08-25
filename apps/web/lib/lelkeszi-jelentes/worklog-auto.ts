// 2026-08-25 (gyülekezeti egységek, 3. ütem): a lelkészi jelentés munkanapló-
// alapú auto-mezőinek TISZTA számítási magja.
//
// MIÉRT KÜLÖN FÁJL: a számítás eddig a lelkeszi-jelentes-actions.ts
// computeAuto-jában élt (~250 soros blokk). A „Gyülekezetenkénti bontás"
// (bontás-tábla) ugyanazt a számítást partíciónként (anyaközpont + minden
// egység) is futtatja — a 'use server' fájl viszont csak async függvényt
// exportálhat, ezért a tiszta mag ide került. A fő jelentés az ÖSSZES sorral
// hívja (viselkedés-azonos a korábbi blokkal, BETŰRE — a De.2/Du.2
// csoportkulcs, a javaslat-építés és minden él-eset változatlan), a bontás
// partíciónként külön-külön (így a de2/du2 kulcs-ütközés fel sem merülhet,
// mert egy alkalom pontosan egy partícióban van).
//
// A fájl NEM 'use server' — sima lib, tehát a kliens (dialógus) is
// importálhatja a típusokat.

import { categorizeWorklogEntry, type WorklogEntry } from '@/lib/constants/worklog'
import { classifyForOfficialJournal, getUnnepInfo } from '@/lib/worklog/print-columns'
import { isJournalEntry } from '@/lib/worklog/official-journal'
import type { EgysegTipus } from '@/lib/gyulekezet/egysegek-shared'
import { MUNKANAPLO_JAVASLAT_MEZOK } from './types'
import type { JelentesJavaslatTetel, JelentesJavaslatok } from './types'

// ─────────────────────────────────────────────────────────────────────────
// A bontás (gyülekezetenkénti kimutatás) adat-kontraktusa
// ─────────────────────────────────────────────────────────────────────────

/** A bontás-tábla egy egység-oszlopának fejléce. */
export interface BontasEgyseg {
  id: string
  nev: string
  tipus: EgysegTipus
}

/**
 * A „Gyülekezetenkénti bontás" kiszámolt adata. A getLelkesziJelentes adja
 * vissza (szerkesztés módban élőből számolva; véglegesített jelentésnél a
 * snapshot `bontas` kulcsából). A kézi cellák / felülírások NEM itt élnek —
 * azok a kezi_adatok / felulirasok jsonb-kben ülnek `egyseg:<id>:<mezoId>`
 * kulcsokkal (egysegek-shared.ts).
 */
export interface JelentesBontas {
  /** Az aktív egységek a bontás-tábla oszlop-sorrendjében. */
  egysegek: BontasEgyseg[]
  /**
   * oszlop ('anya' = ANYA_OSZLOP_ID | egység-uuid) → mezoId → auto érték.
   * null = nincs levezethető adat (a cella kézzel tölthető) — SOHA nem néma 0.
   */
  auto: Record<string, Record<string, number | null>>
  /** A bontást érintő rész-lekérdezési hibák magyar üzenetei (fail-closed). */
  hibak: string[]
}

// ─────────────────────────────────────────────────────────────────────────
// Segédek (a lelkeszi-jelentes-actions.ts-ből átemelve — változatlanul)
// ─────────────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Egy alkalom effektív jelenléte: jelenlet_osszesen ha > 0, különben a
 * férfi+nő+gyermek összege (azonos a statistics.ts / generator.ts szabályával).
 */
function jelenlet(e: WorklogEntry): number {
  if (typeof e.jelenlet_osszesen === 'number' && e.jelenlet_osszesen > 0) return e.jelenlet_osszesen
  return (e.jelenlet_ferfi ?? 0) + (e.jelenlet_no ?? 0) + (e.jelenlet_gyermek ?? 0)
}

/** Alkalom-halmozó: darab + össz-jelenlét + jelenlétet ténylegesen rögzítő alkalmak. */
interface Halmozo {
  db: number
  jelenletOssz: number
  jelenletesDb: number
}

function ujHalmozo(): Halmozo {
  return { db: 0, jelenletOssz: 0, jelenletesDb: 0 }
}

function halmoz(h: Halmozo, e: WorklogEntry) {
  h.db += 1
  const j = jelenlet(e)
  h.jelenletOssz += j
  if (j > 0) h.jelenletesDb += 1
}

/** Átlagjelenlét: a jelenlétet rögzítő alkalmak átlaga, 1 tizedes; null ha nincs ilyen. */
function atlagJelenlet(h: Halmozo): number | null {
  return h.jelenletesDb > 0 ? round1(h.jelenletOssz / h.jelenletesDb) : null
}

/** Átlagjelenlét a lélekszám %-ában (1 tizedes); null ha bármelyik hiányzik. */
function szazalek(atlag: number | null, lelekszam: number | null): number | null {
  if (atlag === null || !lelekszam || lelekszam <= 0) return null
  return round1((atlag / lelekszam) * 100)
}

/** A sátoros ünnepnapok (getUnnepInfo nevei) → II.5x mező-azonosítók. */
const SATOROS_NAP_MEZO: Record<string, string> = {
  'Karácsony': 'II.5a',
  'Karácsony másodnapja': 'II.5b',
  'Húsvét': 'II.5c',
  'Húsvét másodnapja': 'II.5d',
  'Pünkösd': 'II.5e',
  'Pünkösd másodnapja': 'II.5f',
  // 2026-07-17 (F5): a hivatalos nyomtatvány III. napjai (Erdélyben a sátoros
  // ünnepek harmadnapja is ünnep) — a getUnnepInfo új 'harmadnapja' nevei.
  'Karácsony harmadnapja': 'II.5g',
  'Húsvét harmadnapja': 'II.5h',
  'Pünkösd harmadnapja': 'II.5i',
}

// 2026-08-14 (18. pont 3C): a spec II.1 e/f/g származtatásainak TÍPUSNÉV-
// készletei (hivatalos EREK-nevek + legacy nevek — a régi rögzítések is
// helyesen számítanak). Szinkronban tartandó a lib/constants/worklog.ts
// WORKLOG_TYPES/LEGACY_WORKLOG_TYPES listáival.
const JELENTES_BIBLIAORA_TIPUSOK = new Set([
  'Felnőtt bibliaóra', 'Ifj. vagy IKE bibliaóra', 'Presbiteri bibliaóra',
  'Nőszöv. bibliaóra', 'Házasok bibliaórája', 'Más bibliaóra 1', 'Más bibliaóra 2',
  'Bibliaóra', 'Ifjúsági bibliaóra (IKE)', 'Ifjúsági óra',
])
const JELENTES_KAZUALIA_TIPUSOK = new Set([
  'F. keresztelő', 'N. keresztelő', 'Keresztelői felkészítő',
  'F. temetés', 'N. temetés', 'Virrasztó',
  'Azonos esketés', 'Vegyes esketés', 'Jegyesbeszélgetés',
  'Keresztelő', 'Esketés', 'Temetés',
])
const JELENTES_MAS_ALKALOM_TIPUSOK = new Set([
  'Vallásos ünnepély', 'Szeretetvendégség', 'Imahét',
  'Úrvacsora templomban', 'Betegúrvacsora', 'Egyéb szolgálat',
  // legacy: az 'Úrvacsora' a mai 'Úrvacsora templomban' elődje; a
  // 'Konfirmáció' esemény a 37-es készletben nem önálló típus → más alkalom.
  'Úrvacsora', 'Konfirmáció',
])

// ─────────────────────────────────────────────────────────────────────────
// A munkanapló-alapú auto-mezők számítása
// ─────────────────────────────────────────────────────────────────────────

/**
 * A lelkészi jelentés MINDEN munkanapló-alapú auto-mezője a megadott sorokból:
 * II.1a–II.14 (De.2/Du.2 összevonással), II.5a–i, III.1–III.10 worklog-részei,
 * V.3/V.3b — plusz a III.17 (nőszövetségi) JAVASLAT.
 *
 * TISZTA függvény: a hívó dönt a sor-halmazról — a fő jelentés az ÖSSZES évi
 * sorral hívja, a gyülekezetenkénti bontás partíciónként (egy alkalom pontosan
 * egy partícióban van, így a De.2/Du.2 csoportkulcs partíción belül ugyanúgy
 * működik, mint a teljes halmazon).
 *
 * `lelekszam`: a II.1c/II.2c/II.3c/II.4c százalék-mezők nevezője — a bontás
 * hívásaiban null (ott ezek a mezők nem szerepelnek).
 */
export function worklogAutoMezok(
  entries: WorklogEntry[],
  lelekszam: number | null,
): { mezok: Record<string, number | null>; javaslatok: JelentesJavaslatok } {
  const mezok: Record<string, number | null> = {}
  const javaslatok: JelentesJavaslatok = {}

  const vasarnapDe = ujHalmozo()
  const vasarnapDu = ujHalmozo()
  const unnepi = ujHalmozo()
  const satoros = ujHalmozo()
  const hetkoznapi = ujHalmozo()
  const bunbanati = ujHalmozo()
  let egyebDb = 0
  let presbiteriGyulesDb = 0
  let unnepelyDb = 0
  const imahet = ujHalmozo()
  const satorosNapJelenlet = new Map<string, number>() // mezoId → össz-jelenlét
  let katekezisDb = 0
  let csaladlatogatasDb = 0
  let egyebLatogatasDb = 0
  // Úrvacsora: 'Úrvacsora'-ként besorolt alkalmak + minden sor, ahol
  // úrvacsorázó-szám van rögzítve (uv_templomban / uv_betegnel)
  let uvOsztasDb = 0
  let uvResztvevoOssz = 0
  let uvResztvevosDb = 0
  let uvBetegnelOssz = 0
  // 2026-08-11 (6. kör): a hivatalos napló 15. oszlopa („Nőszövetségi
  // összejövetel") — a III.17 KÉZI rubrika JAVASLATÁHOZ, tételesen.
  const noszovetsegiTetelek: JelentesJavaslatTetel[] = []

  // 2026-08-14 (18. pont, EREK-spec 2.2 — De.2/Du.2 ÖSSZEADÓ SZABÁLY):
  // az istentiszteleti oszlopok alkalmait NEM halmozzuk azonnal — előbb
  // összegyűjtjük, és a De.2/Du.2-vel jelölt (ugyanaznapi második) alkalmak
  // jelenléte a nap ELSŐ azonos-napszakú alkalmához ADÓDIK, EGY alkalomként.
  // Jelölés nélkül két külön alkalom = az átlag feleződik (100+200 → 150);
  // jelöléssel 300 — ez a templomlátogatási százalék hivatalos alapja.
  const itGyujto: Array<{
    oszlop: 'vasarnapi' | 'unnepi' | 'satoros' | 'hetkoznapi' | 'bunbanati'
    kulcs: string
    masodik: boolean
    e: WorklogEntry
  }> = []
  const itNapszakOldal = (e: WorklogEntry): 'de' | 'du' | 'este' => {
    const n = e.napszak
    if (n === 'de2') return 'de'
    if (n === 'du2') return 'du'
    return n ?? (e.du ? 'du' : 'de')
  }

  // 2026-08-14 (EREK-spec 3.1 — VALLÁSÓRA-ÁTLAG): a nevező NEM az összes
  // vallásóra, hanem a „Vallásóra 1. csoport" alkalmainak száma (= a
  // vallásórás hetek száma). Két csoport heti 10+20 fővel: helyesen 30.
  let vallasoraJelenletOssz = 0
  let vallasora1CsoportDb = 0

  // 2026-08-14 (18. pont 3C — a spec II.1 e/f/g/h származtatásai,
  // TÍPUSNÉV szerint, a hivatalos képletekkel; a legacy nevek is számítanak):
  //  e (II.8) = a 7 bibliaóra-típus összege (a hivatalos ív 13. oszlopa
  //    csak a felnőtt/ifjúságit fogja — a jelentésé MIND a 7);
  //  f (II.9) = kazuáliák és felkészítők: keresztelők + esketések +
  //    Keresztelői felkészítő + Jegyesbeszélgetés + Virrasztó + temetések;
  //  g (II.10) = más alkalmak: Vallásos ünnepély + Szeretetvendégség +
  //    Imahét + Úrvacsora templomban + Betegúrvacsora + Egyéb szolgálat
  //    (a legacy 'Úrvacsora' és 'Konfirmáció' is ide számít);
  //  h (II.11) = kizárólag digitális alkalmak.
  const bibliaoraTipus = ujHalmozo()
  let kazualiaDb = 0
  let masAlkalomDb = 0
  let digitalisDb = 0
  // III.1/III.2 + új III.2b–f: bibliaóra-alkalmak TÍPUSONKÉNT (spec III.1).
  const bibliaoraTipusDb = new Map<string, number>()

  for (const e of entries) {
    if (e.deleted) continue

    const kategoria = categorizeWorklogEntry(e)
    const jellege = (e.jellege || '').trim()

    // 2026-08-15 (átvilágítás 12.) — MI VOLT A ROSSZ: a bibliaóra-számlálás a
    // `kategoria === 'szolgalat'` őr MÖGÖTT ült, a legacy 'Ifjúsági bibliaóra
    // (IKE)' és 'Ifjúsági óra' nevek viszont a worklog.ts katekézis-listájában
    // élnek, tehát a categorizeWorklogEntry 'katekezis'-t ad rájuk — az őr
    // némán kizárta őket. KÖVETKEZMÉNY: a hivatalos NYOMTATOTT munkanaplón
    // (isJournalEntry engedi őket, a 13. oszlop „Ifjúsági" rovatába) szereplő
    // alkalmak a jelentés II.8 és III.2 rubrikájában 0-t adtak, miközben
    // ugyanaz az esemény a V.3 katekézis-rubrikába csúszott: rossz fejezet,
    // aláírt és beküldött nyomtatványon. A bibliaóra-ság ezért MOSTANTÓL
    // tisztán TÍPUSNÉV kérdése (a halmaz maga elég szűrő), a kategóriától
    // függetlenül — ez ugyanaz a szabály, amit a nyomtatvány használ.
    const bibliaoraTipusu = JELENTES_BIBLIAORA_TIPUSOK.has(jellege)

    // V.3 — katekézis-alkalmak. A bibliaóra-típusú sorok NEM ide tartoznak
    // (a nyomtatvány is a 13. „Bibliaóra" oszlopba teszi őket): enélkül a
    // legacy ifjúsági alkalmak KÉTSZER számítanának, két külön fejezetben.
    if (kategoria === 'katekezis' && !bibliaoraTipusu) {
      katekezisDb += 1
      // Vallásóra-átlag (V.3b): számláló = MINDEN vallásóra-alkalom
      // jelenléte (hivatalos 1–5. csoport + legacy 'Vallásóra'),
      // nevező = a 'Vallásóra 1. csoport' alkalmai.
      if (jellege.startsWith('Vallásóra')) {
        vallasoraJelenletOssz += jelenlet(e)
        if (jellege === 'Vallásóra 1. csoport') vallasora1CsoportDb += 1
      }
    }
    if (kategoria === 'latogatas') {
      if (jellege === 'Családlátogatás') csaladlatogatasDb += 1
      else egyebLatogatasDb += 1
    }

    // Imahét (III.5/III.6) — jellege szerint, kategóriától függetlenül
    if (jellege === 'Imahét') halmoz(imahet, e)

    // II.1 e/f/g/h — típusnév szerinti számlálás. A bibliaóra-ág kategóriától
    // FÜGGETLEN (lásd a fenti magyarázatot); a maradék három ág — kazuália,
    // digitális, más alkalom — a szolgálat-kategórián belül marad. A négy
    // típushalmaz diszjunkt, így egy bejegyzés pontosan egyszer számít.
    if (bibliaoraTipusu) {
      halmoz(bibliaoraTipus, e)
      bibliaoraTipusDb.set(jellege, (bibliaoraTipusDb.get(jellege) || 0) + 1)
    } else if (kategoria === 'szolgalat') {
      if (JELENTES_KAZUALIA_TIPUSOK.has(jellege)) kazualiaDb += 1
      else if (jellege === 'Digitális alkalmak') digitalisDb += 1
      else if (JELENTES_MAS_ALKALOM_TIPUSOK.has(jellege)) masAlkalomDb += 1
    }

    // Úrvacsorázó-számot rögzítő sorok (bármely kategória)
    const uvOsszeg = (e.uv_templomban ?? 0) + (e.uv_betegnel ?? 0)
    uvBetegnelOssz += e.uv_betegnel ?? 0
    let uvAlkalom = uvOsszeg > 0
    if (uvOsszeg > 0) {
      uvResztvevoOssz += uvOsszeg
      uvResztvevosDb += 1
    }

    if (isJournalEntry(e)) {
      const { column } = classifyForOfficialJournal(e)
      switch (column) {
        // Az 5 istentiszteleti oszlop a De.2/Du.2 összevonás miatt NEM
        // halmozódik azonnal — a gyűjtőbe megy, a ciklus után egyesítjük.
        case 'vasarnapi':
        case 'unnepi':
        case 'satoros':
        case 'hetkoznapi':
        case 'bunbanati': {
          const oldal = itNapszakOldal(e)
          itGyujto.push({
            oszlop: column,
            kulcs: `${column}|${(e.idopont || '').slice(0, 10)}|${oldal}`,
            masodik: e.napszak === 'de2' || e.napszak === 'du2',
            e,
          })
          break
        }
        case 'urvacsora':
          uvAlkalom = true
          break
        case 'presbiteri':
          presbiteriGyulesDb += 1
          break
        case 'unnepely':
          unnepelyDb += 1
          break
        case 'noszovetsegi': {
          // 2026-08-11 (6. kör): eddig ITT ÜRES volt az ág — a rendesen
          // naplózott nőszövetségi alkalom SEHOL nem jelent meg a
          // jelentésben. A III.17 rubrika KÉZI MARAD (az okokat lásd a
          // types.ts MUNKANAPLO_JAVASLAT_MEZOK kommentjében), de mostantól
          // JAVASLATOT adunk mellé — tételesen, hogy a lelkész ellenőrizni
          // tudja, mit ír alá.
          const nszJelenlet = jelenlet(e)
          noszovetsegiTetelek.push({
            datum: (e.idopont || '').slice(0, 10),
            cim: (e.cim || '').trim() || (e.jellege || '').trim() || 'Nőszövetségi összejövetel',
            jelenlet: nszJelenlet > 0 ? nszJelenlet : null,
          })
          break
        }
        case 'egyeb':
          egyebDb += 1
          break
      }

      // Sátoros ünnepek naponkénti jelenléte (II.5a–i): az adott ünnepNAP
      // ÖSSZES naplózott alkalmának jelenléte (oszloptól függetlenül —
      // pl. az aznapi úrvacsorás istentisztelet is beleszámít).
      const unnep = getUnnepInfo((e.idopont || '').slice(0, 10))
      if (unnep && unnep.tipus === 'satoros') {
        const mezoId = SATOROS_NAP_MEZO[unnep.nev]
        if (mezoId) satorosNapJelenlet.set(mezoId, (satorosNapJelenlet.get(mezoId) || 0) + jelenlet(e))
      }
    }

    if (uvAlkalom) uvOsztasDb += 1
  }

  // ── De.2/Du.2 ÖSSZEVONÁS (EREK 2.2) ──────────────────────────────────
  // Csoportkulcs: oszlop + nap + napszak-oldal. A jelöletlen alkalmak
  // önálló alkalmak; a De.2/Du.2-vel jelöltek jelenléte a csoport ELSŐ
  // jelöletlen alkalmához adódik (egy alkalomként számít). Ha egy jelölt
  // alkalomnak nincs jelöletlen párja (adathiba), önálló alkalomként
  // számoljuk — az adat nem veszhet el némán.
  {
    const csoportok = new Map<string, { alapok: WorklogEntry[]; masodikOssz: number }>()
    for (const t of itGyujto) {
      let cs = csoportok.get(t.kulcs)
      if (!cs) {
        cs = { alapok: [], masodikOssz: 0 }
        csoportok.set(t.kulcs, cs)
      }
      if (t.masodik) cs.masodikOssz += jelenlet(t.e)
      else cs.alapok.push(t.e)
    }
    for (const [kulcs, cs] of csoportok) {
      const [oszlop, , oldal] = kulcs.split('|') as [
        'vasarnapi' | 'unnepi' | 'satoros' | 'hetkoznapi' | 'bunbanati',
        string,
        'de' | 'du' | 'este',
      ]
      const celHalmozo =
        oszlop === 'vasarnapi'
          ? oldal === 'du' || oldal === 'este'
            ? vasarnapDu
            : vasarnapDe
          : oszlop === 'unnepi'
            ? unnepi
            : oszlop === 'satoros'
              ? satoros
              : oszlop === 'hetkoznapi'
                ? hetkoznapi
                : bunbanati
      if (cs.alapok.length === 0 && cs.masodikOssz > 0) {
        // csak jelölt alkalom van a napon — önálló alkalomként számoljuk
        halmoz(celHalmozo, {
          jelenlet_osszesen: cs.masodikOssz,
          jelenlet_ferfi: null,
          jelenlet_no: null,
          jelenlet_gyermek: null,
        } as WorklogEntry)
        continue
      }
      cs.alapok.forEach((alap, idx) => {
        const osszevont = idx === 0 ? jelenlet(alap) + cs.masodikOssz : jelenlet(alap)
        halmoz(celHalmozo, {
          ...alap,
          jelenlet_osszesen: osszevont,
          jelenlet_ferfi: null,
          jelenlet_no: null,
          jelenlet_gyermek: null,
        } as WorklogEntry)
      })
    }
  }

  mezok['II.1a'] = vasarnapDe.db
  mezok['II.1b'] = atlagJelenlet(vasarnapDe)
  mezok['II.1c'] = szazalek(atlagJelenlet(vasarnapDe), lelekszam)
  mezok['II.2a'] = vasarnapDu.db
  mezok['II.2b'] = atlagJelenlet(vasarnapDu)
  mezok['II.2c'] = szazalek(atlagJelenlet(vasarnapDu), lelekszam)
  mezok['II.3a'] = unnepi.db
  mezok['II.3b'] = atlagJelenlet(unnepi)
  mezok['II.3c'] = szazalek(atlagJelenlet(unnepi), lelekszam)
  mezok['II.4a'] = satoros.db
  mezok['II.4b'] = atlagJelenlet(satoros)
  mezok['II.4c'] = szazalek(atlagJelenlet(satoros), lelekszam)
  for (const mezoId of Object.values(SATOROS_NAP_MEZO)) {
    mezok[mezoId] = satorosNapJelenlet.has(mezoId) ? satorosNapJelenlet.get(mezoId)! : null
  }
  mezok['II.6a'] = hetkoznapi.db
  mezok['II.6b'] = atlagJelenlet(hetkoznapi)
  mezok['II.7a'] = bunbanati.db
  mezok['II.7b'] = atlagJelenlet(bunbanati)
  // 2026-08-14 (3C): a II.8 a spec e-képlete — MIND a 7 bibliaóra-típus
  // (a régi, ív-oszlop alapú számláló a presbiterit/nőszövetségit kihagyta).
  mezok['II.8a'] = bibliaoraTipus.db
  mezok['II.8b'] = atlagJelenlet(bibliaoraTipus)
  // f-képlet: kazuáliák és felkészítők (a régi érték az ív 17. oszlopa
  // volt, amiben az Imahét/Digitális/Egyéb is benne volt — pontatlanul).
  mezok['II.9'] = kazualiaDb
  // g/h-képlet: eddig KÉZI mezők voltak — a spec [M]-et (munkanaplóból) kér.
  mezok['II.10'] = masAlkalomDb
  mezok['II.11'] = digitalisDb
  mezok['II.12'] = uvOsztasDb
  mezok['II.13'] = uvResztvevosDb > 0 ? round1(uvResztvevoOssz / uvResztvevosDb) : null
  mezok['II.14'] = uvBetegnelOssz

  // 2026-08-14 (3D): a III.1/III.2 TÍPUSNÉV szerint számol (a régi
  // ív-oszlop-slot a felnőtt rovatba sodorta a házasok/Más 1-2 órákat is);
  // + az új típusonkénti bontás (III.2b–f, spec III.1).
  const bibliaoraDb = (...tipusok: string[]) =>
    tipusok.reduce((s, t) => s + (bibliaoraTipusDb.get(t) || 0), 0)
  mezok['III.1'] = bibliaoraDb('Felnőtt bibliaóra', 'Bibliaóra')
  mezok['III.2'] = bibliaoraDb('Ifj. vagy IKE bibliaóra', 'Ifjúsági bibliaóra (IKE)', 'Ifjúsági óra')
  mezok['III.2b'] = bibliaoraDb('Presbiteri bibliaóra')
  mezok['III.2c'] = bibliaoraDb('Nőszöv. bibliaóra')
  mezok['III.2d'] = bibliaoraDb('Házasok bibliaórája')
  mezok['III.2e'] = bibliaoraDb('Más bibliaóra 1')
  mezok['III.2f'] = bibliaoraDb('Más bibliaóra 2')
  mezok['III.3'] = unnepelyDb
  mezok['III.5'] = imahet.db
  mezok['III.6'] = atlagJelenlet(imahet)
  mezok['III.7'] = csaladlatogatasDb
  mezok['III.8'] = egyebLatogatasDb
  mezok['III.10'] = presbiteriGyulesDb

  // V.3 — katekézis-alkalmak (worklog-alapú, ezért ebben a blokkban)
  mezok['V.3'] = katekezisDb
  // V.3b — vallásórára járt átlag EGY ALKALOMMAL (EREK 3.1): a nevező a
  // „Vallásóra 1. csoport" alkalmainak száma (= vallásórás hetek). Ha az
  // adat még a régi, csoport nélküli típusnevekkel készült, nincs helyes
  // nevező → null (kézi töltés), NEM hamis szám.
  mezok['V.3b'] =
    vallasora1CsoportDb > 0 ? round1(vallasoraJelenletOssz / vallasora1CsoportDb) : null

  // III.17 — JAVASLAT (NEM auto-mező!) a nőszövetségi alkalmakból.
  // Csak akkor tesszük be, ha van mit javasolni: a nulla nem javaslat,
  // hanem zaj. Az `ertek` MINDIG a lista hossza — nincs két igazság.
  // FIGYELEM: a hívó csak sikeres munkanapló-lekérdezés után hív minket,
  // tehát hibás lekérdezésnél NEM születik javaslat (a 0 hazugság lenne) —
  // a hiba az autoHibak listán megy ki, hangosan.
  if (MUNKANAPLO_JAVASLAT_MEZOK.has('III.17') && noszovetsegiTetelek.length > 0) {
    noszovetsegiTetelek.sort((a, b) => a.datum.localeCompare(b.datum))
    javaslatok['III.17'] = {
      ertek: noszovetsegiTetelek.length,
      tetelek: noszovetsegiTetelek,
    }
  }

  return { mezok, javaslatok }
}
