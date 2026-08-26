'use server'

/**
 * Leltar 3_43 — a hivatalos egyházmegyei leltár-munkafüzet DEDIKÁLT importja
 * és az export-környezet (2026-08-26).
 *
 * MIÉRT NEM A GENERIKUS BATCH-ÚT: a munkafüzet fejlécei a 3–4. sorban vannak,
 * a G oszlop „Helyszín - Felelős" összevont, a Könyvek lapon E=Szerző/F=Cím,
 * az ismétlődő kulcsú (negatív) sorok részleges kivezetést, alapeszköznél
 * le-/felértékelést jelentenek — ezt a szabályrendszert a
 * lib/inventory/leltar343-shared tiszta rétege hordozza, itt csak a kapuőrzés,
 * a DB-egyeztetés és az írás él.
 *
 * KAPUŐRZÉS: ugyanaz a fail-closed hármas, mint a generikus batch-importon
 * (delegált PIN-munkamenet VAGY aktív god-mode VAGY rendszergazda+hatókör) —
 * a 2026-08-11-i #16-os biztonsági javítás mintája.
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'
import { assertDelegatedImportAllowed } from '@/app/(dashboard)/delegated-import/guard'
import { resolveImportTargetCongregationId } from '@/lib/import/import-target'
import { selectAllPaged } from '@kartoteka/supabase-client'
import { serializeInventoryCategory } from '@kartoteka/ui-app'
import {
  isLeltar343Workbook,
  feldolgozLeltar343Lap,
} from '@/lib/inventory/leltar343-shared'
// 2026-08-27 (javító-varázsló): a KÖZÖS review-réteg — ugyanez fut a kliensen
// is, így a felület és a szerver betűre ugyanazt tartja hibának.
import {
  alkalmazJavitasok,
  egyebHibak,
  ellenorizSorok,
  epitReviewSorok,
  osztSzamokat,
  LELTAR343_FELOLDASOK,
  LELTAR343_SZERKESZTHETO_MEZOK,
  type Leltar343Feloldas,
  type Leltar343Javitas,
  type Leltar343Javitasok,
  type Leltar343ReviewSor,
} from '@/lib/inventory/leltar343-review'
import {
  parseLeltar343Workbook,
  leltar343LapNevek,
  type Leltar343Parsed,
} from '@/lib/inventory/leltar343-parse'
import type {
  Leltar343Preview,
  Leltar343ImportResult,
  Leltar343ExportContext,
} from '@/lib/inventory/leltar343-import-types'
import { documentSeasonYear } from '@/lib/constants/documents'
import { getInventoryPrintFinanceSummary, getLeltarFinalizationStatus } from './actions'

// ---------------------------------------------------------------------------
// Közös: kapu + fájl + parse
// ---------------------------------------------------------------------------

type ElokeszitesHiba = { error: string }
interface Elokeszites {
  congregationId: string
  userId: string
  fileName: string
  parsed: Leltar343Parsed
}

async function elokeszit(formData: FormData): Promise<Elokeszites | ElokeszitesHiba> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const target = await resolveImportTargetCongregationId(null, access)
  if (target.error) return { error: target.error }
  if (!target.congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const guard = await assertDelegatedImportAllowed('inventory', target.congregationId, access)
  if (!guard.ok) return { error: guard.error }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'Nincs fájl kiválasztva.' }
  if (file.size > 10 * 1024 * 1024) return { error: 'A fájl mérete meghaladja a 10 MB-os limitet.' }
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext !== 'xlsx' && ext !== 'xls') {
    return { error: 'A Leltar 3_43 importáló Excel-munkafüzetet (.xlsx/.xls) vár.' }
  }

  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    return { error: 'A fájl beolvasása sikertelen.' }
  }

  try {
    const lapNevek = leltar343LapNevek(buffer)
    if (!isLeltar343Workbook(lapNevek)) {
      return {
        error:
          'Ez a fájl nem a hivatalos Leltar 3_43 munkafüzet (a jellemző lapok — Cimlap, ' +
          'Csekely_erteku_targyak, Alapeszkozok… — nem találhatók). Egyszerű leltár-listát a ' +
          'lentebbi „Rendszergazdai importáló" táblázatos útján tölthetsz fel.',
      }
    }
    return {
      congregationId: target.congregationId,
      userId: access.user.id,
      fileName: file.name,
      parsed: parseLeltar343Workbook(buffer),
    }
  } catch (e) {
    return { error: `A munkafüzet feldolgozása sikertelen: ${e instanceof Error ? e.message : 'ismeretlen hiba'}` }
  }
}

/**
 * A már kiadott leltári számok fail-closed, lapozott lekérdezése.
 *
 * 2026-08-27 (javító-varázsló): AKTÍV és KIVEZETETT bontásban, az aktívakhoz
 * a tétel azonosítójával. MIÉRT: a DB egyediségi védelme RÉSZLEGES index
 * (leltar_tetelek_cong_leltari_szam_key … WHERE COALESCE(is_deleted,false) =
 * false), tehát egy KIVEZETETT tétel száma újra kiadható — a korábbi, mindent
 * egy halomba söprő változat ezt is „foglalt"-nak mutatta, és a lelkész nem
 * értette, miért ütközik. Az azonosító pedig a „meglévő tétel frissítése"
 * feloldáshoz kell (UPDATE a beszúrás helyett).
 */
interface KiadottSzamok {
  aktiv: Set<string>
  kivezetett: Set<string>
  /** Leltári szám → az AKTÍV tétel azonosítója. */
  aktivId: Map<string, string>
}

async function kiadottSzamok(
  supabase: Awaited<ReturnType<typeof createClient>>,
  congregationId: string,
): Promise<KiadottSzamok | ElokeszitesHiba> {
  const { data, error } = await selectAllPaged<{
    id: string
    leltari_szam: string | null
    is_deleted: boolean | null
  }>(
    supabase
      .from('leltar_tetelek')
      .select('id, leltari_szam, is_deleted')
      .eq('congregation_id', congregationId),
  )
  if (error) {
    return { error: `A meglévő leltári számok lekérdezése nem sikerült (${error.message}) — az import nem indult el (különben duplikált szám születhetne).` }
  }
  const aktiv = new Set<string>()
  const kivezetett = new Set<string>()
  const aktivId = new Map<string, string>()
  for (const r of data) {
    const szam = String(r.leltari_szam || '').trim()
    if (!szam) continue
    if (r.is_deleted) {
      kivezetett.add(szam)
      continue
    }
    aktiv.add(szam)
    if (!aktivId.has(szam)) aktivId.set(szam, String(r.id))
  }
  return { aktiv, kivezetett, aktivId }
}

function kiadottHiba(x: KiadottSzamok | ElokeszitesHiba): x is ElokeszitesHiba {
  return 'error' in x
}

// ---------------------------------------------------------------------------
// 1. Előnézet
// ---------------------------------------------------------------------------

export async function previewLeltar343(formData: FormData): Promise<Leltar343Preview> {
  const elo = await elokeszit(formData)
  if ('error' in elo) return { error: elo.error }
  const { parsed } = elo

  const supabase = await createClient()
  const meglevok = await kiadottSzamok(supabase, elo.congregationId)
  if (kiadottHiba(meglevok)) return { error: meglevok.error }

  const lapok: NonNullable<Leltar343Preview['lapok']> = []
  const feldolgozott: Array<{ lap: (typeof parsed.lapok)[number]['lap']; eredmeny: ReturnType<typeof feldolgozLeltar343Lap> }> = []
  let osszesTetel = 0
  let dbDuplikatumok = 0

  for (const { lap, sorok } of parsed.lapok) {
    const eredmeny = feldolgozLeltar343Lap({ lap, sorok, helyszinKatalogus: parsed.helyszinKatalogus })
    feldolgozott.push({ lap, eredmeny })
    osszesTetel += eredmeny.rekordok.length
    dbDuplikatumok += eredmeny.rekordok.filter(
      r => r.leltari_szam && meglevok.aktiv.has(r.leltari_szam),
    ).length
    lapok.push({
      sheet: lap.sheet,
      cimke: lap.cimke,
      tetelek: eredmeny.rekordok.length,
      kivezetett: eredmeny.rekordok.filter(r => r.is_deleted).length,
      ertekModositott: eredmeny.rekordok.filter(r => r.ertek_modositas !== 0).length,
      // 2026-08-27 (Endre kérése): „az ellenőrzést lássam TELJES EGÉSZÉBEN".
      // A korábbi .slice(0, 20) NÉMÁN csonkolta a lapok hibalistáját — a
      // felület így 20 fölött azt sugallta, hogy nincs több baj.
      hibakSzama: eredmeny.hibak.length,
      figyelmeztetesekSzama: eredmeny.figyelmeztetesek.length,
    })
  }

  const sorok = epitReviewSorok({
    lapok: feldolgozott,
    helyszinKatalogus: parsed.helyszinKatalogus,
  })

  // A VÉGLEGESÍTETT év figyelmeztetése. Ma egyetlen írási út sem zárja le a
  // véglegesített leltárt (sem a kézi mentés, sem a törlés) — nem vezetünk be
  // csendben új tiltást, de a felülíró import előtt LÁTSZANIA kell, hogy
  // lezárt évhez nyúlunk. (Hiba esetén néma: a figyelmeztetés hiánya nem
  // akadályozhatja meg az importot.)
  let veglegesitve = false
  try {
    veglegesitve = (await getLeltarFinalizationStatus()).finalized
  } catch {
    veglegesitve = false
  }

  return {
    success: true,
    fileName: elo.fileName,
    egyhazmegye: parsed.cimlap.egyhazmegye,
    intezmeny: parsed.cimlap.intezmeny,
    vezeto: parsed.cimlap.vezeto,
    helyszinek: parsed.cimlap.parok.length,
    lapok,
    osszesTetel,
    dbDuplikatumok,
    hianyzoLapok: parsed.hianyzoLapok,
    sorok,
    // A gyülekezet SAJÁT leltári számai — a varázsló ezekkel tud gépelés
    // közben, szerver-körfordulás nélkül ütközést jelezni. (Nem idegen adat:
    // ugyanezt a listát a felhasználó a leltár-fülön amúgy is látja.)
    aktivSzamok: [...meglevok.aktiv],
    kivezetettSzamok: [...meglevok.kivezetett],
    veglegesitve,
  }
}

// ---------------------------------------------------------------------------
// 2. Import végrehajtás
// ---------------------------------------------------------------------------

/** Az új (2026-08-26-os SQL-lel érkező) oszlopok — migráció előtt kihagyhatók. */
const UJ_OSZLOP_RE = /ertek_modositas|alapeszkoz_csoport/

function dbPayload(
  r: Leltar343ReviewSor,
  congregationId: string,
  userId: string,
  leltariSzam: string,
): Record<string, unknown> {
  return {
    congregation_id: congregationId,
    userid: userId,
    kategoria: serializeInventoryCategory(r.kategoria),
    megnevezes: r.megnevezes,
    szerzo: r.szerzo,
    megjegyzes: r.megjegyzes,
    leltari_szam: leltariSzam,
    helyszin: r.helyszin,
    felelos_neve: r.felelos_neve,
    beszerzes_datuma: r.beszerzes_datuma,
    beszerzesi_ertek: r.beszerzesi_ertek,
    mennyiseg: r.mennyiseg,
    mertekegyseg: r.mertekegyseg,
    beszerzes_bizonylat: r.beszerzes_bizonylat,
    torles_datuma: r.torles_datuma,
    torles_bizonylat: r.torles_bizonylat,
    is_deleted: r.is_deleted,
    hasznalati_ido_ev: r.hasznalati_ido_ev,
    alapeszkoz_csoport: r.alapeszkoz_csoport,
    ertek_modositas: r.ertek_modositas,
    ertek_modositas_megjegyzes: r.ertek_modositas_megjegyzes,
  }
}

function ujOszlopNelkul(payload: Record<string, unknown>): Record<string, unknown> {
  const masolat = { ...payload }
  delete masolat['alapeszkoz_csoport']
  delete masolat['ertek_modositas']
  delete masolat['ertek_modositas_megjegyzes']
  return masolat
}

/** Legfeljebb ennyi üzenetet viszünk vissza a felületre (a csonkolás JELEZVE). */
const UZENET_PLAFON = 500

/**
 * FELÜLÍRÁS-payload: az ÜRES munkafüzet-cella NEM ír felül meglévő adatot.
 *
 * ⚠️ HIBAOSZTÁLY-VÉDELEM: a beszúró payload 21 oszlopot ír. UPDATE-ként
 * alkalmazva egy üres G/O/F cella NULL-ra törölné a felületen kézzel rögzített
 * helyszínt, felelőst vagy megjegyzést, a hiányzó (0) érték pedig felülírná a
 * valódi beszerzési árat — a lelkész számára NÉMA adatvesztés. Frissítéskor
 * ezért csak a KITÖLTÖTT mezők mennek át; a kulcsok (hatókör-oszlop, rögzítő,
 * leltári szám) pedig érintetlenek maradnak.
 *
 * A `false`/`0` szintén „nincs adat" ebben a munkafüzetben (nincs kivezetés,
 * nincs értékmódosítás) — ezek sem billenthetik vissza a meglévő állapotot.
 */
function frissitesiPayload(
  sor: Leltar343ReviewSor,
  congregationId: string,
  userId: string,
  leltariSzam: string,
): Record<string, unknown> {
  const teljes = dbPayload(sor, congregationId, userId, leltariSzam)
  delete teljes['congregation_id']
  delete teljes['userid']
  delete teljes['leltari_szam']
  const ki: Record<string, unknown> = {}
  for (const [kulcs, ertek] of Object.entries(teljes)) {
    if (ertek === null || ertek === undefined || ertek === '') continue
    if (ertek === false || ertek === 0) continue
    ki[kulcs] = ertek
  }
  return ki
}

const UJ_OSZLOP_UZENET =
  'A leltár-bővítő SQL (2026-08-26-leltar-343.sql) még nincs lefuttatva — az import az ' +
  'alapeszköz-főcsoport és a le-/felértékelés mezők NÉLKÜL ment végbe. Futtasd le az SQL-t, ' +
  'majd szükség esetén importáld újra a fájlt a teljes adathűségért.'

/**
 * A kliens javítás-térképének BIZTONSÁGOS beolvasása.
 *
 * A tétel-adatok forrása MINDIG a szerveren újraolvasott munkafüzet marad — a
 * kliens csak (a) a feloldást és (b) a review-réteg whitelistjén szereplő
 * mezőket tudja felülírni. Így a varázsló nem válik szabad írási csatornává a
 * leltar_tetelek táblába, és a payload is nagyságrenddel kisebb marad.
 */
function olvasJavitasok(formData: FormData): Leltar343Javitasok {
  const nyers = formData.get('javitasok')
  if (typeof nyers !== 'string' || !nyers.trim()) return {}
  let parsolt: unknown
  try {
    parsolt = JSON.parse(nyers)
  } catch {
    return {}
  }
  if (!parsolt || typeof parsolt !== 'object' || Array.isArray(parsolt)) return {}

  const ki: Leltar343Javitasok = {}
  let db = 0
  for (const [id, ertek] of Object.entries(parsolt as Record<string, unknown>)) {
    // Plafon: a legnagyobb lap 1496 sor, 7 lap — 12 000 fölött már nem valódi
    // javítás-térkép érkezik.
    if (db >= 12_000) break
    if (!ertek || typeof ertek !== 'object' || Array.isArray(ertek)) continue
    const j = ertek as { feloldas?: unknown; mezok?: unknown }
    const tisztitott: Leltar343Javitas = {}

    if (typeof j.feloldas === 'string' && (LELTAR343_FELOLDASOK as string[]).includes(j.feloldas)) {
      tisztitott.feloldas = j.feloldas as Leltar343Feloldas
    }

    if (j.mezok && typeof j.mezok === 'object' && !Array.isArray(j.mezok)) {
      const forras = j.mezok as Record<string, unknown>
      const mezok: Record<string, string | number | null> = {}
      for (const mezo of LELTAR343_SZERKESZTHETO_MEZOK) {
        const v = forras[mezo]
        if (v === undefined) continue
        if (v === null) mezok[mezo] = null
        else if (typeof v === 'number') mezok[mezo] = v
        else if (typeof v === 'string') mezok[mezo] = v.slice(0, 500)
      }
      if (Object.keys(mezok).length > 0) tisztitott.mezok = mezok
    }

    if (tisztitott.feloldas || tisztitott.mezok) {
      ki[id] = tisztitott
      db += 1
    }
  }
  return ki
}

export async function executeLeltar343Import(formData: FormData): Promise<Leltar343ImportResult> {
  const elo = await elokeszit(formData)
  if ('error' in elo) return { error: elo.error }
  const { parsed, congregationId, userId } = elo

  const supabase = await createClient()
  const meglevok = await kiadottSzamok(supabase, congregationId)
  if (kiadottHiba(meglevok)) return { error: meglevok.error }

  // ── 1. A munkafüzet ÚJRAOLVASÁSA + a kliens javításainak rávetítése ───────
  const feldolgozott = parsed.lapok.map(({ lap, sorok }) => ({
    lap,
    eredmeny: feldolgozLeltar343Lap({ lap, sorok, helyszinKatalogus: parsed.helyszinKatalogus }),
  }))
  const sorok = alkalmazJavitasok(
    epitReviewSorok({ lapok: feldolgozott, helyszinKatalogus: parsed.helyszinKatalogus }),
    olvasJavitasok(formData),
  )

  // ── 2. UGYANAZ az ellenőrzés, amit a felület futtatott ────────────────────
  const ctx = {
    aktivSzamok: [...meglevok.aktiv],
    kivezetettSzamok: [...meglevok.kivezetett],
  }
  const ellenorzes = ellenorizSorok(sorok, ctx)
  const kiosztott = osztSzamokat(sorok, ctx)

  const hibak: Array<{ lap: string; sor: number; uzenet: string }> = []
  const figyelmeztetesek: string[] = []
  let elnyeltHiba = 0
  let elnyeltFigyelmeztetes = 0
  const hiba = (lap: string, sor: number, uzenet: string) => {
    if (hibak.length < UZENET_PLAFON) hibak.push({ lap, sor, uzenet })
    else elnyeltHiba += 1
  }
  const figyelmeztet = (uzenet: string) => {
    if (figyelmeztetesek.length < UZENET_PLAFON) figyelmeztetesek.push(uzenet)
    else elnyeltFigyelmeztetes += 1
  }

  let kihagyott = 0
  const beszurando: Array<{ lap: string; sor: number; payload: Record<string, unknown> }> = []
  const frissitendo: Array<{ lap: string; sor: number; id: string; payload: Record<string, unknown> }> = []

  // Rekordhoz nem köthető feldolgozási hibák (nincs javítható nyers sor).
  for (const { lap, eredmeny } of feldolgozott) {
    for (const h of egyebHibak(eredmeny.hibak)) hiba(lap.sheet, h.sor, h.uzenet)
  }

  for (const s of sorok) {
    if (s.feloldas === 'kihagy') {
      kihagyott += 1
      const ok = s.uzenetek.find(u => u.szint === 'hiba')
      if (ok) hiba(s.lap, s.sor, `${ok.uzenet} (kihagyva)`)
      continue
    }

    const gondok = ellenorzes.gondok[s.id] || []
    const blokkolo = gondok.filter(g => g.szint === 'hiba')
    if (blokkolo.length > 0) {
      // FAIL-CLOSED: a felület idáig el sem engedné, de ha mégis, a sor
      // kimarad ÉS hangosan jelezzük — néma adatvesztés nincs.
      kihagyott += 1
      hiba(s.lap, s.sor, blokkolo.map(g => g.uzenet).join(' '))
      continue
    }
    for (const g of gondok) figyelmeztet(`[${s.lap} ${s.sor}. sor] ${g.uzenet}`)

    const ujSzam = kiosztott[s.id]
    const leltariSzam = ujSzam || String(s.leltari_szam || '').trim()
    if (ujSzam) figyelmeztet(`[${s.lap} ${s.sor}. sor] A rendszer a(z) ${ujSzam} leltári számot adta ki.`)

    if (s.feloldas === 'felulir') {
      const id = meglevok.aktivId.get(leltariSzam)
      if (!id) {
        kihagyott += 1
        hiba(s.lap, s.sor, `A(z) „${leltariSzam}" leltári számú aktív tétel nem található — a sor kimaradt.`)
        continue
      }
      const payload = frissitesiPayload(s, congregationId, userId, leltariSzam)
      if (Object.keys(payload).length === 0) {
        kihagyott += 1
        hiba(s.lap, s.sor, `A(z) „${leltariSzam}" sorban nincs egyetlen kitöltött mező sem — nem írtunk felül semmit.`)
        continue
      }
      frissitendo.push({ lap: s.lap, sor: s.sor, id, payload })
      continue
    }

    beszurando.push({
      lap: s.lap,
      sor: s.sor,
      payload: dbPayload(s, congregationId, userId, leltariSzam),
    })
  }

  // ── 3. Beszúrás 100-asával; új-oszlop hibánál lecsupaszított payload ──────
  let beszurt = 0
  let frissitett = 0
  let ujOszlopMod = false
  const BATCH = 100
  for (let i = 0; i < beszurando.length; i += BATCH) {
    const szelet = beszurando.slice(i, i + BATCH)
    const batchPayload = szelet.map(p => (ujOszlopMod ? ujOszlopNelkul(p.payload) : p.payload))
    const { error } = await supabase.from('leltar_tetelek').insert(batchPayload)
    if (!error) {
      beszurt += szelet.length
      continue
    }
    if (!ujOszlopMod && UJ_OSZLOP_RE.test(error.message || '')) {
      ujOszlopMod = true
      figyelmeztet(UJ_OSZLOP_UZENET)
      i -= BATCH // ugyanez a szelet újra, csupaszított payloaddal
      continue
    }
    // Soronkénti újrapróbálás — a hibás sor kimarad, a többi bemegy.
    for (const p of szelet) {
      const egyPayload = ujOszlopMod ? ujOszlopNelkul(p.payload) : p.payload
      const { error: sorHiba } = await supabase.from('leltar_tetelek').insert([egyPayload])
      if (sorHiba) {
        kihagyott += 1
        hiba(p.lap, p.sor, sorHiba.message)
      } else {
        beszurt += 1
      }
    }
  }

  // ── 4. „Meglévő frissítése" feloldás: UPDATE azonosító szerint ────────────
  for (const f of frissitendo) {
    let payload = ujOszlopMod ? ujOszlopNelkul(f.payload) : f.payload
    let { error } = await supabase
      .from('leltar_tetelek')
      .update(payload)
      .eq('id', f.id)
      .eq('congregation_id', congregationId)
    if (error && !ujOszlopMod && UJ_OSZLOP_RE.test(error.message || '')) {
      ujOszlopMod = true
      figyelmeztet(UJ_OSZLOP_UZENET)
      payload = ujOszlopNelkul(f.payload)
      ;({ error } = await supabase
        .from('leltar_tetelek')
        .update(payload)
        .eq('id', f.id)
        .eq('congregation_id', congregationId))
    }
    if (error) {
      kihagyott += 1
      hiba(f.lap, f.sor, error.message)
    } else {
      frissitett += 1
    }
  }

  if (elnyeltHiba > 0) {
    hibak.push({
      lap: '—',
      sor: 0,
      uzenet: `… és további ${elnyeltHiba} hibaüzenet (a lista ${UZENET_PLAFON} tételnél megáll).`,
    })
  }
  if (elnyeltFigyelmeztetes > 0) {
    figyelmeztetesek.push(
      `… és további ${elnyeltFigyelmeztetes} figyelmeztetés (a lista ${UZENET_PLAFON} tételnél megáll).`,
    )
  }

  revalidatePath('/leltar')

  try {
    const { logImportRun } = await import('@/lib/import/import-log')
    await logImportRun({
      supabase,
      congregationId,
      userId,
      module: 'inventory',
      fileName: elo.fileName,
      // ⚠️ Az import_logs táblában NINCS total_updated oszlop — a frissítéseket
      // ezért NEM adjuk hozzá a beszúrtakhoz (az torzítaná a statisztikát),
      // hanem külön, beszédes figyelmeztetés-sorként naplózzuk.
      totalInserted: beszurt,
      totalSkipped: kihagyott,
      perSheetLog: parsed.lapok.map(({ lap }) => ({
        sheet: lap.sheet,
        profile: 'leltar343',
        inserted: 0,
        skipped: 0,
      })),
      lookupStats: {
        personResolved: 0,
        personUnresolved: 0,
        categoryResolved: 0,
        categoryUnresolved: 0,
        warnings: [
          ...(frissitett > 0 ? [`${frissitett} meglévő tétel FELÜLÍRVA (a varázsló „meglévő frissítése" feloldásával).`] : []),
          ...figyelmeztetesek.slice(0, 50),
        ],
      },
      errors: hibak.slice(0, 200).map(h => ({ sheet: h.lap, row: h.sor, message: h.uzenet })),
    })
  } catch (e) {
    // ⚠️ NEM némítjuk el: az import_logs_insert policy WITH CHECK-je
    // (2026-04-15-import-logs.sql) global-access kivétel NÉLKÜL köti a sort a
    // hívó saját gyülekezetéhez, ezért ADMIN-hatókörű importnál a naplózás
    // elbukhat. Felülírásnál ez már nem statisztika-vesztés, hanem
    // nyom nélküli adatmódosítás lenne — mondjuk ki a felületen is.
    console.warn('[executeLeltar343Import] Import log rögzítése sikertelen:', e)
    figyelmeztet(
      'Az import NAPLÓZÁSA nem sikerült (az import maga lefutott). Ha másik gyülekezetbe ' +
      'importáltál rendszergazdaként, ez az import_logs jogosultsági szabályának ismert ' +
      'korlátja — jelezd, hogy futtatni kelljen a javító SQL-t.',
    )
  }

  return {
    success: true,
    beszurt,
    frissitett,
    kihagyott,
    hibak: hibak.length > 0 ? hibak : undefined,
    figyelmeztetesek: figyelmeztetesek.length > 0 ? figyelmeztetesek : undefined,
  }
}

// ---------------------------------------------------------------------------
// 3. Export-környezet (Cimlap-fejadatok + Pénztár kezdő egyenlegek)
// ---------------------------------------------------------------------------

export async function getLeltar343ExportContext(): Promise<Leltar343ExportContext> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!access.effectiveCongregationId) {
    // Felsőbb (megyei/kerületi) szinten a munkafüzet-export fej-adatok nélkül
    // is működik — a Cimlap üresen marad, a tételek mennek.
    return { ev: documentSeasonYear() }
  }

  const supabase = await createClient()
  const ev = documentSeasonYear()

  const [gyulekezet, bealitas] = await Promise.all([
    supabase
      .from('congregations')
      .select('name, dioceses(name)')
      .eq('id', access.effectiveCongregationId)
      .maybeSingle(),
    supabase
      .from('bealitas')
      .select('lelkesz, intezmenyneve')
      .eq('congregation_id', access.effectiveCongregationId)
      .eq('id', String(ev))
      .maybeSingle(),
  ])

  const diocese = gyulekezet.data?.dioceses as { name?: string | null } | { name?: string | null }[] | null
  const egyhazmegye = Array.isArray(diocese) ? diocese[0]?.name || null : diocese?.name || null

  // Pénzügyi kezdő egyenlegek — hiba esetén üresen maradnak (inkább üres,
  // mint téves pénzügyi adat a hivatalos íven).
  let penztarKezdo: number | null = null
  let kinnlevosegKezdo: number | null = null
  try {
    const osszegzes = await getInventoryPrintFinanceSummary({ year: ev })
    if (osszegzes) {
      penztarKezdo = osszegzes.openingCash
      kinnlevosegKezdo = osszegzes.openingReceivables
    }
  } catch {
    // néma — az export enélkül is teljes értékű
  }

  return {
    egyhazmegye,
    intezmeny: bealitas.data?.intezmenyneve || gyulekezet.data?.name || null,
    vezeto: bealitas.data?.lelkesz || null,
    ev,
    penztarKezdo,
    kinnlevosegKezdo,
  }
}
