'use server'

// 2026-07-16 (F5/J2): Éves hivatalos lelkészi jelentés — aggregátor + CRUD.
//
// A jelentés adat-kontraktusa (JELENTES_MEZOK, LelkesziJelentesData, mezoErtek)
// a lib/lelkeszi-jelentes/types.ts-ben él — Next.js 16 'use server' szabály:
// ez a fájl CSAK async function-öket exportálhat.
//
// AUTO-MEZŐ FORRÁSOK (minden lekérdezés a meglévő, MŰKÖDŐ minták másolata —
// a nem létező oszlopra írt select némán üres listát adna, lásd a v0.9.78
// hibaosztályt):
//  - I. fejezet: keresztseg/temetes/hazassag/konfirmalas (scope-vital.ts
//    minta: datum ill. temetesnél TDATUM év-tartomány) + szemely (annual-report
//    generator.ts minta: meghalt + member_status + isvisible). Férfi/nő bontás:
//    a szemely.ferfi boolean, kötegelt .in('id', …) lookuppal (FK-embed helyett,
//    mert a temetes→szemely kapcsolat-név nincs verifikálva).
//  - II–III–V. fejezet: a munkanapló évi sorai (getWorklogsForYearChecked —
//    1000-es lapozó HIBA-TOVÁBBADÁSSAL), a hivatalos nyomtatvány típus→oszlop
//    besorolásával (classifyForOfficialJournal, print-columns.ts).
//  - VII. fejezet: befizetes a befizetescel(szamadasicel(kod)) beágyazással
//    (getExpectedJarulek működő mintája; 101.01* = egyházfenntartói járulék,
//    101.03* = perselypénz) + a bealitas.szamadas_zaro_adatok VÉGLEGESÍTETT
//    snapshotja (finalizeAccounting írja; totalIncome/totalExpense).
//
// HIBA-FILOZÓFIA: ha egy rész-lekérdezés hibázik, a hozzá tartozó auto-mezők
// NULL-ok lesznek (a UI „nincs adat"-ként jelzi, felülírható) + hangos
// console.error — SOHA nem jelentünk némán 0-t hivatalos rubrikában. A
// munkanapló- és befizetés-hibák ezen felül az autoHibak listában szövegesen
// is visszamennek a hívónak (getLelkesziJelentes).

import { revalidatePath } from 'next/cache'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { categorizeWorklogEntry, type WorklogEntry } from '@/lib/constants/worklog'
import { classifyForOfficialJournal, getUnnepInfo } from '@/lib/worklog/print-columns'
import { isJournalEntry } from '@/lib/worklog/official-journal'
import { JELENTES_MEZOK, deriveAutoMezok } from '@/lib/lelkeszi-jelentes/types'
import type { HatarozatAdatok, LelkesziJelentesData } from '@/lib/lelkeszi-jelentes/types'
import { submitDocument } from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
import { getWorklogsForYearChecked } from './actions'

// ─────────────────────────────────────────────────────────────────────────
// Belső típusok + segédek (nem exportáltak — 'use server' szabály)
// ─────────────────────────────────────────────────────────────────────────

type Supa = Awaited<ReturnType<typeof getEffectiveCongregationContext>>['supabase']

type PgError = { message?: string; code?: string } | null

/** A lelkeszi_jelentes tábla egy sora (a 2026-07-16-f5 migráció szerint). */
interface JelentesRow {
  id: string
  statusz: string
  kezi_adatok: Record<string, unknown> | null
  felulirasok: Record<string, unknown> | null
  hatarozat: Record<string, unknown> | null
  snapshot: Record<string, unknown> | null
  veglegesitve_at: string | null
  unlock_requested: boolean | null
  unlock_reason: string | null
  /** Optimista zár a véglegesítés-versenyhez (a DB updated_at triggere lépteti). */
  updated_at: string
}

const JELENTES_SOR_MEZOK =
  'id, statusz, kezi_adatok, felulirasok, hatarozat, snapshot, veglegesitve_at, unlock_requested, unlock_reason, updated_at'

/**
 * A lelkeszi_jelentes tábla hiányának felismerése (42P01 = undefined_table,
 * PGRST205 = PostgREST schema-cache-ben nincs ilyen tábla). Érthető magyar
 * hibát adunk, ami a 2026-07-16-os migrációra utal.
 */
function isMissingJelentesTable(error: PgError): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message || '').toLowerCase()
  return (
    msg.includes('lelkeszi_jelentes') &&
    (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))
  )
}

const MISSING_TABLE_HIBA =
  'A lelkészi jelentés adatbázis-táblája még hiányzik. Kérjük, futtassa le a ' +
  '2026-07-16-os migrációt (migration-docs/sql/2026-07-16-f5-lelkeszi-jelentes.sql), ' +
  'majd töltse újra az oldalt.'

/**
 * A befizetés-lekérdezés kompatibilitási oszlopainak (stornozott,
 * belso_mozgas_xkey) hiányát felismerő őr — a legacy (szűkített) fallback
 * CSAK erre a hibára futhat. Bármilyen más hibánál a fallback elrejtené a
 * valódi okot, és a VII. rubrikák némán csonka összeget kaphatnának.
 */
function isMissingBefizetesCompatColumn(error: PgError): boolean {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  return (
    (msg.includes('stornozott') || msg.includes('belso_mozgas_xkey')) &&
    (msg.includes('column') || msg.includes('does not exist') || msg.includes('schema cache'))
  )
}

/**
 * Lapozás-tudatos lekérdezés: a PostgREST kérésenként legfeljebb 1000 sort ad
 * vissza — 1000-es range-oldalakban megyünk, amíg rövid oldal nem érkezik
 * (a getWorklogs friss lapozó-mintája). A hívó builderének determinisztikus
 * .order() kell (pl. id) a stabil oldalhatárokhoz.
 */
const PAGE_SIZE = 1000

async function fetchAllRows<T>(
  makePage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: PgError }>,
): Promise<{ rows: T[]; error: PgError }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const res = await makePage(from, from + PAGE_SIZE - 1)
    if (res.error) return { rows: [], error: res.error }
    const page = (res.data || []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return { rows, error: null }
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Szám-koerció: véges szám vagy null. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** jsonb → tisztított {mezoId: szám|szöveg|null} rekord (idegen típusok kiesnek). */
function sanitizeErtekek(raw: Record<string, unknown> | null | undefined): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || typeof v === 'number' || typeof v === 'string') out[k] = v
  }
  return out
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

/** Beágyazott PostgREST sor normalizálása (objektum VAGY 1 elemű tömb jöhet). */
function egyBeagyazott<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/**
 * Befizetés → számadási cél kód a befizetescel(szamadasicel(kod)) beágyazásból
 * (a penzugy/actions.ts getPaymentGoalCode működő mintája).
 */
function befizetesKod(row: { befizetescel?: unknown }): string | null {
  const cel = egyBeagyazott(row.befizetescel as { szamadasicel?: unknown } | Array<{ szamadasicel?: unknown }> | null)
  if (!cel) return null
  const szamadasicel = egyBeagyazott(cel.szamadasicel as { kod?: unknown } | Array<{ kod?: unknown }> | null)
  const kod = szamadasicel?.kod
  return typeof kod === 'string' && kod ? kod : null
}

// ─────────────────────────────────────────────────────────────────────────
// Auto-számítás
// ─────────────────────────────────────────────────────────────────────────

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

interface AnyakonyviSzamok {
  ferfi: number
  no: number
  egyutt: number
}

/**
 * Anyakönyvi sorok férfi/nő bontása: a szemely.ferfi boolean kötegelt
 * lookupjával. Az ismeretlen nemű (hiányzó/nem látható személy) csak az
 * „együtt" rubrikába számít — az a/b összege ezért lehet kisebb a c-nél.
 */
function nemBontas(idSzemelyLista: Array<number | null>, ferfiMap: Map<number, boolean | null>): AnyakonyviSzamok {
  let ferfi = 0
  let no = 0
  for (const id of idSzemelyLista) {
    if (id == null) continue
    const f = ferfiMap.get(id)
    if (f === true) ferfi += 1
    else if (f === false) no += 1
  }
  return { ferfi, no, egyutt: idSzemelyLista.length }
}

/** szemely.ferfi kötegelt lekérdezése (200-as .in() csomagokban — URL-hossz limit). */
async function fetchFerfiMap(supabase: Supa, ids: number[]): Promise<Map<number, boolean | null>> {
  const map = new Map<number, boolean | null>()
  const unique = Array.from(new Set(ids))
  const CHUNK = 200
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('szemely')
      .select('id, ferfi')
      .in('id', unique.slice(i, i + CHUNK))
    if (error) {
      console.error('[lelkeszi-jelentes] szemely.ferfi lookup hiba — a férfi/nő bontás hiányos lesz:', error.message)
      continue
    }
    for (const row of (data || []) as Array<{ id: number; ferfi: boolean | null }>) {
      map.set(Number(row.id), row.ferfi === true ? true : row.ferfi === false ? false : null)
    }
  }
  return map
}

/**
 * Az előző évi VÉGLEGESÍTETT jelentés dec. 31-i lélekszáma (I.10) a
 * snapshotból, a mezoErtek prioritásával (felulirasok > auto > kezi).
 */
function elozoEviLelekszam(snapshot: Record<string, unknown> | null): number | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const felul = sanitizeErtekek(snapshot.felulirasok as Record<string, unknown> | null)
  const auto = sanitizeErtekek(snapshot.auto as Record<string, unknown> | null)
  const kezi = sanitizeErtekek(snapshot.kezi as Record<string, unknown> | null)
  const f = felul['I.10']
  if (f !== undefined && f !== null && f !== '') return toNum(f)
  const a = auto['I.10']
  if (a !== undefined && a !== null) return toNum(a)
  return toNum(kezi['I.10'])
}

/**
 * A teljes auto-rekord kiszámítása egy évre. A `kezi` és `felulirasok` a már
 * mentett sorból jön — a levezetett mezőkhöz (I.8/I.9/VII.8, deriveAutoMezok)
 * kellenek a kézi komponensek (betért/kiköltözött, előző évi maradvány) és a
 * felülírások.
 *
 * `autoHibak`: a hivatalos rubrikákat érintő rész-lekérdezési hibák magyar
 * üzenetei (munkanapló, befizetés) — a UI ezekkel tudja jelezni, hogy egy
 * blokk azért üres, mert a forrás-lekérdezés hibázott, nem azért, mert 0.
 */
async function computeAuto(
  supabase: Supa,
  congId: string,
  ev: number,
  kezi: Record<string, number | string | null>,
  felulirasok: Record<string, number | string | null>,
): Promise<{
  auto: Record<string, number | string | null>
  congregationName: string
  egyhazmegyeNev: string | null
  autoHibak: string[]
}> {
  const yearStart = `${ev}-01-01`
  const yearEndExclusive = `${ev + 1}-01-01`
  const autoHibak: string[] = []

  // Minden auto-mező kulcsa előre null-lal — a UI így meg tudja különböztetni
  // a „nincs adat"-ot a 0-tól.
  const auto: Record<string, number | string | null> = {}
  for (const mezo of JELENTES_MEZOK) {
    if (mezo.auto) auto[mezo.id] = null
  }

  // ── Párhuzamos lekérdezések ──
  const [
    worklogRes,
    keresztsegRes,
    temetesRes,
    hazassagRes,
    konfirmalasRes,
    szemelyRes,
    elozoJelentesRes,
    bealitasRes,
    presbiterRes,
    congRes,
  ] = await Promise.all([
    // Munkanapló — teljes év, 1000-es lapozóval, HIBA-TOVÁBBADÁSSAL (a néma
    // üres lista hivatalos rubrikában tilos — v0.9.78 hibaosztály)
    getWorklogsForYearChecked(ev),
    // Anyakönyvek — a scope-vital.ts működő év-tartomány mintája
    fetchAllRows<{ id: number; id_szemely: number | null }>((from, to) =>
      supabase
        .from('keresztseg')
        .select('id, id_szemely')
        .eq('congregation_id', congId)
        .gte('datum', yearStart)
        .lt('datum', yearEndExclusive)
        .order('id')
        .range(from, to),
    ),
    fetchAllRows<{ id: number; id_szemely: number | null }>((from, to) =>
      supabase
        .from('temetes')
        .select('id, id_szemely')
        .eq('congregation_id', congId)
        // FIGYELEM: a temetésnél a TDATUM (temetés napja) számít, nem a hdatum!
        .gte('tdatum', yearStart)
        .lt('tdatum', yearEndExclusive)
        .order('id')
        .range(from, to),
    ),
    fetchAllRows<{ id: number; vegyes: boolean | null }>((from, to) =>
      supabase
        .from('hazassag')
        .select('id, vegyes')
        .eq('congregation_id', congId)
        .gte('datum', yearStart)
        .lt('datum', yearEndExclusive)
        .order('id')
        .range(from, to),
    ),
    fetchAllRows<{ id: number; id_szemely: number | null }>((from, to) =>
      supabase
        .from('konfirmalas')
        .select('id, id_szemely')
        .eq('congregation_id', congId)
        .gte('datum', yearStart)
        .lt('datum', yearEndExclusive)
        .order('id')
        .range(from, to),
    ),
    // Lélekszám — az annual-report generator.ts MŰKÖDŐ mintája (v0.9.78 után):
    // CSAK verifikált oszlopok (meghalt, member_status, isvisible).
    fetchAllRows<{ id: number; meghalt: boolean | null; member_status: string | null }>((from, to) =>
      supabase
        .from('szemely')
        .select('id, meghalt, member_status')
        .eq('congregation_id', congId)
        .eq('isvisible', true)
        .order('id')
        .range(from, to),
    ),
    // Előző évi jelentés (I.1-hez) — csak véglegesítettből olvasunk
    supabase
      .from('lelkeszi_jelentes')
      .select('statusz, snapshot')
      .eq('congregation_id', congId)
      .eq('ev', ev - 1)
      .maybeSingle(),
    // Zárszámadás kanonikus snapshot (VII.6/7/8) — csak véglegesített számadásból
    supabase
      .from('bealitas')
      .select('accounting_finalized, szamadas_zaro_adatok')
      .eq('id', String(ev))
      .eq('congregation_id', congId)
      .maybeSingle(),
    // Presbiterek száma (III.9) — a dashboard bevált szemely!inner mintája
    // (2026-06-30 perf-fix): a szűrés a szemely.congregation_id-n megy, mert a
    // LEGACY presbiter-sorokban a presbiter.congregation_id hiányozhat (az
    // insert csak az új sorokra írja); az elhunyt presbiterek kimaradnak.
    supabase
      .from('presbiter')
      .select('id, szemely:szemely!inner(congregation_id, meghalt)')
      .eq('szemely.congregation_id', congId)
      .eq('szemely.meghalt', false),
    // Gyülekezet-név + egyházmegye-név (a jelentés fejlécéhez / címzettjéhez)
    supabase.from('congregations').select('nev_hu, name, dioceses(name)').eq('id', congId).maybeSingle(),
  ])

  if (congRes.error) {
    console.error('[lelkeszi-jelentes] congregations lekérdezés hiba — a gyülekezet/egyházmegye neve üres lesz:', congRes.error.message)
  }
  const congRow = congRes.data as {
    nev_hu?: string | null
    name?: string | null
    dioceses?: { name?: string | null } | Array<{ name?: string | null }> | null
  } | null
  const congregationName = congRow?.nev_hu || congRow?.name || ''
  const dioceseRow = egyBeagyazott(congRow?.dioceses)
  const egyhazmegyeNev = (dioceseRow?.name || '').trim() || null

  // ── I. Lélekszám ──

  // I.10 — dec. 31-i lélekszám. MEGJEGYZÉS: a szemely a JELENLEGI állapotot
  // tárolja — visszamenőleges évre ez a mai állapot közelítése (felülírható).
  let lelekszam: number | null = null
  if (szemelyRes.error) {
    console.error('[lelkeszi-jelentes] Lélekszám-lekérdezés HIBA — I.10 null lesz:', szemelyRes.error.message)
  } else {
    lelekszam = szemelyRes.rows.filter(
      (s) =>
        !s.meghalt &&
        !['elhunyt', 'elköltözött', 'elkoltozott', 'kitért', 'törölt'].includes(s.member_status || ''),
    ).length
    auto['I.10'] = lelekszam
  }

  // I.1 — előző évi véglegesített jelentés I.10-e
  if (elozoJelentesRes.error) {
    if (!isMissingJelentesTable(elozoJelentesRes.error)) {
      console.error('[lelkeszi-jelentes] Előző évi jelentés lekérdezés hiba:', elozoJelentesRes.error.message)
    }
  } else {
    const elozo = elozoJelentesRes.data as { statusz: string; snapshot: Record<string, unknown> | null } | null
    if (elozo?.statusz === 'veglegesitve') auto['I.1'] = elozoEviLelekszam(elozo.snapshot)
  }

  // I.2 / I.3 / V.7 — férfi/nő bontás közös szemely-lookuppal
  const szemelyIds: number[] = []
  if (!keresztsegRes.error) for (const r of keresztsegRes.rows) if (r.id_szemely != null) szemelyIds.push(Number(r.id_szemely))
  if (!temetesRes.error) for (const r of temetesRes.rows) if (r.id_szemely != null) szemelyIds.push(Number(r.id_szemely))
  if (!konfirmalasRes.error) for (const r of konfirmalasRes.rows) if (r.id_szemely != null) szemelyIds.push(Number(r.id_szemely))
  const ferfiMap = szemelyIds.length > 0 ? await fetchFerfiMap(supabase, szemelyIds) : new Map<number, boolean | null>()

  if (keresztsegRes.error) {
    console.error('[lelkeszi-jelentes] keresztseg lekérdezés hiba — I.2 null:', keresztsegRes.error.message)
  } else {
    const b = nemBontas(keresztsegRes.rows.map((r) => (r.id_szemely == null ? null : Number(r.id_szemely))), ferfiMap)
    auto['I.2a'] = b.ferfi
    auto['I.2b'] = b.no
    auto['I.2c'] = b.egyutt
  }

  if (temetesRes.error) {
    console.error('[lelkeszi-jelentes] temetes lekérdezés hiba — I.3 null:', temetesRes.error.message)
  } else {
    const b = nemBontas(temetesRes.rows.map((r) => (r.id_szemely == null ? null : Number(r.id_szemely))), ferfiMap)
    auto['I.3a'] = b.ferfi
    auto['I.3b'] = b.no
    auto['I.3c'] = b.egyutt
  }

  // I.8 / I.9 — a computeAuto végén, a deriveAutoMezok közös helperével
  // származnak (felülírás- és kézi-komponens-tudatosan).

  // I.16 / I.17 — esketések + vegyes házasságok
  if (hazassagRes.error) {
    console.error('[lelkeszi-jelentes] hazassag lekérdezés hiba — I.16/I.17 null:', hazassagRes.error.message)
  } else {
    auto['I.16'] = hazassagRes.rows.length
    auto['I.17'] = hazassagRes.rows.filter((r) => r.vegyes === true).length
  }

  // ── II. Istentisztelet + III. gyülekezetgondozás worklog-részei + V.3 ──
  // A II. fejezetbe a hivatalos nyomtatott munkanapló sorai számítanak
  // (isJournalEntry: szolgálat-kategória + ifjúsági bibliaóra), a besorolás a
  // classifyForOfficialJournal determinisztikus típus→oszlop szabálya.
  //
  // HIBA-ŐR: ha a munkanapló-lekérdezés hibázott, a TELJES worklog-alapú blokk
  // kimarad (a II.*, a III. worklog-alapú mezői és a V.3 null marad — soha nem
  // írunk hibából 0-t hivatalos rubrikába), és a hiba az autoHibak listába kerül.

  if (worklogRes.error) {
    console.error(
      '[lelkeszi-jelentes] munkanapló lekérdezés HIBA — a II./III. worklog-alapú mezők és a V.3 null maradnak:',
      worklogRes.error,
    )
    autoHibak.push(
      'A munkanapló lekérdezése hibázott, ezért az istentiszteleti (II.) és a gyülekezetgondozási (III.) ' +
        'munkanapló-alapú rubrikák, valamint a katekézis-alkalmak (V.3) üresen maradtak: ' +
        worklogRes.error,
    )
  } else {
    const vasarnapDe = ujHalmozo()
    const vasarnapDu = ujHalmozo()
    const unnepi = ujHalmozo()
    const satoros = ujHalmozo()
    const hetkoznapi = ujHalmozo()
    const bunbanati = ujHalmozo()
    const bibliaora = ujHalmozo()
    let bibliaoraFelnottDb = 0
    let bibliaoraIfjusagiDb = 0
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

    for (const e of worklogRes.entries) {
      if (e.deleted) continue

      const kategoria = categorizeWorklogEntry(e)
      if (kategoria === 'katekezis') katekezisDb += 1
      if (kategoria === 'latogatas') {
        if ((e.jellege || '').trim() === 'Családlátogatás') csaladlatogatasDb += 1
        else egyebLatogatasDb += 1
      }

      // Imahét (III.5/III.6) — jellege szerint, kategóriától függetlenül
      if ((e.jellege || '').trim() === 'Imahét') halmoz(imahet, e)

      // Úrvacsorázó-számot rögzítő sorok (bármely kategória)
      const uvOsszeg = (e.uv_templomban ?? 0) + (e.uv_betegnel ?? 0)
      uvBetegnelOssz += e.uv_betegnel ?? 0
      let uvAlkalom = uvOsszeg > 0
      if (uvOsszeg > 0) {
        uvResztvevoOssz += uvOsszeg
        uvResztvevosDb += 1
      }

      if (isJournalEntry(e)) {
        const { column, slot } = classifyForOfficialJournal(e)
        switch (column) {
          case 'vasarnapi':
            halmoz(slot === 'du' ? vasarnapDu : vasarnapDe, e)
            break
          case 'unnepi':
            halmoz(unnepi, e)
            break
          case 'satoros':
            halmoz(satoros, e)
            break
          case 'hetkoznapi':
            halmoz(hetkoznapi, e)
            break
          case 'bunbanati':
            halmoz(bunbanati, e)
            break
          case 'bibliaora':
            halmoz(bibliaora, e)
            if (slot === 'ifjusagi') bibliaoraIfjusagiDb += 1
            else bibliaoraFelnottDb += 1
            break
          case 'urvacsora':
            uvAlkalom = true
            break
          case 'presbiteri':
            presbiteriGyulesDb += 1
            break
          case 'unnepely':
            unnepelyDb += 1
            break
          case 'noszovetsegi':
            // Nincs hozzá auto-rubrika (a IV. Belmisszió kézi fejezet)
            break
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

    auto['II.1a'] = vasarnapDe.db
    auto['II.1b'] = atlagJelenlet(vasarnapDe)
    auto['II.1c'] = szazalek(atlagJelenlet(vasarnapDe), lelekszam)
    auto['II.2a'] = vasarnapDu.db
    auto['II.2b'] = atlagJelenlet(vasarnapDu)
    auto['II.2c'] = szazalek(atlagJelenlet(vasarnapDu), lelekszam)
    auto['II.3a'] = unnepi.db
    auto['II.3b'] = atlagJelenlet(unnepi)
    auto['II.3c'] = szazalek(atlagJelenlet(unnepi), lelekszam)
    auto['II.4a'] = satoros.db
    auto['II.4b'] = atlagJelenlet(satoros)
    auto['II.4c'] = szazalek(atlagJelenlet(satoros), lelekszam)
    for (const mezoId of Object.values(SATOROS_NAP_MEZO)) {
      auto[mezoId] = satorosNapJelenlet.has(mezoId) ? satorosNapJelenlet.get(mezoId)! : null
    }
    auto['II.6a'] = hetkoznapi.db
    auto['II.6b'] = atlagJelenlet(hetkoznapi)
    auto['II.7a'] = bunbanati.db
    auto['II.7b'] = atlagJelenlet(bunbanati)
    auto['II.8a'] = bibliaora.db
    auto['II.8b'] = atlagJelenlet(bibliaora)
    auto['II.9'] = egyebDb
    auto['II.12'] = uvOsztasDb
    auto['II.13'] = uvResztvevosDb > 0 ? round1(uvResztvevoOssz / uvResztvevosDb) : null
    auto['II.14'] = uvBetegnelOssz

    auto['III.1'] = bibliaoraFelnottDb
    auto['III.2'] = bibliaoraIfjusagiDb
    auto['III.3'] = unnepelyDb
    auto['III.5'] = imahet.db
    auto['III.6'] = atlagJelenlet(imahet)
    auto['III.7'] = csaladlatogatasDb
    auto['III.8'] = egyebLatogatasDb
    auto['III.10'] = presbiteriGyulesDb

    // V.3 — katekézis-alkalmak (worklog-alapú, ezért ebben a blokkban)
    auto['V.3'] = katekezisDb
  }

  // III.9 — presbiterek száma (NEM worklog-alapú — worklog-hibánál is számol)
  if (presbiterRes.error) {
    console.error('[lelkeszi-jelentes] presbiter lekérdezés hiba — III.9 null:', presbiterRes.error.message)
  } else {
    auto['III.9'] = (presbiterRes.data || []).length
  }

  // ── V. Vallásoktatás (konfirmálás — anyakönyv-alapú) ──
  if (konfirmalasRes.error) {
    console.error('[lelkeszi-jelentes] konfirmalas lekérdezés hiba — V.7 null:', konfirmalasRes.error.message)
  } else {
    const b = nemBontas(konfirmalasRes.rows.map((r) => (r.id_szemely == null ? null : Number(r.id_szemely))), ferfiMap)
    auto['V.7a'] = b.ferfi
    auto['V.7b'] = b.no
    auto['V.7c'] = b.egyutt
  }

  // ── VII. Anyagi helyzet ──

  // Járulék + persely: az évben TÉNYLEGESEN beérkezett (datum szerinti) tételek,
  // törölt/stornózott/belső mozgás nélkül — a finalizeAccounting kanonikus
  // szűrésével; a cél-kód a befizetescel(szamadasicel(kod)) beágyazásból.
  const befizetesQ = (legacy: boolean) =>
    fetchAllRows<{ id: number; osszeg: number | null; befizetescel?: unknown }>((from, to) => {
      let q = supabase
        .from('befizetes')
        .select('id, osszeg, befizetescel(szamadasicel(kod))')
        .eq('congregation_id', congId)
        .gte('datum', `${ev}-01-01`)
        .lte('datum', `${ev}-12-31`)
      if (legacy) {
        // Régi séma-fallback: stornozott/belso_mozgas_xkey oszlop nélkül
        q = q.or('deleted.eq.false,deleted.is.null')
      } else {
        // FIGYELEM: a régi (storno-funkció előtti) sorokban a deleted/stornozott
        // NULL — az .eq(false) ezeket némán KIZÁRNÁ (a penzugy/actions.ts
        // S3-#12 or-mintája a mérvadó; a láncolt .or()-ok ÉS-kapcsolatban állnak).
        q = q
          .or('deleted.eq.false,deleted.is.null')
          .or('stornozott.eq.false,stornozott.is.null')
          .is('belso_mozgas_xkey', null)
      }
      return q.order('id').range(from, to)
    })

  let befRes = await befizetesQ(false)
  // Legacy-fallback CSAK a kompatibilitási oszlopok (stornozott /
  // belso_mozgas_xkey) hiányára — más hibát nem szabad fallbackkel elfedni,
  // mert a szűkített lekérdezés hibás összeget adhatna a hivatalos rubrikába.
  if (befRes.error && isMissingBefizetesCompatColumn(befRes.error)) {
    befRes = await befizetesQ(true)
  }
  if (befRes.error) {
    console.error('[lelkeszi-jelentes] befizetes lekérdezés hiba — VII.1–VII.4 null:', befRes.error.message)
    autoHibak.push(
      'A befizetések lekérdezése hibázott, ezért az egyházfenntartói járulék és a perselypénz rubrikái ' +
        '(VII.1–VII.4) üresen maradtak: ' +
        (befRes.error.message || 'ismeretlen hiba'),
    )
  } else {
    let jarulekOssz = 0
    let perselyOssz = 0
    for (const r of befRes.rows) {
      const kod = befizetesKod(r)
      if (!kod) continue
      const osszeg = Number(r.osszeg) || 0
      if (kod.startsWith('101.01')) jarulekOssz += osszeg
      else if (kod.startsWith('101.03')) perselyOssz += osszeg
    }
    auto['VII.1'] = round2(jarulekOssz)
    auto['VII.3'] = round2(perselyOssz)
    if (lelekszam && lelekszam > 0) {
      auto['VII.2'] = round2(jarulekOssz / lelekszam)
      auto['VII.4'] = round2(perselyOssz / lelekszam)
    }
  }

  // Zárszámadás (VII.6/7) — CSAK a véglegesített számadás kanonikus
  // snapshotjából (bealitas.szamadas_zaro_adatok, finalizeAccounting írja).
  // Amíg nincs véglegesített számadás, a mezők null-ok — a UI jelzi.
  if (bealitasRes.error) {
    console.error('[lelkeszi-jelentes] bealitas lekérdezés hiba — VII.6–VII.8 null:', bealitasRes.error.message)
  } else {
    const b = bealitasRes.data as {
      accounting_finalized: boolean | null
      szamadas_zaro_adatok: Record<string, unknown> | null
    } | null
    const zaro = b?.accounting_finalized ? b.szamadas_zaro_adatok : null
    if (zaro && typeof zaro === 'object') {
      const kanonikus = (zaro.kanonikus && typeof zaro.kanonikus === 'object'
        ? (zaro.kanonikus as Record<string, unknown>)
        : null)
      const bevetel = toNum(zaro.totalIncome) ?? (kanonikus ? toNum(kanonikus.totalIncome) : null)
      const kiadas = toNum(zaro.totalExpense) ?? (kanonikus ? toNum(kanonikus.totalExpense) : null)
      auto['VII.6'] = bevetel === null ? null : round2(bevetel)
      auto['VII.7'] = kiadas === null ? null : round2(kiadas)
    }
  }

  // ── Levezetett mezők (I.8, I.9, VII.8) — közös helper (types.ts) ──
  // A deriveAutoMezok a komponenseket a felulirasok > kezi > auto prioritással
  // oldja fel, így a VII.8 a záró-blokkon KÍVÜL származik: felülírt VII.6/VII.7
  // esetén véglegesített számadás nélkül is számol, és a felülírt keresztelt/
  // temetett számok is átfolynak az I.8/I.9-be.
  const derivedAuto = deriveAutoMezok(auto, kezi, felulirasok)

  return { auto: derivedAuto, congregationName, egyhazmegyeNev, autoHibak }
}

// ─────────────────────────────────────────────────────────────────────────
// Sor-betöltés / összeállítás
// ─────────────────────────────────────────────────────────────────────────

async function loadJelentesRow(
  supabase: Supa,
  congId: string,
  ev: number,
): Promise<{ row: JelentesRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('lelkeszi_jelentes')
    .select(JELENTES_SOR_MEZOK)
    .eq('congregation_id', congId)
    .eq('ev', ev)
    .maybeSingle()
  if (error) {
    if (isMissingJelentesTable(error)) return { row: null, error: MISSING_TABLE_HIBA }
    return { row: null, error: `Hiba a jelentés betöltésekor: ${error.message}` }
  }
  return { row: (data as unknown as JelentesRow) || null, error: null }
}

/** A snapshot minimális alak-ellenőrzése (véglegesített sor visszaadásához). */
function isValidSnapshot(s: Record<string, unknown> | null): s is Record<string, unknown> {
  return !!s && typeof s === 'object' && typeof s.auto === 'object' && s.auto !== null
}

async function buildJelentesData(
  supabase: Supa,
  congId: string,
  ev: number,
  row: JelentesRow | null,
): Promise<{ data: LelkesziJelentesData; autoHibak: string[] }> {
  const kezi = sanitizeErtekek(row?.kezi_adatok)
  const felulirasok = sanitizeErtekek(row?.felulirasok)
  const { auto, congregationName, egyhazmegyeNev, autoHibak } = await computeAuto(
    supabase, congId, ev, kezi, felulirasok,
  )
  return {
    data: {
      ev,
      congregationName,
      egyhazmegyeNev,
      auto,
      kezi,
      felulirasok,
      hatarozat: (row?.hatarozat && typeof row.hatarozat === 'object'
        ? (row.hatarozat as Partial<HatarozatAdatok>)
        : {}),
      statusz: row?.statusz === 'veglegesitve' ? 'veglegesitve' : 'szerkesztes',
      veglegesitveAt: row?.veglegesitve_at || null,
      // A beküldés-állapotot a getLelkesziJelentes tölti FRISSEN (a snapshotba
      // fagyott érték elavulhatna, miközben az egyházmegye feldolgozza).
      submission: null,
    },
    autoHibak,
  }
}

/**
 * Az egyházmegyének beküldött jelentés állapota (document_submissions,
 * 'lelkeszi_jelentes' típus, alap-beküldés: modification_number IS NULL).
 * Hibánál null — a beküldés-állapot hiánya nem blokkolhatja a jelentés-nézetet.
 */
async function loadSubmission(
  supabase: Supa,
  congId: string,
  ev: number,
): Promise<{ status: string; submittedAt: string | null } | null> {
  const { data, error } = await supabase
    .from('document_submissions')
    .select('status, submitted_at')
    .eq('congregation_id', congId)
    .eq('year', ev)
    .eq('document_type', 'lelkeszi_jelentes')
    .is('modification_number', null)
    .maybeSingle()
  if (error) {
    console.error('[lelkeszi-jelentes] document_submissions lekérdezés hiba — a beküldés-állapot ismeretlen:', error.message)
    return null
  }
  const row = data as { status?: unknown; submitted_at?: unknown } | null
  if (!row || typeof row.status !== 'string') return null
  return { status: row.status, submittedAt: typeof row.submitted_at === 'string' ? row.submitted_at : null }
}

// ─────────────────────────────────────────────────────────────────────────
// Exportált szerver-akciók
// ─────────────────────────────────────────────────────────────────────────

/**
 * A jelentés betöltése egy évre: auto-számítás élő adatból + a mentett sor
 * (kezi/felulirasok/hatarozat/statusz).
 *
 * VÉGLEGESÍTETT jelentésnél a befagyasztott snapshotot adjuk vissza (bit-azonos
 * a beküldöttel/nyomtatottal) — nem számolunk újra.
 */
export async function getLelkesziJelentes(ev: number): Promise<{
  data?: LelkesziJelentesData
  /** true = a gyülekezet feloldás-kérése folyamatban van a véglegesített soron. */
  unlockRequested?: boolean
  /** A hivatalos rubrikákat érintő rész-lekérdezési hibák magyar üzenetei. */
  autoHibak?: string[]
  error?: string
}> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó vagy aktív gyülekezet.' }

  const { row, error } = await loadJelentesRow(supabase, congregationId, ev)
  if (error) return { error }

  // Beküldés-állapot — mindig FRISSEN (a véglegesített snapshot mellett is,
  // mert az egyházmegyei feldolgozás állapota a snapshot után is változik).
  const submission = await loadSubmission(supabase, congregationId, ev)

  // Véglegesített sor: a snapshot a hiteles (befagyasztott) adat
  if (row?.statusz === 'veglegesitve' && isValidSnapshot(row.snapshot)) {
    const snap = row.snapshot as unknown as LelkesziJelentesData
    return {
      data: {
        ...snap,
        ev,
        statusz: 'veglegesitve',
        veglegesitveAt: row.veglegesitve_at || snap.veglegesitveAt || null,
        egyhazmegyeNev: snap.egyhazmegyeNev ?? null,
        submission,
      },
      unlockRequested: row.unlock_requested === true,
    }
  }

  const { data, autoHibak } = await buildJelentesData(supabase, congregationId, ev, row)
  return {
    data: { ...data, submission },
    unlockRequested: row?.unlock_requested === true,
    autoHibak,
  }
}

/**
 * Kézi mezők + felülírások + határozati adatok mentése (TELJES csere — a UI a
 * teljes szerkesztő-állapotot küldi). Véglegesített soron tiltott.
 */
export async function saveLelkesziJelentes(
  ev: number,
  input: {
    kezi?: Record<string, number | string | null>
    felulirasok?: Record<string, number | string | null>
    hatarozat?: Partial<HatarozatAdatok>
  },
): Promise<{ success?: boolean; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó vagy aktív gyülekezet.' }

  // Csak a katalógusban létező mezőket engedjük be: kezi → kézi mezők,
  // felulirasok → auto-mezők (idegen kulcsok némán kiesnek).
  const keziMezok = new Set(JELENTES_MEZOK.filter((m) => !m.auto).map((m) => m.id))
  const autoMezok = new Set(JELENTES_MEZOK.filter((m) => m.auto).map((m) => m.id))
  const kezi: Record<string, number | string | null> = {}
  for (const [k, v] of Object.entries(sanitizeErtekek(input.kezi || {}))) {
    if (keziMezok.has(k)) kezi[k] = v
  }
  const felulirasok: Record<string, number | string | null> = {}
  for (const [k, v] of Object.entries(sanitizeErtekek(input.felulirasok || {}))) {
    if (autoMezok.has(k)) felulirasok[k] = v
  }
  const HATAROZAT_KULCSOK: Array<keyof HatarozatAdatok> = [
    'presbiteriSzam', 'presbiteriDatum', 'kozgyulesiSzam', 'kozgyulesiDatum',
    'egyhazkozsegiIktatoszam', 'egyhazmegyeiIktatoszam', 'lelkipasztor', 'fogondnok',
  ]
  const hatarozat: Partial<HatarozatAdatok> = {}
  for (const kulcs of HATAROZAT_KULCSOK) {
    const v = input.hatarozat?.[kulcs]
    if (typeof v === 'string') hatarozat[kulcs] = v
  }

  const { row, error } = await loadJelentesRow(supabase, congregationId, ev)
  if (error) return { error }
  if (row?.statusz === 'veglegesitve') {
    return { error: 'A véglegesített jelentés nem szerkeszthető. Kérjen feloldást az egyházmegyétől.' }
  }

  if (row) {
    // Guardolt update: csak a még szerkesztés alatti sort írjuk (párhuzamos
    // véglegesítés ellen — a .select() üres eredménye jelzi az ütközést).
    const { data: upd, error: updErr } = await supabase
      .from('lelkeszi_jelentes')
      .update({ kezi_adatok: kezi, felulirasok, hatarozat })
      .eq('id', row.id)
      .eq('congregation_id', congregationId)
      .eq('statusz', 'szerkesztes')
      .select('id')
    if (updErr) return { error: `Hiba a mentéskor: ${updErr.message}` }
    if (!upd || upd.length === 0) {
      return { error: 'A jelentést időközben véglegesítették — a mentés nem történt meg. Töltse újra az oldalt.' }
    }
  } else {
    const { error: insErr } = await supabase.from('lelkeszi_jelentes').insert([
      {
        congregation_id: congregationId,
        ev,
        kezi_adatok: kezi,
        felulirasok,
        hatarozat,
        statusz: 'szerkesztes',
      },
    ])
    if (insErr) {
      if (isMissingJelentesTable(insErr)) return { error: MISSING_TABLE_HIBA }
      // 23505 = párhuzamos mentés közben már létrejött a (congregation_id, ev)
      // sor → guardolt update-tel írjuk ugyanazt az adatot.
      if (insErr.code === '23505') {
        const { data: upd, error: updErr } = await supabase
          .from('lelkeszi_jelentes')
          .update({ kezi_adatok: kezi, felulirasok, hatarozat })
          .eq('congregation_id', congregationId)
          .eq('ev', ev)
          .eq('statusz', 'szerkesztes')
          .select('id')
        if (updErr) return { error: `Hiba a mentéskor: ${updErr.message}` }
        if (!upd || upd.length === 0) {
          return { error: 'A jelentést időközben véglegesítették — a mentés nem történt meg. Töltse újra az oldalt.' }
        }
      } else {
        return { error: `Hiba a mentéskor: ${insErr.message}` }
      }
    }
  }

  revalidatePath('/munkanaplo')
  return { success: true }
}

/**
 * Véglegesítés: statusz → 'veglegesitve' + a TELJES kiszámolt jelentés
 * (auto + kezi + felulirasok + hatarozat) befagyasztása a snapshot mezőbe —
 * a beküldött/nyomtatott adat ezzel bit-azonos.
 */
export async function finalizeLelkesziJelentes(ev: number): Promise<{ success?: boolean; error?: string }> {
  const ctx = await getEffectiveCongregationContext()
  const { supabase, congregationId, userId, fullName } = ctx
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó vagy aktív gyülekezet.' }

  const loaded = await loadJelentesRow(supabase, congregationId, ev)
  if (loaded.error) return { error: loaded.error }
  let row = loaded.row

  // Véglegesített sor: csak akkor „kész", ha a snapshot ép. Érvénytelen/hiányzó
  // snapshotnál ÖNGYÓGYÍTÁS: újraszámolt snapshotot írunk a sorra (guard:
  // statusz='veglegesitve' — az időközben feloldott sort nem bántjuk).
  if (row?.statusz === 'veglegesitve') {
    if (isValidSnapshot(row.snapshot)) return { error: 'Ez a jelentés már véglegesítve van.' }
    const { data } = await buildJelentesData(supabase, congregationId, ev, row)
    const gyogyitoAt = row.veglegesitve_at || new Date().toISOString()
    const snapshot: Record<string, unknown> = {
      ...data,
      statusz: 'veglegesitve',
      veglegesitveAt: gyogyitoAt,
      veglegesito: fullName || null,
    }
    const { data: upd, error: updErr } = await supabase
      .from('lelkeszi_jelentes')
      .update({ snapshot })
      .eq('id', row.id)
      .eq('congregation_id', congregationId)
      .eq('statusz', 'veglegesitve')
      .select('id')
    if (updErr) return { error: `Hiba a véglegesítéskor: ${updErr.message}` }
    if (!upd || upd.length === 0) {
      return { error: 'A jelentés állapota időközben megváltozott — töltse újra az oldalt.' }
    }
    revalidatePath('/munkanaplo')
    return { success: true }
  }

  // Ha még nincs sor (pl. minden auto-adat rendben volt, kézi mentés nem
  // történt), létrehozzuk — a véglegesítés így is snapshotol.
  if (!row) {
    const { error: insErr } = await supabase.from('lelkeszi_jelentes').insert([
      { congregation_id: congregationId, ev, statusz: 'szerkesztes' },
    ])
    if (insErr && insErr.code !== '23505') {
      if (isMissingJelentesTable(insErr)) return { error: MISSING_TABLE_HIBA }
      return { error: `Hiba a véglegesítéskor: ${insErr.message}` }
    }
    const reread = await loadJelentesRow(supabase, congregationId, ev)
    if (reread.error) return { error: reread.error }
    row = reread.row
    if (!row) return { error: 'A jelentés-sor létrehozása nem sikerült — próbálja újra.' }
    if (row.statusz === 'veglegesitve') return { error: 'Ez a jelentés már véglegesítve van.' }
  }

  // Guardolt véglegesítés OPTIMISTA ZÁRRAL (updated_at): párhuzamos mentés a
  // snapshot-számítás közben elavulttá tenné a befagyasztandó adatot — a zár
  // ilyenkor 0 sort frissít, és EGYSZER friss sorból újraépítve próbálunk.
  for (let kiserlet = 1; ; kiserlet++) {
    const nowIso = new Date().toISOString()
    const { data } = await buildJelentesData(supabase, congregationId, ev, row)
    const snapshot: Record<string, unknown> = {
      ...data,
      statusz: 'veglegesitve',
      veglegesitveAt: nowIso,
      // Audit-kényelem: ki véglegesítette (a hiteles azonosító a
      // veglegesito_profile_id oszlop)
      veglegesito: fullName || null,
    }

    const { data: upd, error: updErr } = await supabase
      .from('lelkeszi_jelentes')
      .update({
        statusz: 'veglegesitve',
        veglegesitve_at: nowIso,
        veglegesito_profile_id: userId || null,
        snapshot,
        unlock_requested: false,
        unlock_reason: null,
      })
      .eq('id', row.id)
      .eq('congregation_id', congregationId)
      .eq('statusz', 'szerkesztes')
      .eq('updated_at', row.updated_at)
      .select('id')
    if (updErr) return { error: `Hiba a véglegesítéskor: ${updErr.message}` }
    if (upd && upd.length > 0) break

    // 0 sor → verseny: kiderítjük, mi történt időközben.
    const reread = await loadJelentesRow(supabase, congregationId, ev)
    if (reread.error) return { error: reread.error }
    if (!reread.row || reread.row.statusz === 'veglegesitve') {
      return { error: 'A jelentést időközben véglegesítették — töltse újra az oldalt.' }
    }
    if (kiserlet >= 2) {
      return { error: 'A jelentésen időközben mentés történt — próbálja újra a véglegesítést.' }
    }
    // Még 'szerkesztes' → egyszeri újrapróba a FRISS sorból épített snapshottal.
    row = reread.row
  }

  revalidatePath('/munkanaplo')
  return { success: true }
}

/**
 * Feloldás-kérés a véglegesített jelentésre (a pénzügyi unlock-flow mintája):
 * unlock_requested + indoklás — a tényleges feloldás egyházmegyei/admin döntés.
 */
export async function requestJelentesUnlock(
  ev: number,
  reason?: string | null,
): Promise<{ success?: boolean; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó vagy aktív gyülekezet.' }

  const { data: upd, error } = await supabase
    .from('lelkeszi_jelentes')
    .update({ unlock_requested: true, unlock_reason: reason?.trim() || null })
    .eq('congregation_id', congregationId)
    .eq('ev', ev)
    .eq('statusz', 'veglegesitve')
    .select('id')
  if (error) {
    if (isMissingJelentesTable(error)) return { error: MISSING_TABLE_HIBA }
    return { error: `Hiba a feloldás-kéréskor: ${error.message}` }
  }
  if (!upd || upd.length === 0) {
    return { error: 'Erre az évre nincs véglegesített jelentés — nincs mit feloldani.' }
  }

  revalidatePath('/munkanaplo')
  return { success: true }
}

/**
 * A VÉGLEGESÍTETT jelentés beküldése az egyházmegyének a közös dokumentum-
 * workflow-val (document_submissions, 'lelkeszi_jelentes' típus) — a beküldött
 * adat a véglegesítéskori snapshot, így bit-azonos a helyben tárolttal.
 */
export async function submitLelkesziJelentes(ev: number): Promise<{ success?: boolean; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó vagy aktív gyülekezet.' }

  const { row, error } = await loadJelentesRow(supabase, congregationId, ev)
  if (error) return { error }
  if (!row || row.statusz !== 'veglegesitve') {
    return { error: 'A beküldés előtt véglegesíteni kell a jelentést.' }
  }
  // Véglegesített, de sérült/hiányzó snapshot: pontos hibaüzenet (a
  // véglegesítés-gomb öngyógyító újra-snapshotja megjavítja).
  if (!isValidSnapshot(row.snapshot)) {
    return {
      error:
        'A véglegesített jelentés befagyasztott adata hiányzik vagy sérült — véglegesítse újra a jelentést, majd küldje be.',
    }
  }

  // Ha az egyházmegye a korábbi beküldést már feldolgozta (received/reviewed/
  // finalized), az ismételt beküldés némán felülírná a feldolgozott sort.
  const submission = await loadSubmission(supabase, congregationId, ev)
  if (submission && submission.status !== 'submitted') {
    return {
      error:
        'A korábban beküldött jelentést az egyházmegye már feldolgozta — ismételt beküldés előtt egyeztessen az egyházmegyei hivatallal.',
    }
  }

  const result = await submitDocument('lelkeszi_jelentes', ev, row.snapshot)
  if (result.error) return { error: result.error }

  revalidatePath('/munkanaplo')
  return { success: true }
}
