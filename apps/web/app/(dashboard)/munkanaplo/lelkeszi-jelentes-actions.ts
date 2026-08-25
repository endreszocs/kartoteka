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
//    pillanatképe (finalizeAccounting írja). FIGYELEM: ennek KÉT alakja van
//    forgalomban — a régiben a hivatalos végösszeg a `kanonikus` alobjektum
//    `totalActualIncome`/`totalActualExpense` mezőjében ül, az újban a felső
//    szinten. A VII.6/VII.7 olvasója mindkettőt ismeri (lásd ott).
//
// HIBA-FILOZÓFIA: ha egy rész-lekérdezés hibázik, a hozzá tartozó auto-mezők
// NULL-ok lesznek (a UI „nincs adat"-ként jelzi, felülírható) + hangos
// console.error — SOHA nem jelentünk némán 0-t hivatalos rubrikában. A
// munkanapló- és befizetés-hibák ezen felül az autoHibak listában szövegesen
// is visszamennek a hívónak (getLelkesziJelentes).

import { revalidatePath } from 'next/cache'
import { selectAllPaged } from '@kartoteka/supabase-client'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import type { WorklogEntry } from '@/lib/constants/worklog'
import {
  ADATLAP_MEZO_IDS,
  JELENTES_MEZOK,
  SZARMAZTATOTT_EGYUTT_MEZOK,
  deriveAutoMezok,
} from '@/lib/lelkeszi-jelentes/types'
import type {
  HatarozatAdatok,
  TobbEvesEv,
  JelentesJavaslatok,
  LelkesziJelentesData,
  ProgramJavaslat,
} from '@/lib/lelkeszi-jelentes/types'
// 2026-08-25 (határidőnapló-javaslatok): a VBH/FIT7/Imahét programok tiszta
// cím-felismerője — a sablon-definíciókkal KÖZÖS forrásból (nincs két igazság).
import { sablonFelismeres } from '@/lib/constants/program-sablonok'
// 2026-08-25 (gyülekezeti egységek, 3. ütem): a munkanapló-alapú auto-mezők
// TISZTA magja (worklogAutoMezok) a worklog-auto.ts-be költözött — a fő
// jelentés az ÖSSZES évi sorral hívja (viselkedés-azonos a korábbi ~250 soros
// blokkal), a „Gyülekezetenkénti bontás" partíciónként ugyanazt.
import { worklogAutoMezok } from '@/lib/lelkeszi-jelentes/worklog-auto'
import type { BontasEgyseg, JelentesBontas } from '@/lib/lelkeszi-jelentes/worklog-auto'
import {
  ANYA_OSZLOP_ID,
  BONTAS_MEZO_IDS,
  kozpontCimke,
  parseEgysegMezoKulcs,
} from '@/lib/gyulekezet/egysegek-shared'
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

/** A zárszámadás-pillanatkép sora a bealitas táblából (VII.6–VII.10 forrása). */
interface BealitasZaroRow {
  accounting_finalized: boolean | null
  szamadas_zaro_adatok: Record<string, unknown> | null
  szamadas_tartozasok?: { tartozasok?: Record<string, unknown>; kintlevosegek?: Record<string, unknown> } | null
}

/**
 * A `bealitas.szamadas_tartozasok` oszlop hiányának felismerése (42703 =
 * undefined_column, PGRST204 = a PostgREST séma-cache nem ismeri az oszlopot).
 * Ugyanaz a két jel, amit a penzugy/actions.ts saveSzamadasTartozasok néz.
 */
function isMissingTartozasokOszlop(error: PgError): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  return (error.message || '').toLowerCase().includes('szamadas_tartozasok')
}

const TARTOZASOK_OSZLOP_HIBA =
  'A kintlévőségek (VII.9) és a kifizetési kötelezettségek (VII.10) rubrikái üresen maradtak: ' +
  'a Számadás 116–133. sorait tároló adatbázis-mező még hiányzik. Ezt a két sort most kézzel töltse ki, ' +
  'vagy kérje a rendszergazdát, hogy futtassa le a hiányzó adatbázis-bővítést ' +
  '(migration-docs/sql/2026-08-14-szamadas-tartozasok.sql). A jelentés többi pénzügyi rubrikája ' +
  'változatlanul a véglegesített Számadásból jön.'

/**
 * A zárszámadás-pillanatkép betöltése (VII.6–VII.10 forrása), a
 * `szamadas_tartozasok` oszlop hiányát TÚLÉLŐ módon.
 *
 * 2026-08-15 (átvilágítás 21.) — MI VOLT A ROSSZ: a lekérdezés explicit módon
 * kérte a `szamadas_tartozasok` oszlopot, amit csak a MÉG FUTTATÁSRA VÁRÓ
 * migration-docs/sql/2026-08-14-szamadas-tartozasok.sql hoz létre. Amíg az SQL
 * nem futott le, a PostgREST 42703-mal az EGÉSZ sort elutasította, így nem csak
 * az új VII.9/VII.10, hanem a régóta helyesen működő VII.6–VII.8 (bevétel,
 * kiadás, egyenleg) is NÉMÁN üresen maradt a hivatalos, aláírt jelentésen — a
 * lelkész kézzel írta be azt, aminek a véglegesített Számadásból kell jönnie,
 * és a két hivatalos nyomtatvány így széthúzhatott.
 *
 * MOSTANTÓL: a hiányzó oszlop CSAK a saját két rubrikáját ejti ki, és arról
 * hangosan szólunk (autoHibak) — más hibát viszont NEM fed el a szűkebb
 * lekérdezés (fail-closed: azt változatlanul hibaként adjuk vissza).
 */
async function fetchBealitasZaro(
  supabase: Supa,
  congId: string,
  ev: number,
): Promise<{ data: BealitasZaroRow | null; error: PgError; tartozasokOszlopHianyzik: boolean }> {
  const ALAP_MEZOK = 'accounting_finalized, szamadas_zaro_adatok'
  const sor = (mezok: string) =>
    supabase.from('bealitas').select(mezok).eq('id', String(ev)).eq('congregation_id', congId).maybeSingle()

  const teljes = await sor(`${ALAP_MEZOK}, szamadas_tartozasok`)
  if (!teljes.error) {
    return { data: (teljes.data as unknown as BealitasZaroRow) || null, error: null, tartozasokOszlopHianyzik: false }
  }
  if (!isMissingTartozasokOszlop(teljes.error)) {
    return { data: null, error: teljes.error, tartozasokOszlopHianyzik: false }
  }
  const szukitett = await sor(ALAP_MEZOK)
  if (szukitett.error) {
    return { data: null, error: szukitett.error, tartozasokOszlopHianyzik: true }
  }
  return { data: (szukitett.data as unknown as BealitasZaroRow) || null, error: null, tartozasokOszlopHianyzik: true }
}

/**
 * Lapozás-tudatos lekérdezés: a PostgREST kérésenként legfeljebb 1000 sort ad
 * vissza. A hívó builderének determinisztikus `.order('id')` kell a stabil
 * oldalhatárokhoz.
 *
 * 2026-08-11 (5. kör, P3 #15): a saját ciklus helyett a KÖZÖS `selectAllPaged`.
 * A régi `page.length < PAGE_SIZE` stop-feltétel leszállított szerver-plafonnál
 * (Max Rows < 1000) az ELSŐ lap után kilépett volna — a lelkészi jelentés
 * anyakönyvi és lélekszám-rubrikái ilyenkor HIVATALOS nyomtatványon mutattak
 * volna a valóságnál kisebb, de hihető számokat. Hiba esetén a kontraktus
 * változatlan: ÜRES lista + a hiba továbbadva (részleges adat sosem megy ki).
 */
async function fetchAllRows<T>(
  // A lekérdezés sor-típusa a hívónál dől el; a builder típusa itt nem kifejezhető.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
): Promise<{ rows: T[]; error: PgError }> {
  const res = await selectAllPaged<T>(query, { orderColumn: null, dedupeBy: 'id' })
  if (res.error) return { rows: [], error: res.error }
  return { rows: res.data, error: null }
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

// A jelenlét-/halmozó-segédek (jelenlet, Halmozo, atlagJelenlet, szazalek) a
// worklogAutoMezok tiszta magjával együtt a lib/lelkeszi-jelentes/
// worklog-auto.ts-be költöztek (2026-08-25, gyülekezeti egységek).

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

// A SATOROS_NAP_MEZO és a JELENTES_* típusnév-készletek a worklogAutoMezok
// tiszta magjával a lib/lelkeszi-jelentes/worklog-auto.ts-ben élnek (2026-08-25).

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
function nemBontas(idSzemelyLista: Array<number | null>, cimkek: Map<number, SzemelyCimke>): AnyakonyviSzamok {
  let ferfi = 0
  let no = 0
  for (const id of idSzemelyLista) {
    if (id == null) continue
    const f = cimkek.get(id)?.ferfi
    if (f === true) ferfi += 1
    else if (f === false) no += 1
  }
  return { ferfi, no, egyutt: idSzemelyLista.length }
}

/** A szemely-lookup címkéi: nem (ferfi) + egység-besorolás (a bontáshoz). */
interface SzemelyCimke {
  ferfi: boolean | null
  egysegId: string | null
}

/**
 * szemely.ferfi (+ aktív bontásnál egyseg_id) kötegelt lekérdezése (200-as
 * .in() csomagokban — URL-hossz limit; az azonosítók numerikusak, így a 200-as
 * csomag bőven a limit alatt marad). Az egyseg_id-t CSAK akkor kérjük, ha az
 * oszlop bizonyítottan létezik (a fő szemely-lekérdezés igazolta): a migráció
 * előtti adatbázison a plusz oszlop az egész lookupot — és vele a fő jelentés
 * férfi/nő bontását — buktatná el.
 */
async function fetchSzemelyCimkeMap(
  supabase: Supa,
  ids: number[],
  egysegOszloppal: boolean,
): Promise<Map<number, SzemelyCimke>> {
  const map = new Map<number, SzemelyCimke>()
  const unique = Array.from(new Set(ids))
  const CHUNK = 200
  for (let i = 0; i < unique.length; i += CHUNK) {
    // A feltételes select-string a supabase-js literál-parserének nem elemezhető
    // (ParserError-uniót ad) — a sor-alakot ezért .returns nélkül, futásidőben
    // ellenőrizve szűkítjük (unknown-on át, a 313-314. sori védőfeltételekkel).
    const { data, error } = await supabase
      .from('szemely')
      .select((egysegOszloppal ? 'id, ferfi, egyseg_id' : 'id, ferfi') as 'id, ferfi')
      .in('id', unique.slice(i, i + CHUNK))
    if (error) {
      console.error('[lelkeszi-jelentes] szemely lookup hiba — a férfi/nő és az egység-bontás hiányos lesz:', error.message)
      continue
    }
    for (const row of (data || []) as unknown as Array<{ id: number; ferfi: boolean | null; egyseg_id?: string | null }>) {
      map.set(Number(row.id), {
        ferfi: row.ferfi === true ? true : row.ferfi === false ? false : null,
        egysegId: typeof row.egyseg_id === 'string' ? row.egyseg_id : null,
      })
    }
  }
  return map
}

/** A szemely sora a lélekszám-számításhoz (egyseg_id: bontás — fetchSzemelyRows). */
interface SzemelySor {
  id: number
  meghalt: boolean | null
  member_status: string | null
  voter_eligible: boolean | null
  egyseg_id?: string | null
  /** 2026-08-25 (jelentés-UX kör): a kor-mutatókhoz (I.24–I.26). */
  sz_datum?: string | null
}

/**
 * A KANONIKUS „aktív tag" szűrő (2026-08-11, 6. kör: az I.10 és az I.11 közös
 * szabálya). 2026-08-25: modul-szintre emelve, hogy a gyülekezetenkénti bontás
 * UGYANEZT használja — nincs két igazság.
 */
function aktivTagSzuro(s: { meghalt: boolean | null; member_status: string | null }): boolean {
  return (
    !s.meghalt &&
    !['elhunyt', 'elköltözött', 'elkoltozott', 'kitért', 'törölt'].includes(s.member_status || '')
  )
}

/** A szemely/munkanaplo egyseg_id oszlopának hiánya (42703 / PGRST204). */
function isMissingEgysegOszlop(error: PgError): boolean {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  if (!msg.includes('egyseg_id')) return false
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find')
  )
}

/**
 * 2026-08-25 (jelentés-UX kör): a szemely.sz_datum oszlop hiánya (42703 /
 * PGRST204) — az élő sémában az oszlop régóta létezik, de a lekérdezés
 * oszlop-drift-biztos marad: a hiány CSAK az I.24–I.26 kor-mutatókat ejti ki,
 * az I.10/I.11 fő rubrikáit nem (fetchSzemelyRows visszaesési láncolata).
 */
function isMissingSzDatumOszlop(error: PgError): boolean {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  if (!msg.includes('sz_datum')) return false
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find')
  )
}

/** A gyulekezeti_egysegek tábla hiánya (a 2026-08-25-ös migráció előtt). */
function isMissingEgysegTabla(error: PgError): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message || '').toLowerCase()
  return (
    msg.includes('gyulekezeti_egysegek') &&
    (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))
  )
}

/**
 * Lélekszám-sorok lekérdezése — a bontáshoz egyseg_id-vel, a kor-mutatókhoz
 * (I.24–I.26, 2026-08-25 jelentés-UX kör) sz_datum-mal, a MIGRÁCIÓ ELŐTTI /
 * eltérő sémájú adatbázist TÚLÉLŐ visszaeséssel (a fetchBealitasZaro bevált
 * mintája): egy hiányzó bővítő oszlop CSAK a saját mutatóit ejti ki, az
 * I.10/I.11 fő rubrikái nem sérülhetnek. Bármilyen MÁS hibát változatlanul
 * továbbadunk (fail-closed, nincs elfedés).
 */
async function fetchSzemelyRows(
  supabase: Supa,
  congId: string,
): Promise<{ rows: SzemelySor[]; error: PgError; egysegOszlop: boolean; szDatumOszlop: boolean }> {
  const build = (mezok: string) =>
    supabase
      .from('szemely')
      .select(mezok)
      .eq('congregation_id', congId)
      .eq('isvisible', true)
      .order('id')
  const ALAP = 'id, meghalt, member_status, voter_eligible'
  // A bővítő oszlopok minden kombinációja, a legteljesebbtől a legszűkebbig —
  // egy-egy oszlop bizonyított hiányát megjegyezzük, és az azt tartalmazó
  // változatokat átugorjuk (nincs fölösleges kör).
  const valtozatok: Array<{ mezok: string; egyseg: boolean; szdat: boolean }> = [
    { mezok: `${ALAP}, egyseg_id, sz_datum`, egyseg: true, szdat: true },
    { mezok: `${ALAP}, egyseg_id`, egyseg: true, szdat: false },
    { mezok: `${ALAP}, sz_datum`, egyseg: false, szdat: true },
    { mezok: ALAP, egyseg: false, szdat: false },
  ]
  let egysegHianyzik = false
  let szDatumHianyzik = false
  let utolsoHiba: PgError = null
  for (const v of valtozatok) {
    if (v.egyseg && egysegHianyzik) continue
    if (v.szdat && szDatumHianyzik) continue
    const res = await fetchAllRows<SzemelySor>(build(v.mezok))
    if (!res.error) return { rows: res.rows, error: null, egysegOszlop: v.egyseg, szDatumOszlop: v.szdat }
    utolsoHiba = res.error
    if (isMissingEgysegOszlop(res.error)) {
      egysegHianyzik = true
      continue
    }
    if (isMissingSzDatumOszlop(res.error)) {
      szDatumHianyzik = true
      continue
    }
    // Nem oszlop-hiány → fail-closed: a hibát változatlanul továbbadjuk.
    return { rows: [], error: res.error, egysegOszlop: false, szDatumOszlop: false }
  }
  return { rows: [], error: utolsoHiba, egysegOszlop: false, szDatumOszlop: false }
}

/**
 * Születési év a szemely.sz_datum-ból ('YYYY-MM-DD' vagy timestamp alak) —
 * nem értelmezhető / értelmetlen dátumra null (a hívó kihagyja a számításból).
 */
function szuletesiEv(szDatum: string | null | undefined): number | null {
  if (typeof szDatum !== 'string') return null
  const m = szDatum.match(/^(\d{4})-\d{2}-\d{2}/)
  if (!m) return null
  const ev = Number(m[1])
  return Number.isFinite(ev) && ev > 1800 ? ev : null
}

/**
 * 2026-08-25 (társegyházközség): a gyülekezet-sor a jelentés fejlécéhez + a
 * szervezeti forma (a bontás „központ" oszlopának feliratához) — OSZLOP-
 * DRIFT-BIZTOSAN. A congregations.szervezeti_tipus a migráció előtt még
 * hiányozhat: ha a bővített select hibázik, a régi (szűkített) select fut —
 * a fő jelentés (gyülekezet-/egyházmegye-név) migráció előtt sem sérülhet,
 * ilyenkor csak a központ-felirat esik vissza az alapértelmezettre.
 */
async function fetchCongRow(
  supabase: Supa,
  congId: string,
): Promise<{ data: unknown; error: PgError }> {
  const sor = (mezok: string) =>
    supabase.from('congregations').select(mezok).eq('id', congId).maybeSingle()
  const teljes = await sor('nev_hu, name, szervezeti_tipus, dioceses(name)')
  if (!teljes.error) return { data: teljes.data, error: null }
  const szukitett = await sor('nev_hu, name, dioceses(name)')
  return { data: szukitett.data, error: szukitett.error }
}

/**
 * Az előző évi VÉGLEGESÍTETT jelentés dec. 31-i lélekszáma (I.10) a
 * snapshotból, a mezoErtek prioritásával (felulirasok > auto > kezi).
 */
/**
 * Egy mező feloldott értéke egy VÉGLEGESÍTETT jelentés-snapshotból, a bevett
 * felülírás > auto > kézi prioritással (2026-08-14, 18. pont: általánosítva
 * az I.10-es olvasóból — a VII.5 az előző évi VII.8-at olvassa így).
 */
function snapshotMezoErtek(snapshot: Record<string, unknown> | null, mezoId: string): number | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const felul = sanitizeErtekek(snapshot.felulirasok as Record<string, unknown> | null)
  const auto = sanitizeErtekek(snapshot.auto as Record<string, unknown> | null)
  const kezi = sanitizeErtekek(snapshot.kezi as Record<string, unknown> | null)
  const f = felul[mezoId]
  if (f !== undefined && f !== null && f !== '') return toNum(f)
  const a = auto[mezoId]
  if (a !== undefined && a !== null) return toNum(a)
  return toNum(kezi[mezoId])
}

function elozoEviLelekszam(snapshot: Record<string, unknown> | null): number | null {
  return snapshotMezoErtek(snapshot, 'I.10')
}

/**
 * 2026-08-14 (18. pont 4): a korábbi évek VÉGLEGESÍTETT jelentéseinek
 * kivonata az Adatlaphoz (legfeljebb 9 előző év). Fail-soft: hibánál üres
 * lista — az Adatlap ilyenkor csak a tárgyévet mutatja.
 */
async function loadTobbEvesAdatok(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  congId: string,
  ev: number,
): Promise<TobbEvesEv[]> {
  try {
    const { data, error } = await supabase
      .from('lelkeszi_jelentes')
      .select('ev, statusz, snapshot')
      .eq('congregation_id', congId)
      .gte('ev', ev - 9)
      .lt('ev', ev)
      .eq('statusz', 'veglegesitve')
      .order('ev')
    if (error) {
      console.warn('[lelkeszi-jelentes] többéves kivonat nem tölthető be:', error.message)
      return []
    }
    return ((data || []) as Array<{ ev: number; snapshot: Record<string, unknown> | null }>).map((r) => {
      const mezok: Record<string, number | null> = {}
      for (const id of ADATLAP_MEZO_IDS) mezok[id] = snapshotMezoErtek(r.snapshot, id)
      return { ev: Number(r.ev), mezok }
    })
  } catch (e) {
    console.warn('[lelkeszi-jelentes] többéves kivonat hiba:', e)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Gyülekezetenkénti bontás (2026-08-25, gyülekezeti egységek — 3. ütem)
// ─────────────────────────────────────────────────────────────────────────

/** A bontásban munkanaplóból számolt mutatók (a BONTAS_MEZO_IDS részhalmaza). */
const BONTAS_WORKLOG_MEZOK = ['II.1a', 'II.1b', 'II.6a', 'II.12', 'V.3', 'III.7'] as const

/**
 * A „Gyülekezetenkénti bontás" auto-értékei partíciónként (anyaközpont +
 * minden aktív egység). FAIL-CLOSED: ha egy forrás-lekérdezés hibázott, a
 * hozzá tartozó cellák null-ok maradnak + magyar üzenet a hibak listában —
 * SOHA nem néma 0. Az inaktív/törölt egység-címkéjű sorok az anyaközpont
 * oszlopába számítanak (az ON DELETE SET NULL szemantikája), de HANGOSAN.
 */
function bontasSzamitas(args: {
  egysegek: BontasEgyseg[]
  worklog: { entries: WorklogEntry[]; error: string | null }
  szemely: { rows: SzemelySor[]; error: PgError; egysegOszlop: boolean }
  keresztseg: { rows: Array<{ id: number; id_szemely: number | null }>; error: PgError }
  temetes: { rows: Array<{ id: number; id_szemely: number | null }>; error: PgError }
  konfirmalas: { rows: Array<{ id: number; id_szemely: number | null }>; error: PgError }
  hazassag: { rows: Array<{ id: number; id_ferfi: number | null; id_no: number | null }>; error: PgError }
  befizetes: {
    rows: Array<{ osszeg: number | null; osszeg_ron?: number | null; id_szemely?: number | null; befizetescel?: unknown }>
    error: PgError
  }
  /** A közös szemely-lookup (nem + egység) — az anyakönyvi/járulék-cellákhoz. */
  cimkek: Map<number, SzemelyCimke>
  /** false = a lookup egység-adat nélkül futott → a személy-alapú cellák az anya oszlopba esnének. */
  cimkeEgysegOk: boolean
}): JelentesBontas {
  const hibak: string[] = []
  const oszlopIds = [ANYA_OSZLOP_ID, ...args.egysegek.map((e) => e.id)]
  const ervenyes = new Set(oszlopIds)
  const auto: Record<string, Record<string, number | null>> = {}
  for (const o of oszlopIds) {
    const rekord: Record<string, number | null> = {}
    for (const mezoId of BONTAS_MEZO_IDS) rekord[mezoId] = null
    auto[o] = rekord
  }

  let atsorolt = 0
  const oszlop = (egysegId: string | null | undefined): string => {
    if (!egysegId) return ANYA_OSZLOP_ID
    if (ervenyes.has(egysegId)) return egysegId
    atsorolt += 1
    return ANYA_OSZLOP_ID
  }
  const szemelyEgyseg = (idSzemely: number | null | undefined): string | null =>
    idSzemely == null ? null : (args.cimkek.get(Number(idSzemely))?.egysegId ?? null)

  // ── Munkanapló-alapú cellák (II.1a/II.1b/II.6a/II.12/V.3/III.7 + VII.3) ──
  // Partíciónként UGYANAZ a tiszta mag fut, mint a fő jelentésben — így a
  // De.2/Du.2 összevonás és minden él-eset partíción belül azonosan működik
  // (egy alkalom pontosan egy partícióban van, kulcs-ütközés nincs).
  if (args.worklog.error) {
    hibak.push(
      'A munkanapló lekérdezése hibázott — az alkalom-mutatók (II.1a, II.1b, II.6a, II.12, V.3, III.7) ' +
        'és a perselypénz (VII.3) bontás-cellái üresen maradtak.',
    )
  } else {
    const particiok = new Map<string, WorklogEntry[]>()
    for (const o of oszlopIds) particiok.set(o, [])
    for (const e of args.worklog.entries) {
      if (e.deleted) continue
      particiok.get(oszlop(e.egyseg_id))!.push(e)
    }
    for (const [o, sorok] of particiok) {
      // A százalék-mezők nevezője (lélekszám) itt nem kell — nem bontás-mutatók.
      const resz = worklogAutoMezok(sorok, null)
      for (const mezoId of BONTAS_WORKLOG_MEZOK) auto[o][mezoId] = resz.mezok[mezoId] ?? null
      // VII.3 — perselypénz az alkalom-sorok persely-rovatából. A FŐ jelentés
      // VII.3-a a könyvelt befizetésekből számol — ISMERT, DOKUMENTÁLT eltérés,
      // a bontás-panel és a nyomtatott melléklet lábjegyzete mondja ki.
      auto[o]['VII.3'] = round2(sorok.reduce((s, e) => s + (Number(e.persely) || 0), 0))
    }
  }

  // ── I.10 / I.11 — lélekszám + választók egységenként (a KANONIKUS szűrővel) ──
  if (args.szemely.error) {
    hibak.push('A tagnyilvántartás lekérdezése hibázott — a lélekszám és a választók (I.10, I.11) bontás-cellái üresen maradtak.')
  } else if (!args.szemely.egysegOszlop) {
    // Elvben nem fordulhat elő (az egység-tábla és az oszlop egy migrációban
    // születik) — de ha mégis: üres cella + hangos jelzés, nem hamis szám.
    hibak.push(
      'A szemely.egyseg_id oszlop hiányzik — a lélekszám (I.10, I.11) bontás-cellái üresen maradtak. ' +
        'Futtassa le a 2026-08-25-gyulekezeti-egysegek.sql migrációt.',
    )
  } else {
    for (const o of oszlopIds) {
      auto[o]['I.10'] = 0
      auto[o]['I.11'] = 0
    }
    for (const s of args.szemely.rows) {
      if (!aktivTagSzuro(s)) continue
      const o = oszlop(s.egyseg_id ?? null)
      auto[o]['I.10'] = (auto[o]['I.10'] ?? 0) + 1
      if (s.voter_eligible === true) auto[o]['I.11'] = (auto[o]['I.11'] ?? 0) + 1
    }
  }

  // ── I.2c / I.3c / V.7c — anyakönyvek a személy egység-besorolása szerint ──
  // (Az esemény a személy egységét örökli — a terv 3.3 pontja; a ritka
  // határeset a bontás-cellában felülírható.) Ismeretlen személy → anya oszlop.
  const anyakonyvBontas = (
    forras: { rows: Array<{ id_szemely: number | null }>; error: PgError },
    mezoId: 'I.2c' | 'I.3c' | 'V.7c',
    nev: string,
  ) => {
    if (forras.error) {
      hibak.push(`A ${nev} lekérdezése hibázott — a ${mezoId} bontás-cellái üresen maradtak.`)
      return
    }
    for (const o of oszlopIds) auto[o][mezoId] = 0
    for (const r of forras.rows) {
      const o = oszlop(szemelyEgyseg(r.id_szemely))
      auto[o][mezoId] = (auto[o][mezoId] ?? 0) + 1
    }
  }
  anyakonyvBontas(args.keresztseg, 'I.2c', 'keresztelési anyakönyv')
  anyakonyvBontas(args.temetes, 'I.3c', 'temetési anyakönyv')
  anyakonyvBontas(args.konfirmalas, 'V.7c', 'konfirmációs anyakönyv')

  // ── I.16 — esketések: a férj egysége; ha neki nincs, a feleségé ──
  if (args.hazassag.error) {
    hibak.push('A házassági anyakönyv lekérdezése hibázott — az I.16 bontás-cellái üresen maradtak.')
  } else {
    for (const o of oszlopIds) auto[o]['I.16'] = 0
    for (const r of args.hazassag.rows) {
      const egysegId = szemelyEgyseg(r.id_ferfi) ?? szemelyEgyseg(r.id_no)
      const o = oszlop(egysegId)
      auto[o]['I.16'] = (auto[o]['I.16'] ?? 0) + 1
    }
  }

  // ── VII.1 — egyházfenntartói járulék a befizető személy egysége szerint ──
  // JAVASLAT-jellegű bontás (a terv D3 döntése): a család-szintű vagy személy
  // nélküli befizetés az anyaközpont oszlopába számít.
  if (args.befizetes.error) {
    hibak.push('A befizetések lekérdezése hibázott — az egyházfenntartói járulék (VII.1) bontás-cellái üresen maradtak.')
  } else {
    const jarulek = new Map<string, number>()
    for (const o of oszlopIds) jarulek.set(o, 0)
    for (const r of args.befizetes.rows) {
      const kod = befizetesKod(r)
      if (!kod || !kod.startsWith('101.01')) continue
      // A RON-ekvivalens a hivatalos érték (osszeg_ron ?? osszeg) — ugyanaz a
      // szabály, mint a fő VII.1 összegzésében.
      const osszeg = Number(r.osszeg_ron ?? r.osszeg) || 0
      const o = r.id_szemely != null ? oszlop(szemelyEgyseg(r.id_szemely)) : ANYA_OSZLOP_ID
      jarulek.set(o, (jarulek.get(o) || 0) + osszeg)
    }
    for (const o of oszlopIds) auto[o]['VII.1'] = round2(jarulek.get(o) || 0)
  }

  if (!args.cimkeEgysegOk) {
    hibak.push(
      'A személyek egység-besorolása nem volt betölthető — az anyakönyvi (I.2c, I.3c, I.16, V.7c) és a ' +
        'járulék (VII.1) bontás-cellák teljes egészében az Anyaegyházközség oszlopában összegződtek.',
    )
  }
  if (atsorolt > 0) {
    hibak.push(
      `${atsorolt} adatsor időközben törölt vagy inaktív egység-címkét visel — ezek az Anyaegyházközség oszlopában szerepelnek.`,
    )
  }

  return { egysegek: args.egysegek, auto, hibak }
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
  /**
   * 2026-08-11 (6. kör): munkanapló-alapú JAVASLATOK KÉZI rubrikákhoz (III.17).
   * SZÁNDÉKOSAN NEM része a LelkesziJelentesData-nak: így a véglegesítéskori
   * snapshotba (a hivatalos, befagyasztott dokumentumba) SOHA nem kerülhet bele.
   */
  javaslatok: JelentesJavaslatok
  /**
   * 2026-08-25 (gyülekezeti egységek): a „Gyülekezetenkénti bontás" auto-adata.
   * Csak akkor van, ha a gyülekezetnek van aktív egysége ÉS a gyulekezeti_
   * egysegek tábla létezik (migráció előtt / egység nélkül: undefined).
   * A kozpontCimke a „központ" oszlop felirata a szervezeti forma szerint
   * (társegyházközségnél „Közös (egész egyházközség)") — a snapshotba fagyó
   * bontás automatikusan viszi.
   */
  bontas?: JelentesBontas & { kozpontCimke: string }
}> {
  const yearStart = `${ev}-01-01`
  const yearEndExclusive = `${ev + 1}-01-01`
  const autoHibak: string[] = []
  const javaslatok: JelentesJavaslatok = {}

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
    egysegekRes,
  ] = await Promise.all([
    // Munkanapló — teljes év, 1000-es lapozóval, HIBA-TOVÁBBADÁSSAL (a néma
    // üres lista hivatalos rubrikában tilos — v0.9.78 hibaosztály)
    getWorklogsForYearChecked(ev),
    // Anyakönyvek — a scope-vital.ts működő év-tartomány mintája
    fetchAllRows<{ id: number; id_szemely: number | null }>(
      supabase
        .from('keresztseg')
        .select('id, id_szemely')
        .eq('congregation_id', congId)
        .gte('datum', yearStart)
        .lt('datum', yearEndExclusive)
        .order('id'),
    ),
    fetchAllRows<{ id: number; id_szemely: number | null }>(
      supabase
        .from('temetes')
        .select('id, id_szemely')
        .eq('congregation_id', congId)
        // FIGYELEM: a temetésnél a TDATUM (temetés napja) számít, nem a hdatum!
        .gte('tdatum', yearStart)
        .lt('tdatum', yearEndExclusive)
        .order('id'),
    ),
    // 2026-08-25: + id_ferfi/id_no — a bontás I.16 cellájához (az egység a
    // férj szemely.egyseg_id-je, ha nincs, a feleségé). A fő I.16/I.17
    // számítást a két plusz oszlop nem érinti.
    fetchAllRows<{ id: number; vegyes: boolean | null; id_ferfi: number | null; id_no: number | null }>(
      supabase
        .from('hazassag')
        .select('id, vegyes, id_ferfi, id_no')
        .eq('congregation_id', congId)
        .gte('datum', yearStart)
        .lt('datum', yearEndExclusive)
        .order('id'),
    ),
    fetchAllRows<{ id: number; id_szemely: number | null }>(
      supabase
        .from('konfirmalas')
        .select('id, id_szemely')
        .eq('congregation_id', congId)
        .gte('datum', yearStart)
        .lt('datum', yearEndExclusive)
        .order('id'),
    ),
    // Lélekszám — az annual-report generator.ts MŰKÖDŐ mintája (v0.9.78 után):
    // CSAK verifikált oszlopok (meghalt, member_status, isvisible).
    // 2026-07-17 (PR-2 F1.7): + voter_eligible az I.11 auto-számításhoz.
    // 2026-08-25: + egyseg_id a bontáshoz — a helper migráció előtti DB-n a
    // szűkített select-re esik vissza (az I.10/I.11 fő rubrikái nem sérülnek).
    fetchSzemelyRows(supabase, congId),
    // Előző évi jelentés (I.1-hez) — csak véglegesítettből olvasunk
    supabase
      .from('lelkeszi_jelentes')
      .select('statusz, snapshot')
      .eq('congregation_id', congId)
      .eq('ev', ev - 1)
      .maybeSingle(),
    // Zárszámadás kanonikus snapshot (VII.6/7/8) — csak véglegesített számadásból.
    // A `szamadas_tartozasok` oszlop hiányát a helper túléli (lásd ott).
    fetchBealitasZaro(supabase, congId, ev),
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
    // + szervezeti_tipus (2026-08-25: a bontás „központ" felirata) — oszlop-
    // drift-biztosan (lásd fetchCongRow).
    fetchCongRow(supabase, congId),
    // 2026-08-25: aktív gyülekezeti egységek — a „Gyülekezetenkénti bontás"
    // oszlopai. Hiányzó tábla (migráció előtt) = nincs bontás, NEM hiba.
    supabase
      .from('gyulekezeti_egysegek')
      .select('id, nev, tipus')
      .eq('congregation_id', congId)
      .eq('aktiv', true)
      .order('sorrend', { ascending: true })
      .order('nev', { ascending: true }),
  ])

  if (congRes.error) {
    console.error('[lelkeszi-jelentes] congregations lekérdezés hiba — a gyülekezet/egyházmegye neve üres lesz:', congRes.error.message)
  }
  const congRow = congRes.data as {
    nev_hu?: string | null
    name?: string | null
    /** 2026-08-25 (társegyházközség): a migráció előtt / szűkített selectnél hiányzik. */
    szervezeti_tipus?: string | null
    dioceses?: { name?: string | null } | Array<{ name?: string | null }> | null
  } | null
  const congregationName = congRow?.nev_hu || congRow?.name || ''
  const dioceseRow = egyBeagyazott(congRow?.dioceses)
  const egyhazmegyeNev = (dioceseRow?.name || '').trim() || null

  // ── Gyülekezeti egységek — a bontás oszlopai (2026-08-25) ──
  // Hiányzó tábla (a migráció még nem futott le) → a bontás EGÉSZÉNEK
  // kihagyása, NEM hiba. Más hibánál is kihagyjuk (a fő jelentés fut tovább),
  // de hangosan logolunk.
  let egysegek: BontasEgyseg[] = []
  if (egysegekRes.error) {
    if (!isMissingEgysegTabla(egysegekRes.error)) {
      console.error(
        '[lelkeszi-jelentes] gyulekezeti_egysegek lekérdezés hiba — a gyülekezetenkénti bontás kimarad:',
        egysegekRes.error.message,
      )
    }
  } else {
    egysegek = ((egysegekRes.data || []) as Array<{ id: string; nev: string; tipus: string }>)
      .filter((e) => e.tipus === 'leany' || e.tipus === 'szorvany')
      .map((e) => ({ id: e.id, nev: e.nev, tipus: e.tipus as BontasEgyseg['tipus'] }))
  }
  const bontasAktiv = egysegek.length > 0

  // ── I. Lélekszám ──

  // I.10 — dec. 31-i lélekszám. MEGJEGYZÉS: a szemely a JELENLEGI állapotot
  // tárolja — visszamenőleges évre ez a mai állapot közelítése (felülírható).
  let lelekszam: number | null = null
  if (szemelyRes.error) {
    console.error('[lelkeszi-jelentes] Lélekszám-lekérdezés HIBA — I.10 null lesz:', szemelyRes.error.message)
    // 2026-08-25 (jelentés-UX kör): a tagnyilvántartás-hiba HANGOSAN megy a
    // felületre is — az érintett rubrikák (I.10, I.11, I.24–I.26) üresen
    // maradnak, soha nem néma 0 (fail-closed).
    autoHibak.push(
      'A tagnyilvántartás lekérdezése hibázott, ezért a lélekszám (I.10), a választók (I.11), ' +
        'az átlagéletkor és a korosztály-mutatók (I.24–I.26) üresen maradtak: ' +
        (szemelyRes.error.message || 'ismeretlen hiba'),
    )
  } else {
    // 2026-08-11 (6. kör): a KANONIKUS „aktív tag" szűrő — az I.10 és az I.11
    // MOSTANTÓL UGYANEZT használja (eddig az I.11 csak a `meghalt`-at nézte).
    // 2026-08-25: a szűrő modul-szintű (aktivTagSzuro) — a bontás is EZT hívja.
    lelekszam = szemelyRes.rows.filter(aktivTagSzuro).length
    auto['I.10'] = lelekszam
    // I.11 — választói névjegyzékben szereplők (2026-07-17, PR-2 F1.7): a
    // perzisztált voter_eligible flagből (a „Jogosultság frissítése" gomb / RPC
    // tartja karban); a lelkész felülírhatja, mint minden auto-mezőt.
    //
    // 2026-08-11 (6. kör): eddig az I.11 CSAK a `meghalt` jelzőt nézte, a
    // member_statust nem. Egy elköltözött (vagy kitért/törölt) tag, akinek a
    // `voter_eligible` flagje nem lett letisztítva, felhizlalta a választók
    // számát — miközben az I.10 lélekszámban már NEM szerepelt. A hivatalos
    // nyomtatványon így több választó látszott, mint amennyi gyülekezeti tag.
    auto['I.11'] = szemelyRes.rows.filter((s) => s.voter_eligible === true && aktivTagSzuro(s)).length

    // I.24–I.26 — kor-mutatók (2026-08-25, jelentés-UX kör): átlagéletkor,
    // vallásórás korúak (6–14), IKE-korosztály (15–25) — az AKTÍV tagokból, a
    // dec. 31-i korral (kor = tárgyév − születési év; dec. 31-én az évi
    // születésnap már mindenkinél elmúlt). A sz_datum nélküli tag kimarad; ha
    // az aktívak >20%-a ilyen, hangos autoHibak-jelzés megy (a mutatók a
    // többiekből ettől még számolnak — de a lelkész tudja, mit ír alá).
    if (!szemelyRes.szDatumOszlop) {
      autoHibak.push(
        'A születési dátum (szemely.sz_datum) oszlop nem volt lekérdezhető — az átlagéletkor és a ' +
          'korosztály-mutatók (I.24–I.26) üresen maradtak.',
      )
    } else {
      const aktivak = szemelyRes.rows.filter(aktivTagSzuro)
      let korOsszeg = 0
      let korDb = 0
      let hianyzoSzDatum = 0
      let vallasorasKoru = 0
      let ikeKorosztaly = 0
      for (const s of aktivak) {
        const szEv = szuletesiEv(s.sz_datum)
        const kor = szEv === null ? null : ev - szEv
        if (kor === null || kor < 0 || kor > 120) {
          hianyzoSzDatum += 1
          continue
        }
        korOsszeg += kor
        korDb += 1
        if (kor >= 6 && kor <= 14) vallasorasKoru += 1
        if (kor >= 15 && kor <= 25) ikeKorosztaly += 1
      }
      if (korDb > 0) {
        auto['I.24'] = Math.round((korOsszeg / korDb) * 10) / 10
        auto['I.25'] = vallasorasKoru
        auto['I.26'] = ikeKorosztaly
      }
      if (aktivak.length > 0 && hianyzoSzDatum / aktivak.length > 0.2) {
        autoHibak.push(
          `Az aktív tagok ${Math.round((hianyzoSzDatum / aktivak.length) * 100)}%-ánál hiányzik vagy ` +
            'értelmezhetetlen a születési dátum — az átlagéletkor és a korosztály-mutatók (I.24–I.26) ' +
            'csak a többi tagból számolnak. Érdemes a születési dátumokat pótolni a tagnyilvántartásban.',
        )
      }
    }
  }

  // I.1 — előző évi véglegesített jelentés I.10-e
  if (elozoJelentesRes.error) {
    if (!isMissingJelentesTable(elozoJelentesRes.error)) {
      console.error('[lelkeszi-jelentes] Előző évi jelentés lekérdezés hiba:', elozoJelentesRes.error.message)
    }
  } else {
    const elozo = elozoJelentesRes.data as { statusz: string; snapshot: Record<string, unknown> | null } | null
    if (elozo?.statusz === 'veglegesitve') {
      auto['I.1'] = elozoEviLelekszam(elozo.snapshot)
      // 2026-08-14 (18. pont 3D, spec VII): az előző évi maradvány (a
      // Számadás 1. sora) = az ELŐZŐ ÉVI véglegesített jelentés egyenlege
      // (VII.8 = a + b − c). Véglegesített előző jelentés nélkül null (kézi).
      auto['VII.5'] = snapshotMezoErtek(elozo.snapshot, 'VII.8')
    }
  }

  // I.2 / I.3 / V.7 — férfi/nő bontás közös szemely-lookuppal. 2026-08-25:
  // aktív bontásnál UGYANEZ a lookup adja a személyek EGYSÉG-besorolását is
  // (a bontás I.16 cellájához a házasfelek azonosítói is bekerülnek).
  const szemelyIds: number[] = []
  if (!keresztsegRes.error) for (const r of keresztsegRes.rows) if (r.id_szemely != null) szemelyIds.push(Number(r.id_szemely))
  if (!temetesRes.error) for (const r of temetesRes.rows) if (r.id_szemely != null) szemelyIds.push(Number(r.id_szemely))
  if (!konfirmalasRes.error) for (const r of konfirmalasRes.rows) if (r.id_szemely != null) szemelyIds.push(Number(r.id_szemely))
  if (bontasAktiv && !hazassagRes.error) {
    for (const r of hazassagRes.rows) {
      if (r.id_ferfi != null) szemelyIds.push(Number(r.id_ferfi))
      if (r.id_no != null) szemelyIds.push(Number(r.id_no))
    }
  }
  // Az egyseg_id-t csak akkor kérjük, ha az oszlop BIZONYÍTOTTAN létezik (a fő
  // szemely-lekérdezés igazolta) — különben a migráció előtti DB-n a lookup, és
  // vele a fő jelentés férfi/nő bontása is elhasalna.
  const cimkeEgysegOk = bontasAktiv && szemelyRes.egysegOszlop
  const ferfiMap =
    szemelyIds.length > 0
      ? await fetchSzemelyCimkeMap(supabase, szemelyIds, cimkeEgysegOk)
      : new Map<number, SzemelyCimke>()

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
    // 2026-08-25 (gyülekezeti egységek): a ~250 soros worklog-blokk a
    // worklogAutoMezok TISZTA magba költözött (lib/lelkeszi-jelentes/
    // worklog-auto.ts) — a fő jelentés itt az ÖSSZES évi sorral hívja
    // (viselkedés-azonos BETŰRE: De.2/Du.2 összevonás, javaslat-építés és
    // minden él-eset változatlan), a bontás lentebb partíciónként ugyanazt.
    const worklogSzamitas = worklogAutoMezok(worklogRes.entries, lelekszam)
    Object.assign(auto, worklogSzamitas.mezok)
    Object.assign(javaslatok, worklogSzamitas.javaslatok)
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
  const befizetesQ = (legacy: boolean) => {
    let q = supabase
      .from('befizetes')
      // 2026-08-11 (6. kör): `osszeg_ron` is kell — lásd a lenti összegzésnél.
      // 2026-08-25: + id_szemely/id_csalad — a bontás VII.1 (járulék) cellái a
      // befizető személy egysége szerint oszlanak el (a fő összegzést a két
      // plusz oszlop nem érinti).
      .select('id, osszeg, osszeg_ron, id_szemely, id_csalad, befizetescel(szamadasicel(kod))')
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
    return fetchAllRows<{
      id: number
      osszeg: number | null
      osszeg_ron?: number | null
      id_szemely?: number | null
      id_csalad?: number | null
      befizetescel?: unknown
    }>(q.order('id'))
  }

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
      // 2026-08-11 (6. kör, P0): a RON-ekvivalens a hivatalos érték, nem a nyers
      // deviza-összeg. Eddig `Number(r.osszeg)` volt: egy 100 EUR-s befizetés
      // 100 lejként került a VII.1 (egyházfenntartói járulék) és a VII.3
      // (perselypénz) rubrikába — ALÁÍRT, BEKÜLDÖTT nyomtatványon —, és a
      // VII.2/VII.4 egy lélekre eső értékek is ezzel csúsztak el.
      // A kanonikus szabály (`osszeg_ron ?? osszeg`) már él a penzugy/actions.ts
      // és az eves-jelentes/prezentacio/actions.ts kódjában; ez a hely kimaradt.
      const osszeg = Number(r.osszeg_ron ?? r.osszeg) || 0
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

  // Zárszámadás (VII.6/7) — CSAK a véglegesített számadás HIVATALOS
  // pillanatképéből (bealitas.szamadas_zaro_adatok, finalizeAccounting írja).
  // Amíg nincs véglegesített számadás, a mezők null-ok — a UI jelzi.
  //
  // 2026-08-11 (6. kör, P0 — „két pillanatkép, és nem egyeznek"):
  //
  // MI VOLT A HIBA: ez a rubrika a `zaro.totalIncome` / `zaro.totalExpense`
  // mezőket olvasta ELSŐKÉNT. A RÉGI (1-es) alakban viszont ezek NEM a hivatalos
  // számadás végösszegei voltak, hanem a `finalizeAccounting` szerveroldali,
  // junction-FK-id kulcsú, a hivatalos ív végpont-kódjaira NEM szűrt
  // összesítése — az íven kívülre könyvelt pénzt is beleértve. A ténylegesen
  // BEKÜLDÖTT Számadás ezzel szemben a kanonikus (ív-szűrt) összeget vitte.
  // Vagyis a lelkész ALÁÍRT jelentése más bevétel-/kiadás-végösszeget mutatott,
  // mint az ugyanarra az évre beküldött Számadás: eltérés két hivatalos
  // nyomtatvány között. A meglévő `kanonikus.totalIncome` visszaesés ezen NEM
  // segített, mert SZERKEZETILEG HALOTT volt: (a) a `zaro.totalIncome` mindig
  // jelen volt, tehát a `??` sosem lépett tovább, és (b) a tárolt `kanonikus`
  // alobjektum `totalActualIncome`/`totalActualExpense` néven hordozza az
  // összegeket — `totalIncome` kulcs SOSEM volt benne.
  //
  // MOSTANTÓL a kettő ugyanaz az objektum (penzugy/actions.ts), de a MÁR
  // tárolt sorok a régi alakot hordozzák, ezért ez az olvasó MINDKÉT alakot
  // ismeri — a migrációs SQL (2026-08-11-zaro-pillanatkep-egyesites.sql)
  // lefutásától függetlenül helyes marad:
  //   · RÉGI (1-es) alak — van `kanonikus` alobjektum: a hivatalos szám OTT van
  //     (`totalActualIncome`; a `totalIncome` a felső szinten a nyers összesítés),
  //   · ÚJ (2-es) alak — nincs `kanonikus`: a felső szint MAGA a hivatalos adat,
  //   · ŐS-alak — se `kanonikus`, se kanonikus kulcs (kanonikus pillanatkép nélkül
  //     zárt év): marad a nyers `totalIncome`, mert más adat egyszerűen nincs.
  if (bealitasRes.error) {
    console.error('[lelkeszi-jelentes] bealitas lekérdezés hiba — VII.6–VII.8 null:', bealitasRes.error.message)
    autoHibak.push(
      'A véglegesített Számadás adatai nem tölthetők be, ezért a jelentés pénzügyi rubrikái ' +
        '(VII.6–VII.10) üresen maradtak. Töltse újra az oldalt; ha továbbra is üresek, írja be őket ' +
        'kézzel a beküldött Számadás alapján, és jelezze a rendszergazdának. (Részletek: ' +
        (bealitasRes.error.message || 'ismeretlen hiba') +
        ')',
    )
  } else {
    // A `szamadas_tartozasok` oszlop hiánya (még nem futott le a migráció) CSAK
    // a VII.9/VII.10-et ejti ki — a lelkész erről HANGOS üzenetet kap, hogy ne
    // higgye üres rubrikánál azt, hogy nincs tartozás/kintlévőség.
    if (bealitasRes.tartozasokOszlopHianyzik) autoHibak.push(TARTOZASOK_OSZLOP_HIBA)

    const b = bealitasRes.data

    // 2026-08-14 (18. pont 3D, spec VII): a kintlévőség (VII.9) és a
    // kifizetési kötelezettségek (VII.10) a Számadás hivatalos 129–133. ill.
    // 117–127. soraiból összegződnek (a K2-es Tartozások-rögzítő tárolja,
    // bealitas.szamadas_tartozasok) — így a jelentés KÖTELEZŐEN egyezik a
    // számadással. Rögzített sorok nélkül null (kézi töltés).
    const tartozasSum = (m: Record<string, unknown> | undefined): number | null => {
      if (!m || typeof m !== 'object') return null
      const ertekek = Object.values(m).map((v) => toNum(v)).filter((n): n is number => n !== null)
      if (ertekek.length === 0) return null
      return round2(ertekek.reduce((s, n) => s + n, 0))
    }
    auto['VII.9'] = tartozasSum(b?.szamadas_tartozasok?.kintlevosegek)
    auto['VII.10'] = tartozasSum(b?.szamadas_tartozasok?.tartozasok)

    const zaro = b?.accounting_finalized ? b.szamadas_zaro_adatok : null
    if (zaro && typeof zaro === 'object') {
      const kanonikus = (zaro.kanonikus && typeof zaro.kanonikus === 'object' && !Array.isArray(zaro.kanonikus)
        ? (zaro.kanonikus as Record<string, unknown>)
        : null)
      // A sorrend SZÁNDÉKOS: a kanonikus (ív-szűrt, beküldött) érték MINDIG
      // erősebb, mint a felső szintű nyers összesítés.
      //   1. `kanonikus.totalActual*` — RÉGI alak, a hivatalos (beküldött) szám,
      //   2. `kanonikus.total*`       — védőháló, ha a kanonikus alobjektum már
      //                                 normalizált kulcsokkal került be,
      //   3. `zaro.totalActual*`      — ÚJ alak: a felső szint a hivatalos adat,
      //   4. `zaro.total*`            — ÚJ alak tükör-kulcsa, ill. ŐS-alaknál a
      //                                 nyers összesítés (más adat nincs).
      const hivatalosOsszeg = (kanonikusKulcs: string, nyersKulcs: string) =>
        (kanonikus ? toNum(kanonikus[kanonikusKulcs]) ?? toNum(kanonikus[nyersKulcs]) : null) ??
        toNum(zaro[kanonikusKulcs]) ??
        toNum(zaro[nyersKulcs])
      const bevetel = hivatalosOsszeg('totalActualIncome', 'totalIncome')
      const kiadas = hivatalosOsszeg('totalActualExpense', 'totalExpense')
      auto['VII.6'] = bevetel === null ? null : round2(bevetel)
      auto['VII.7'] = kiadas === null ? null : round2(kiadas)
    }
  }

  // ── Gyülekezetenkénti bontás (2026-08-25) — csak aktív egységeknél ──
  let bontas: (JelentesBontas & { kozpontCimke: string }) | undefined
  if (bontasAktiv) {
    // A járulék-bontáshoz a BEFIZETŐ személyek egység-címkéje is kell — a
    // közös lookupot pótoljuk a belőle még hiányzó azonosítókkal.
    if (cimkeEgysegOk && !befRes.error) {
      const potlando: number[] = []
      for (const r of befRes.rows) {
        if (r.id_szemely == null) continue
        const id = Number(r.id_szemely)
        if (!ferfiMap.has(id)) potlando.push(id)
      }
      if (potlando.length > 0) {
        const potlas = await fetchSzemelyCimkeMap(supabase, potlando, true)
        for (const [id, cimke] of potlas) ferfiMap.set(id, cimke)
      }
    }
    bontas = {
      ...bontasSzamitas({
        egysegek,
        worklog: worklogRes,
        szemely: szemelyRes,
        keresztseg: keresztsegRes,
        temetes: temetesRes,
        konfirmalas: konfirmalasRes,
        hazassag: hazassagRes,
        befizetes: befRes,
        cimkek: ferfiMap,
        cimkeEgysegOk,
      }),
      // 2026-08-25 (társegyházközség): a „központ" oszlop felirata a szervezeti
      // forma szerint — társnál „Közös (egész egyházközség)", különben (és a
      // migráció előtti / szűkített congregations-selectnél is) a hagyományos
      // „Anyaegyházközség". A véglegesítéskor a snapshotba fagyó bontás ezt
      // automatikusan viszi magával.
      kozpontCimke: kozpontCimke(congRow?.szervezeti_tipus ?? null),
    }
  }

  // ── Levezetett mezők (I.8, I.9, VII.8) — közös helper (types.ts) ──
  // A deriveAutoMezok a komponenseket a felulirasok > kezi > auto prioritással
  // oldja fel, így a VII.8 a záró-blokkon KÍVÜL származik: felülírt VII.6/VII.7
  // esetén véglegesített számadás nélkül is számol, és a felülírt keresztelt/
  // temetett számok is átfolynak az I.8/I.9-be.
  const derivedAuto = deriveAutoMezok(auto, kezi, felulirasok)

  return { auto: derivedAuto, congregationName, egyhazmegyeNev, autoHibak, javaslatok, bontas }
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

/**
 * 2026-08-25: a snapshotba fagyasztott bontás kiolvasása (minimális alak-
 * ellenőrzéssel). Véglegesített jelentésnél NEM számolunk újra — a befagyott
 * adat a hiteles; a bontás nélkül véglegesített (régi) snapshotnál undefined.
 */
function snapshotBontas(
  snapshot: Record<string, unknown>,
): (JelentesBontas & { kozpontCimke?: string }) | undefined {
  const b = snapshot.bontas
  if (!b || typeof b !== 'object' || Array.isArray(b)) return undefined
  const o = b as { egysegek?: unknown; auto?: unknown; hibak?: unknown; kozpontCimke?: unknown }
  if (!Array.isArray(o.egysegek) || !o.auto || typeof o.auto !== 'object' || Array.isArray(o.auto)) {
    return undefined
  }
  return {
    egysegek: o.egysegek as JelentesBontas['egysegek'],
    auto: o.auto as JelentesBontas['auto'],
    hibak: Array.isArray(o.hibak) ? (o.hibak as unknown[]).filter((h): h is string => typeof h === 'string') : [],
    // 2026-08-25 (társegyházközség): a kozpontCimke nélkül fagyasztott (régi)
    // snapshotot TOLERÁLJUK — a mező ilyenkor hiányzik, a hívók (dialógus,
    // nyomtatott melléklet) az ANYAKOZPONT_CIMKE-re esnek vissza.
    ...(typeof o.kozpontCimke === 'string' ? { kozpontCimke: o.kozpontCimke } : {}),
  }
}

async function buildJelentesData(
  supabase: Supa,
  congId: string,
  ev: number,
  row: JelentesRow | null,
): Promise<{
  data: LelkesziJelentesData
  autoHibak: string[]
  javaslatok: JelentesJavaslatok
  /** 2026-08-25: a gyülekezetenkénti bontás — csak aktív egységeknél. */
  bontas?: JelentesBontas & { kozpontCimke: string }
}> {
  const kezi = sanitizeErtekek(row?.kezi_adatok)
  const felulirasok = sanitizeErtekek(row?.felulirasok)
  const { auto, congregationName, egyhazmegyeNev, autoHibak, javaslatok, bontas } = await computeAuto(
    supabase, congId, ev, kezi, felulirasok,
  )
  return {
    javaslatok,
    bontas,
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

/**
 * 2026-08-25 (határidőnapló-javaslatok): az adott év gyulekezeti_programok
 * sorai közül a sablonFelismeres által VBH / FIT7 / Imahét-ként felismert
 * programok — a jelentés-dialógus „Határidőnapló-javaslatok" paneljéhez.
 *
 * CSAK szerkesztés módban hívjuk (véglegesített jelentésnél a snapshot a
 * hiteles, ott javaslatnak nincs értelme). Lekérdezés-hibánál undefined +
 * console.warn — a jelentés többi része nem sérülhet, de a kulcs ELMARAD
 * (nem hazudunk üres listát: a hiányzó kulcsnál a panel meg sem jelenik).
 */
async function loadProgramJavaslatok(
  supabase: Supa,
  congId: string,
  ev: number,
): Promise<ProgramJavaslat[] | undefined> {
  try {
    const { data, error } = await supabase
      .from('gyulekezeti_programok')
      .select('cim, datum, datum_vege, helyszin, megjegyzes')
      .eq('congregation_id', congId)
      .gte('datum', `${ev}-01-01`)
      .lte('datum', `${ev}-12-31`)
      .order('datum')
    if (error) {
      console.warn(
        '[lelkeszi-jelentes] gyulekezeti_programok lekérdezés hiba — a határidőnapló-javaslatok kimaradnak:',
        error.message,
      )
      return undefined
    }
    const out: ProgramJavaslat[] = []
    for (const r of (data || []) as Array<{
      cim?: unknown
      datum?: unknown
      datum_vege?: unknown
      helyszin?: unknown
      megjegyzes?: unknown
    }>) {
      const cim = typeof r.cim === 'string' ? r.cim.trim() : ''
      if (!cim || typeof r.datum !== 'string' || !r.datum) continue
      const tipus = sablonFelismeres(cim)
      if (!tipus) continue
      out.push({
        tipus,
        cim,
        datum: r.datum,
        datumVege: typeof r.datum_vege === 'string' && r.datum_vege ? r.datum_vege : null,
        helyszin: typeof r.helyszin === 'string' && r.helyszin.trim() ? r.helyszin.trim() : null,
        megjegyzes: typeof r.megjegyzes === 'string' && r.megjegyzes.trim() ? r.megjegyzes.trim() : null,
      })
    }
    return out
  } catch (e) {
    console.warn('[lelkeszi-jelentes] határidőnapló-javaslatok hiba — a panel kimarad:', e)
    return undefined
  }
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
  /**
   * 2026-08-11 (6. kör): munkanapló-alapú JAVASLATOK KÉZI rubrikákhoz (III.17).
   * VÉGLEGESÍTETT jelentésnél SZÁNDÉKOSAN hiányzik: ott a befagyasztott
   * snapshot a hiteles adat, és javaslatot már nincs értelme kínálni.
   */
  javaslatok?: JelentesJavaslatok
  /**
   * 2026-08-25 (gyülekezeti egységek): a „Gyülekezetenkénti bontás" adata.
   * Szerkesztés módban élőből számolt; VÉGLEGESÍTETT jelentésnél a snapshot
   * `bontas` kulcsából jön (nem számolunk újra). Egység nélküli gyülekezetnél
   * / a migráció előtt hiányzik. A kozpontCimke a „központ" oszlop felirata
   * (társegyházközségnél „Közös (egész egyházközség)"); a régi snapshotból
   * hiányozhat — a hívó az ANYAKOZPONT_CIMKE-re essen vissza.
   */
  bontas?: JelentesBontas & { kozpontCimke?: string }
  /**
   * 2026-08-25: HATÁRIDŐNAPLÓ-JAVASLATOK — az év gyulekezeti_programok
   * soraiból felismert VBH / FIT7 / Imahét programok (sablonFelismeres).
   * CSAK szerkesztés módban van (véglegesítettnél a snapshot a hiteles, ott
   * SZÁNDÉKOSAN hiányzik); lekérdezés-hibánál is elmarad (console.warn) —
   * a jelentés többi része ettől nem sérül.
   */
  programJavaslatok?: ProgramJavaslat[]
  /**
   * 2026-08-25: a munkanapló Imahét-jellegű sorainak száma az évben — az
   * aggregátor III.5 értéke (imahet.db, worklog-auto.ts): NINCS két igazság.
   * Az Imahét-javaslatkártya tájékoztatójához. Hiányzik, ha a munkanapló-
   * lekérdezés hibázott (fail-closed: ilyenkor nem állítunk 0-t).
   */
  imahetNaploSorok?: number
  error?: string
}> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó vagy aktív gyülekezet.' }

  const { row, error } = await loadJelentesRow(supabase, congregationId, ev)
  if (error) return { error }

  // Beküldés-állapot — mindig FRISSEN (a véglegesített snapshot mellett is,
  // mert az egyházmegyei feldolgozás állapota a snapshot után is változik).
  const submission = await loadSubmission(supabase, congregationId, ev)

  // Az Adatlap többéves kivonata — a véglegesített nézetben is FRISSEN
  // számoljuk (a snapshot a saját éve befagyasztásakor még nem láthatta a
  // később véglegesített éveket).
  const tobbEvesAdatok = await loadTobbEvesAdatok(supabase, congregationId, ev)

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
        tobbEvesAdatok,
      },
      unlockRequested: row.unlock_requested === true,
      // A bontás a snapshotból — a befagyott adat a hiteles, nem számolunk újra.
      bontas: snapshotBontas(row.snapshot),
    }
  }

  const { data, autoHibak, javaslatok, bontas } = await buildJelentesData(supabase, congregationId, ev, row)

  // 2026-08-25: határidőnapló-javaslatok — CSAK a szerkesztés módú ágban
  // (a véglegesített ág fentebb már visszatért). Hibánál a kulcs elmarad.
  const programJavaslatok = await loadProgramJavaslatok(supabase, congregationId, ev)
  // Az Imahét-kártya tájékoztatója: a munkanapló Imahét-sorainak száma = a
  // már kiszámolt III.5 auto-érték (worklog-hibánál null → a kulcs elmarad,
  // nem állítunk hamis 0-t).
  const iii5 = data.auto['III.5']

  return {
    data: { ...data, submission, tobbEvesAdatok },
    unlockRequested: row?.unlock_requested === true,
    autoHibak,
    javaslatok,
    bontas,
    ...(programJavaslatok ? { programJavaslatok } : {}),
    ...(typeof iii5 === 'number' ? { imahetNaploSorok: iii5 } : {}),
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

  // 2026-08-25 (gyülekezeti egységek) — ⛔ BONTÁS-KULCSOK: a bontás-cellák
  // `egyseg:<uuid|anya>:<mezoId>` kulcsai a fenti szűrőkön idegen kulcsként
  // NÉMÁN kiesnének a teljes-csere mentésből. Érvényes bontás-kulcs = létező
  // mezoId + a gyülekezet valamelyik egysége (VAGY az anya-oszlop). Az
  // egység-listát a mentés elején kérjük le; hiányzó tábla (migráció előtt) →
  // üres halmaz: a bontás-kulcsok kimaradnak, a többi mentés fut.
  const ervenyesEgysegIds = new Set<string>()
  const vanBontasKulcs =
    Object.keys(input.kezi || {}).some((k) => parseEgysegMezoKulcs(k) !== null) ||
    Object.keys(input.felulirasok || {}).some((k) => parseEgysegMezoKulcs(k) !== null)
  if (vanBontasKulcs) {
    // Szándékosan az INAKTÍV egységek is benne vannak: egy egység
    // inaktiválása nem törölheti némán a korábban mentett bontás-celláit.
    const egysegekRes = await supabase
      .from('gyulekezeti_egysegek')
      .select('id')
      .eq('congregation_id', congregationId)
    if (egysegekRes.error) {
      if (!isMissingEgysegTabla(egysegekRes.error)) {
        // Váratlan hibánál MEGÁLLUNK: a teljes-csere mentés különben némán
        // törölné a korábban mentett bontás-cellákat (fail-closed).
        return {
          error:
            'A gyülekezeti egységek ellenőrzése nem sikerült, ezért a mentés nem történt meg ' +
            '(a gyülekezetenkénti bontás celláinak védelme miatt). Próbálja újra. Részletek: ' +
            egysegekRes.error.message,
        }
      }
    } else {
      ervenyesEgysegIds.add(ANYA_OSZLOP_ID)
      for (const s of (egysegekRes.data || []) as Array<{ id: string }>) ervenyesEgysegIds.add(s.id)
    }
  }

  const kezi: Record<string, number | string | null> = {}
  for (const [k, v] of Object.entries(sanitizeErtekek(input.kezi || {}))) {
    if (keziMezok.has(k)) {
      kezi[k] = v
    } else {
      const p = parseEgysegMezoKulcs(k)
      if (p && keziMezok.has(p.mezoId) && ervenyesEgysegIds.has(p.egysegId)) kezi[k] = v
    }
  }
  const felulirasok: Record<string, number | string | null> = {}
  for (const [k, v] of Object.entries(sanitizeErtekek(input.felulirasok || {}))) {
    // 2026-08-25 (jelentés-UX kör): a SZÁMOLT „együtt" mezők (I.4c–I.7c) a
    // katalógusban KÉZIK (auto: false), de a szerkesztő számolt mezőként
    // mutatja őket, és a felülírásuk a felulirasok rekordba megy — a szűrő
    // ezért őket is átengedi (különben a felülírás NÉMÁN elveszne).
    if (autoMezok.has(k) || SZARMAZTATOTT_EGYUTT_MEZOK.has(k)) {
      felulirasok[k] = v
    } else {
      const p = parseEgysegMezoKulcs(k)
      if (p && autoMezok.has(p.mezoId) && ervenyesEgysegIds.has(p.egysegId)) felulirasok[k] = v
    }
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
    const { data, bontas } = await buildJelentesData(supabase, congregationId, ev, row)
    const gyogyitoAt = row.veglegesitve_at || new Date().toISOString()
    const snapshot: Record<string, unknown> = {
      ...data,
      // 2026-08-25: a gyülekezetenkénti bontás is befagy (append-only kulcs —
      // a snapshot meglévő alakja nem változik, csak bővül).
      ...(bontas ? { bontas } : {}),
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
    const { data, bontas } = await buildJelentesData(supabase, congregationId, ev, row)
    const snapshot: Record<string, unknown> = {
      ...data,
      // 2026-08-25: a gyülekezetenkénti bontás is befagy (append-only kulcs —
      // a snapshot meglévő alakja nem változik, csak bővül). A bontás kézi
      // cellái / felülírásai a data.kezi / data.felulirasok részeként már
      // eleve a snapshotban vannak (egyseg:<id>:<mezoId> kulcsokkal).
      ...(bontas ? { bontas } : {}),
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

  // 2026-08-15 (Endre 4. szakasz — egységes véglegesítés): AZ INDOKLÁS KÖTELEZŐ,
  // mint a többi öt irat-típusnál (a leltár K5-#12-es mintája). Eddig üresen is
  // átment (`|| null`), így az esperes indoklás nélküli kérelmet kapott, amit
  // nem tudott elbírálni. A kliens-dialógus megkerülhető, ezért a szerver is őrzi.
  const trimmedReason = (reason || '').trim()
  if (trimmedReason.length < 10) {
    return {
      error:
        'Írja le legalább egy mondatban, miért kéri a jelentés feloldását — enélkül az egyházmegye nem tudja elbírálni a kérelmet.',
    }
  }

  const { data: upd, error } = await supabase
    .from('lelkeszi_jelentes')
    .update({ unlock_requested: true, unlock_reason: trimmedReason })
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
  //
  // 2026-08-09 (review-fix): a VISSZAKÜLDÖTT ('returned') jelentés KIVÉTEL —
  // azt az egyházmegye épp javításra küldte vissza, tehát újra beküldhető
  // (különben a visszaküldés-értesítés ígérete zsákutcába vinne).
  const submission = await loadSubmission(supabase, congregationId, ev)
  if (submission && submission.status !== 'submitted' && submission.status !== 'returned') {
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

/**
 * 2026-08-25 (jelentés-UX kör): a gyülekezet MENTETT jelentés-évei a dialógus
 * évválasztójához — könnyű lekérdezés (csak ev + statusz). A hívó ebből
 * építi az opciókat (az aktuális + az előző naptári év akkor is felkerül, ha
 * itt nem szerepel). Hiányzó tábla (migráció előtt) = üres lista, NEM hiba —
 * az évválasztó ilyenkor a minimum-készletet mutatja.
 */
export async function listJelentesEvek(): Promise<{
  evek?: Array<{ ev: number; statusz: 'szerkesztes' | 'veglegesitve' }>
  error?: string
}> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó vagy aktív gyülekezet.' }

  const { data, error } = await supabase
    .from('lelkeszi_jelentes')
    .select('ev, statusz')
    .eq('congregation_id', congregationId)
    .order('ev', { ascending: false })
  if (error) {
    if (isMissingJelentesTable(error)) return { evek: [] }
    return { error: `Hiba a jelentés-évek lekérdezésekor: ${error.message}` }
  }
  const evek: Array<{ ev: number; statusz: 'szerkesztes' | 'veglegesitve' }> = []
  for (const r of (data || []) as Array<{ ev: unknown; statusz: unknown }>) {
    const ev = Number(r.ev)
    if (!Number.isFinite(ev)) continue
    evek.push({ ev, statusz: r.statusz === 'veglegesitve' ? 'veglegesitve' : 'szerkesztes' })
  }
  return { evek }
}
