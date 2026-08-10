'use server'

import { createHash } from 'node:crypto'

import { cache } from 'react'

import type { SupabaseClient } from '@supabase/supabase-js'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import type { EnrichedMember, MemberRow, PaymentStatus } from '@/lib/constants/members'
import {
  allocateFamilyPayments,
  computeBaseExpectedForMemberYear,
  computeJarulekForMemberYear,
  isJarulekExcludedMemberStatus,
  type JarulekDiscountRule,
  type JarulekExemption,
  type JarulekPaymentLike,
  type JarulekYearSetting,
} from '@/lib/finance/jarulek-calculation'
// 2026-08-11 (5. kör, P3 #4): a járulék-besoroló pár közös forrása (web ⇄ desktop).
import {
  getPaymentGoalCode,
  isChurchMaintenanceCode,
  type PaymentGoalCodeRef,
} from '@kartoteka/ui-app'
import {
  familyListQuerySchema,
  memberListQuerySchema,
  type FamilyListItem,
  type FamilyListKpiSummary,
  type FamilyListPage,
  type FamilyListPerson,
  type FamilyListQuery,
  type HouseholdRole,
  type MemberFilterOptions,
  type MemberListItem,
  type MemberListKpiSummary,
  type MemberListPage,
  type MemberListQuery,
  type ParsedFamilyListQuery,
  type ParsedMemberListQuery,
} from '@/lib/members/registry-list-types'
import { ageFromDate, currentRegistryMonth, monthFromIsoDate } from '@/lib/utils/date'

/**
 * 2026-08-11 (P1-perf): 500 → 1000. A PostgREST/Supabase `db-max-rows` plafonja
 * 1000, tehát ez a legnagyobb oldal, amit egy körfordulóval le lehet kérni —
 * ugyanaz az érték, amit a `dashboard/page.tsx` lapozói is használnak. Ezzel a
 * szerveroldali körfordulók száma feleződik minden batchelt lekérdezésnél.
 */
const DB_BATCH_SIZE = 1000
const IN_FILTER_BATCH_SIZE = 100
const MAX_SERVER_SCAN_ROWS = 100_000
const CURSOR_VERSION = 1

type QueryError = { message: string }
type QueryPage<T> = { data: T[] | null; error: QueryError | null }
type NameRelation = { name: string | null }

type HouseholdRelation = {
  legacy_csalad_id: number | null
  isaktiv: boolean | null
  ervenyes_ig: string | null
}

type HouseholdTagRow = {
  id: string
  id_szemely: number
  szerep: HouseholdRole
  is_primary: boolean
  haztartas: HouseholdRelation | HouseholdRelation[] | null
}

type MemberHouseholdState = {
  familyId: number | null
  roles: Set<HouseholdRole>
}

type PaymentRow = JarulekPaymentLike & {
  id: number
  id_szemely: number | null
  id_csalad: number | null
  datum: string | null
  fizetettev: number | null
  osszeg: number
  stornozott?: boolean | null
  befizetescel?: PaymentGoalCodeRef | PaymentGoalCodeRef[]
}

type ExemptionRow = JarulekExemption & { id: number }

type FinancialContext = {
  currentYear: number
  currentPayments: PaymentRow[]
  exemptions: JarulekExemption[]
  exemptPersonIds: Set<number>
  exemptFamilyIds: Set<number>
  paidPersonIds: Set<number>
  paidFamilyIds: Set<number>
  everPaidPersonIds: Set<number>
  everPaidFamilyIds: Set<number>
  yearSettings: Record<number, JarulekYearSetting>
  discounts: JarulekDiscountRule[]
  /** 2026-07-17 (F5, Q6): a mód kivezetve — mindig 'akkori'. */
  debtCalcMode: 'akkori'
}

type CursorPayload = {
  v: number
  offset: number
  fingerprint: string
}

type PendingTransferRow = {
  id: string
  szemely_id: number
  created_at: string
  target_congregation:
    | { name: string | null; nev_hu: string | null }
    | Array<{ name: string | null; nev_hu: string | null }>
    | null
}

const huCollator = new Intl.Collator('hu', { numeric: true, sensitivity: 'base' })

function pickRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

/**
 * 2026-08-11 (5. kör, P3 #15): KÉT hibát javítottunk ebben a ciklusban.
 *
 *  (1) STOP-FELTÉTEL. A `page.length < DB_BATCH_SIZE` HIBÁS: ha a Supabase
 *      „Max Rows" beállítása a lapméret alá kerül, a szerver a kért lapra
 *      kevesebbet ad, és a ciklus az ELSŐ lap után kilépett volna — a teljes
 *      taglista, a járulék-befizetések és a felmentések NÉMÁN a felükre
 *      csökkennek, a lelkész pedig hihető, de hamis hátralék-listát lát.
 *      Csak az ÜRES lap a biztos stop.
 *
 *  (2) FIX LÉPÉSKÖZ. A `from += DB_BATCH_SIZE` ugyanebben az esetben ÁT IS
 *      UGROTT sorokat: 500-as szerver-plafonnál az első lap 0–499, a második
 *      kérés viszont az 500-as (helyesen) helyett a `DB_BATCH_SIZE`-nyival
 *      eltolt ablakot kérné. A lépésköz mostantól a TÉNYLEGESEN kapott sorszám.
 *
 * A biztonsági sorlimit (`MAX_SERVER_SCAN_ROWS`) változatlanul HANGOS hiba.
 *
 * HÁTRALÉVŐ: ez a helper `fetchPage(from, to)` callback-et vár, ezért a közös
 * `selectAllPaged`-re (@kartoteka/supabase-client) még nem cseréltük — az a 7
 * hívási hely átírását jelentené. Külön menetben érdemes.
 */
async function collectBatched<T>(
  label: string,
  fetchPage: (from: number, to: number) => Promise<QueryPage<T>>,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; from < MAX_SERVER_SCAN_ROWS; ) {
    const result = await fetchPage(from, from + DB_BATCH_SIZE - 1)
    if (result.error) {
      throw new Error(`${label}: ${result.error.message}`)
    }

    const page = result.data ?? []
    rows.push(...page)
    if (page.length === 0) return rows
    from += page.length
  }

  throw new Error(`${label}: a szerveroldali biztonsági sorlimit (${MAX_SERVER_SCAN_ROWS}) elfogyott.`)
}

function chunksOf<T>(items: T[], size = IN_FILTER_BATCH_SIZE): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function normalizeForSearch(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('hu-HU')
    .replace(/\s+/g, ' ')
    .trim()
}

function searchTokens(value: string) {
  return normalizeForSearch(value).split(' ').filter(Boolean)
}

function normalizeMemberStatus(value: string | null | undefined) {
  return normalizeForSearch(value).replace(/[\s_-]+/g, '')
}

function isMoved(member: Pick<MemberRow, 'member_status'>) {
  return normalizeMemberStatus(member.member_status) === 'elkoltozott'
}

function hasLeft(member: Pick<MemberRow, 'member_status'>) {
  return normalizeMemberStatus(member.member_status) === 'kitert'
}

function isReformed(member: Pick<MemberRow, 'vallas'>) {
  return normalizeForSearch(member.vallas) === 'reformatus'
}

function isActiveMember(member: EnrichedMember) {
  const status = normalizeMemberStatus(member.member_status)
  if (member.meghalt || isMoved(member) || hasLeft(member) || status === 'torolt') return false
  return isReformed(member) || member.hasEverPaid
}

// 2026-08-11 (5. kör, P3 #4): a `getPaymentGoalCode` / `isChurchMaintenanceCode` pár
// itteni MÁSOLATA törölve. Ez volt a négy példány közül az EGYETLEN, amelyik `??`-lal
// fűzte a fallback-láncot (`id_szamadasicel ?? szamadasicel.id ?? .kod`), a másik három
// `||`-lal. Egy üres sztring `id_szamadasicel` esetén emiatt a tagnyilvántartási karton
// „nem fizetett"-et mutatott volna arra a befizetésre, amit a Pénzügy modul járuléknak
// számol. A közös forrás — `@kartoteka/ui-app` — a megengedőbb `||` szemantikát viszi.

function cursorFingerprint(kind: 'members' | 'families', filters: unknown) {
  return createHash('sha256')
    .update(`${kind}:${JSON.stringify(filters)}`)
    .digest('base64url')
    .slice(0, 20)
}

function encodeCursor(offset: number, fingerprint: string) {
  const payload: CursorPayload = { v: CURSOR_VERSION, offset, fingerprint }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string | null | undefined, expectedFingerprint: string) {
  if (!cursor) return 0

  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<CursorPayload>
    if (
      payload.v !== CURSOR_VERSION ||
      !Number.isSafeInteger(payload.offset) ||
      Number(payload.offset) < 0 ||
      payload.fingerprint !== expectedFingerprint
    ) {
      throw new Error('invalid cursor')
    }
    return Number(payload.offset)
  } catch {
    throw new Error('A lapozási kurzor érvénytelen vagy más szűréshez tartozik.')
  }
}

function normalizeMemberRow(row: unknown): MemberRow {
  const raw = row as MemberRow & {
    adrstreet?: (NameRelation & { adrlocality?: NameRelation | NameRelation[] | null }) | Array<NameRelation & { adrlocality?: NameRelation | NameRelation[] | null }> | null
    adrlocality?: NameRelation | NameRelation[] | null
    birthLocality?: NameRelation | NameRelation[] | null
  }

  // 2026-07-17 (PR-1, település-P0): ha a c_helysegid-join üres (import-hiba
  // öröksége), a település az utca → adrstreet.localityid láncból pótlódik.
  const street = pickRelation(raw.adrstreet) as (NameRelation & { adrlocality?: NameRelation | NameRelation[] | null }) | null
  const streetLocality = street ? (pickRelation(street.adrlocality) as { name: string } | null) : null

  return {
    ...raw,
    // A jelenlegi production sémában a költözés a member_status mezőn él.
    elkoltozott: raw.elkoltozott ?? false,
    adrstreet: street ? { name: street.name as string } : null,
    adrlocality: (pickRelation(raw.adrlocality) as { name: string } | null) ?? streetLocality,
    birthLocality: pickRelation(raw.birthLocality) as { name: string } | null,
  }
}

/**
 * 2026-08-11 (P1-perf): React `cache()` — a `getEffectiveAccessContext` maga is
 * `cache()`-elt, ezért ugyanazon a szerver-körfordulón belül MINDIG ugyanazt a
 * supabase-példányt adja vissza; így a (supabase, congregationId) kulcs
 * megbízhatóan találatot ad. Ettől egy SSR-renderen belül a több hívó
 * (`getMembersPage`, `getMemberRegistrySnapshot`) EGYETLEN olvasáson osztozik.
 * Kliens-oldali szerver-akciók külön kérések, azokra ez nem hat — lásd a
 * `getMembersPage` fejlécében a lapozásról szóló megjegyzést.
 */
const loadMemberRows = cache(async (supabase: SupabaseClient, congregationId: string) => {
  return collectBatched<MemberRow>('Személyek lekérdezése sikertelen', async (from, to) => {
    const result = await supabase
      .from('szemely')
      .select(`
        id, cnp, csaladnev, k_nev, szcs_nev, namepattern, allapot, ferfi,
        sz_datum, sz_helyid, foglalkozas, vallas, telefon, email, meghalt,
        member_status, isvisible, photo_url, gdpr_consent_at, photo_consent,
        mailing_consent, social_profil_url, voter_eligible, voter_manual_override,
        type, befizetoev, id_apja, id_anyja, apjaneve, anyjaneve, megjegyzes,
        c_helysegid, c_utcaid, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto,
        congregation_id, adrstreet!c_utcaid(name, adrlocality!localityid(name)), adrlocality!c_helysegid(name),
        birthLocality:adrlocality!sz_helyid(name)
      `)
      .eq('congregation_id', congregationId)
      .eq('isvisible', true)
      .order('id', { ascending: true })
      .range(from, to)

    return {
      data: ((result.data ?? []) as unknown[]).map(normalizeMemberRow),
      error: result.error,
    }
  })
})

const loadHouseholdTags = cache(async (supabase: SupabaseClient, congregationId: string) => {
  return collectBatched<HouseholdTagRow>('Családi kapcsolatok lekérdezése sikertelen', async (from, to) => {
    const result = await supabase
      .from('haztartas_tag')
      .select('id, id_szemely, szerep, is_primary, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
      .eq('congregation_id', congregationId)
      .is('ervenyes_ig', null)
      .order('id', { ascending: true })
      .range(from, to)

    return { data: (result.data ?? []) as unknown as HouseholdTagRow[], error: result.error }
  })
})

function buildMemberHouseholdMap(tags: HouseholdTagRow[]) {
  const map = new Map<number, MemberHouseholdState>()
  const primaryMembers = new Set<number>()

  for (const tag of tags) {
    const household = pickRelation(tag.haztartas)
    if (!household || household.isaktiv !== true || household.ervenyes_ig != null) continue

    const current = map.get(tag.id_szemely) ?? { familyId: null, roles: new Set<HouseholdRole>() }
    current.roles.add(tag.szerep)

    if (household.legacy_csalad_id != null && (current.familyId == null || tag.is_primary)) {
      current.familyId = household.legacy_csalad_id
      if (tag.is_primary) primaryMembers.add(tag.id_szemely)
    } else if (primaryMembers.has(tag.id_szemely)) {
      // Egy másodlagos háztartás ne írja felül a már kiválasztott primary családot.
    }

    map.set(tag.id_szemely, current)
  }

  return map
}

/**
 * 2026-08-11 (P1-perf): a korábbi `loadMaintenancePayments` MINDEN év MINDEN
 * egyházfenntartási befizetését lehozta, a teljes oszlopkészlettel — pedig a
 * kettős szerepéből csak az egyik igényli a bő sorokat:
 *
 *  - az ÖSSZEG-alapú számítás (fizetett-státusz, családi felosztás, járulék)
 *    KIZÁRÓLAG a `fizetettev === currentYear` sorokat használja
 *    (lásd `loadFinancialContext` → `currentPayments`, `enrichMembers`),
 *  - az everPaid / aktív-tag besorolásnak viszont MINDEN év kell, de abból
 *    csak a fizető azonosítója (`id_szemely` / `id_csalad`).
 *
 * Ezért két lekérdezésre bontva: bő sorok CSAK a tárgyévre, és egy szűk
 * (3 oszlopos) azonosító-vetítés a teljes történelemre. Egy 10 éves,
 * évi ~1500 befizetéses gyülekezetnél ez ~15 000 bő sor helyett ~1 500 bő +
 * ~15 000 szűk sor — nagyjából a JSON-forgalom fele-harmada.
 *
 * A SZEMANTIKA VÁLTOZATLAN: ugyanaz a `deleted` szűrés, ugyanaz a 101.01%
 * jogcím-szűrés, és az everPaid továbbra is SZÁNDÉKOSAN tartalmazza a
 * stornózott befizetéseket is (bit-azonosan a tagnyilvantartas/actions.ts
 * everPaid-döntésével — a stornó könyvelési javítás, nem a történelmi
 * kapcsolódás törlése).
 */
type MaintenanceQueryShape = 'full' | 'payer-ids'

function buildMaintenanceQuery(
  supabase: SupabaseClient,
  congregationId: string,
  shape: MaintenanceQueryShape,
  databaseFiltered: boolean,
) {
  const columns = shape === 'full'
    ? 'id, id_szemely, id_csalad, datum, fizetettev, osszeg, stornozott'
    : 'id, id_szemely, id_csalad'

  // A beágyazott jogcím-tábla azért kell a select-be, mert a
  // `befizetescel.id_szamadasicel` szűrő csak így alkalmazható.
  const query = databaseFiltered
    ? supabase
        .from('befizetes')
        .select(`${columns}, befizetescel!inner(id_szamadasicel)`)
        .like('befizetescel.id_szamadasicel', '101.01%')
    : supabase
        .from('befizetes')
        .select(`${columns}, befizetescel(id_szamadasicel)`)

  return query
    .eq('congregation_id', congregationId)
    .or('deleted.eq.false,deleted.is.null')
}

async function loadMaintenancePayments(
  supabase: SupabaseClient,
  congregationId: string,
  options: { shape: MaintenanceQueryShape; year?: number },
) {
  const label = options.shape === 'full'
    ? 'Egyházfenntartási befizetések lekérdezése sikertelen'
    : 'Korábbi egyházfenntartási befizetők lekérdezése sikertelen'

  const load = (databaseFiltered: boolean) => collectBatched<PaymentRow>(
    label,
    async (from, to) => {
      let query = buildMaintenanceQuery(supabase, congregationId, options.shape, databaseFiltered)
      if (options.year != null) query = query.eq('fizetettev', options.year)

      // FIGYELEM: `shape: 'payer-ids'` esetén a sorokon CSAK az
      // id / id_szemely / id_csalad mező van kitöltve — a `PaymentRow` típus
      // közös, de az összeg-alapú mezőket ilyenkor TILOS olvasni.
      const result = await query.order('id', { ascending: true }).range(from, to)
      return { data: (result.data ?? []) as unknown as PaymentRow[], error: result.error }
    },
  )

  try {
    return await load(true)
  } catch (error) {
    console.warn(
      '[registry-list] A beágyazott PostgREST kódszűrés nem elérhető; szerveroldali kódszűrésre váltunk.',
      error instanceof Error ? error.message : error,
    )
    const rows = await load(false)
    return rows.filter((row) => isChurchMaintenanceCode(getPaymentGoalCode(row.befizetescel)))
  }
}

async function loadExemptions(supabase: SupabaseClient, congregationId: string) {
  const rows = await collectBatched<ExemptionRow>('Felmentések lekérdezése sikertelen', async (from, to) => {
    const result = await supabase
      .from('felmentes')
      .select('id, id_szemely, id_csalad, kezdete, vege')
      .eq('congregation_id', congregationId)
      .order('id', { ascending: true })
      .range(from, to)
    return { data: (result.data ?? []) as ExemptionRow[], error: result.error }
  })

  return rows
}

async function loadDiscounts(supabase: SupabaseClient, congregationId: string, currentYear: number) {
  const result = await supabase
    .from('jarulek_kedvezmeny')
    .select('id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
    .eq('congregation_id', congregationId)
    .eq('ev', currentYear)
    .eq('aktiv', true)
    .order('sorrend', { ascending: true })

  let discountData = result.data as Array<Record<string, unknown>> | null
  if (result.error) {
    const retry = await supabase
      .from('jarulek_kedvezmeny')
      .select('id, ev, tipus, aktiv, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
      .eq('congregation_id', congregationId)
      .eq('ev', currentYear)
      .eq('aktiv', true)
      .order('sorrend', { ascending: true })
    if (retry.error) {
      console.warn('[registry-list] A járulékkedvezmények nem olvashatók:', retry.error.message)
      return []
    }
    discountData = retry.data as Array<Record<string, unknown>> | null
  }

  return ((discountData ?? []) as unknown as JarulekDiscountRule[]).map((row) => ({
    ...row,
    ev: Number(row.ev),
    aktiv: row.aktiv !== false,
    kedv_osszeg: row.kedv_osszeg == null ? null : Number(row.kedv_osszeg) || 0,
    kor_tol: row.kor_tol == null ? null : Number(row.kor_tol) || 0,
    szazalek: row.szazalek == null ? null : Number(row.szazalek) || 0,
    fix_osszeg: row.fix_osszeg == null ? null : Number(row.fix_osszeg) || 0,
  }))
}

const loadFinancialContext = cache(async (
  supabase: SupabaseClient,
  congregationId: string,
): Promise<FinancialContext> => {
  const currentYear = new Date().getFullYear()
  const [yearPayments, everPaidRows, exemptionRows, settingsResult, discounts] = await Promise.all([
    // Bő sorok — CSAK a tárgyév (összeg-alapú számításokhoz).
    loadMaintenancePayments(supabase, congregationId, { shape: 'full', year: currentYear }),
    // Szűk azonosító-vetítés — MINDEN év (everPaid / aktív-tag besorolás).
    loadMaintenancePayments(supabase, congregationId, { shape: 'payer-ids' }),
    loadExemptions(supabase, congregationId),
    supabase
      .from('bealitas')
      .select('id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid')
      .eq('congregation_id', congregationId)
      .eq('id', String(currentYear)),
    loadDiscounts(supabase, congregationId, currentYear),
    // 2026-07-17 (F5, Q6): a congregations.tartozas_szamitas_mod lekérdezés törölve —
    // a mód kivezetve; ráadásul egy már olvasatlan lekérdezés hibája dobta volna el
    // az egész névjegyzék-listát.
  ])

  if (settingsResult.error) throw new Error(`Járulékbeállítások lekérdezése sikertelen: ${settingsResult.error.message}`)

  // 2026-07-17 (F1-4): a stornózott befizetés a FIZETETT-státuszba és a számításba nem
  // számít bele, de az everPaid (aktív-tag besorolás) SZÁNDÉKOSAN stornóval együtt épül —
  // a stornó könyvelési javítás, nem a történelmi kapcsolódás törlése (a tagnyilvantartas
  // oldal everPaid-szemantikájával bit-azonosan).
  // 2026-08-11: a `fizetettev === currentYear` szűrés már a szerveren megtörtént,
  // itt csak a stornó-kizárás marad (a feltétel eredménye változatlan).
  const currentPayments = yearPayments.filter((payment) => !payment.stornozott)
  const paidPersonIds = new Set<number>()
  const paidFamilyIds = new Set<number>()
  const everPaidPersonIds = new Set<number>()
  const everPaidFamilyIds = new Set<number>()

  for (const payment of everPaidRows) {
    if (payment.id_szemely != null) everPaidPersonIds.add(payment.id_szemely)
    if (payment.id_csalad != null) everPaidFamilyIds.add(payment.id_csalad)
  }

  for (const payment of currentPayments) {
    if (payment.id_szemely != null) paidPersonIds.add(payment.id_szemely)
    if (payment.id_csalad != null) paidFamilyIds.add(payment.id_csalad)
  }

  const exemptPersonIds = new Set<number>()
  const exemptFamilyIds = new Set<number>()
  for (const exemption of exemptionRows) {
    if (currentYear < (exemption.kezdete || 0) || currentYear > (exemption.vege || 2099)) continue
    if (exemption.id_szemely != null) exemptPersonIds.add(exemption.id_szemely)
    if (exemption.id_csalad != null) exemptFamilyIds.add(exemption.id_csalad)
  }

  const yearSettings: Record<number, JarulekYearSetting> = {}
  for (const row of settingsResult.data ?? []) {
    const year = Number(row.id)
    yearSettings[year] = {
      year,
      eves_jarulek: Number(row.eves_jarulek) || 0,
      jarulek_kedvezmenyes: row.jarulek_kedvezmenyes == null ? null : Number(row.jarulek_kedvezmenyes) || 0,
      jarulek_hatarid: row.jarulek_hatarid || null,
    }
  }

  return {
    currentYear,
    currentPayments,
    exemptions: exemptionRows,
    exemptPersonIds,
    exemptFamilyIds,
    paidPersonIds,
    paidFamilyIds,
    everPaidPersonIds,
    everPaidFamilyIds,
    yearSettings,
    discounts,
    // 2026-07-17 (F5, Q6): a tartozas_szamitas_mod kivezetve — mindig 'akkori'.
    debtCalcMode: 'akkori',
  }
})

function enrichMembers(
  members: MemberRow[],
  householdByMember: Map<number, MemberHouseholdState>,
  financial: FinancialContext,
) {
  // 2026-07-17 (F5, Q7): a tisztán családi befizetések felosztása a tagok közt
  // (idősebb előbb, alap-elvárásig) — bit-azonos a Tartozás-listával.
  // A roster a KANONIKUS kizárt-státusz predikátummal szűr (bit-azonos a Tartozás-listával).
  const allocationMembers = members
    .filter((m) => !m.meghalt && !isJarulekExcludedMemberStatus(m.member_status))
    .map((m) => ({
      id: m.id,
      sz_datum: m.sz_datum,
      familyId: householdByMember.get(m.id)?.familyId ?? null,
      foglalkozas: m.foglalkozas,
    }))
  const allocatedPayments = allocateFamilyPayments(financial.currentPayments, allocationMembers, (mem, y) =>
    computeBaseExpectedForMemberYear({
      member: mem,
      year: y,
      currentYear: financial.currentYear,
      debtCalcMode: financial.debtCalcMode,
      yearSettings: financial.yearSettings,
      discounts: financial.discounts,
      exemptions: financial.exemptions,
    }),
  )

  return members.map((member): EnrichedMember => {
    const familyId = householdByMember.get(member.id)?.familyId ?? null
    const jarulek = computeJarulekForMemberYear({
      member: {
        id: member.id,
        sz_datum: member.sz_datum,
        familyId,
        foglalkozas: member.foglalkozas,
      },
      year: financial.currentYear,
      currentYear: financial.currentYear,
      debtCalcMode: financial.debtCalcMode,
      yearSettings: financial.yearSettings,
      discounts: financial.discounts,
      exemptions: financial.exemptions,
      payments: allocatedPayments,
    })

    let paymentStatus: PaymentStatus = 'hatralekos'
    if (member.meghalt) paymentStatus = 'elhunyt'
    else if (isMoved(member)) paymentStatus = 'elkoltozott'
    else if (hasLeft(member)) paymentStatus = 'kitert'
    else if (
      financial.exemptPersonIds.has(member.id) ||
      (familyId != null && financial.exemptFamilyIds.has(familyId))
    ) paymentStatus = 'felmentett'
    // 2026-07-17 (F5, Q7): a paidPersonIds/paidFamilyIds ÖSSZEG-VAK ágak törölve a
    // rendezve-döntésből — a családi felosztás után épp ezek hozták volna vissza a
    // régi „egy családi befizetés mindenkit rendez" szemantikát.
    else if (jarulek.expected === 0 || jarulek.paid >= jarulek.expected) paymentStatus = 'rendezve'

    return {
      ...member,
      familyId,
      paymentStatus,
      pendingTransfer: null,
      hasEverPaid:
        financial.everPaidPersonIds.has(member.id) ||
        (familyId != null && financial.everPaidFamilyIds.has(familyId)),
    }
  })
}

const loadMemberUniverse = cache(async (supabase: SupabaseClient, congregationId: string) => {
  const [members, householdTags, financial] = await Promise.all([
    loadMemberRows(supabase, congregationId),
    loadHouseholdTags(supabase, congregationId),
    loadFinancialContext(supabase, congregationId),
  ])
  const householdByMember = buildMemberHouseholdMap(householdTags)
  return { members: enrichMembers(members, householdByMember, financial), householdByMember }
})

function memberMatchesStatus(member: EnrichedMember, status: ParsedMemberListQuery['status']) {
  switch (status) {
    case 'mind':
      return true
    case 'aktív':
      return isActiveMember(member)
    case 'meghalt':
      return member.meghalt
    case 'elkoltozott':
      return isMoved(member)
    case 'kitert':
      return hasLeft(member)
    case 'mas_vallasu':
      return !member.meghalt && Boolean(member.vallas?.trim()) && !isReformed(member)
    case 'lebego':
      return member.familyId == null && !member.meghalt && !isMoved(member)
  }
}

function memberMatchesQuery(member: EnrichedMember, tokens: string[]) {
  if (tokens.length === 0) return true

  const address = [
    member.adrlocality?.name,
    member.adrstreet?.name,
    member.c_szam,
    member.c_tombhaz,
    member.c_lepcsohaz,
    member.c_emelet,
    member.c_ajto,
  ].filter(Boolean).join(' ')

  const haystack = normalizeForSearch([
    member.csaladnev,
    member.k_nev,
    member.szcs_nev,
    member.namepattern,
    address,
    member.telefon,
    member.email,
    member.cnp,
    member.foglalkozas,
    member.vallas,
  ].filter(Boolean).join(' '))

  return tokens.every((token) => haystack.includes(token))
}

function filterMembers(
  members: EnrichedMember[],
  householdByMember: Map<number, MemberHouseholdState>,
  query: ParsedMemberListQuery,
) {
  const tokens = searchTokens(query.search)
  const locality = normalizeForSearch(query.locality)
  const religion = normalizeForSearch(query.religion)

  return members.filter((member) => {
    if (!memberMatchesQuery(member, tokens)) return false
    if (!memberMatchesStatus(member, query.status)) return false

    const age = ageFromDate(member.sz_datum)
    if (query.ageMin != null && (age == null || age < query.ageMin)) return false
    if (query.ageMax != null && (age == null || age > query.ageMax)) return false
    if (
      query.birthdayMonth != null
      && (member.meghalt || monthFromIsoDate(member.sz_datum) !== query.birthdayMonth)
    ) return false

    if (query.gender === 'male' && member.ferfi !== true) return false
    if (query.gender === 'female' && member.ferfi !== false) return false
    if (query.gender === 'unknown' && member.ferfi != null) return false
    if (locality && normalizeForSearch(member.adrlocality?.name) !== locality) return false
    if (religion && normalizeForSearch(member.vallas) !== religion) return false

    const household = householdByMember.get(member.id)
    if (query.family === 'with-family' && household?.familyId == null) return false
    if (query.family === 'without-family' && household?.familyId != null) return false
    if (query.payment !== 'all' && member.paymentStatus !== query.payment) return false

    const hasPhone = Boolean(member.telefon?.trim())
    const hasEmail = Boolean(member.email?.trim())
    if (query.contact === 'phone' && !hasPhone) return false
    if (query.contact === 'email' && !hasEmail) return false
    if (query.contact === 'both' && (!hasPhone || !hasEmail)) return false
    if (query.contact === 'missing' && (hasPhone || hasEmail)) return false
    return true
  })
}

function memberName(member: EnrichedMember) {
  return `${member.csaladnev ?? ''} ${member.k_nev ?? ''}`.trim()
}

function compareNullableNumber(left: number | null, right: number | null, direction: 1 | -1) {
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  return (left - right) * direction
}

function memberAddress(member: EnrichedMember) {
  return [member.adrlocality?.name, member.adrstreet?.name, member.c_szam].filter(Boolean).join(' ')
}

function sortMembers(
  members: EnrichedMember[],
  sort: ParsedMemberListQuery['sort'],
  direction: ParsedMemberListQuery['direction'],
) {
  const multiplier = direction === 'asc' ? 1 : -1
  return [...members].sort((left, right) => {
    let comparison = 0
    switch (sort) {
      case 'name':
        comparison = huCollator.compare(memberName(left), memberName(right))
        break
      case 'id':
        comparison = left.id - right.id
        break
      case 'age':
        comparison = compareNullableNumber(ageFromDate(left.sz_datum), ageFromDate(right.sz_datum), 1)
        break
      case 'birth':
        comparison = huCollator.compare(left.sz_datum ?? '', right.sz_datum ?? '')
        break
      case 'address':
        comparison = huCollator.compare(memberAddress(left), memberAddress(right))
        break
      case 'job':
        comparison = huCollator.compare(left.foglalkozas ?? '', right.foglalkozas ?? '')
        break
    }
    return comparison * multiplier || left.id - right.id
  })
}

function summarizeMembers(
  members: EnrichedMember[],
  birthdayMonth = currentRegistryMonth(),
): MemberListKpiSummary {
  return {
    scope: 'filtered',
    members: members.length,
    active: members.filter(isActiveMember).length,
    deceased: members.filter((member) => member.meghalt).length,
    moved: members.filter(isMoved).length,
    withoutFamily: members.filter((member) => member.familyId == null).length,
    paidUp: members.filter((member) => member.paymentStatus === 'rendezve').length,
    inArrears: members.filter((member) => member.paymentStatus === 'hatralekos').length,
    men: members.filter((member) => member.ferfi === true).length,
    women: members.filter((member) => member.ferfi === false).length,
    birthdaysThisMonth: members.filter((member) => {
      if (member.meghalt || !member.sz_datum) return false
      return monthFromIsoDate(member.sz_datum) === birthdayMonth
    }).length,
  }
}

/**
 * Szűréstől független felső KPI-snapshot a személyek munkafelületéhez.
 * A részmutatók ugyanabból a teljes gyülekezeti univerzumból indulnak,
 * az aktív tagokra vonatkozó szabályokkal egyezően.
 */
export async function getMemberRegistrySnapshot(): Promise<{
  total: number
  active: number
  birthdays: number
  floating: number
}> {
  const { supabase, congregationId, user } = await getEffectiveCongregationContext()
  if (!user || !congregationId) {
    return { total: 0, active: 0, birthdays: 0, floating: 0 }
  }

  const universe = await loadMemberUniverse(supabase, congregationId)
  const summary = summarizeMembers(universe.members.filter(isActiveMember))
  return {
    total: universe.members.length,
    active: summary.active,
    birthdays: summary.birthdaysThisMonth,
    floating: summary.withoutFamily,
  }
}

function toMemberListItem(member: EnrichedMember): MemberListItem {
  return {
    ...member,
    // A legacy listaavatar ugyanazt az URL-t kaphatja, base64 mezőt nem olvasunk.
    kep: member.photo_url,
  }
}

async function hydratePendingTransfers(
  supabase: SupabaseClient,
  congregationId: string,
  members: EnrichedMember[],
) {
  if (members.length === 0) return members

  const result = await supabase
    .from('member_transfer_notifications')
    .select('id, szemely_id, created_at, target_congregation:congregations!target_congregation_id(name, nev_hu)')
    .eq('source_congregation_id', congregationId)
    .eq('status', 'pending')
    .in('szemely_id', members.map((member) => member.id))

  if (result.error) {
    console.warn('[registry-list] A folyamatban lévő átjelentkezések nem olvashatók:', result.error.message)
    return members
  }

  const transfers = new Map<number, EnrichedMember['pendingTransfer']>()
  for (const row of (result.data ?? []) as unknown as PendingTransferRow[]) {
    const congregation = pickRelation(row.target_congregation)
    transfers.set(row.szemely_id, {
      id: row.id,
      target_congregation_name: congregation?.nev_hu || congregation?.name || 'Ismeretlen célgyülekezet',
      created_at: row.created_at,
    })
  }

  return members.map((member) => ({
    ...member,
    pendingTransfer: transfers.get(member.id) ?? null,
  }))
}

/**
 * Legfeljebb 50 személyt ad vissza. A kurzor a validált szűréshez van kötve,
 * ezért egy régi kurzor nem használható más kereséssel vagy rendezéssel.
 *
 * A paymentStatus, aktív tagság és háztartási szerep több táblából
 * számított mező. Migráció/RPC nélkül ezeket a szerver batchelt,
 * determinisztikus olvasással értékeli ki; a teljes lista sosem kerül a kliensre.
 *
 * ─────────────────────────────────────────────────────────────────
 * 2026-08-11 — MIÉRT MARAD a szűrés/rendezés JS-ben (P1-perf vizsgálat)
 * ─────────────────────────────────────────────────────────────────
 * A kézenfekvő javítás az lenne, hogy a szűrés + rendezés + LIMIT/OFFSET
 * átkerül Postgresbe. Végignézve MINDEN szűrőt, ez a jelenlegi sémán NEM
 * tehető meg úgy, hogy az eredmény bit-azonos maradjon:
 *
 *  1. KERESÉS — a `normalizeForSearch` NFD-vel leszedi az ékezeteket, majd
 *     `hu-HU` kisbetűsít, és a tokenek AND-kapcsolatban illeszkednek 10 mezőre
 *     (köztük a joinolt település- és utcanévre). A PostgREST `ilike`/`or`
 *     NEM tud ékezet-érzéketlen illesztést (ahhoz `unaccent`-es generált
 *     oszlop vagy `search_vector` kellene) — „Szocs" ma megtalálja a
 *     „Szőcs"-öt, szerveroldalon nem találná.
 *  2. RENDEZÉS — `Intl.Collator('hu', { sensitivity: 'base' })`. A PostgREST
 *     `.order()` nem tud COLLATE-et megadni, az adatbázis alapértelmezett
 *     (C/en_US) rendezése pedig a magyar ábécétől eltérő sorrendet ad.
 *  3. PÉNZÜGYI ÁLLAPOT (`payment` szűrő + a Pénzügy oszlop) — az
 *     `allocateFamilyPayments` a tisztán családi befizetéseket a TELJES
 *     gyülekezeti roszteren osztja szét, tehát egyetlen tag állapota is a
 *     többi tag adatától függ. Bármilyen szerveroldali elő-szűrés megváltoztatná
 *     a rosztert, és ezzel a kiszámolt állapotot is.
 *  4. AKTÍV TAG (az ALAPÉRTELMEZETT szűrő) — `reformatus || hasEverPaid`,
 *     ahol a `hasEverPaid` a `befizetes` tábla + a családi kapcsolat együttese.
 *  5. KPI-ÖSSZESÍTŐ — a `summary` a teljes SZŰRT halmazra vonatkozik, tehát a
 *     50 elemű oldal önmagában akkor sem lenne elég, ha a lapozás szerveroldali
 *     lenne.
 *  6. ÉLETKOR / SZÜLETÉSNAP-HÓNAP — `ageFromDate` és `monthFromIsoDate`
 *     szemantikáját dátum-tartománnyá alakítani év-fordulón hibázik.
 *
 * Amit HELYETTE megtettünk (mérhető, viselkedés-semleges):
 *  - a befizetés-olvasás tárgyévre szűkítve, a történelmi rész 3 oszlopos
 *    azonosító-vetítésre fogyva (lásd `loadMaintenancePayments`),
 *  - `DB_BATCH_SIZE` 500 → 1000 (feleannyi körfordulás),
 *  - `cache()` a betöltőkön (egy SSR-render = egy olvasás),
 *  - a szűrő-legördülők külön, 2 mezős lekérdezést kaptak,
 *  - az Excel-export egyetlen hívássá vonva (`getMembersForExport`) a korábbi
 *    50-esével lapozó, hívásonként teljes univerzumot olvasó ciklus helyett.
 *
 * A TELJES megoldáshoz migráció kell: `unaccent`-es `search_vector` oszlop +
 * magyar COLLATE-es rendezőkulcs + a pénzügyi állapotot előszámoló nézet/RPC.
 * Amíg ez nincs meg, a szűrés SZÁNDÉKOSAN marad JS-ben.
 */
export async function getMembersPage(input: MemberListQuery = {}): Promise<MemberListPage> {
  const parsed = memberListQuerySchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Érvénytelen személyszűrés.')
  }

  const { supabase, congregationId, user } = await getEffectiveCongregationContext()
  if (!user || !congregationId) {
    return {
      members: [],
      totalCount: 0,
      filteredCount: 0,
      pageSize: parsed.data.pageSize,
      hasMore: false,
      nextCursor: null,
      nextOffset: null,
      summary: summarizeMembers([]),
    }
  }

  const { cursor, pageSize, ...filters } = parsed.data
  const fingerprint = cursorFingerprint('members', filters)
  const offset = decodeCursor(cursor, fingerprint)
  const universe = await loadMemberUniverse(supabase, congregationId)
  const filtered = sortMembers(
    filterMembers(universe.members, universe.householdByMember, parsed.data),
    parsed.data.sort,
    parsed.data.direction,
  )
  const pageMembers = await hydratePendingTransfers(
    supabase,
    congregationId,
    filtered.slice(offset, offset + pageSize),
  )
  const page = pageMembers.map(toMemberListItem)
  const candidateNextOffset = offset + page.length
  const hasMore = candidateNextOffset < filtered.length

  return {
    members: page,
    totalCount: universe.members.length,
    filteredCount: filtered.length,
    pageSize,
    hasMore,
    nextCursor: hasMore ? encodeCursor(candidateNextOffset, fingerprint) : null,
    nextOffset: hasMore ? candidateNextOffset : null,
    summary: summarizeMembers(filtered, parsed.data.birthdayMonth ?? currentRegistryMonth()),
  }
}

/** Az Excel-exportban egyszerre visszaadható személyek felső korlátja. */
const MAX_EXPORT_ROWS = 20_000

/**
 * 2026-08-11 (P1-perf): a szűrt lista EGYETLEN hívásban, az Excel-exporthoz.
 *
 * A `persons-tab.tsx` exportja korábban a `getMembersPage`-et hívta körbe-körbe
 * 50-es lapokkal. Mivel a `pageSize` a séma szerint fix 50 (`z.literal(50)`),
 * egy 2000 fős gyülekezet exportja 40 szerver-akciót jelentett, és MINDEGYIK
 * újra betöltötte a teljes tag-univerzumot (személyek + háztartások +
 * befizetések) — nagyságrendileg 40 × ~20 adatbázis-körfordulás.
 *
 * Ez a művelet ugyanazt a validált szűrést és rendezést használja, mint a
 * lista (bit-azonos eredmény), csak lapozás nélkül. A folyamatban lévő
 * átjelentkezéseket NEM tölti be (`hydratePendingTransfers`): az export
 * oszlopai között nem szerepel, az `enrichMembers` pedig eleve `null`-t ad.
 */
export async function getMembersForExport(input: MemberListQuery = {}): Promise<{
  members: MemberListItem[]
  truncated: boolean
}> {
  const parsed = memberListQuerySchema.safeParse({ ...input, cursor: null })
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Érvénytelen személyszűrés.')
  }

  const { supabase, congregationId, user } = await getEffectiveCongregationContext()
  if (!user || !congregationId) return { members: [], truncated: false }

  const universe = await loadMemberUniverse(supabase, congregationId)
  const filtered = sortMembers(
    filterMembers(universe.members, universe.householdByMember, parsed.data),
    parsed.data.sort,
    parsed.data.direction,
  )

  const truncated = filtered.length > MAX_EXPORT_ROWS
  return {
    members: filtered.slice(0, MAX_EXPORT_ROWS).map(toMemberListItem),
    truncated,
  }
}

type HouseholdRow = {
  id: string
  isaktiv: boolean
  id_csoport: number | null
  legacy_csalad_id: number
  id_cim: string | null
}

type FamilyTagPerson = FamilyListPerson
type RawFamilyTagPerson = Omit<FamilyListPerson, 'kep'> & { photo_url: string | null }

type FamilyTagRow = {
  id: string
  id_haztartas: string
  szerep: HouseholdRole
  is_primary: boolean
  szemely: RawFamilyTagPerson | RawFamilyTagPerson[] | null
}

type AddressRow = {
  id: string
  szam: string | null
  id_utca: number | null
}

type LegacyFamilyAddressRow = {
  id: number
  c_utcaid: number | null
  c_szam: string | null
}

type StreetRow = { id: number; name: string }
type DistrictRow = { id: number; nev: string }

type FamilyCandidate = {
  item: FamilyListItem
  memberNames: string
  adultCount: number
  living: boolean
  allAdultsDeceased: boolean
  headName: string
  spouseName: string
}

async function loadHouseholds(supabase: SupabaseClient, congregationId: string) {
  return collectBatched<HouseholdRow>('Háztartások lekérdezése sikertelen', async (from, to) => {
    const result = await supabase
      .from('haztartas')
      .select('id, isaktiv, id_csoport, legacy_csalad_id, id_cim')
      .eq('congregation_id', congregationId)
      .is('ervenyes_ig', null)
      .not('legacy_csalad_id', 'is', null)
      .order('legacy_csalad_id', { ascending: true })
      .range(from, to)
    return { data: (result.data ?? []) as unknown as HouseholdRow[], error: result.error }
  })
}

async function loadFamilyTags(supabase: SupabaseClient, congregationId: string) {
  return collectBatched<FamilyTagRow>('Háztartási tagok lekérdezése sikertelen', async (from, to) => {
    const result = await supabase
      .from('haztartas_tag')
      .select(`
        id, id_haztartas, szerep, is_primary,
        szemely:szemely!id_szemely(
          id, csaladnev, k_nev, ferfi, sz_datum, allapot, meghalt, namepattern, vallas, photo_url
        )
      `)
      .eq('congregation_id', congregationId)
      .is('ervenyes_ig', null)
      .order('id', { ascending: true })
      .range(from, to)
    return { data: (result.data ?? []) as unknown as FamilyTagRow[], error: result.error }
  })
}

async function loadAddressesByIds(
  supabase: SupabaseClient,
  congregationId: string,
  ids: string[],
) {
  const rows: AddressRow[] = []
  for (const chunk of chunksOf(Array.from(new Set(ids)))) {
    const result = await supabase
      .from('cim')
      .select('id, szam, id_utca')
      .eq('congregation_id', congregationId)
      .in('id', chunk)
    if (result.error) throw new Error(`Címek lekérdezése sikertelen: ${result.error.message}`)
    rows.push(...((result.data ?? []) as AddressRow[]))
  }
  return rows
}

async function loadLegacyFamilyAddresses(supabase: SupabaseClient, ids: number[]) {
  const rows: LegacyFamilyAddressRow[] = []
  for (const chunk of chunksOf(Array.from(new Set(ids)))) {
    const result = await supabase
      .from('csalad')
      .select('id, c_utcaid, c_szam')
      .in('id', chunk)
    if (result.error) throw new Error(`Legacy családi címek lekérdezése sikertelen: ${result.error.message}`)
    rows.push(...((result.data ?? []) as LegacyFamilyAddressRow[]))
  }
  return rows
}

async function loadStreetsByIds(supabase: SupabaseClient, ids: number[]) {
  const rows: StreetRow[] = []
  for (const chunk of chunksOf(Array.from(new Set(ids)))) {
    const result = await supabase
      .from('adrstreet')
      .select('id, name')
      .in('id', chunk)
    if (result.error) throw new Error(`Utcák lekérdezése sikertelen: ${result.error.message}`)
    rows.push(...((result.data ?? []) as StreetRow[]))
  }
  return rows
}

async function loadDistrictsByIds(
  supabase: SupabaseClient,
  congregationId: string,
  ids: number[],
) {
  const rows: DistrictRow[] = []
  for (const chunk of chunksOf(Array.from(new Set(ids)))) {
    const result = await supabase
      .from('csoport')
      .select('id, nev')
      .eq('congregation_id', congregationId)
      .in('id', chunk)
    if (result.error) throw new Error(`Körzetek lekérdezése sikertelen: ${result.error.message}`)
    rows.push(...((result.data ?? []) as DistrictRow[]))
  }
  return rows
}

function familyPersonName(person: FamilyTagPerson) {
  return `${person.csaladnev ?? ''} ${person.k_nev ?? ''}`.trim()
}

function buildFamilyCandidates(
  households: HouseholdRow[],
  familyTags: FamilyTagRow[],
  addresses: AddressRow[],
  legacyAddresses: LegacyFamilyAddressRow[],
  streets: StreetRow[],
  districts: DistrictRow[],
) {
  const addressById = new Map(addresses.map((address) => [address.id, address]))
  const legacyAddressById = new Map(legacyAddresses.map((address) => [address.id, address]))
  const streetById = new Map(streets.map((street) => [street.id, street.name]))
  const districtById = new Map(districts.map((district) => [district.id, district.nev]))
  const tagsByHousehold = new Map<string, FamilyTagRow[]>()

  for (const tag of familyTags) {
    const list = tagsByHousehold.get(tag.id_haztartas) ?? []
    list.push(tag)
    tagsByHousehold.set(tag.id_haztartas, list)
  }

  return households.map((household): FamilyCandidate => {
    const tags = tagsByHousehold.get(household.id) ?? []
    const uniquePeople = new Map<number, { person: FamilyTagPerson; roles: Set<HouseholdRole> }>()

    for (const tag of tags) {
      const rawPerson = pickRelation(tag.szemely)
      if (!rawPerson) continue
      const { photo_url: photoUrl, ...personFields } = rawPerson
      const person: FamilyTagPerson = { ...personFields, kep: photoUrl }
      const current = uniquePeople.get(person.id) ?? { person, roles: new Set<HouseholdRole>() }
      current.roles.add(tag.szerep)
      uniquePeople.set(person.id, current)
    }

    const adults = Array.from(uniquePeople.values())
      .filter(({ roles }) => roles.has('csaladfo') || roles.has('hazastars'))
      .map(({ person }) => person)
    const children = Array.from(uniquePeople.values())
      .filter(({ roles }) => roles.has('gyermek') || roles.has('unoka'))
      .map(({ person }) => ({
        id: person.id,
        csaladnev: person.csaladnev,
        k_nev: person.k_nev,
        sz_datum: person.sz_datum,
        meghalt: person.meghalt,
        kep: person.kep ?? null,
      }))
      .sort((left, right) => (left.sz_datum || '9999').localeCompare(right.sz_datum || '9999'))

    const ferfi = adults.find((person) => person.ferfi === true) ?? null
    const no = adults.find((person) => person.ferfi === false) ?? null
    const head = Array.from(uniquePeople.values()).find(({ roles }) => roles.has('csaladfo'))?.person ?? null
    const spouse = Array.from(uniquePeople.values()).find(({ roles }) => roles.has('hazastars'))?.person ?? null
    const primaryAdultRaw = tags
      .filter((tag) => tag.is_primary && (tag.szerep === 'csaladfo' || tag.szerep === 'hazastars'))
      .map((tag) => pickRelation(tag.szemely))
      .find((person) => person != null)
    const primaryAdult = primaryAdultRaw ? uniquePeople.get(primaryAdultRaw.id)?.person ?? null : null
    const displayName = primaryAdult?.csaladnev || ferfi?.csaladnev || no?.csaladnev || children[0]?.csaladnev || 'Névtelen család'

    const currentAddress = household.id_cim ? addressById.get(household.id_cim) ?? null : null
    const legacyAddress = legacyAddressById.get(household.legacy_csalad_id) ?? null
    const streetId = currentAddress?.id_utca ?? legacyAddress?.c_utcaid ?? null
    const houseNumber = currentAddress?.szam ?? legacyAddress?.c_szam ?? null
    const streetName = streetId == null ? null : streetById.get(streetId) ?? null
    const memberNames = Array.from(uniquePeople.values()).map(({ person }) => familyPersonName(person)).join(' ')
    const living = adults.some((person) => !person.meghalt)
    const allAdultsDeceased = adults.length > 0 && adults.every((person) => person.meghalt)

    return {
      item: {
        id: household.legacy_csalad_id,
        householdId: household.id,
        displayName,
        c_utcaid: streetId,
        c_szam: houseNumber,
        isaktiv: household.isaktiv,
        id_csoport: household.id_csoport,
        district: household.id_csoport == null
          ? null
          : { id: household.id_csoport, name: districtById.get(household.id_csoport) ?? `#${household.id_csoport}` },
        ferfi,
        no,
        utca: streetName ? { name: streetName } : null,
        gyerekek: children,
        memberCount: uniquePeople.size,
      },
      memberNames,
      adultCount: adults.length,
      living,
      allAdultsDeceased,
      headName: head ? familyPersonName(head) : '',
      spouseName: spouse ? familyPersonName(spouse) : '',
    }
  })
}

async function loadFamilyUniverse(supabase: SupabaseClient, congregationId: string) {
  const [households, familyTags] = await Promise.all([
    loadHouseholds(supabase, congregationId),
    loadFamilyTags(supabase, congregationId),
  ])
  if (households.length === 0) return []

  const [addresses, legacyAddresses] = await Promise.all([
    loadAddressesByIds(
      supabase,
      congregationId,
      households.map((household) => household.id_cim).filter((id): id is string => id != null),
    ),
    loadLegacyFamilyAddresses(supabase, households.map((household) => household.legacy_csalad_id)),
  ])
  const streetIds = [
    ...addresses.map((address) => address.id_utca),
    ...legacyAddresses.map((address) => address.c_utcaid),
  ].filter((id): id is number => id != null)
  const [streets, districts] = await Promise.all([
    loadStreetsByIds(supabase, streetIds),
    loadDistrictsByIds(
      supabase,
      congregationId,
      households.map((household) => household.id_csoport).filter((id): id is number => id != null),
    ),
  ])
  return buildFamilyCandidates(households, familyTags, addresses, legacyAddresses, streets, districts)
}

function familyHasMissingAddress(family: FamilyCandidate) {
  return !family.item.utca?.name || !family.item.c_szam?.trim()
}

function filterFamilies(families: FamilyCandidate[], query: ParsedFamilyListQuery) {
  const tokens = searchTokens(query.query)
  const districtIds = new Set(query.districtIds)

  return families.filter((family) => {
    const { item } = family
    const address = `${item.utca?.name ?? ''} ${item.c_szam ?? ''}`
    const haystack = normalizeForSearch(
      `${family.memberNames} ${address} ${item.district?.name ?? ''}`,
    )
    if (!tokens.every((token) => haystack.includes(token))) return false

    if (query.status === 'active' && (!item.isaktiv || !family.living)) return false
    if (query.status === 'deceased' && !family.allAdultsDeceased) return false
    if (query.status === 'inactive' && item.isaktiv) return false

    if ((query.district === 'none' || query.missingDistrict) && item.id_csoport != null) return false
    if (query.district === 'specific' && (item.id_csoport == null || !districtIds.has(item.id_csoport))) return false
    if (query.household === 'couple' && family.adultCount < 2) return false
    if (query.household === 'single' && family.adultCount !== 1) return false
    if (query.children === 'with' && item.gyerekek.length === 0) return false
    if (query.children === 'without' && item.gyerekek.length > 0) return false
    if (query.missingAddress && !familyHasMissingAddress(family)) return false
    if (query.memberCountMin != null && item.memberCount < query.memberCountMin) return false
    if (query.memberCountMax != null && item.memberCount > query.memberCountMax) return false
    return true
  })
}

function familyStatusRank(family: FamilyCandidate) {
  if (!family.item.isaktiv) return 2
  if (family.allAdultsDeceased) return 1
  return 0
}

function sortFamilies(
  families: FamilyCandidate[],
  sortKey: ParsedFamilyListQuery['sortKey'],
  sortDir: ParsedFamilyListQuery['sortDir'],
) {
  const multiplier = sortDir === 'asc' ? 1 : -1
  return [...families].sort((left, right) => {
    let comparison = 0
    switch (sortKey) {
      case 'head':
        comparison = huCollator.compare(left.headName, right.headName)
        break
      case 'spouse':
        comparison = huCollator.compare(left.spouseName, right.spouseName)
        break
      case 'address':
        comparison = huCollator.compare(
          `${left.item.utca?.name ?? ''} ${left.item.c_szam ?? ''}`,
          `${right.item.utca?.name ?? ''} ${right.item.c_szam ?? ''}`,
        )
        break
      case 'district':
        comparison = huCollator.compare(left.item.district?.name ?? '', right.item.district?.name ?? '')
        break
      case 'status':
        comparison = familyStatusRank(left) - familyStatusRank(right)
        break
    }
    return comparison * multiplier || left.item.id - right.item.id
  })
}

function summarizeFamilies(families: FamilyCandidate[]): FamilyListKpiSummary {
  return {
    scope: 'filtered',
    families: families.length,
    active: families.filter((family) => family.item.isaktiv && family.living).length,
    deceased: families.filter((family) => family.allAdultsDeceased).length,
    inactive: families.filter((family) => !family.item.isaktiv).length,
    people: families.reduce((total, family) => total + family.item.memberCount, 0),
    children: families.reduce((total, family) => total + family.item.gyerekek.length, 0),
    withoutHead: families.filter((family) => family.adultCount === 0).length,
    withoutAddress: families.filter(familyHasMissingAddress).length,
    withoutDistrict: families.filter((family) => family.item.id_csoport == null).length,
  }
}

/** Legfeljebb 50 családot ad vissza, a teljes háztartási szűrést a szerveren alkalmazva. */
export async function getFamiliesPage(input: FamilyListQuery = {}): Promise<FamilyListPage> {
  const parsed = familyListQuerySchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Érvénytelen családszűrés.')
  }

  const { supabase, congregationId, user } = await getEffectiveCongregationContext()
  if (!user || !congregationId) {
    return {
      families: [],
      totalCount: 0,
      filteredCount: 0,
      pageSize: parsed.data.pageSize,
      hasMore: false,
      nextCursor: null,
      nextOffset: null,
      summary: summarizeFamilies([]),
    }
  }

  const { cursor, pageSize, ...filters } = parsed.data
  const fingerprint = cursorFingerprint('families', filters)
  const offset = decodeCursor(cursor, fingerprint)
  const universe = await loadFamilyUniverse(supabase, congregationId)
  const filtered = sortFamilies(
    filterFamilies(universe, parsed.data),
    parsed.data.sortKey,
    parsed.data.sortDir,
  )
  const page = filtered.slice(offset, offset + pageSize).map((candidate) => candidate.item)
  const candidateNextOffset = offset + page.length
  const hasMore = candidateNextOffset < filtered.length

  return {
    families: page,
    totalCount: universe.length,
    filteredCount: filtered.length,
    pageSize,
    hasMore,
    nextCursor: hasMore ? encodeCursor(candidateNextOffset, fingerprint) : null,
    nextOffset: hasMore ? candidateNextOffset : null,
    summary: summarizeFamilies(filtered),
  }
}

type FilterOptionRow = {
  vallas: string | null
  localityName: string | null
}

/**
 * 2026-08-11 (P1-perf): a szűrő-legördülők KIZÁRÓLAG a `vallas`-t és a
 * település nevét használják, korábban mégis a teljes `loadMemberRows`-t
 * hívták (40 oszlop + 3 beágyazott join MINDEN látható személyre) — ez volt a
 * /tagnyilvantartas megnyitásának HARMADIK teljes személy-letöltése.
 * Ez a lekérdezés csak a két szükséges mezőt hozza le.
 *
 * A település feloldása bit-azonos a `normalizeMemberRow`-éval: elsődlegesen a
 * `c_helysegid` join, és ha az üres (import-hiba öröksége), az utca
 * (`c_utcaid` → `adrstreet.localityid`) településéből pótlódik.
 */
async function loadFilterOptionRows(supabase: SupabaseClient, congregationId: string) {
  return collectBatched<FilterOptionRow>('Szűrőbeállítások lekérdezése sikertelen', async (from, to) => {
    const result = await supabase
      .from('szemely')
      .select(`
        vallas,
        adrstreet!c_utcaid(adrlocality!localityid(name)),
        adrlocality!c_helysegid(name)
      `)
      .eq('congregation_id', congregationId)
      .eq('isvisible', true)
      .order('id', { ascending: true })
      .range(from, to)

    const rows = ((result.data ?? []) as unknown[]).map((raw): FilterOptionRow => {
      const row = raw as {
        vallas?: string | null
        adrstreet?: { adrlocality?: NameRelation | NameRelation[] | null } | Array<{ adrlocality?: NameRelation | NameRelation[] | null }> | null
        adrlocality?: NameRelation | NameRelation[] | null
      }
      const street = pickRelation(row.adrstreet)
      const streetLocality = street ? pickRelation(street.adrlocality) : null
      const locality = pickRelation(row.adrlocality) ?? streetLocality
      return { vallas: row.vallas ?? null, localityName: locality?.name ?? null }
    })

    return { data: rows, error: result.error }
  })
}

export async function getMemberFilterOptions(): Promise<MemberFilterOptions> {
  const { supabase, congregationId, user } = await getEffectiveCongregationContext()
  if (!user || !congregationId) {
    return {
      localities: [],
      religions: [],
      statuses: [],
      genders: [],
      families: [],
      contacts: [],
      paymentStatuses: [],
      sorts: [],
      directions: [],
    }
  }

  // Ha a szűk lekérdezés bármiért elbukna (séma-sodródás a beágyazott
  // join-okban), inkább a régi, teljes olvasásra esünk vissza, mint hogy a
  // legördülők üresen maradjanak.
  let optionRows: FilterOptionRow[]
  try {
    optionRows = await loadFilterOptionRows(supabase, congregationId)
  } catch (error) {
    console.warn(
      '[registry-list] A szűk szűrő-lekérdezés nem elérhető; teljes személy-olvasásra váltunk.',
      error instanceof Error ? error.message : error,
    )
    optionRows = (await loadMemberRows(supabase, congregationId)).map((member) => ({
      vallas: member.vallas ?? null,
      localityName: member.adrlocality?.name ?? null,
    }))
  }

  const localityMap = new Map<string, { value: string; count: number }>()
  const religionMap = new Map<string, { value: string; count: number }>()

  for (const member of optionRows) {
    const locality = member.localityName?.trim()
    if (locality) {
      const key = normalizeForSearch(locality)
      const current = localityMap.get(key) ?? { value: locality, count: 0 }
      current.count += 1
      localityMap.set(key, current)
    }

    const religion = member.vallas?.trim()
    if (religion) {
      const key = normalizeForSearch(religion)
      const current = religionMap.get(key) ?? { value: religion, count: 0 }
      current.count += 1
      religionMap.set(key, current)
    }
  }

  return {
    localities: Array.from(localityMap.values())
      .sort((left, right) => huCollator.compare(left.value, right.value))
      .map(({ value, count }) => ({ value, label: value, count })),
    religions: Array.from(religionMap.values())
      .sort((left, right) => huCollator.compare(left.value, right.value))
      .map(({ value, count }) => ({ value, label: value, count })),
    statuses: [
      { value: 'mind', label: 'Mindenki' },
      { value: 'aktív', label: 'Aktív gyülekezeti tagok' },
      { value: 'meghalt', label: 'Elhunyt tagok' },
      { value: 'elkoltozott', label: 'Elköltözöttek' },
      { value: 'kitert', label: 'Kitértek' },
      { value: 'mas_vallasu', label: 'Más vallásúak' },
      { value: 'lebego', label: 'Család nélküli tagok' },
    ],
    genders: [
      { value: 'all', label: 'Minden nem' },
      { value: 'male', label: 'Férfi' },
      { value: 'female', label: 'Nő' },
      { value: 'unknown', label: 'Nincs rögzítve' },
    ],
    families: [
      { value: 'all', label: 'Minden családi kapcsolat' },
      { value: 'with-family', label: 'Családhoz rendelve' },
      { value: 'without-family', label: 'Család nélkül' },
    ],
    contacts: [
      { value: 'all', label: 'Minden elérhetőség' },
      { value: 'phone', label: 'Van telefonszám' },
      { value: 'email', label: 'Van e-mail' },
      { value: 'both', label: 'Telefon és e-mail' },
      { value: 'missing', label: 'Nincs elérhetőség' },
    ],
    paymentStatuses: [
      { value: 'rendezve', label: 'Rendezve' },
      { value: 'hatralekos', label: 'Hátralékos' },
      { value: 'felmentett', label: 'Felmentett' },
      { value: 'elhunyt', label: 'Elhunyt' },
      { value: 'elkoltozott', label: 'Elköltözött' },
      { value: 'kitert', label: 'Kitért' },
    ],
    sorts: [
      { value: 'id', label: 'Azonosító' },
      { value: 'name', label: 'Név' },
      { value: 'age', label: 'Életkor' },
      { value: 'birth', label: 'Születési dátum' },
      { value: 'address', label: 'Lakcím' },
      { value: 'job', label: 'Foglalkozás' },
    ],
    directions: [
      { value: 'asc', label: 'Növekvő' },
      { value: 'desc', label: 'Csökkenő' },
    ],
  }
}
