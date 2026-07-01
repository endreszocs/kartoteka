'use server'

import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import {
  incomeSchema,
  expenseSchema,
  incomeBatchSchema,
  expenseBatchSchema,
  linkedInventoryFromIncomeSchema,
  linkedInventoryFromExpenseSchema,
  rentalContractSchema,
  fxRevaluationSchema,
  type IncomeInput,
  type ExpenseInput,
  type IncomeBatchRowInput,
  type ExpenseBatchRowInput,
  type LinkedInventoryFromIncomeInput,
  type LinkedInventoryFromExpenseInput,
  type RentalContractInput,
  type FxRevaluationInput,
} from '@/lib/validations/finance'
import {
  normalizeDebtCalcMode,
  RENTAL_SZAMADASICEL_MAP,
  RENTAL_SZAMADASICEL_CODES,
  FX_REVAL_NYERESEG_KOD,
  FX_REVAL_VESZTESEG_KOD,
} from '@/lib/constants/finance'
import type {
  BefitetesRow,
  KiadasRow,
  BealitasRow,
  SzamadasiCel,
  BankAccount,
  InternalTransferRow,
  DebtRow,
  ReceiptHealth,
  ReceiptChronologyIssue,
  RentalContractRow,
  RentalDebtRow,
  FxRevaluationRow,
} from '@/lib/constants/finance'
import { getEffectiveCongregationContext, getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { inventoryItemSchema } from '@/lib/validations/inventory'
import { INVENTORY_CATEGORY_PREFIXES, serializeInventoryCategory } from '@/lib/constants/inventory.next'
import {
  computeJarulekForMemberYear,
  type JarulekDiscountRule,
  type JarulekExemption,
  type JarulekYearSetting,
} from '@/lib/finance/jarulek-calculation'
import { calculateRentalDebts, type RentalPaymentLike } from '@/lib/finance/rental-calculation'
import {
  calculateBankCurrencyBalance,
  calculateFxRevaluation,
  type BankBalanceResult,
} from '@/lib/finance/bank-balance'
import { fetchBnrRates, type BnrFetchResult } from '@/lib/finance/bnr-exchange-rate'
import {
  getFinanceScopeContext,
  tablesFor,
  type FinanceScopeContext,
  type FinanceScopeTableMap,
} from '@/lib/auth/finance-scope'

// ── Profil segéd ─────────────────────────────────────────────

async function getProfileCongregation() {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  return { supabase, congregationId }
}

/**
 * Scope-aware pénzügyi kontextus. A diocese scope esetén a `diocese_*`
 * táblákra, a congregation scope esetén a `befizetes`/`kiadas`/stb. táblákra
 * ír. Hívd meg ezt a régi `getProfileCongregation()` helyett minden
 * scope-érzékeny action-ben.
 *
 * Return típus: `{ scope, scopeId, supabase, userId, T }` + `scopeName`.
 * Hibánál `null` + hívó oldalon error visszaadása.
 */
async function getFinanceScope(): Promise<
  (FinanceScopeContext & { T: FinanceScopeTableMap }) | null
> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return null
  return { ...ctx, T: tablesFor(ctx.scope) }
}

type PaymentGoalCodeRef = {
  szamadasicel?: { kod: string | null } | { kod: string | null }[] | null
} | null

function getPaymentGoalCode(goal?: PaymentGoalCodeRef | PaymentGoalCodeRef[]) {
  const normalizedGoal = Array.isArray(goal) ? goal[0] || null : goal || null
  const goalCodeRef = normalizedGoal?.szamadasicel
  const normalizedCodeRef = Array.isArray(goalCodeRef) ? goalCodeRef[0] || null : goalCodeRef || null
  return normalizedCodeRef?.kod || null
}

function isChurchMaintenanceCode(code?: string | null) {
  return typeof code === 'string' && code.startsWith('101.01')
}

function normalizeBankAccounts(rows: Record<string, unknown>[]): BankAccount[] {
  return rows.map(row => ({
    id: Number(row.id),
    bank_neve: String(row.bank_neve || 'Bankszamla'),
    iban: typeof row.iban === 'string' ? row.iban : null,
    valuta: typeof row.valuta === 'string' && row.valuta ? row.valuta : 'RON',
    aktiv: typeof row.aktiv === 'boolean' ? row.aktiv : true,
    nyito_egyenleg: typeof row.nyito_egyenleg === 'number'
      ? row.nyito_egyenleg
        : row.nyito_egyenleg == null
          ? null
          : Number(row.nyito_egyenleg) || 0,
    szin: typeof row.szin === 'string' ? row.szin : '#206bc4',
    ikon: typeof row.ikon === 'string' ? row.ikon : 'building-2',
    is_default: typeof row.is_default === 'boolean' ? row.is_default : false,
  }))
}

function normalizeInternalTransfers(rows: Record<string, unknown>[]): InternalTransferRow[] {
  return rows.map(row => ({
    id: Number(row.id),
    datum: typeof row.datum === 'string' ? row.datum : '',
    tipus: String(row.tipus || 'bank_bank') as InternalTransferRow['tipus'],
    forras: typeof row.forras === 'string' ? row.forras : '',
    cel: typeof row.cel === 'string' ? row.cel : '',
    osszeg: Number(row.osszeg) || 0,
    cel_osszeg: row.cel_osszeg == null ? null : Number(row.cel_osszeg) || 0,
    arfolyam: row.arfolyam == null ? null : Number(row.arfolyam) || 0,
    megjegyzes: typeof row.megjegyzes === 'string' ? row.megjegyzes : null,
    deleted: typeof row.deleted === 'boolean' ? row.deleted : null,
  }))
}

function buildDocumentNumber(rawValue: string | null | undefined, date: string) {
  const trimmed = rawValue?.trim()
  if (trimmed) return trimmed

  return `AUTO-${date.replaceAll('-', '')}-${Date.now().toString().slice(-6)}`
}

function extractNumericDocumentNumber(rawValue: string | null | undefined) {
  const match = String(rawValue || '').match(/(\d+)/)
  return match ? Number.parseInt(match[1], 10) : null
}

// #Endre 2026-07-01: egy fizikai nyugta KERÜLETI alap-iratszáma a per-befizető `/N` utótag
// nélkül. Egy nyugtán több befizető lehet — ilyenkor személyenként KÜLÖN sor keletkezik,
// KÖZÖS gyülekezeti sorszámmal (nyugta) és KÖZÖS kerületi alap-iratszámmal, csak `/1`, `/2` …
// utótaggal (a kerületi iratszámra UNIQUE index van). Az alap (a /N levágva) tehát a fizikai
// nyugta azonosítója: ha egy Irat sz.-hoz TÖBB különböző alap tartozik, az két külön nyugta
// ugyanazzal a sorszámmal → VALÓDI duplikátum. Ha csak egy alap → egy nyugta több befizetővel (OK).
function receiptBaseKey(rawValue: string | null | undefined): string {
  return String(rawValue || '').replace(/\/\d+\s*$/, '').trim()
}

function computeReceiptHealth(rows: Array<Pick<BefitetesRow, 'datum' | 'iratszam' | 'nyugta' | 'irattipus' | 'deleted' | 'belso_mozgas_xkey' | 'bankszamla_id'>>): ReceiptHealth {
  const numberedRows = rows
    .filter(row => !row.deleted)
    .filter(row => !row.belso_mozgas_xkey)
    // 2026-06-30 FIX: készpénz = kanonikus `bankszamla_id IS NULL` (kassza), NEM az
    // irattipus — különben az importált nyugták (irattipus 'chitanta' stb.) kimaradnának,
    // és a Chitanță-számozás javítása után HAMIS „hiányzó szám" figyelmeztetést adna
    // (az importált számok közti hézagokat tévesen jelölné). Konzisztens a getNextReceiptNumbers-szel.
    .filter(row => row.bankszamla_id == null)
    // 2026-07-01 FIX (Endre): a nyugtafigyelő a GYÜLEKEZET SAJÁT sorszámát (Irat sz. =
    // `nyugta`) követi, NEM a kerületi (nyomdai) számot (`iratszam`). A KÉT szám két külön
    // számsorozat: a kerületi számot a kerület adja, kerület-szintű NAGY szám (pl. 115019),
    // amelyben a gyülekezetnél NORMÁLIS a hézag (a számok más gyülekezetek nyugtái közé
    // esnek) — így azt sorozatként hézag-ellenőrizni értelmetlen. A gyülekezeti saját
    // sorszám az, aminek hézag- és duplikátummentesnek kell lennie. Korábban a monitor a
    // két oszlopot `iratszam || nyugta`-ként ÖSSZEMOSTA, ezért a ~115000-es kerületi és az
    // 1..N gyülekezeti számok EGY sorozatként ~115000 hamis „hiányzót", ~310 hamis
    // „duplikátumot" és hamis dátumrendellenességeket adtak. A tükrözött (import/legacy:
    // nyugta === iratszam) sorokat kihagyjuk — azoknak nincs valódi gyülekezeti számuk
    // (ugyanaz a kizárás, mint a getNextReceiptNumbers-ben).
    .map(row => ({
      number: (row.nyugta && row.nyugta !== row.iratszam)
        ? extractNumericDocumentNumber(row.nyugta)
        : null,
      date: String(row.datum || ''),
      // A kerületi alap-iratszám (a /N nélkül) = a fizikai nyugta azonosítója (lásd receiptBaseKey).
      base: receiptBaseKey(row.iratszam),
    }))
    .filter((row): row is { number: number; date: string; base: string } => row.number != null)
    .sort((a, b) => a.number - b.number)

  if (numberedRows.length === 0) {
    return {
      missingNumbers: [],
      duplicateNumbers: [],
      chronologyIssues: [],
      trackedReceiptCount: 0,
      highestReceiptNumber: null,
    }
  }

  const missingNumbers: number[] = []
  const duplicateNumbers = new Set<number>()
  const chronologyIssues: ReceiptChronologyIssue[] = []

  // #Endre 2026-07-01: az ISMÉTLŐDŐ Irat sz. ÖNMAGÁBAN NEM hiba. Egy nyugtán több befizető
  // lehet (személyenként külön sor, KÖZÖS Irat sz. + közös kerületi alap-iratszám /N utótaggal)
  // — ez teljesen szabályos. Ezért egy Irat sz. CSAK akkor valódi duplikátum, ha TÖBB
  // KÜLÖNBÖZŐ kerületi alap-iratszámhoz (= külön fizikai nyugtához) tartozik. A lényeg a
  // HIÁNYZÓ számok kiszűrése; a több-befizetős ismétlődést nem jelezzük hibaként.
  const basesByNumber = new Map<number, Set<string>>()
  numberedRows.forEach(row => {
    const set = basesByNumber.get(row.number) ?? new Set<string>()
    set.add(row.base)
    basesByNumber.set(row.number, set)
  })

  basesByNumber.forEach((bases, number) => {
    if (bases.size > 1) duplicateNumbers.add(number)
  })

  // Az év első és utolsó nyugtája között keresünk hiányzókat. Ha 2025-ben
  // az első nyugta sorszáma 23 (mert 22-ig 2024-ben voltak), akkor csak 23-tól
  // felfelé ellenőrzünk — különben 1–22 "hiányzókként" jelennének meg, pedig
  // azok egy másik évből valók.
  const lowestReceiptNumber = numberedRows[0]?.number ?? null
  const highestReceiptNumber = numberedRows[numberedRows.length - 1]?.number ?? null
  if (lowestReceiptNumber != null && highestReceiptNumber != null) {
    const existing = new Set(numberedRows.map(row => row.number))
    for (let receipt = lowestReceiptNumber; receipt <= highestReceiptNumber; receipt += 1) {
      if (!existing.has(receipt)) missingNumbers.push(receipt)
    }
  }

  for (let index = 1; index < numberedRows.length; index += 1) {
    const previous = numberedRows[index - 1]
    const current = numberedRows[index]
    if (current.date < previous.date) {
      chronologyIssues.push({
        previousNumber: previous.number,
        previousDate: previous.date,
        currentNumber: current.number,
        currentDate: current.date,
      })
    }
  }

  return {
    missingNumbers,
    duplicateNumbers: Array.from(duplicateNumbers).sort((a, b) => a - b),
    chronologyIssues,
    trackedReceiptCount: numberedRows.length,
    highestReceiptNumber,
  }
}

function isMissingColumnError(message?: string) {
  const lower = message?.toLowerCase() || ''
  return (
    lower.includes('column') ||
    lower.includes('schema cache') ||
    lower.includes('could not find') ||
    lower.includes('does not exist')
  )
}

function shouldRetryLegacySettingsInsert(message?: string) {
  const lower = message?.toLowerCase() || ''
  return (
    isMissingColumnError(message) ||
    lower.includes('not-null constraint') ||
    lower.includes('null value in column') ||
    lower.includes('violates')
  )
}

async function insertIncomeRecord(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  congregationId: string
  userId: string
  input: IncomeInput
}) {
  const { supabase, congregationId, userId, input } = params
  const documentNumber = buildDocumentNumber(input.iratszam, input.datum)
  const modernPayload = {
    osszeg: input.osszeg,
    datum: input.datum,
    id_befizetescel: input.id_befizetescel,
    id_szemely: input.id_szemely || null,
    id_csalad: input.id_csalad || null,
    forrasa: input.forrasa || null,
    iratszam: documentNumber,
    irattipus: input.irattipus,
    fizetettev: input.fizetettev || new Date(input.datum).getFullYear(),
    megjegyzes: input.megjegyzes || null,
    deleted: false,
    congregation_id: congregationId,
  }

  const legacyCompatiblePayload = {
    ...modernPayload,
    xkey: randomUUID().replace(/-/g, '').slice(0, 20),
    // #3 (Endre): a `nyugta` a GYÜLEKEZETI saját sorszám (a kerületi = iratszam mellett).
    // Ha nincs megadva, a régi viselkedés szerint az iratszámmal egyezik (a NOT NULL miatt is).
    nyugta: input.nyugta?.trim() || documentNumber,
    csalad: Boolean(input.id_csalad),
    forrasa: input.forrasa || 'Kézi rögzítés',
    userid: userId,
  }

  let insertResult = await supabase.from('befizetes').insert([legacyCompatiblePayload]).select('id').single()
  if (insertResult.error && isMissingColumnError(insertResult.error.message)) {
    insertResult = await supabase.from('befizetes').insert([modernPayload]).select('id').single()
  }

  if (insertResult.error) {
    return { error: `Hiba: ${insertResult.error.message}` as string }
  }

  return {
    id: Number(insertResult.data?.id),
    documentNumber,
  }
}

async function rollbackInsertedIncome(supabase: Awaited<ReturnType<typeof createClient>>, congregationId: string, incomeId?: number | null) {
  if (!incomeId) return

  let updateResult = await supabase.from('befizetes').update({ deleted: true }).eq('id', incomeId).eq('congregation_id', congregationId)
  if (updateResult.error?.message?.toLowerCase().includes('deleted')) {
    updateResult = await supabase.from('befizetes').delete().eq('id', incomeId).eq('congregation_id', congregationId)
  }
}

async function insertExpenseRecord(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  congregationId: string
  userId: string
  input: ExpenseInput | ExpenseBatchRowInput
}) {
  const { supabase, congregationId, userId, input } = params
  const documentNumber = buildDocumentNumber(input.iratszam || ('bizonylatszam' in input ? input.bizonylatszam : null), input.datum)

  const canonicalPayload = {
    osszeg: input.osszeg,
    datum: input.datum,
    id_kiadascel: input.id_kiadascel,
    // A partner/kedvezményezett a `atvevo` oszlopba kerül (lent) — a `kiadas` táblában
    // NINCS `kedvezmenyzett` oszlop, ezért azt nem szabad beszúrni (column-does-not-exist).
    id_szemely: 'id_szemely' in input ? input.id_szemely || null : null,
    iratszam: documentNumber,
    irattipus: input.irattipus,
    megjegyzes: input.megjegyzes || null,
    deleted: false,
    congregation_id: congregationId,
  }

  const referencePayload = {
    ...canonicalPayload,
    nyugta: documentNumber,
    xkey: randomUUID().replace(/-/g, '').slice(0, 20),
    atvevo: input.kedvezmenyzett || 'Kézi rögzítés',
    atvevoid: 'id_szemely' in input ? input.id_szemely || null : null,
    userid: userId,
  }

  const legacyAliasPayload = {
    ...canonicalPayload,
    bizonylatszam: documentNumber,
  }

  let insertResult = await supabase.from('kiadas').insert([referencePayload]).select('id')
  if (insertResult.error && isMissingColumnError(insertResult.error.message)) {
    insertResult = await supabase.from('kiadas').insert([canonicalPayload]).select('id')
  }
  if (insertResult.error && isMissingColumnError(insertResult.error.message)) {
    insertResult = await supabase.from('kiadas').insert([legacyAliasPayload]).select('id')
  }

  const { data, error } = insertResult
  if (error) {
    return { error: `Hiba: ${error.message}` as string }
  }

  return {
    id: Number(data?.[0]?.id),
    documentNumber,
  }
}

/**
 * Diocese-scope-specifikus bevétel-insert. A `diocese_befizetes` táblába ír,
 * a gyülekezeti `befizetes` helyett. Az `id_befizetescel` (int) helyett az
 * `id_szamadasicel` (string kód) használatos.
 *
 * FONTOS: az IncomeInput.id_befizetescel itt **a szamadasicel kódot** jelenti
 * (pl. '101.07' string-ként int-re cast-olva). A diocese UI bevCelMap-je
 * identitás (kulcs=érték=kód), így az int érték a kód hash-beli indexe.
 * Az input.id_befizetescel-t itt string-re konvertáljuk a szamadasicel
 * alapján — ehhez vissza-keresés kell.
 */
async function insertDioceseIncomeRecord(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  dioceseId: string
  userId: string
  input: IncomeInput
}) {
  const { supabase, dioceseId, userId, input } = params
  const documentNumber = buildDocumentNumber(input.iratszam, input.datum)

  // A UI bevCelMap-ben diocese módban a kulcs maga a szamadasicel.id (mint "101.07")
  // A kliens az `id_befizetescel: number`-t küld — de diocese módban ez a kód-hash.
  // Feloldás: lekérjük a szamadasicel-t és keressük a kódot.
  // MVP megoldás: ha az input.id_befizetescel int < 1000 és a szamadasicel-ek
  // közt van egy "101.07" stb. kód, akkor a szamadasicel táblából resolveljük.
  // De mivel a diocese-UI a bevCelMap kulcs-értékét használja (ami string kód),
  // az input.id_befizetescel tényleges értéke itt a kód int-re castolt hash lehet.
  // Egyszerűbb út: a kliens diocese módban az input.id_befizetescel string-et
  // küld közvetlenül — lehetővé tesszük, hogy az input.id_befizetescel
  // opcionálisan string is lehet. De az IncomeInput típus `id_befizetescel: number`.
  //
  // PRAGMATIKUS MEGOLDÁS: az input.id_befizetescel-t a szamadasicel táblában
  // keressük vissza sorszám szerint (amit a diocese-UI használ cím-hash-ként).
  let idSzamadasicel: string | null = null
  const { data: allCells } = await supabase
    .from('szamadasicel')
    .select('id, sorszam')
    .order('sorszam')
  const cells = (allCells || []) as Array<{ id: string; sorszam: number }>
  // A diocese UI-ban az int "id" igazából a sorszám → vissza-keresünk
  const found = cells.find((c) => c.sorszam === input.id_befizetescel)
  if (found) idSzamadasicel = found.id
  // Fallback: ha az int-et direktben kódstringre konvertáljuk, esetleg
  // egyáltalán találjuk a szamadasicel.id-k közt
  if (!idSzamadasicel) {
    const direct = cells.find((c) => c.id === String(input.id_befizetescel))
    if (direct) idSzamadasicel = direct.id
  }
  if (!idSzamadasicel) {
    return { error: 'Nem található a kiválasztott kategória az egyházmegyei szinten.' as string }
  }

  const payload = {
    osszeg: input.osszeg,
    datum: input.datum,
    id_szamadasicel: idSzamadasicel,
    forrasa: input.forrasa || 'Kézi rögzítés',
    befizeto_congregation_id: null,  // az UI-ban a lelkész választhat gyülekezetet, MVP null
    iratszam: documentNumber.slice(0, 20),
    nyugta: documentNumber.slice(0, 20),
    irattipus: normalizeIrattipusForDiocese(input.irattipus),
    fizetettev: input.fizetettev || new Date(input.datum).getFullYear(),
    megjegyzes: input.megjegyzes || null,
    bankszamla_id: null as number | null,
    xkey: randomUUID().replace(/-/g, '').slice(0, 20),
    userid: userId,
    deleted: false,
    diocese_id: dioceseId,
  }

  const { data, error } = await supabase.from('diocese_befizetes').insert([payload]).select('id').single()
  if (error) return { error: `Hiba: ${error.message}` as string }
  return { id: Number(data?.id), documentNumber }
}

async function insertDioceseExpenseRecord(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  dioceseId: string
  userId: string
  input: ExpenseInput | ExpenseBatchRowInput
}) {
  const { supabase, dioceseId, userId, input } = params
  const documentNumber = buildDocumentNumber(
    input.iratszam || ('bizonylatszam' in input ? input.bizonylatszam : null),
    input.datum,
  )

  // Ugyanaz a szamadasicel resolve mint a bevételnél
  let idSzamadasicel: string | null = null
  const { data: allCells } = await supabase
    .from('szamadasicel')
    .select('id, sorszam')
    .order('sorszam')
  const cells = (allCells || []) as Array<{ id: string; sorszam: number }>
  const found = cells.find((c) => c.sorszam === input.id_kiadascel)
  if (found) idSzamadasicel = found.id
  if (!idSzamadasicel) {
    const direct = cells.find((c) => c.id === String(input.id_kiadascel))
    if (direct) idSzamadasicel = direct.id
  }
  if (!idSzamadasicel) {
    return { error: 'Nem található a kiválasztott kategória az egyházmegyei szinten.' as string }
  }

  const payload = {
    osszeg: input.osszeg,
    datum: input.datum,
    id_szamadasicel: idSzamadasicel,
    kedvezmenyezett: input.kedvezmenyzett || 'Kézi rögzítés',
    kedvezmenyezett_congregation_id: null,  // Phase 5: UI gyülekezet dropdown
    iratszam: documentNumber.slice(0, 20),
    nyugta: documentNumber.slice(0, 20),
    irattipus: normalizeIrattipusForDiocese(input.irattipus),
    megjegyzes: input.megjegyzes || null,
    bankszamla_id: null as number | null,
    xkey: randomUUID().replace(/-/g, '').slice(0, 20),
    userid: userId,
    deleted: false,
    diocese_id: dioceseId,
  }

  const { data, error } = await supabase.from('diocese_kiadas').insert([payload]).select('id').single()
  if (error) return { error: `Hiba: ${error.message}` as string }
  return { id: Number(data?.id), documentNumber }
}

/**
 * A diocese_befizetes / diocese_kiadas tábla `irattipus` oszlopa CHECK
 * constraint-et használ: csak 'készpénz' / 'banki' / 'számla' értéket fogad el.
 * A gyülekezeti bemenetet normalizáljuk.
 */
function normalizeIrattipusForDiocese(raw: string): 'készpénz' | 'banki' | 'számla' {
  const lower = (raw || '').toLowerCase().trim()
  if (lower.includes('bank')) return 'banki'
  if (lower.includes('szám') || lower === 'számla') return 'számla'
  return 'készpénz'  // default
}

async function generateNextInventoryNumberForCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  congregationId: string,
  category: string,
) {
  const prefix = INVENTORY_CATEGORY_PREFIXES[category as keyof typeof INVENTORY_CATEGORY_PREFIXES] || category.toUpperCase().slice(0, 3)
  const { data } = await supabase
    .from('leltar_tetelek')
    .select('leltari_szam')
    .eq('congregation_id', congregationId)
    .ilike('leltari_szam', `${prefix}-%`)

  let max = 0
  ;(data || []).forEach((row: { leltari_szam?: string | null }) => {
    const match = String(row.leltari_szam || '').match(/-(\d+)$/)
    if (match) {
      const parsed = Number.parseInt(match[1], 10)
      if (parsed > max) max = parsed
    }
  })

  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

async function insertLinkedInventoryFromIncome(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  congregationId: string
  income: IncomeInput
  inventory: LinkedInventoryFromIncomeInput
  documentNumber: string
}) {
  const { supabase, congregationId, income, inventory, documentNumber } = params
  const inventoryPayload = inventoryItemSchema.safeParse({
    megnevezes: inventory.megnevezes,
    kategoria: 'alapeszkoz',
    beszerzes_erteke: income.osszeg,
    beszerzes_datuma: income.datum,
    beszerzes_bizonylat: documentNumber,
    katalogus_kod: inventory.katalogus_kod || null,
    hasznalati_ido: inventory.hasznalati_ido ?? null,
    helyszin: inventory.helyszin || null,
    felelos_nev: inventory.felelos_nev || null,
    megjegyzes: inventory.megjegyzes || null,
    mennyiseg: 1,
    mertekegyseg: 'db',
  })

  if (!inventoryPayload.success) {
    return { error: inventoryPayload.error.issues[0].message }
  }

  const leltariSzam = await generateNextInventoryNumberForCategory(supabase, congregationId, 'alapeszkoz')
  const normalized = inventoryPayload.data
  const serializedCategory = serializeInventoryCategory('alapeszkoz')

  const record = {
    megnevezes: normalized.megnevezes,
    kategoria: serializedCategory,
    beszerzesi_ertek: normalized.beszerzes_erteke,
    beszerzes_datuma: normalized.beszerzes_datuma || null,
    katalogus_kod: normalized.katalogus_kod || null,
    hasznalati_ido_ev: normalized.hasznalati_ido || null,
    helyszin: normalized.helyszin || null,
    felelos_neve: normalized.felelos_nev || null,
    megjegyzes: normalized.megjegyzes || null,
    is_deleted: false,
    congregation_id: congregationId,
    mennyiseg: normalized.mennyiseg ?? 1,
    mertekegyseg: normalized.mertekegyseg || 'db',
    beszerzes_bizonylat: normalized.beszerzes_bizonylat || null,
    leltari_szam: leltariSzam,
  }

  const modernFallback = {
    megnevezes: normalized.megnevezes,
    kategoria: serializedCategory,
    beszerzes_erteke: normalized.beszerzes_erteke,
    beszerzes_datuma: normalized.beszerzes_datuma || null,
    katalogus_kod: normalized.katalogus_kod || null,
    hasznalati_ido: normalized.hasznalati_ido || null,
    helyszin: normalized.helyszin || null,
    felelos_nev: normalized.felelos_nev || null,
    megjegyzes: normalized.megjegyzes || null,
    deleted: false,
    congregation_id: congregationId,
    mennyiseg: normalized.mennyiseg ?? 1,
    mertekegyseg: normalized.mertekegyseg || 'db',
    beszerzes_bizonylat: normalized.beszerzes_bizonylat || null,
    leltari_szam: leltariSzam,
  }

  let { error } = await supabase.from('leltar_tetelek').insert([record])
  if (error?.message?.match(/beszerzes_erteke|deleted|felelos_nev|hasznalati_ido/)) {
    const retry = await supabase.from('leltar_tetelek').insert([modernFallback])
    error = retry.error
  }

  if (error) {
    return { error: `Hiba: ${error.message}` }
  }

  return { success: true }
}

// ── Inicializálás (page.tsx-ből hívva) ───────────────────────

/**
 * Pénzügyi inicializálás — scope-tudatos belépési pont.
 *
 * 2026-04-18 REFAKTOR (Endre): ha az aktív profile_role scope === 'diocese',
 * akkor a diocese path fut (diocese_* táblák), különben a meglévő
 * gyülekezeti logika változatlanul — ez biztosítja a zéró regressziós
 * kockázatot a meglévő gyülekezeti felhasználóknak.
 */
/**
 * A hero-beli év-választóhoz: CSAK azok az évek, amelyekhez tartozik pénzügyi adat
 * (befizetés/kiadás dátum-éve), kiegészítve a folyó évvel (abban mindig lehet dolgozni).
 * Így a választó nem egy fix 2019–2027 listát mutat, hanem a ténylegesen használt éveket.
 * (Endre kérése, 2026-06-20.)
 */
export async function listFinanceYears(): Promise<number[]> {
  const access = await getEffectiveAccessContext()
  const realYear = new Date().getFullYear()
  if (!access.user) return [realYear]

  const years = new Set<number>([realYear])
  const addYears = (rows: { datum: string | null }[] | null) => {
    for (const r of rows || []) {
      const y = Number(String(r.datum || '').slice(0, 4))
      if (Number.isInteger(y) && y >= 2000 && y <= realYear + 1) years.add(y)
    }
  }

  const isDiocese =
    access.activeProfileRole?.scope === 'diocese' && !!access.activeProfileRole.scopeId
  try {
    if (isDiocese) {
      const did = access.activeProfileRole!.scopeId as string
      const [bev, kia] = await Promise.all([
        access.supabase.from('diocese_befizetes').select('datum').eq('diocese_id', did).eq('deleted', false),
        access.supabase.from('diocese_kiadas').select('datum').eq('diocese_id', did).eq('deleted', false),
      ])
      addYears((bev.data || []) as { datum: string | null }[])
      addYears((kia.data || []) as { datum: string | null }[])
    } else if (access.effectiveCongregationId) {
      const cid = access.effectiveCongregationId
      const [bev, kia] = await Promise.all([
        access.supabase.from('befizetes').select('datum').eq('congregation_id', cid).eq('deleted', false),
        access.supabase.from('kiadas').select('datum').eq('congregation_id', cid).eq('deleted', false),
      ])
      addYears((bev.data || []) as { datum: string | null }[])
      addYears((kia.data || []) as { datum: string | null }[])
    }
  } catch {
    /* csendes — legalább a folyó év mindig elérhető marad */
  }

  return Array.from(years).sort((a, b) => b - a)
}

export async function initFinance(year: number) {
  const scope = await getFinanceScope()
  if (!scope) return null

  if (scope.scope === 'diocese') {
    return initFinanceDiocese(year, scope)
  }

  // ── Congregation path (MEGLÉVŐ, VÁLTOZATLAN kód a backward compat-ért) ──
  const { supabase, scopeId: congregationId } = scope

  const [
    settingsRes, celRes, bevCelRes, kiaCelRes, bankRes,
    bevRes, kiaRes, prevBevRes, prevKiaRes,
    bealitasAllRes, membersRes, debtPaymentsRes, exemptionsRes, familiesRes, discountsRes,
    transferRes, congRes,
  ] = await Promise.all([
    supabase.from('bealitas').select('*').eq('id', String(year)).eq('congregation_id', congregationId).maybeSingle(),
    // 2026-04-18 JAVÍTÁS (Endre diagnosztikai SQL-je alapján):
    //   Minden szintű (gyulekezet/egyhazmegye/kerulet) szamadasicel-t lekérünk,
    //   hogy a name-lookup MINDIG megtalálja a tétel nevét. A korábbi
    //   `.eq('szint', 'gyulekezet')` szűrés miatt a junction táblákban
    //   (befizetescel, kiadascel) hivatkozott „egyhazmegye" szintű tételek
    //   (pl. 201.15 Nettó fizetések, 201.17 CAS, 206.02 Biztosítások stb.)
    //   név nélkül jelentek meg a BCR import kategóriaválasztójában.
    //
    //   A szint-szűrést most már a KLIENS oldalon végezzük, csak ott, ahol a
    //   lelkész új tételt választ (pl. budget-tab, accounting-tab) — nem a
    //   lookup / név-megjelenítés szintjén.
    supabase.from('szamadasicel').select('*').order('sorszam'),
    supabase.from('befizetescel').select('id, id_szamadasicel'),
    supabase.from('kiadascel').select('id, id_szamadasicel'),
    supabase.from('bankszamlak').select('*').eq('congregation_id', congregationId).eq('aktiv', true),
    // 2026-06-30 (perf): '*' helyett a BefizetesRow/KiadasRow típus mezői (a DB-ben
    // ~31/33 oszlop, de a UI csak ~18/16-ot olvas) — bit-azonos a fogyasztóknak,
    // kevesebb adat-transzfer/deszerializálás nagy gyülekezetnél (sok ezer tétel/év).
    supabase.from('befizetes').select('id, osszeg, datum, id_befizetescel, id_szemely, id_csalad, forrasa, nyugta, iratszam, irattipus, fizetettev, megjegyzes, belso_mozgas_xkey, bankszamla_id, deleted, stornozott, stornozott_indok, stornozott_at').eq('congregation_id', congregationId).eq('deleted', false).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`),
    supabase.from('kiadas').select('id, osszeg, datum, id_kiadascel, atvevo, atvevoid, nyugta, iratszam, irattipus, megjegyzes, belso_mozgas_xkey, bankszamla_id, deleted, stornozott, stornozott_indok, stornozott_at').eq('congregation_id', congregationId).eq('deleted', false).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`),
    // Előző évi adatok az átviteli egyenleghez (bankszamla_id: NULL=kassza, egyébként bank)
    supabase.from('befizetes').select('osszeg, bankszamla_id').eq('congregation_id', congregationId).eq('deleted', false).gte('datum', `${year - 1}-01-01`).lte('datum', `${year - 1}-12-31`),
    supabase.from('kiadas').select('osszeg, bankszamla_id').eq('congregation_id', congregationId).eq('deleted', false).gte('datum', `${year - 1}-01-01`).lte('datum', `${year - 1}-12-31`),
    supabase.from('bealitas').select('id, eves_jarulek').eq('congregation_id', congregationId),
    supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, prefix, sz_datum, foglalkozas, meghalt, elkoltozott, member_status')
      .eq('congregation_id', congregationId)
      .eq('isvisible', true),
    supabase
      .from('befizetes')
      .select('id_szemely, id_csalad, datum, fizetettev, osszeg, befizetescel(szamadasicel(kod))')
      .eq('congregation_id', congregationId)
      .eq('fizetettev', year)
      .or('deleted.eq.false,deleted.is.null'),
    supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').eq('congregation_id', congregationId),
    // 2026-06-01 (hibrid család-modell Fázis 2): új haztartas_tag-ból mapping
    supabase.from('haztartas_tag')
      .select('id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
      .eq('congregation_id', congregationId)
      .is('ervenyes_ig', null),
    supabase
      .from('jarulek_kedvezmeny')
      .select('id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
      .eq('congregation_id', congregationId)
      .eq('aktiv', true),
    // 2026-06-30 (perf): a belsomozgas (transferRes) és a congregations (congRes)
    // korábban a Promise.all UTÁN, szekvenciálisan futott — egyik sem függ a fő
    // blokktól, ezért bevonjuk a párhuzamos hullámba (2 round-trippel kevesebb).
    supabase.from('belsomozgas')
      .select('id, datum, tipus, forras, cel, osszeg, cel_osszeg, arfolyam, megjegyzes, deleted')
      .eq('congregation_id', congregationId)
      .or('deleted.eq.false,deleted.is.null')
      .gte('datum', `${year}-01-01`)
      .lte('datum', `${year}-12-31`)
      .order('datum', { ascending: false }),
    supabase.from('congregations')
      .select('nev_hu, nev_ro, name, tartozas_szamitas_mod')
      .eq('id', congregationId)
      .single(),
  ])

  let internalTransfers: InternalTransferRow[] = []
  if (!transferRes.error) {
    internalTransfers = normalizeInternalTransfers((transferRes.data || []) as Record<string, unknown>[])
  }

  let congregationName = ''
  let congregationNameRo = '' // hivatalos román név (pl. „Parohia Reformată Brateș") a nyomtatványokhoz
  let debtCalcMode: 'akkori' | 'aktualis' = 'akkori'

  // A primary congregations-lekérdezés már a fenti Promise.all-ban futott (congRes).
  // Ha a `tartozas_szamitas_mod` oszlop hiányzik (régi séma), a ritka fallback ág fut.
  if (congRes.error?.message?.includes('tartozas_szamitas_mod')) {
    const fallbackRes = await supabase
      .from('congregations')
      .select('nev_hu, nev_ro, name')
      .eq('id', congregationId)
      .single()

    congregationName = fallbackRes.data?.nev_hu || fallbackRes.data?.name || ''
    congregationNameRo = (fallbackRes.data?.nev_ro as string | null) || ''
  } else {
    congregationName = congRes.data?.nev_hu || congRes.data?.name || ''
    congregationNameRo = (congRes.data?.nev_ro as string | null) || ''
    debtCalcMode = normalizeDebtCalcMode(congRes.data?.tartozas_szamitas_mod)
  }

  // Kategória map-ek felépítése
  //
  // FONTOS TYPE-FIX (KARTOTEKA-2026-04-17):
  // A `befizetescel.id_szamadasicel` és `kiadascel.id_szamadasicel` oszlopok
  // `character varying` típusúak az adatbázisban (pl. "100.01"), és közvetlenül
  // a `szamadasicel.id`-re hivatkoznak (szintén string).
  //
  // A korábbi kód tévesen `szamadasicel.sorszam` (integer) mezőhöz próbálta
  // párosítani, ami type-mismatch miatt MINDIG üres map-et eredményezett —
  // ezért nem jelentek meg a kategóriák a bevétel/kiadás/BCR dialogokban.
  //
  // Mostantól egyszerűen a `r.id_szamadasicel` stringet használjuk közvetlenül,
  // mert az PONTOSAN a szamadasicel.id.
  // 2026-04-18 JAVÍTÁS: a `szamadasicel` táblában NINCS `kod` oszlop (Endre
  // ellenőrizte), az `id` maga a kód (pl. "101.07"). A SzamadasiCel típus
  // `kod: string` mezője backward-compat miatt van — itt kitöltjük az `id`-ből,
  // hogy a kliens oldali `c.kod` referenciák működjenek.
  const szamadasiCellek = ((celRes.data || []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    kod: String(row.id || ''),
  })) as unknown as SzamadasiCel[]
  const celMap: Record<number, string> = {}
  szamadasiCellek.forEach(c => { celMap[c.sorszam] = c.kod || c.id })

  const bevCelMap: Record<number, string> = {}
  ;(bevCelRes.data || []).forEach((r: { id: number; id_szamadasicel: string }) => {
    // Az id_szamadasicel MÁR a szamadasicel.id (string) — nincs szükség lookup-ra
    if (r.id_szamadasicel) bevCelMap[r.id] = r.id_szamadasicel
  })

  const kiaCelMap: Record<number, string> = {}
  ;(kiaCelRes.data || []).forEach((r: { id: number; id_szamadasicel: string }) => {
    if (r.id_szamadasicel) kiaCelMap[r.id] = r.id_szamadasicel
  })

  // Biztonsági háló: ha a `befizetescel` vagy `kiadascel` tábla üres (új
  // gyülekezet, vagy sosem lett seedelve), automatikusan létrehozzuk az összes
  // szamadasicel B/K típusú celláját befizetescel/kiadascel sorokként — így a
  // könyvelés azonnal használható.
  //
  // FONTOS: ehhez szükség van az INSERT RLS policy-ra a befizetescel / kiadascel
  // táblákon. A `migration-docs/sql/2026-04-17-seed-befizetescel-kiadascel.sql`
  // tartalmazza a szükséges policy-kat + egy SQL seed-et (ami szintén futhat).
  async function autoPopulateCategoryJunctions() {
    const hasBev = Object.keys(bevCelMap).length > 0
    const hasKia = Object.keys(kiaCelMap).length > 0
    if (hasBev && hasKia) return

    const bevCells = szamadasiCellek.filter(c => c.type === 'B')
    const kiaCells = szamadasiCellek.filter(c => c.type === 'K')

    if (!hasBev && bevCells.length > 0) {
      const newBev = bevCells.map(c => ({
        id_szamadasicel: c.id,
        nev: c.nev || c.id,
        nevro: (c as { nevro?: string | null }).nevro || c.nev || c.id,
        aktiv: true,
      }))
      const { data: inserted, error } = await supabase
        .from('befizetescel')
        .insert(newBev)
        .select('id, id_szamadasicel')
      if (error) {
        console.warn(
          '[initFinance] befizetescel auto-populate sikertelen — futtasd le a `migration-docs/sql/2026-04-17-seed-befizetescel-kiadascel.sql` fájlt a Supabase SQL editorban.',
          error.message,
        )
      } else if (inserted) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[initFinance] ${inserted.length} befizetescel sor auto-létrehozva.`)
        }
        for (const r of inserted as Array<{ id: number; id_szamadasicel: string }>) {
          if (r.id_szamadasicel) bevCelMap[r.id] = r.id_szamadasicel
        }
      }
    }

    if (!hasKia && kiaCells.length > 0) {
      const newKia = kiaCells.map(c => ({
        id_szamadasicel: c.id,
        nev: c.nev || c.id,
        nevro: (c as { nevro?: string | null }).nevro || c.nev || c.id,
        aktiv: true,
      }))
      const { data: inserted, error } = await supabase
        .from('kiadascel')
        .insert(newKia)
        .select('id, id_szamadasicel')
      if (error) {
        console.warn(
          '[initFinance] kiadascel auto-populate sikertelen — futtasd le a `migration-docs/sql/2026-04-17-seed-befizetescel-kiadascel.sql` fájlt a Supabase SQL editorban.',
          error.message,
        )
      } else if (inserted) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[initFinance] ${inserted.length} kiadascel sor auto-létrehozva.`)
        }
        for (const r of inserted as Array<{ id: number; id_szamadasicel: string }>) {
          if (r.id_szamadasicel) kiaCelMap[r.id] = r.id_szamadasicel
        }
      }
    }
  }

  await autoPopulateCategoryJunctions()

  // BM kategória ID-k
  let bmBevKeszpenz = 0, bmBevBanki = 0, bmKiaKeszpenz = 0, bmKiaBanki = 0
  for (const [id, kod] of Object.entries(bevCelMap)) {
    if (kod === '100.01') bmBevKeszpenz = Number(id)
    if (kod === '100.02') bmBevBanki = Number(id)
  }
  for (const [id, kod] of Object.entries(kiaCelMap)) {
    if (kod === '100.01') bmKiaKeszpenz = Number(id)
    if (kod === '100.02') bmKiaBanki = Number(id)
  }

  // Átviteli (nyitó) egyenleg. A nyitó = az ÉVRE RÖGZÍTETT nyitó egyenleg (keszpenz_nyito_egyenleg /
  // bankszamla_nyito_egyenleg, pl. importból), ha van; KÜLÖNBEN az előző év ZÁRÓJA
  // (= előző évi rögzített nyitó + előző évi nettó forgalom). Korábban CSAK az előző évi nettó
  // forgalmat számolta → a rögzített nyitó kimaradt, ezért a bank/kassza nyitó hibás (akár negatív) lett.
  const [cashNyitoRes, bankNyitoRes] = await Promise.all([
    supabase.from('keszpenz_nyito_egyenleg').select('eve, nyito_egyenleg')
      .eq('congregation_id', congregationId).in('eve', [year - 1, year]),
    supabase.from('bankszamla_nyito_egyenleg').select('eve, nyito_egyenleg_ron')
      .eq('congregation_id', congregationId).in('eve', [year - 1, year]),
  ])
  let recCashCur = 0, recCashPrev = 0, hasCashCur = false
  for (const r of (cashNyitoRes.data || []) as { eve: number; nyito_egyenleg: number }[]) {
    if (r.eve === year) { recCashCur += Number(r.nyito_egyenleg) || 0; hasCashCur = true }
    else recCashPrev += Number(r.nyito_egyenleg) || 0
  }
  let recBankCur = 0, recBankPrev = 0, hasBankCur = false
  for (const r of (bankNyitoRes.data || []) as { eve: number; nyito_egyenleg_ron: number }[]) {
    if (r.eve === year) { recBankCur += Number(r.nyito_egyenleg_ron) || 0; hasBankCur = true }
    else recBankPrev += Number(r.nyito_egyenleg_ron) || 0
  }
  // Előző évi NETTÓ forgalom — bankszamla_id szerint szétválasztva (NULL=kassza, egyébként bank).
  let carryoverCashNet = 0, carryoverBankNet = 0
  ;(prevBevRes.data || []).forEach((r: { osszeg: number; bankszamla_id: number | null }) => {
    if (r.bankszamla_id == null) carryoverCashNet += Number(r.osszeg) || 0
    else carryoverBankNet += Number(r.osszeg) || 0
  })
  ;(prevKiaRes.data || []).forEach((r: { osszeg: number; bankszamla_id: number | null }) => {
    if (r.bankszamla_id == null) carryoverCashNet -= Number(r.osszeg) || 0
    else carryoverBankNet -= Number(r.osszeg) || 0
  })
  const carryoverCash = hasCashCur ? recCashCur : recCashPrev + carryoverCashNet
  const carryoverBank = hasBankCur ? recBankCur : recBankPrev + carryoverBankNet

  // Évenkénti járulék
  const yearlyFees: Record<number, number> = {}
  ;(bealitasAllRes.data || []).forEach((b: { id: string; eves_jarulek: number | null }) => {
    yearlyFees[Number(b.id)] = Number(b.eves_jarulek) || 0
  })

  const yearSettings: Record<number, JarulekYearSetting> = {}
  ;(bealitasAllRes.data || []).forEach((b: { id: string; eves_jarulek: number | null }) => {
    yearSettings[Number(b.id)] = {
      year: Number(b.id),
      eves_jarulek: Number(b.eves_jarulek) || 0,
      jarulek_kedvezmenyes: null,
      jarulek_hatarid: null,
    }
  })
  ;((settingsRes.data ? [settingsRes.data] : []) as Array<{ id: string; eves_jarulek: number | null; jarulek_kedvezmenyes?: number | null; jarulek_hatarid?: string | null }>).forEach((setting) => {
    const normalizedYear = Number(setting.id)
    yearSettings[normalizedYear] = {
      year: normalizedYear,
      eves_jarulek: Number(setting.eves_jarulek) || 0,
      jarulek_kedvezmenyes: setting.jarulek_kedvezmenyes == null ? null : Number(setting.jarulek_kedvezmenyes) || 0,
      jarulek_hatarid: setting.jarulek_hatarid || null,
    }
  })

  // 2026-06-01 (hibrid család-modell Fázis 2): Személy → család (legacy_csalad_id)
  // mapping az új haztartas_tag-ból; csak aktív tagság + aktív háztartás számít.
  const personToFamilyMap: Record<number, number> = {}
  ;(
    (familiesRes.data || []) as Array<{
      id_szemely: number
      haztartas: { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null } | { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null }[] | null
    }>
  ).forEach((row) => {
    const h = Array.isArray(row.haztartas) ? row.haztartas[0] : row.haztartas
    if (!h || h.isaktiv !== true || h.ervenyes_ig != null) return
    if (h.legacy_csalad_id && row.id_szemely) {
      personToFamilyMap[row.id_szemely] = h.legacy_csalad_id
    }
  })

  const maintenancePayments = ((debtPaymentsRes.data || []) as Array<{
    id_szemely: number | null
    id_csalad: number | null
    datum: string | null
    fizetettev: number | null
    osszeg: number
    befizetescel?: PaymentGoalCodeRef | PaymentGoalCodeRef[]
  }>).filter((payment) => isChurchMaintenanceCode(getPaymentGoalCode(payment.befizetescel)))

  const exemptions = (exemptionsRes.data || []) as JarulekExemption[]
  // Ellenálló a `kezdet` oszlop hiányára (régi séma): ha a lekérdezés HIBÁZOTT, újrapróbáljuk
  // `kezdet` nélkül — különben a SELECT némán [] -t adna, és az ÖSSZES mentett kedvezmény kiesne
  // a Tartozás-listáról (a „van mentett adat, mégsem alkalmazza" tünet). A kezdet ekkor null (nyitott ablak).
  // Bit-azonos a getExpectedJarulek (Tétel-rögzítő auto-összeg) ellenállóságával — commit 535c33fc.
  let discData: Array<Record<string, unknown>> | null = discountsRes.data as Array<Record<string, unknown>> | null
  if (discountsRes.error) {
    const retry = await supabase.from('jarulek_kedvezmeny')
      .select('id, ev, tipus, aktiv, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
      .eq('congregation_id', congregationId).eq('aktiv', true)
    if (retry.error) console.warn('[initFinance] jarulek_kedvezmeny retry (kezdet nélkül) is hibázott — a kedvezmények kimaradnak:', retry.error.message)
    discData = retry.data as Array<Record<string, unknown>> | null
  }
  const discounts = ((discData || []) as unknown as JarulekDiscountRule[]).map((row) => ({
    ...row,
    ev: Number(row.ev),
    aktiv: row.aktiv !== false,
    kedv_osszeg: row.kedv_osszeg == null ? null : Number(row.kedv_osszeg) || 0,
    kor_tol: row.kor_tol == null ? null : Number(row.kor_tol) || 0,
    szazalek: row.szazalek == null ? null : Number(row.szazalek) || 0,
    fix_osszeg: row.fix_osszeg == null ? null : Number(row.fix_osszeg) || 0,
  }))

  const debtRows: DebtRow[] = ((membersRes.data || []) as Array<{
    id: number
    csaladnev: string | null
    k_nev: string | null
    prefix: string | null
    sz_datum: string | null
    foglalkozas: string | null
    meghalt: boolean | null
    elkoltozott: boolean | null
    member_status: string | null
  }>)
    .filter((member) => !member.meghalt && !member.elkoltozott && member.member_status !== 'kitért')
    .map((member) => {
      const familyId = personToFamilyMap[member.id] ?? null
      const result = computeJarulekForMemberYear({
        member: {
          id: member.id,
          sz_datum: member.sz_datum,
          familyId,
          foglalkozas: member.foglalkozas,
        },
        year,
        currentYear: year,
        debtCalcMode,
        yearSettings,
        discounts,
        exemptions,
        payments: maintenancePayments,
      })

      const nameParts = [member.prefix, member.csaladnev, member.k_nev].filter(Boolean)
      const status: DebtRow['status'] =
        result.expected === 0 ? 'felmentett' : result.debt > 0 ? 'hatralekos' : 'rendezve'

      return {
        memberId: member.id,
        familyId,
        name: nameParts.join(' '),
        expected: result.expected,
        paid: result.paid,
        debt: result.debt,
        status,
        appliedRules: result.appliedRules,
      }
    })
    .sort((a, b) => {
      if (a.status !== b.status) {
        const priority = { hatralekos: 0, rendezve: 1, felmentett: 2 }
        return priority[a.status] - priority[b.status]
      }
      if (a.debt !== b.debt) return b.debt - a.debt
      return a.name.localeCompare(b.name, 'hu')
    })

  const receiptHealth = computeReceiptHealth((bevRes.data || []) as BefitetesRow[])

  return {
    settings: (settingsRes.data || null) as BealitasRow | null,
    szamadasiCellek,
    bevCelMap,
    kiaCelMap,
    bmBevCelIds: { keszpenz: bmBevKeszpenz, banki: bmBevBanki },
    bmKiaCelIds: { keszpenz: bmKiaKeszpenz, banki: bmKiaBanki },
    bankAccounts: normalizeBankAccounts((bankRes.data || []) as Record<string, unknown>[]),
    initialIncome: (bevRes.data || []) as unknown as BefitetesRow[],
    initialExpense: (kiaRes.data || []) as unknown as KiadasRow[],
    carryoverCash,
    carryoverBank,
    internalTransfers,
    congregationName,
    congregationNameRo,
    debtCalcMode,
    yearlyFees,
    debtRows,
    receiptHealth,
    currentYear: year,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// initFinanceDiocese — scope='diocese' path
// ─────────────────────────────────────────────────────────────────────────
/**
 * Az egyházmegyei pénzügyi dashboard inicializálása. A diocese_* táblákból
 * olvas, és ugyanolyan struktúrát ad vissza, mint az `initFinance` gyülekezeti
 * path-a — így a FinanceTabs komponens scope-agnosztikusan tud dolgozni.
 *
 * Különbségek a gyülekezeti path-tól:
 *   - Tag-szintű adatok (szemely, csalad, jarulek_kedvezmeny, felmentes)
 *     üres arrayt adnak → debtRows üres
 *   - A bealitas kulcsa (eve int) és flag-ei (szamadas_veglegesitve,
 *     koltsegvetes_veglegesitve) eltérnek a gyülekezetitől → normalizálás
 *   - A bevCelMap / kiaCelMap "virtuális identitás-hash" (kulcs = érték = kód)
 *   - belsomozgas / jarulek_kedvezmeny / befizetescel junction nincs
 */
async function initFinanceDiocese(
  year: number,
  scope: FinanceScopeContext & { T: FinanceScopeTableMap },
) {
  const { supabase, scopeId: dioceseId } = scope

  const [
    settingsRes, celRes, bankRes, bevRes, kiaRes, prevBevRes, prevKiaRes,
  ] = await Promise.all([
    supabase
      .from('diocese_bealitas')
      .select('*')
      .eq('diocese_id', dioceseId)
      .eq('eve', year)
      .maybeSingle(),
    supabase.from('szamadasicel').select('*').order('sorszam'),
    supabase
      .from('bankszamlak')
      .select('*')
      .eq('scope', 'egyhazmegye')
      .eq('diocese_id', dioceseId)
      .eq('aktiv', true),
    supabase
      .from('diocese_befizetes')
      .select('*')
      .eq('diocese_id', dioceseId)
      .eq('deleted', false)
      .gte('datum', `${year}-01-01`)
      .lte('datum', `${year}-12-31`),
    supabase
      .from('diocese_kiadas')
      .select('*')
      .eq('diocese_id', dioceseId)
      .eq('deleted', false)
      .gte('datum', `${year}-01-01`)
      .lte('datum', `${year}-12-31`),
    supabase
      .from('diocese_befizetes')
      .select('osszeg, irattipus')
      .eq('diocese_id', dioceseId)
      .eq('deleted', false)
      .gte('datum', `${year - 1}-01-01`)
      .lte('datum', `${year - 1}-12-31`),
    supabase
      .from('diocese_kiadas')
      .select('osszeg, irattipus')
      .eq('diocese_id', dioceseId)
      .eq('deleted', false)
      .gte('datum', `${year - 1}-01-01`)
      .lte('datum', `${year - 1}-12-31`),
  ])

  // ── Szamadasicel: ugyanaz mint a gyülekezeti path ──
  const szamadasiCellek = ((celRes.data || []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    kod: String(row.id || ''),
  })) as unknown as SzamadasiCel[]

  // ── BevCelMap / KiaCelMap: diocese módban "virtuális identitás" ──
  // A diocese_befizetes.id_szamadasicel közvetlenül a kód string-ben.
  // A UI a bevCelMap[id] alakban keresi → kulcs=érték=kód mintát adunk vissza.
  // A `saveIncome` scope-aware path-ban ezt az identitás-kódot direktben írjuk.
  const bevCelMap: Record<string, string> = {}
  const kiaCelMap: Record<string, string> = {}
  szamadasiCellek.forEach((c) => {
    if (c.type === 'B') bevCelMap[c.id] = c.id
    if (c.type === 'K') kiaCelMap[c.id] = c.id
  })

  // ── Egyházmegye neve ──
  let dioceseName = ''
  const dioRes = await supabase
    .from('dioceses')
    .select('name')
    .eq('id', dioceseId)
    .single()
  dioceseName = dioRes.data?.name || ''

  // ── Bealitas normalizálása BealitasRow-kompatibilisra ──
  // A UI `settings.accounting_finalized` / `settings.budget_finalized` mezőket vár
  const rawSettings = settingsRes.data as Record<string, unknown> | null
  const settings: BealitasRow | null = rawSettings
    ? ({
        id: String(year),
        congregation_id: dioceseId,
        accounting_finalized: Boolean(rawSettings.szamadas_veglegesitve),
        accounting_finalized_at: rawSettings.szamadas_veglegesites_datuma as string | null,
        accounting_unlock_requested: Boolean(rawSettings.szamadas_unlock_requested),
        accounting_unlock_request_reason: rawSettings.szamadas_unlock_request_reason as string | null,
        accounting_unlock_request_at: rawSettings.szamadas_unlock_request_at as string | null,
        budget_finalized: Boolean(rawSettings.koltsegvetes_veglegesitve),
        budget_finalized_at: rawSettings.koltsegvetes_veglegesites_datuma as string | null,
        // A többi mező (eves_jarulek, járulék beállítások stb.) nem releváns diocese-ben
        eves_jarulek: 0,
        jarulek_kedvezmenyes: null,
        jarulek_hatarid: null,
        budget_mod1_finalized: false,
        budget_mod1_finalized_at: null,
        budget_mod2_finalized: false,
        budget_mod2_finalized_at: null,
        budget_mod3_finalized: false,
        budget_mod3_finalized_at: null,
      } as unknown as BealitasRow)
    : null

  // ── Átviteli egyenleg (előző évi záró) ──
  let carryoverCash = 0
  let carryoverBank = 0
  ;(prevBevRes.data || []).forEach((r: { osszeg: number; irattipus: string }) => {
    const o = Number(r.osszeg) || 0
    if (r.irattipus === 'készpénz') carryoverCash += o
    else carryoverBank += o
  })
  ;(prevKiaRes.data || []).forEach((r: { osszeg: number; irattipus: string }) => {
    const o = Number(r.osszeg) || 0
    if (r.irattipus === 'készpénz') carryoverCash -= o
    else carryoverBank -= o
  })

  // ── BM kódok: diocese-ben is jelen lehetnek a 100.01/100.02, de most fallback ──
  let bmBevKeszpenz = 0
  let bmBevBanki = 0
  let bmKiaKeszpenz = 0
  let bmKiaBanki = 0
  for (const k of Object.keys(bevCelMap)) {
    if (k === '100.01') bmBevKeszpenz = 1 // placeholder, nem használt diocese módban
    if (k === '100.02') bmBevBanki = 1
  }
  for (const k of Object.keys(kiaCelMap)) {
    if (k === '100.01') bmKiaKeszpenz = 1
    if (k === '100.02') bmKiaBanki = 1
  }

  // ── A befizetes/kiadas típushoz normalizálás ──
  // A diocese_befizetes.id_szamadasicel string, de a BefitetesRow type
  // szerint `id_befizetescel: number`. A UI ezt `bevCelMap[id]` szerint
  // dekódolja — ezért kulcs=kód mintát adjuk, és a sort-ban az id_befizetescel
  // mezőbe a kódot tesszük (mint ha id lenne).
  const initialIncome = ((bevRes.data || []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    id_befizetescel: row.id_szamadasicel as string, // a bevCelMap ebből olvas
  })) as unknown as BefitetesRow[]

  const initialExpense = ((kiaRes.data || []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    id_kiadascel: row.id_szamadasicel as string,
  })) as unknown as KiadasRow[]

  return {
    settings,
    szamadasiCellek,
    bevCelMap: bevCelMap as unknown as Record<number, string>, // TS cast a UI-kompatibilitásért
    kiaCelMap: kiaCelMap as unknown as Record<number, string>,
    bmBevCelIds: { keszpenz: bmBevKeszpenz, banki: bmBevBanki },
    bmKiaCelIds: { keszpenz: bmKiaKeszpenz, banki: bmKiaBanki },
    bankAccounts: normalizeBankAccounts((bankRes.data || []) as Record<string, unknown>[]),
    initialIncome,
    initialExpense,
    carryoverCash,
    carryoverBank,
    internalTransfers: [] as InternalTransferRow[], // Phase 5-re halasztott
    congregationName: dioceseName, // UI label, diocese módban a diocese neve
    congregationNameRo: '', // diocese módban nincs külön román gyülekezetnév
    debtCalcMode: 'akkori' as 'akkori' | 'aktualis',
    yearlyFees: {} as Record<number, number>, // diocese-nél nincs tag-járulék
    debtRows: [] as DebtRow[], // tag-szintű adósság diocese-ben nincs
    receiptHealth: {
      missingNumbers: [],
      duplicateNumbers: [],
      chronologyIssues: [],
      trackedReceiptCount: 0,
      highestReceiptNumber: null,
    } as ReceiptHealth,
    currentYear: year,
  }
}

// ── Bevétel mentés ───────────────────────────────────────────

export async function saveIncome(data: IncomeInput) {
  const parsed = incomeSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }

  const d = parsed.data
  const {
    data: { user },
  } = await scope.supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Scope-aware elágazás: diocese vagy congregation
  const insertResult = scope.scope === 'diocese'
    ? await insertDioceseIncomeRecord({
        supabase: scope.supabase,
        dioceseId: scope.scopeId,
        userId: user.id,
        input: d,
      })
    : await insertIncomeRecord({
        supabase: scope.supabase,
        congregationId: scope.scopeId,
        userId: user.id,
        input: d,
      })
  if ('error' in insertResult) return { error: insertResult.error }
  revalidatePath('/penzugy')
  return { success: true }
}

export async function saveIncomeWithLinkedInventory(data: IncomeInput, inventory: LinkedInventoryFromIncomeInput) {
  const parsedIncome = incomeSchema.safeParse(data)
  if (!parsedIncome.success) return { error: parsedIncome.error.issues[0].message }

  const parsedInventory = linkedInventoryFromIncomeSchema.safeParse(inventory)
  if (!parsedInventory.success) return { error: parsedInventory.error.issues[0].message }

  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Diocese módban a leltárhoz kapcsolt bevétel még nem támogatott (Phase 5)
  if (scope.scope === 'diocese') {
    return { error: 'A leltár-integrált bevétel rögzítés egyházmegyei módban jelenleg nem elérhető. Külön rögzítsd a bevételt és a leltári tételt.' }
  }

  const { supabase, scopeId: congregationId } = scope

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const insertResult = await insertIncomeRecord({
    supabase,
    congregationId,
    userId: user.id,
    input: parsedIncome.data,
  })

  if ('error' in insertResult) return { error: insertResult.error }

  const inventoryResult = await insertLinkedInventoryFromIncome({
    supabase,
    congregationId,
    income: parsedIncome.data,
    inventory: parsedInventory.data,
    documentNumber: insertResult.documentNumber,
  })

  if ('error' in inventoryResult) {
    await rollbackInsertedIncome(supabase, congregationId, insertResult.id)
    return { error: `A bevétel rögzítése vissza lett vonva, mert a kapcsolt alapeszköz mentése nem sikerült. ${inventoryResult.error}` }
  }

  revalidatePath('/penzugy')
  revalidatePath('/leltar')
  return { success: true }
}

// ── Kiadás mentés ────────────────────────────────────────────

export async function saveExpense(data: ExpenseInput) {
  const parsed = expenseSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }

  const d = parsed.data
  const {
    data: { user },
  } = await scope.supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Scope-aware elágazás
  const insertResult = scope.scope === 'diocese'
    ? await insertDioceseExpenseRecord({
        supabase: scope.supabase,
        dioceseId: scope.scopeId,
        userId: user.id,
        input: d,
      })
    : await insertExpenseRecord({
        supabase: scope.supabase,
        congregationId: scope.scopeId,
        userId: user.id,
        input: d,
      })
  if ('error' in insertResult) return { error: insertResult.error }

  revalidatePath('/penzugy')
  return { success: true }
}

/**
 * Kiadás mentése kapcsolt leltári tétellel — a leltári varázsló adatait is megkapja.
 * A kiadás összege lesz a leltári tétel beszerzési értéke.
 */
export async function saveExpenseWithLinkedInventory(
  data: ExpenseInput,
  inventory: LinkedInventoryFromExpenseInput,
) {
  const parsedExpense = expenseSchema.safeParse(data)
  if (!parsedExpense.success) return { error: parsedExpense.error.issues[0].message }

  const parsedInventory = linkedInventoryFromExpenseSchema.safeParse(inventory)
  if (!parsedInventory.success) return { error: parsedInventory.error.issues[0].message }

  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Diocese módban a leltár-integrált kiadás még nem támogatott (Phase 5)
  if (scope.scope === 'diocese') {
    return { error: 'A leltár-integrált kiadás rögzítés egyházmegyei módban jelenleg nem elérhető. Külön rögzítsd a kiadást és a leltári tételt.' }
  }

  const { supabase, scopeId: congregationId } = scope

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // 1. Kiadás beszúrása
  const insertResult = await insertExpenseRecord({
    supabase,
    congregationId,
    userId: user.id,
    input: parsedExpense.data,
  })
  if ('error' in insertResult) return { error: insertResult.error }

  // 2. Kapcsolt leltári tétel mentése (ugyanaz a logika mint a bevételnél)
  const inv = parsedInventory.data
  const leltariSzam = await generateNextInventoryNumberForCategory(
    supabase,
    congregationId,
    inv.kategoria,
  )

  const serializedCategory = serializeInventoryCategory(inv.kategoria as Parameters<typeof serializeInventoryCategory>[0])
  const invRecord = {
    megnevezes: inv.megnevezes,
    kategoria: serializedCategory,
    beszerzes_erteke: parsedExpense.data.osszeg,
    beszerzes_datuma: parsedExpense.data.datum || null,
    katalogus_kod: inv.katalogus_kod || null,
    hasznalati_ido: inv.hasznalati_ido || null,
    helyszin: inv.helyszin || null,
    felelos_nev: inv.felelos_nev || null,
    megjegyzes: inv.megjegyzes || null,
    deleted: false,
    congregation_id: congregationId,
    mennyiseg: 1,
    mertekegyseg: 'db',
    beszerzes_bizonylat: insertResult.documentNumber || null,
    leltari_szam: leltariSzam,
  }

  const { error: invError } = await supabase.from('leltar_tetelek').insert([invRecord])
  if (invError) {
    // Rollback: a kiadás visszavonása
    if (insertResult.id) {
      await supabase.from('kiadas').update({ deleted: true }).eq('id', insertResult.id).eq('congregation_id', congregationId)
    }
    return { error: `A kiadás visszavonva, mert a kapcsolt leltári tétel mentése nem sikerült. ${invError.message}` }
  }

  revalidatePath('/penzugy')
  revalidatePath('/leltar')
  return { success: true }
}

export async function saveIncomeBatch(rows: IncomeBatchRowInput[]) {
  const parsed = incomeBatchSchema.safeParse(rows)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }

  const {
    data: { user },
  } = await scope.supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  for (let index = 0; index < parsed.data.length; index += 1) {
    const row = parsed.data[index]
    const result = scope.scope === 'diocese'
      ? await insertDioceseIncomeRecord({
          supabase: scope.supabase,
          dioceseId: scope.scopeId,
          userId: user.id,
          // Egyházmegyei bevételnek nincs tag/család-kapcsolata.
          input: { ...row, id_szemely: null, id_csalad: null },
        })
      : await insertIncomeRecord({
          supabase: scope.supabase,
          congregationId: scope.scopeId,
          userId: user.id,
          // #4b / B1: a Tétel rögzítője által küldött tag-/család-kapcsolat MEGŐRZÉSE
          // (kölcsönösen kizáró — a komponens már gondoskodik róla).
          input: { ...row, id_szemely: row.id_szemely ?? null, id_csalad: row.id_csalad ?? null },
        })

    if ('error' in result) {
      return { error: `${index + 1}. sor: ${result.error}` }
    }
  }

  revalidatePath('/penzugy')
  return { success: true }
}

export async function saveExpenseBatch(rows: ExpenseBatchRowInput[]) {
  const parsed = expenseBatchSchema.safeParse(rows)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }

  const {
    data: { user },
  } = await scope.supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  for (let index = 0; index < parsed.data.length; index += 1) {
    const row = parsed.data[index]
    const result = scope.scope === 'diocese'
      ? await insertDioceseExpenseRecord({
          supabase: scope.supabase,
          dioceseId: scope.scopeId,
          userId: user.id,
          input: row,
        })
      : await insertExpenseRecord({
          supabase: scope.supabase,
          congregationId: scope.scopeId,
          userId: user.id,
          input: row,
        })
    if ('error' in result) {
      return { error: `${index + 1}. sor: ${result.error}` }
    }
  }

  revalidatePath('/penzugy')
  return { success: true }
}

// ── Tranzakció törlés (soft delete) ──────────────────────────

export async function deleteTransaction(type: 'befizetes' | 'kiadas', id: number) {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  const { supabase, T } = scope

  // Diocese path — egyszerűbb (nincs belsomozgas_xkey pairing MVP-ben)
  if (scope.scope === 'diocese') {
    const table = type === 'befizetes' ? T.befizetes : T.kiadas
    const { error } = await supabase
      .from(table)
      .update({ deleted: true })
      .eq('id', id)
      .eq('diocese_id', scope.scopeId)
    if (error) return { error: `Hiba: ${error.message}` }
    revalidatePath('/penzugy')
    return { success: true }
  }

  // Congregation path (változatlan logika — belsomozgas pairing)
  const congregationId = scope.scopeId

  // Belső mozgás: mindkét oldalt töröljük
  if (type === 'befizetes') {
    const { data: rec } = await supabase.from('befizetes').select('belso_mozgas_xkey').eq('id', id).eq('congregation_id', congregationId).single()
    if (rec?.belso_mozgas_xkey) {
      await supabase.from('befizetes').update({ deleted: true }).eq('belso_mozgas_xkey', rec.belso_mozgas_xkey).eq('congregation_id', congregationId)
      await supabase.from('kiadas').update({ deleted: true }).eq('belso_mozgas_xkey', rec.belso_mozgas_xkey).eq('congregation_id', congregationId)
      revalidatePath('/penzugy')
      return { success: true }
    }
  }
  if (type === 'kiadas') {
    const { data: rec } = await supabase.from('kiadas').select('belso_mozgas_xkey').eq('id', id).eq('congregation_id', congregationId).single()
    if (rec?.belso_mozgas_xkey) {
      await supabase.from('befizetes').update({ deleted: true }).eq('belso_mozgas_xkey', rec.belso_mozgas_xkey).eq('congregation_id', congregationId)
      await supabase.from('kiadas').update({ deleted: true }).eq('belso_mozgas_xkey', rec.belso_mozgas_xkey).eq('congregation_id', congregationId)
      revalidatePath('/penzugy')
      return { success: true }
    }
  }

  const { error } = await supabase.from(type).update({ deleted: true }).eq('id', id).eq('congregation_id', congregationId)
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/penzugy')
  return { success: true }
}

// ── Következő nyugtaszám ─────────────────────────────────────

export async function getNextReceiptNumber(year: number): Promise<number> {
  const scope = await getFinanceScope()
  if (!scope) return 1
  const { supabase, T } = scope

  let q = supabase.from(T.befizetes)
    .select('iratszam')
    .eq(T.scopeCol, scope.scopeId)
    .eq('deleted', false)
    .ilike('irattipus', '%észpénz%')
    .gte('datum', `${year}-01-01`)
    .lte('datum', `${year}-12-31`)
  // belso_mozgas_xkey csak congregation táblában
  if (scope.scope === 'congregation') {
    q = q.is('belso_mozgas_xkey', null)
  }

  const { data } = await q

  let maxNum = 0
  ;(data || []).forEach((r: { iratszam: string | null }) => {
    const m = String(r.iratszam || '').match(/(\d+)/)
    if (m && parseInt(m[1]) > maxNum) maxNum = parseInt(m[1])
  })
  return maxNum + 1
}

// ── #3 (Endre): következő nyugtaszámok — kerületi (nyomdai) + gyülekezeti ──
// A nyugtán KÉT szám van: a kerületi (a kerülettől kapott, előre nyomtatott szám —
// `befizetes.iratszam`) és a gyülekezeti (a gyülekezet saját sorszáma — `befizetes.nyugta`).
// Mindkettő FOLYAMATOS (hézagmentes): a következő = az UTOLSÓ nyugta számai + 1.
// „Utolsó" = a legnagyobb kerületi számú sor — ennek a sornak vesszük MINDKÉT számát,
// és léptetjük +1-gyel (lépésben), a vezető nullák megőrzésével (pl. „0115301" → „0115302").
// Így a két szám együtt lép, és a régi (tükrözött nyugta=iratszam) adat sem rontja el a
// gyülekezeti sorozatot az első valódi tétel után (önjavító).
export async function getNextReceiptNumbers(
  year: number,
): Promise<{ keruleti: string; gyulekezeti: string; ujEv?: boolean; tavalyiUtolso?: string; tavalyiEv?: number }> {
  const scope = await getFinanceScope()
  if (!scope) return { keruleti: '', gyulekezeti: '' }
  const { supabase, T } = scope

  // Egy számsorozat maximuma (numerikus) + a max értékhez tartozó számjegy-szélesség.
  function maxNumOf(values: Array<string | null>): { num: number; width: number } {
    let num = 0
    let width = 0
    for (const v of values) {
      const m = String(v || '').match(/(\d+)/)
      if (!m) continue
      const n = parseInt(m[1], 10)
      if (n > num) { num = n; width = m[1].length }
    }
    return { num, width }
  }
  const pad = (n: number, width: number) => (width > 0 ? String(n).padStart(width, '0') : String(n))

  // KERÜLETI (nyomdai) szám — EGYSZERŰ: az ÖSSZES készpénz-iratszám MAX + 1 (folytonos, év-független).
  // NINCS nyugtatömb-függőség (a tömb csak a NYOMTATÁSHOZ kell, a rögzítéshez nem).
  // 2026-06-30 FIX (Endre hibajelzés): a készpénzt a kanonikus `bankszamla_id IS NULL`
  // (kassza) alapján azonosítjuk, NEM az `irattipus`-ból. Így az IMPORTÁLT nyugták is
  // beleszámítanak a sorozatba — ezek bankszamla_id nélkül = kassza, de irattipus-uk
  // 'chitanta' / 'általános import' / fájlból jövő érték, amit az `irattipus ILIKE
  // '%észpénz%'` szűrő kihagyott. Emiatt nem találta a Chitanță auto-számozás az
  // importból hozott utolsó kerületi/gyülekezeti számot. (Manuális-only gyülekezetnél
  // a halmaz változatlan: a kézi készpénz 'Készpénz' = bankszamla_id NULL.)
  let allQ = supabase.from(T.befizetes)
    .select('iratszam, nyugta')
    .eq(T.scopeCol, scope.scopeId)
    .eq('deleted', false)
    .is('bankszamla_id', null)
  if (scope.scope === 'congregation') allQ = allQ.is('belso_mozgas_xkey', null)
  const { data: allData } = await allQ
  // CSAK a valódi kerületi iratszámokat nézzük: kizárjuk az „AUTO-…" auto-generált iratszámot
  // (üres iratszámú készpénz-tételnél keletkezik — dátumszerű számjegyei az égbe húznák a kerületi
  // következőt). A tükrözés-kizárást (nyugta === iratszam) NEM alkalmazzuk: az kiejtette a régi/
  // import kerületi előzményt is, így a mező üresen maradt — a max úgyis a legnagyobb valódi számot veszi.
  const keruletiVals = ((allData || []) as Array<{ iratszam: string | null; nyugta: string | null }>)
    .filter((r) => r.iratszam && !/^AUTO/i.test(r.iratszam))
    .map((r) => r.iratszam)
  const befMax = maxNumOf(keruletiVals)
  const keruleti = befMax.num > 0 ? pad(befMax.num + 1, befMax.width) : ''

  // GYÜLEKEZETI saját sorszám: évente 1-től ÚJRAINDUL → az adott NAPTÁRI év valódi nyugta-számai
  // (nyugta != iratszam, hogy a tükrözött import-adat ne rontson). MAX + 1.
  let yearQ = supabase.from(T.befizetes)
    .select('iratszam, nyugta')
    .eq(T.scopeCol, scope.scopeId)
    .eq('deleted', false)
    .is('bankszamla_id', null)
    .gte('datum', `${year}-01-01`)
    .lte('datum', `${year}-12-31`)
  if (scope.scope === 'congregation') yearQ = yearQ.is('belso_mozgas_xkey', null)
  const { data: yearData } = await yearQ
  const thisYear = maxNumOf(
    ((yearData || []) as Array<{ iratszam: string | null; nyugta: string | null }>)
      .filter((r) => r.nyugta && r.nyugta !== r.iratszam)
      .map((r) => r.nyugta),
  )
  if (thisYear.num > 0) {
    // Folytonos az éven belül — nincs kérdés, csak +1.
    return { keruleti, gyulekezeti: pad(thisYear.num + 1, thisYear.width) }
  }

  // Nincs ezévi gyülekezeti szám → van-e KORÁBBI évi? (ÚJ ÉV → a hívó kérdezzen rá)
  let prevQ = supabase.from(T.befizetes)
    .select('iratszam, nyugta, datum')
    .eq(T.scopeCol, scope.scopeId)
    .eq('deleted', false)
    .is('bankszamla_id', null)
    .lt('datum', `${year}-01-01`)
    .order('datum', { ascending: false })
    .limit(500)
  if (scope.scope === 'congregation') prevQ = prevQ.is('belso_mozgas_xkey', null)
  const { data: prevData } = await prevQ
  const prevRows = ((prevData || []) as Array<{ iratszam: string | null; nyugta: string | null; datum: string }>)
    .filter((r) => r.nyugta && r.nyugta !== r.iratszam)
  if (prevRows.length === 0) {
    // Soha nem volt gyülekezeti nyugta → első valaha: 1-től, nincs kérdés.
    return { keruleti, gyulekezeti: '1' }
  }
  // A legutóbbi KORÁBBI év + annak utolsó (max) gyülekezeti száma → ÚJ ÉV: döntés kell.
  let maxYear = 0
  for (const r of prevRows) { const y = parseInt(r.datum.slice(0, 4), 10); if (y > maxYear) maxYear = y }
  const prevMax = maxNumOf(prevRows.filter((r) => parseInt(r.datum.slice(0, 4), 10) === maxYear).map((r) => r.nyugta))
  return {
    keruleti,
    gyulekezeti: prevMax.num > 0 ? pad(prevMax.num + 1, prevMax.width) : '1', // alapértelmezett ajánlat: folytatás
    ujEv: true,
    tavalyiUtolso: prevMax.num > 0 ? pad(prevMax.num, prevMax.width) : '0',
    tavalyiEv: maxYear,
  }
}

// ── Utolsó rögzített dátum ───────────────────────────────────

export async function getLastRecordedDate(): Promise<string | null> {
  const scope = await getFinanceScope()
  if (!scope) return null
  const { supabase, T } = scope

  const [bevRes, kiaRes] = await Promise.all([
    supabase.from(T.befizetes).select('datum').eq(T.scopeCol, scope.scopeId).eq('deleted', false).order('datum', { ascending: false }).limit(1),
    supabase.from(T.kiadas).select('datum').eq(T.scopeCol, scope.scopeId).eq('deleted', false).order('datum', { ascending: false }).limit(1),
  ])
  const bevDate = bevRes.data?.[0]?.datum || null
  const kiaDate = kiaRes.data?.[0]?.datum || null
  if (!bevDate) return kiaDate
  if (!kiaDate) return bevDate
  return bevDate > kiaDate ? bevDate : kiaDate
}

// ── Tag keresés (bevételhez) ─────────────────────────────────

export async function searchMembersForFinance(query: string) {
  if (query.trim().length < 2) return []
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return []
  // ekezet-javitas: a raw (ekezetes) query-vel keresunk - az ilike NEM ekezet-erzeketlen,
  // ezert a strippelt query (pl. Kovacs) sosem talalna meg az ekezetes DB-nevet (Kovacs).
  const parts = query.trim().split(/\s+/)
  let q = supabase.from('szemely')
    .select('id, csaladnev, k_nev, sz_datum, c_szam, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
    .eq('congregation_id', congregationId).eq('isvisible', true).eq('meghalt', false)

  if (parts.length === 1) q = q.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`)
  else q = q.ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`)

  const { data } = await q.limit(8)
  return data || []
}

// ── #5 (Endre): kiadás-partner autocomplete ──────────────────
// A korábban már rögzített kiadás-partnerek (atvevo) közül ajánl, gépelés közben.
export async function searchExpensePartners(query: string): Promise<string[]> {
  const term = query.trim()
  if (term.length < 2) return []
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return []
  const { data } = await supabase
    .from('kiadas')
    .select('atvevo, datum')
    .eq('congregation_id', congregationId)
    .eq('deleted', false)
    .ilike('atvevo', `%${term}%`)
    .order('datum', { ascending: false })
    .limit(60)
  const seen = new Set<string>()
  const names: string[] = []
  for (const r of (data || []) as { atvevo: string | null }[]) {
    const n = (r.atvevo || '').trim()
    const key = n.toLowerCase()
    if (n && !seen.has(key)) {
      seen.add(key)
      names.push(n)
      if (names.length >= 8) break
    }
  }
  return names
}

// ── B1 javítás: Személy → család ID meghatározás ─────────────

export async function getFamilyIdForPerson(personId: number): Promise<number | null> {
  const supabase = await createClient()
  // 2026-06-01 (hibrid család-modell Fázis 2): aktív haztartas_tag-ból kérdezzük,
  // a haztartas.legacy_csalad_id visszafelé-kompatibilis a régi csalad.id-vel.
  // Bármilyen szerep (családfő/házastárs/gyermek/lakótárs) jó — fő a tagság.
  const { data } = await supabase
    .from('haztartas_tag')
    .select('haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
    .eq('id_szemely', personId)
    .is('ervenyes_ig', null)
    .limit(5)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data || []) as any[]) {
    const h = Array.isArray(row.haztartas) ? row.haztartas[0] : row.haztartas
    if (h && h.isaktiv === true && h.ervenyes_ig == null && h.legacy_csalad_id) {
      return h.legacy_csalad_id as number
    }
  }
  // Fallback a régi modellre (ha valamiért nincs új-modell tagság)
  const { data: asParent } = await supabase.from('csalad')
    .select('id').or(`id_ferfi.eq.${personId},id_no.eq.${personId}`).limit(1)
  if (asParent?.[0]) return asParent[0].id
  const { data: asChild } = await supabase.from('gyerek')
    .select('id_csalad').eq('id_szemely', personId).limit(1)
  if (asChild?.[0]) return asChild[0].id_csalad
  return null
}

// ── #4b (Endre): Családi nyugta — család-keresés + tagok ──────
// Egy nyugta, több név: a felhasználó kikeresi a családot (a tagok nevére/címére),
// majd a tagok mellé összeget ír. A keresés a SZEMÉLY-találatokat családokká
// csoportosítja (legacy csalad.id); a tagok a családfők + gyerekek + a hibrid
// haztartas_tag tagok alapján. (A csalad táblának nincs congregation_id-je — a
// gyülekezet-szűrés a kiinduló személyeknél történik.)

export async function searchFamilies(
  query: string,
): Promise<Array<{ id: number; name: string; detail?: string }>> {
  const term = query.trim()
  if (term.length < 2) return []
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return []

  // ekezet-javitas: raw (ekezetes) query (lasd searchMembersForFinance)
  const parts = term.split(/\s+/).filter(Boolean)

  // 1) Találó személyek (vezeték-/keresztnévre)
  let pq = supabase.from('szemely').select('id').eq('congregation_id', congregationId).eq('isvisible', true)
  if (parts.length === 1) pq = pq.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`)
  else pq = pq.ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`)
  const { data: persons } = await pq.limit(40)
  const personIds = (persons || []).map((p) => (p as { id: number }).id)
  if (!personIds.length) return []
  const idList = personIds.join(',')

  // 2) E személyek családjai (családfő / gyerek / hibrid háztartás-tag)
  const familyIds = new Set<number>()
  const { data: asHead } = await supabase.from('csalad')
    .select('id').or(`id_ferfi.in.(${idList}),id_no.in.(${idList})`).limit(40)
  for (const r of (asHead || []) as Array<{ id: number }>) familyIds.add(r.id)
  const { data: asChild } = await supabase.from('gyerek')
    .select('id_csalad').in('id_szemely', personIds).limit(80)
  for (const r of (asChild || []) as Array<{ id_csalad: number | null }>) if (r.id_csalad) familyIds.add(r.id_csalad)
  const { data: asTag } = await supabase.from('haztartas_tag')
    .select('haztartas:haztartas!id_haztartas(legacy_csalad_id)').in('id_szemely', personIds).is('ervenyes_ig', null).limit(80)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (asTag || []) as any[]) {
    const h = Array.isArray(r.haztartas) ? r.haztartas[0] : r.haztartas
    if (h?.legacy_csalad_id) familyIds.add(h.legacy_csalad_id as number)
  }
  if (!familyIds.size) return []

  // 3) Család-részletek (családfők + cím)
  const ids = [...familyIds].slice(0, 12)
  const { data: fams } = await supabase.from('csalad')
    .select(
      'id, c_szam, ferfi:szemely!csalad_id_ferfi_fk(csaladnev, k_nev), no:szemely!csalad_id_no_fk(csaladnev, k_nev), utca:adrstreet!csalad_c_utcaid_fk(name)',
    )
    .in('id', ids)
  const nameOf = (p: { csaladnev?: string | null; k_nev?: string | null } | null | undefined) =>
    p ? `${p.csaladnev ?? ''} ${p.k_nev ?? ''}`.trim() : ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((fams || []) as any[]).map((f) => {
    const ferfi = Array.isArray(f.ferfi) ? f.ferfi[0] : f.ferfi
    const no = Array.isArray(f.no) ? f.no[0] : f.no
    const utca = Array.isArray(f.utca) ? f.utca[0] : f.utca
    const heads = [nameOf(ferfi), nameOf(no)].filter(Boolean).join(' & ') || `Család #${f.id}`
    const addr = [utca?.name, f.c_szam].filter(Boolean).join(' ')
    return { id: f.id as number, name: heads, detail: addr || undefined }
  })
}

export async function getFamilyMembers(
  familyId: number,
): Promise<Array<{ id: number; name: string; role?: string }>> {
  const { supabase, congregationId } = await getProfileCongregation()
  const members = new Map<number, { id: number; name: string; role?: string }>()
  const nameOf = (p: { id: number; csaladnev?: string | null; k_nev?: string | null }) =>
    `${p.csaladnev ?? ''} ${p.k_nev ?? ''}`.trim() || `#${p.id}`

  // Családfők
  const { data: fam } = await supabase.from('csalad')
    .select('ferfi:szemely!csalad_id_ferfi_fk(id, csaladnev, k_nev), no:szemely!csalad_id_no_fk(id, csaladnev, k_nev)')
    .eq('id', familyId).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const famAny = fam as any
  if (famAny) {
    const ferfi = Array.isArray(famAny.ferfi) ? famAny.ferfi[0] : famAny.ferfi
    const no = Array.isArray(famAny.no) ? famAny.no[0] : famAny.no
    if (ferfi?.id) members.set(ferfi.id, { id: ferfi.id, name: nameOf(ferfi), role: 'családfő' })
    if (no?.id) members.set(no.id, { id: no.id, name: nameOf(no), role: 'házastárs' })
  }

  // Gyermekek
  const { data: kids } = await supabase.from('gyerek')
    .select('szemely:szemely!gyerek_id_szemely_fk(id, csaladnev, k_nev)').eq('id_csalad', familyId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const k of (kids || []) as any[]) {
    const s = Array.isArray(k.szemely) ? k.szemely[0] : k.szemely
    if (s?.id && !members.has(s.id)) members.set(s.id, { id: s.id, name: nameOf(s), role: 'gyermek' })
  }

  // Hibrid háztartás-tagok (legacy_csalad_id alapján) — pl. lakótárs, nagyszülő
  if (congregationId) {
    const { data: hh } = await supabase.from('haztartas')
      .select('id').eq('congregation_id', congregationId).eq('legacy_csalad_id', familyId).limit(1)
    const haztartasId = (hh?.[0] as { id: string } | undefined)?.id
    if (haztartasId) {
      const { data: tags } = await supabase.from('haztartas_tag')
        .select('szerep, szemely:szemely!id_szemely(id, csaladnev, k_nev)')
        .eq('id_haztartas', haztartasId).is('ervenyes_ig', null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const t of (tags || []) as any[]) {
        const s = Array.isArray(t.szemely) ? t.szemely[0] : t.szemely
        if (s?.id && !members.has(s.id)) members.set(s.id, { id: s.id, name: nameOf(s), role: t.szerep || 'tag' })
      }
    }
  }

  return [...members.values()]
}

// Okos „Család csatolása": egy KIVÁLASZTOTT személy (befizető) családtagjai egy lépésben.
// A személy családját feloldjuk (getFamilyIdForPerson), majd a tagokat lekérjük (getFamilyMembers).
// Üres / nincs család → üres lista (a hívó ilyenkor a család-kereső ablakra esik vissza).
export async function getFamilyMembersForPerson(
  personId: number,
): Promise<Array<{ id: number; name: string; role?: string }>> {
  const familyId = await getFamilyIdForPerson(personId)
  if (familyId == null) return []
  return getFamilyMembers(familyId)
}

// (B) Egyházfenntartói járulék AUTO-ÖSSZEG (Endre, 2026-06-21): EGY tag adott évi járuléka a
// Tétel-rögzítő automatikus kitöltéséhez. A meglévő computeJarulekForMemberYear motort használja
// (single-source-of-truth a Tartozások-listával) — single-person szűréssel. `currentYear: year`,
// hogy az eredmény BIT-AZONOS legyen az aggregát Tartozások-listával (lásd a nagy initFinance fv-t).
// Visszaad {expected, paid, debt} | null (null = nincs scope / ismeretlen tag / hiba → nincs auto-kitöltés).
export async function getExpectedJarulek(
  personId: number,
  year: number,
  // (B/J6): a beírni kívánt befizetés dátuma (ISO) — a korai-fizetés/időszaki kedvezmény
  // PROSPEKTÍV alkalmazásához (a dátum a határidő előtt van-e), hogy az auto-összeg a kedvezményes
  // célt ajánlja. A Tartozás-lista NEM adja meg → ott a retrospektív (bit-azonos) viselkedés marad.
  prospectiveDateIso?: string,
): Promise<{ expected: number; paid: number; debt: number } | null> {
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return null

  // 1. fázis: tag + beállítás + kedvezmények + felmentések + család + számítási mód (párhuzamosan).
  const [memberRes, bealitasRes, discRes, exRes, famRes, congRes] = await Promise.all([
    supabase.from('szemely').select('id, sz_datum, foglalkozas').eq('id', personId).eq('congregation_id', congregationId).maybeSingle(),
    supabase.from('bealitas').select('id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid').eq('congregation_id', congregationId).eq('id', String(year)).maybeSingle(),
    supabase.from('jarulek_kedvezmeny').select('id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras').eq('congregation_id', congregationId).eq('aktiv', true).eq('ev', year),
    supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').eq('congregation_id', congregationId),
    supabase.from('haztartas_tag').select('id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)').eq('congregation_id', congregationId).eq('id_szemely', personId).is('ervenyes_ig', null),
    supabase.from('congregations').select('tartozas_szamitas_mod').eq('id', congregationId).maybeSingle(),
  ])

  const member = memberRes.data as { id: number; sz_datum: string | null; foglalkozas: string | null } | null
  if (!member) return null // ismeretlen tag a gyülekezetben → nincs auto-kitöltés

  // Család (legacy_csalad_id): aktív háztartás-tagság alapján (mint az aggregát 940-944).
  let familyId: number | null = null
  for (const row of (famRes.data || []) as Array<{ haztartas: { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null } | { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null }[] | null }>) {
    const h = Array.isArray(row.haztartas) ? row.haztartas[0] : row.haztartas
    if (h && h.isaktiv === true && h.ervenyes_ig == null && h.legacy_csalad_id) { familyId = h.legacy_csalad_id; break }
  }

  // 2. fázis: a tag (és családja) egyházfenntartás-befizetései az adott ÉVRE (fizetettev=year).
  let payQ = supabase.from('befizetes')
    .select('id_szemely, id_csalad, datum, fizetettev, osszeg, befizetescel(szamadasicel(kod))')
    .eq('congregation_id', congregationId)
    .eq('fizetettev', year)
    .or('deleted.eq.false,deleted.is.null')
  // FONTOS: id_csalad.eq.null tilos Supabase-ben — ha nincs család, csak személyre szűrünk.
  payQ = familyId != null ? payQ.or(`id_szemely.eq.${personId},id_csalad.eq.${familyId}`) : payQ.eq('id_szemely', personId)
  const { data: payData } = await payQ
  const maintenancePayments = ((payData || []) as Array<{
    id_szemely: number | null; id_csalad: number | null; datum: string | null; fizetettev: number | null; osszeg: number; befizetescel?: PaymentGoalCodeRef | PaymentGoalCodeRef[]
  }>).filter((p) => isChurchMaintenanceCode(getPaymentGoalCode(p.befizetescel)))

  // Az aggregáttal AZONOS normalizálás (a Number()-konverziók KÖTELEZŐK).
  const yearSettings: Record<number, JarulekYearSetting> = {}
  const b = bealitasRes.data as { id: string; eves_jarulek: number | null; jarulek_kedvezmenyes?: number | null; jarulek_hatarid?: string | null } | null
  if (b) {
    yearSettings[Number(b.id)] = {
      year: Number(b.id),
      eves_jarulek: Number(b.eves_jarulek) || 0,
      jarulek_kedvezmenyes: b.jarulek_kedvezmenyes == null ? null : Number(b.jarulek_kedvezmenyes) || 0,
      jarulek_hatarid: b.jarulek_hatarid || null,
    }
  }
  // Ellenálló a `kezdet` oszlop hiányára (régi séma): ha a lekérdezés HIBÁZOTT, újrapróbáljuk
  // `kezdet` nélkül — különben a SELECT némán [] -t adna, és az ÖSSZES mentett kedvezmény kiesne
  // (ez a „van mentett adat, mégsem alkalmazza" tünet leggyakoribb oka). A kezdet ekkor null (nyitott ablak).
  let discData: Array<Record<string, unknown>> | null = discRes.data as Array<Record<string, unknown>> | null
  if (discRes.error) {
    const retry = await supabase.from('jarulek_kedvezmeny')
      .select('id, ev, tipus, aktiv, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
      .eq('congregation_id', congregationId).eq('aktiv', true).eq('ev', year)
    if (retry.error) console.warn('[getExpectedJarulek] jarulek_kedvezmeny retry (kezdet nélkül) is hibázott — a kedvezmények kimaradnak:', retry.error.message)
    discData = retry.data as Array<Record<string, unknown>> | null
  }
  const discounts = ((discData || []) as unknown as JarulekDiscountRule[]).map((row) => ({
    ...row,
    ev: Number(row.ev),
    aktiv: row.aktiv !== false,
    kedv_osszeg: row.kedv_osszeg == null ? null : Number(row.kedv_osszeg) || 0,
    kor_tol: row.kor_tol == null ? null : Number(row.kor_tol) || 0,
    szazalek: row.szazalek == null ? null : Number(row.szazalek) || 0,
    fix_osszeg: row.fix_osszeg == null ? null : Number(row.fix_osszeg) || 0,
  }))
  const exemptions = (exRes.data || []) as JarulekExemption[]
  const debtCalcMode = normalizeDebtCalcMode(congRes.error ? null : (congRes.data as { tartozas_szamitas_mod?: unknown } | null)?.tartozas_szamitas_mod)

  const prospectiveDate = prospectiveDateIso ? new Date(prospectiveDateIso) : null
  const result = computeJarulekForMemberYear({
    member: { id: member.id, sz_datum: member.sz_datum, familyId, foglalkozas: member.foglalkozas },
    year,
    currentYear: year, // D2: bit-azonos a Tartozások-listával
    debtCalcMode,
    yearSettings,
    discounts,
    exemptions,
    payments: maintenancePayments,
    prospectiveDate: prospectiveDate && !Number.isNaN(prospectiveDate.getTime()) ? prospectiveDate : null,
  })
  return { expected: result.expected, paid: result.paid, debt: result.debt }
}

// ── H2 javítás: Iratszám duplikáció ellenőrzés ──────────────

export async function checkReceiptDuplicate(iratszam: string): Promise<boolean> {
  if (!iratszam.trim()) return false
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return false
  const { data } = await supabase.from('befizetes')
    .select('id').eq('congregation_id', congregationId).eq('iratszam', iratszam.trim()).eq('deleted', false).limit(1)
  return (data?.length || 0) > 0
}

// ── H7 javítás: Éves beállítás létrehozás ────────────────────

export async function createYearlySettings(
  year: number,
  evesJarulek: number,
  jarulekHatarid: string,
  // A render-útvonal (page.tsx) NEM hívhat revalidatePath-ot renderelés közben (Next 16
  // hiba). Onnan revalidate:false-szal hívjuk; a kliens-modalból marad az alapértelmezett true.
  opts?: { revalidate?: boolean },
) {
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const yearId = String(year)
  const { data: congregation } = await supabase
    .from('congregations')
    .select('adrstreet_id, adrlocality_id')
    .eq('id', congregationId)
    .maybeSingle()
  let streetId = Number(congregation?.adrstreet_id) || null
  if (!streetId) {
    const { data: fallbackStreet } = await supabase
      .from('adrstreet')
      .select('id')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    streetId = Number(fallbackStreet?.id) || 1
  }
  const localityId = congregation?.adrlocality_id ?? null

  const basePayload = {
    id: yearId,
    congregation_id: congregationId,
    eves_jarulek: evesJarulek,
    jarulek_hatarid: jarulekHatarid || '07-01',
    jarulek_kedvezmenyes: 0,
    aktiv: true,
    isszemelyibefizetes: false,
    isszulokkulon: false,
    felmentes70felul: false,
    felmentesideneskudtek: false,
    kedvezmenyxevenfelul: false,
    utcaid: streetId,
    helysegid: localityId,
    budget_finalized: false,
    accounting_finalized: false,
    unlock_requested: false,
    accounting_unlock_requested: false,
    leltar_finalized: false,
    leltar_unlock_requested: false,
    unlock_reason: null,
    accounting_unlock_reason: null,
    leltar_unlock_reason: null,
    szamadas_zaro_adatok: {},
    nyito_keszpenz: 0,
    nyito_bank: 0,
  }

  let { error } = await supabase
    .from('bealitas')
    .upsert([basePayload], { onConflict: 'id,congregation_id' })

  if (error && shouldRetryLegacySettingsInsert(error.message)) {
    const { data: previousSettings } = await supabase
      .from('bealitas')
      .select('*')
      .eq('congregation_id', congregationId)
      .lt('id', yearId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (previousSettings) {
      const legacyCompatiblePayload = {
        ...(previousSettings as Record<string, unknown>),
        ...basePayload,
      }
      const retry = await supabase
        .from('bealitas')
        .upsert([legacyCompatiblePayload], { onConflict: 'id,congregation_id' })
      error = retry.error
    }
  }

  if (error && shouldRetryLegacySettingsInsert(error.message)) {
    return {
      error: 'Az eves beallitas letrehozasahez a jelenlegi adatbazis tovabbi kotelezo mezoket var. Hozzon letre egy korabbi evi beallitast, vagy egeszitsuk ki kulon a legacy mezo-kompatibilitast.'
    }
  }

  if (error) return { error: `Hiba: ${error.message}` }
  if (opts?.revalidate !== false) revalidatePath('/penzugy')
  return { success: true }
}

// ── Párosítatlan befizetések ─────────────────────────────────

type YearlyFinanceFlagUpdates = Partial<
  Pick<BealitasRow, 'budget_finalized' | 'accounting_finalized' | 'unlock_requested' | 'accounting_unlock_requested'>
> & {
  unlock_reason?: string | null
  accounting_unlock_reason?: string | null
}

async function updateYearlyFinanceFlags(year: number, updates: YearlyFinanceFlagUpdates) {
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasznalo.' }

  const { error } = await supabase
    .from('bealitas')
    .update(updates)
    .eq('id', String(year))
    .eq('congregation_id', congregationId)

  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/penzugy')
  return { success: true }
}

export async function finalizeBudget(year: number) {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }

  if (scope.scope === 'diocese') {
    // Diocese path: upsert diocese_bealitas
    const { error } = await scope.supabase
      .from('diocese_bealitas')
      .upsert(
        {
          diocese_id: scope.scopeId,
          eve: year,
          koltsegvetes_veglegesitve: true,
          koltsegvetes_veglegesites_datuma: new Date().toISOString().slice(0, 10),
          koltsegvetes_veglegesitette: scope.userId,
        },
        { onConflict: 'diocese_id,eve' },
      )
    if (error) return { error: `Hiba: ${error.message}` }
    revalidatePath('/penzugy')
    return { success: true }
  }

  return updateYearlyFinanceFlags(year, { budget_finalized: true })
}

export async function requestBudgetUnlock(year: number, reason?: string | null) {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }

  if (scope.scope === 'diocese') {
    return { error: 'A költségvetés feloldása egyházmegyei szinten jelenleg nem támogatott — kérlek egyeztess a kerülettel.' }
  }

  return updateYearlyFinanceFlags(year, {
    unlock_requested: true,
    unlock_reason: reason?.trim() || null,
  })
}

export async function finalizeAccounting(
  year: number,
  meta?: {
    jegyzokonyviSzam?: string | null
    targyalasDatuma?: string | null
    alairok?: string[] | null
  },
) {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  const { supabase, T } = scope

  // Aggregáljuk a tényleges adatokat
  // Scope-aware: befizetes/kiadas vs diocese_befizetes/diocese_kiadas
  const categoryColBef = T.categoryColBefizetes
  const categoryColKia = T.categoryColKiadas

  const { data: incomeData } = await supabase.from(T.befizetes)
    .select(`${categoryColBef}, osszeg`)
    .eq(T.scopeCol, scope.scopeId)
    .eq('deleted', false)
    .gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`)
  const { data: expenseData } = await supabase.from(T.kiadas)
    .select(`${categoryColKia}, osszeg`)
    .eq(T.scopeCol, scope.scopeId)
    .eq('deleted', false)
    .gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`)

  const snapshot: Record<string, unknown> = {
    income: {},
    expense: {},
    totalIncome: 0,
    totalExpense: 0,
    generatedAt: new Date().toISOString(),
    ...(meta?.jegyzokonyviSzam ? { jegyzokonyviSzam: meta.jegyzokonyviSzam } : {}),
    ...(meta?.targyalasDatuma ? { targyalasDatuma: meta.targyalasDatuma } : {}),
    ...(meta?.alairok ? { alairok: meta.alairok } : {}),
  }

  let totalInc = 0
  let totalExp = 0
  for (const r of (incomeData || []) as Array<Record<string, unknown>>) {
    const key = String(r[categoryColBef] || 0)
    ;(snapshot.income as Record<string, number>)[key] = ((snapshot.income as Record<string, number>)[key] || 0) + Number(r.osszeg || 0)
    totalInc += Number(r.osszeg || 0)
  }
  for (const r of (expenseData || []) as Array<Record<string, unknown>>) {
    const key = String(r[categoryColKia] || 0)
    ;(snapshot.expense as Record<string, number>)[key] = ((snapshot.expense as Record<string, number>)[key] || 0) + Number(r.osszeg || 0)
    totalExp += Number(r.osszeg || 0)
  }
  snapshot.totalIncome = totalInc
  snapshot.totalExpense = totalExp

  // Scope-aware finalize
  if (scope.scope === 'diocese') {
    // 1. diocese_bealitas upsert
    const { error: bealitasErr } = await supabase
      .from('diocese_bealitas')
      .upsert(
        {
          diocese_id: scope.scopeId,
          eve: year,
          szamadas_veglegesitve: true,
          szamadas_veglegesites_datuma: new Date().toISOString().slice(0, 10),
          szamadas_veglegesitette: scope.userId,
        },
        { onConflict: 'diocese_id,eve' },
      )
    if (bealitasErr) return { error: `Hiba (diocese_bealitas): ${bealitasErr.message}` }

    // 2. diocese_annual_reports upsert (submission + finalization egy lépésben)
    const nowIso = new Date().toISOString()
    const { error: arErr } = await supabase
      .from('diocese_annual_reports')
      .upsert(
        {
          diocese_id: scope.scopeId,
          year,
          status: 'finalized',
          snapshot_data: snapshot,
          submitted_at: nowIso,
          submitted_by: scope.userId,
          finalized_at: nowIso,
          finalized_by: scope.userId,
        },
        { onConflict: 'diocese_id,year' },
      )
    if (arErr) return { error: `Véglegesítve, de annual_report hiba: ${arErr.message}` }

    revalidatePath('/penzugy')
    revalidatePath('/dashboard-egyhazmegye')
    return { success: true }
  }

  // Congregation path (eredeti logika)
  const { error } = await supabase
    .from('bealitas')
    .update({
      accounting_finalized: true,
      szamadas_zaro_adatok: snapshot,
      ...(meta?.jegyzokonyviSzam ? { szamadas_hatarozat_szam: meta.jegyzokonyviSzam } : {}),
      ...(meta?.targyalasDatuma ? { szamadas_hatarozat_datum: meta.targyalasDatuma } : {}),
    })
    .eq('id', String(year))
    .eq('congregation_id', scope.scopeId)

  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/penzugy')
  return { success: true }
}

export async function requestAccountingUnlock(year: number, reason?: string | null) {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }

  if (scope.scope === 'diocese') {
    // Diocese: diocese_bealitas.szamadas_unlock_requested
    const { error } = await scope.supabase
      .from('diocese_bealitas')
      .upsert(
        {
          diocese_id: scope.scopeId,
          eve: year,
          szamadas_unlock_requested: true,
          szamadas_unlock_request_reason: reason?.trim() || null,
          szamadas_unlock_request_at: new Date().toISOString(),
        },
        { onConflict: 'diocese_id,eve' },
      )
    if (error) return { error: `Hiba: ${error.message}` }
    revalidatePath('/penzugy')
    return { success: true }
  }

  return updateYearlyFinanceFlags(year, {
    accounting_unlock_requested: true,
    accounting_unlock_reason: reason?.trim() || null,
  })
}

// ── Költségvetés módosítás véglegesítés ──────────────────────

export async function finalizeBudgetModification(year: number, modNumber: 1 | 2 | 3) {
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const flagKey = `budget_mod${modNumber}_finalized` as const
  const dateKey = `budget_mod${modNumber}_date` as const

  const { error } = await supabase
    .from('bealitas')
    .update({
      [flagKey]: true,
      [dateKey]: new Date().toISOString().split('T')[0],
    })
    .eq('id', String(year))
    .eq('congregation_id', congregationId)

  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/penzugy')
  return { success: true }
}

export async function getUnlinkedPayments() {
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return []

  const { data } = await supabase.from('befizetes')
    .select('id, datum, forrasa, osszeg, nyugta, iratszam, fizetettev, id_befizetescel')
    .eq('congregation_id', congregationId)
    .is('id_szemely', null)
    .is('id_csalad', null)
    .eq('deleted', false)
    .order('datum', { ascending: false })

  return (data || []) as { id: number; datum: string; forrasa: string | null; osszeg: number; nyugta: string | null; iratszam: string | null; fizetettev: number | null; id_befizetescel: number | null }[]
}

export async function linkPaymentToPerson(paymentId: number, personId: number) {
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { error } = await supabase
    .from('befizetes')
    .update({ id_szemely: personId })
    .eq('id', paymentId)
    .eq('congregation_id', congregationId)
  if (error) return { error: error.message }
  revalidatePath('/penzugy')
  return { success: true }
}

// ── Belső mozgás rögzítés ────────────────────────────────────

export async function saveInternalTransfer(data: {
  tipus: 'kassza_bank' | 'bank_kassza' | 'bank_bank' | 'valutacsere'
  datum: string
  forras: string
  cel: string
  osszeg: number
  celOsszeg?: number
  arfolyam?: number
  megjegyzes?: string
}) {
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  if (!data.datum || !data.forras || !data.cel) return { error: 'Hiányos adatok.' }
  if (data.forras === data.cel) return { error: 'A forrás és a cél nem lehet ugyanaz.' }
  if (data.osszeg <= 0) return { error: 'Az összeg 0-nál nagyobb kell legyen.' }

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('belsomozgas').insert({
    congregation_id: congregationId,
    datum: data.datum,
    tipus: data.tipus,
    forras: data.forras,
    cel: data.cel,
    osszeg: data.osszeg,
    cel_osszeg: data.celOsszeg || null,
    arfolyam: data.arfolyam || null,
    megjegyzes: data.megjegyzes || null,
    created_by: user?.id || null,
    deleted: false,
  })

  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/penzugy')
  return { success: true }
}

// ═══════════════════════════════════════════════════════════════
// BÉRLETI SZERZŐDÉSEK (B1 modul)
// ═══════════════════════════════════════════════════════════════

/**
 * A gyülekezet bérleti szerződéseinek listázása.
 *
 * Alapértelmezetten csak az AKTÍV (nem törölt + aktiv=true) szerződéseket
 * adja vissza. Ha `includeInactive = true`, a lejárt / deaktivált szerződéseket
 * is visszaadja (pl. archív nézethez).
 */
export async function getRentalContracts(
  includeInactive = false,
): Promise<{ data?: RentalContractRow[]; error?: string }> {
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  let query = supabase
    .from('berleti_szerzodes')
    .select('*')
    .eq('congregation_id', congregationId)
    .eq('deleted', false)
    .order('created_at', { ascending: false })

  if (!includeInactive) {
    query = query.eq('aktiv', true)
  }

  const { data, error } = await query
  if (error) return { error: `Bérleti szerződések lekérése sikertelen: ${error.message}` }
  return { data: (data || []) as RentalContractRow[] }
}

/**
 * Bérleti szerződés mentése — új rögzítés vagy meglévő szerkesztése.
 *
 * Az `id` mező jelenléte alapján dönt:
 * - `id` nélkül / null-lal → INSERT
 * - `id` megadva → UPDATE
 *
 * A `tipus` alapján automatikusan kitölti az `id_szamadasicel` mezőt
 * (terület = 104.05, épület = 104.04), kivéve ha a user explicit átírta.
 */
export async function saveRentalContract(raw: RentalContractInput) {
  const parsed = rentalContractSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const d = parsed.data

  // A tipus alapján auto-kitöltjük az id_szamadasicel-t, ha nincs megadva vagy üres
  const id_szamadasicel =
    d.id_szamadasicel && d.id_szamadasicel.trim().length > 0
      ? d.id_szamadasicel
      : RENTAL_SZAMADASICEL_MAP[d.tipus]

  // Cég esetén a ceg_nev-et használjuk berlo_nev-ként is (a Vanilla JS így csinálja,
  // hogy a név-alapú befizetés-párosítás működjön)
  const effectiveBerloNev =
    d.berlo_tipus === 'ceg' && d.ceg_nev ? d.ceg_nev : d.berlo_nev

  const payload = {
    congregation_id: congregationId,
    berlo_nev: effectiveBerloNev.trim(),
    id_szemely: d.berlo_tipus === 'szemely' ? d.id_szemely ?? null : null,
    targy: d.targy?.trim() || null,
    leiras: d.leiras.trim(),
    tipus: d.tipus,
    jogi_tipus: d.jogi_tipus,
    osszeg: d.osszeg,
    fizetesi_ciklus: d.fizetesi_ciklus,
    kezdet: d.kezdet,
    vege: d.vege || null,
    id_szamadasicel,
    leltari_szam: d.leltari_szam?.trim() || null,
    telekkonyvi_szam: d.telekkonyvi_szam?.trim() || null,
    ceg_nev: d.berlo_tipus === 'ceg' ? d.ceg_nev?.trim() || null : null,
    ceg_adoszam: d.berlo_tipus === 'ceg' ? d.ceg_adoszam?.trim() || null : null,
    aktiv: d.aktiv,
    megjegyzes: d.megjegyzes?.trim() || null,
    userid: user.id,
  }

  if (d.id) {
    // UPDATE — csak a saját gyülekezetben
    const { error } = await supabase
      .from('berleti_szerzodes')
      .update(payload)
      .eq('id', d.id)
      .eq('congregation_id', congregationId)
    if (error) return { error: `Mentés sikertelen: ${error.message}` }
  } else {
    // INSERT
    const { error } = await supabase.from('berleti_szerzodes').insert(payload)
    if (error) return { error: `Mentés sikertelen: ${error.message}` }
  }

  revalidatePath('/penzugy')
  return { success: true }
}

/**
 * Bérleti szerződés soft delete.
 *
 * A szerződés rekord a DB-ben marad (historikus bevételek párosításához),
 * de `aktiv = false, deleted = true` jelzéssel kikerül a rendszerből.
 * A historikus hátralék-számítás (korábbi évekre) nem érinti, mert
 * a hátralék-számítás csak aktív szerződésekre fut.
 */
export async function deleteRentalContract(id: string) {
  if (!id) return { error: 'Hiányzó azonosító.' }

  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { error } = await supabase
    .from('berleti_szerzodes')
    .update({ aktiv: false, deleted: true })
    .eq('id', id)
    .eq('congregation_id', congregationId)

  if (error) return { error: `Törlés sikertelen: ${error.message}` }
  revalidatePath('/penzugy')
  return { success: true }
}

/**
 * Bérleti hátralék-sorok számítása egy év-intervallumra.
 *
 * Lépések:
 * 1) Összes aktív bérleti szerződés lekérése
 * 2) A bérleti kategóriájú befizetések lekérése (104.04 / 104.05 kódok),
 *    az intervallumra szűrve
 * 3) `calculateRentalDebts()` hívása — duális párosítás (id_szemely + név)
 *
 * Visszaad: soronként szerződés-szintű hátralék rekord.
 */
export async function getRentalDebtRows(
  yearFrom: number,
  yearTo: number,
): Promise<{ rows?: RentalDebtRow[]; error?: string }> {
  if (!Number.isFinite(yearFrom) || !Number.isFinite(yearTo) || yearFrom > yearTo) {
    return { error: 'Érvénytelen év-intervallum.' }
  }

  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  // 1) Aktív szerződések
  const { data: contracts, error: contractsError } = await supabase
    .from('berleti_szerzodes')
    .select('*')
    .eq('congregation_id', congregationId)
    .eq('deleted', false)
    .eq('aktiv', true)

  if (contractsError) {
    return { error: `Szerződések lekérése sikertelen: ${contractsError.message}` }
  }

  if (!contracts || contracts.length === 0) {
    return { rows: [] }
  }

  // 2) Bérleti kategóriájú befizetések — a befizetescel.id_szamadasicel-en keresztül szűrve
  // Először megkeressük, melyik befizetescel.id-k tartoznak a 104.04 / 104.05 kódokhoz
  const { data: bevCels, error: bevCelsError } = await supabase
    .from('befizetescel')
    .select('id, id_szamadasicel')
    .in('id_szamadasicel', RENTAL_SZAMADASICEL_CODES)

  if (bevCelsError) {
    return { error: `Befizetéskategóriák lekérése sikertelen: ${bevCelsError.message}` }
  }

  const bevCelIds = (bevCels || []).map(c => c.id)

  let payments: RentalPaymentLike[] = []
  if (bevCelIds.length > 0) {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('befizetes')
      .select('id_szemely, forrasa, fizetettev, osszeg')
      .eq('congregation_id', congregationId)
      .eq('deleted', false)
      .in('id_befizetescel', bevCelIds)
      .gte('fizetettev', yearFrom)
      .lte('fizetettev', yearTo)

    if (paymentsError) {
      return { error: `Befizetések lekérése sikertelen: ${paymentsError.message}` }
    }

    payments = (paymentsData || []) as RentalPaymentLike[]
  }

  // 3) Hátralék számítás
  const rows = calculateRentalDebts(
    contracts as RentalContractRow[],
    payments,
    yearFrom,
    yearTo,
  )

  return { rows }
}

// ═══════════════════════════════════════════════════════════════
// DEVIZÁS ÁTÉRTÉKELÉS (FX revaluation, B2 modul)
// ═══════════════════════════════════════════════════════════════

/**
 * Egy adott évre a gyülekezet összes devizás átértékelése.
 *
 * Hasznos a bank-tab-on a "már átértékelt" jelölés megjelenítéséhez,
 * vagy egy historikus áttekintésnek.
 */
export async function getFxRevaluations(
  year: number,
): Promise<{ data?: FxRevaluationRow[]; error?: string }> {
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data, error } = await supabase
    .from('valuta_atert')
    .select('*')
    .eq('congregation_id', congregationId)
    .eq('ev', year)
    .eq('deleted', false)
    .order('created_at', { ascending: false })

  if (error) return { error: `FX átértékelések lekérése sikertelen: ${error.message}` }
  return { data: (data || []) as FxRevaluationRow[] }
}

/**
 * BNR napi árfolyam lekérdezés (server action wrapper a libre).
 * A Next.js cache 1 órás revalidációval, így gyakori hívás nem terheli a BNR-t.
 *
 * @param targetDate  Opcionális historikus dátum (pl. "2025-01-01"). Ha
 *                    nincs megadva, az aktuális árfolyam. Történelmi dátumnál
 *                    a BNR éves XML-ből vagy a Frankfurter API-ból olvassuk.
 */
export async function fetchBnrRateAction(targetDate?: string): Promise<BnrFetchResult> {
  return await fetchBnrRates(targetDate)
}

/**
 * Egy adott bankszámla aktuális deviza-egyenlegének lekérdezése.
 *
 * A `belsomozgas` valutacsere tranzakciók alapján számol. A user a UI-ban
 * felülbírálhatja az értéket, ha a tényleges banki kivonat eltér.
 *
 * @param bankId      A bankszámla integer ID-ja
 * @param uptoDate    Opcionális dátum-felső határ (pl. "2025-12-31")
 */
export async function getBankCurrencyBalance(
  bankId: number,
  uptoDate?: string,
): Promise<{ result?: BankBalanceResult; error?: string }> {
  if (!Number.isFinite(bankId) || bankId <= 0) {
    return { error: 'Érvénytelen bankszámla azonosító.' }
  }

  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Bankszámla lekérése (csak saját gyülekezet)
  const { data: bank, error: bankError } = await supabase
    .from('bankszamlak')
    .select('*')
    .eq('id', bankId)
    .eq('congregation_id', congregationId)
    .maybeSingle()

  if (bankError) return { error: `Bankszámla lekérése sikertelen: ${bankError.message}` }
  if (!bank) return { error: 'A bankszámla nem található.' }

  // Belső mozgások lekérése
  const { data: transfers, error: transfersError } = await supabase
    .from('belsomozgas')
    .select('id, datum, tipus, forras, cel, osszeg, cel_osszeg, arfolyam, megjegyzes, deleted')
    .eq('congregation_id', congregationId)
    .eq('deleted', false)

  if (transfersError) {
    return { error: `Belső mozgások lekérése sikertelen: ${transfersError.message}` }
  }

  const result = calculateBankCurrencyBalance(
    bank as BankAccount,
    (transfers || []) as InternalTransferRow[],
    uptoDate,
  )

  return { result }
}

/**
 * FX átértékelés mentése — TRANZAKCIÓSAN.
 *
 * Lépések:
 * 1) Validálás (Zod)
 * 2) Bankszámla ellenőrzése (saját gyülekezet, deviza)
 * 3) Számolás: új RON érték, különbözet, típus
 * 4) Lookup: a 103.04 (nyereség) vagy 203.03 (veszteség) befizetescel/kiadascel ID
 *    Ha hiányzik → error (a UI-ban jelez a usernek)
 * 5) Insert: befizetes (nyereség) VAGY kiadas (veszteség) dec 31-i dátummal
 * 6) Insert: valuta_atert sor, befizetes_id / kiadas_id link-kel
 * 7) revalidatePath('/penzugy')
 *
 * MEGJEGYZÉS: a Supabase nem támogat valódi multi-table tranzakciót JS API-n
 * keresztül. Ha a 5. lépés sikerül de a 6. nem (pl. unique constraint sért),
 * akkor a befizetes/kiadas sor árva marad. Ezt a következő futáson manuálisan
 * orvosolhatjuk (vagy a frontend a `valuta_atert.unique_per_bank_year` constraint
 * miatt nem enged duplikátumot).
 */
export async function saveFxRevaluation(raw: FxRevaluationInput) {
  const parsed = fxRevaluationSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const d = parsed.data

  // 2) Bankszámla ellenőrzése
  const { data: bank, error: bankError } = await supabase
    .from('bankszamlak')
    .select('id, bank_neve, valuta')
    .eq('id', d.bankszamla_id)
    .eq('congregation_id', congregationId)
    .maybeSingle()

  if (bankError) return { error: `Bankszámla lekérése sikertelen: ${bankError.message}` }
  if (!bank) return { error: 'A bankszámla nem található vagy nem ehhez a gyülekezethez tartozik.' }
  if (!bank.valuta || bank.valuta === 'RON') {
    return { error: 'Az átértékelés csak deviza (nem RON) bankszámlára vonatkozhat.' }
  }
  if (bank.valuta !== d.valuta) {
    return { error: `A megadott valuta (${d.valuta}) nem egyezik a bankszámla valutájával (${bank.valuta}).` }
  }

  // 3) Számolás
  const calc = calculateFxRevaluation({
    devizaEgyenleg: d.deviza_egyenleg,
    regiRonErtek: d.regi_ron_ertek,
    ujArfolyam: d.uj_arfolyam,
  })

  // 4) Lookup: melyik szamadasi cel kód kell
  const isNyereseg = calc.tipus === 'nyereseg'
  const isVeszteseg = calc.tipus === 'veszteseg'
  const targetKod = isNyereseg ? FX_REVAL_NYERESEG_KOD : isVeszteseg ? FX_REVAL_VESZTESEG_KOD : null

  let befizetesId: number | null = null
  let kiadasId: number | null = null

  if (targetKod) {
    // A befizetescel vagy kiadascel ID megkeresése
    const tableName = isNyereseg ? 'befizetescel' : 'kiadascel'
    const { data: celRow, error: celError } = await supabase
      .from(tableName)
      .select('id')
      .eq('id_szamadasicel', targetKod)
      .maybeSingle()

    if (celError) {
      return { error: `${tableName} lekérése sikertelen: ${celError.message}` }
    }
    if (!celRow) {
      return {
        error: `A ${targetKod} számadási cél hiányzik a ${tableName === 'befizetescel' ? 'befizetéskategóriák' : 'kiadáskategóriák'} közül. Vegyétek fel a Beállítások menüben, mielőtt átértékelést rögzíttek.`,
      }
    }

    // 5) Insert: befizetes (nyereség) vagy kiadas (veszteség)
    const evVegeDate = `${d.ev}-12-31`
    const osszeg = Math.abs(calc.kulonbozet)
    const megjegyzes = `Devizás átértékelés (${bank.bank_neve}, ${d.valuta}). Régi árfolyam: ${calc.regiArfolyam || '?'}, új árfolyam: ${d.uj_arfolyam} (${d.arfolyam_forras}). ${d.megjegyzes || ''}`.trim()

    if (isNyereseg) {
      const { data: insertedBev, error: bevError } = await supabase
        .from('befizetes')
        .insert({
          congregation_id: congregationId,
          id_befizetescel: celRow.id,
          osszeg,
          datum: evVegeDate,
          fizetettev: d.ev,
          forrasa: `Árfolyam-nyereség: ${bank.bank_neve}`,
          irattipus: 'Banki',
          iratszam: `ÁRF/${d.ev}/${bank.id}`,
          megjegyzes,
          userid: user.id,
          deleted: false,
        })
        .select('id')
        .single()

      if (bevError) {
        return { error: `Árfolyam-nyereség rögzítése sikertelen: ${bevError.message}` }
      }
      befizetesId = insertedBev.id
    } else {
      const { data: insertedKia, error: kiaError } = await supabase
        .from('kiadas')
        .insert({
          congregation_id: congregationId,
          id_kiadascel: celRow.id,
          osszeg,
          datum: evVegeDate,
          // A `kiadas` táblában a partner oszlopa `atvevo` (NINCS `kedvezmenyzett`).
          atvevo: `Árfolyam-veszteség: ${bank.bank_neve}`,
          irattipus: 'Banki',
          iratszam: `ÁRF/${d.ev}/${bank.id}`,
          megjegyzes,
          userid: user.id,
          deleted: false,
        })
        .select('id')
        .single()

      if (kiaError) {
        return { error: `Árfolyam-veszteség rögzítése sikertelen: ${kiaError.message}` }
      }
      kiadasId = insertedKia.id
    }
  }

  // 6) Insert: valuta_atert audit trail
  const { error: vaError } = await supabase.from('valuta_atert').insert({
    congregation_id: congregationId,
    bankszamla_id: d.bankszamla_id,
    ev: d.ev,
    valuta: d.valuta,
    deviza_egyenleg: d.deviza_egyenleg,
    regi_arfolyam: calc.regiArfolyam || null,
    regi_ron_ertek: d.regi_ron_ertek,
    uj_arfolyam: d.uj_arfolyam,
    uj_ron_ertek: calc.ujRonErtek,
    kulonbozet: calc.kulonbozet,
    tipus: calc.tipus,
    arfolyam_datum: d.arfolyam_datum,
    arfolyam_forras: d.arfolyam_forras,
    befizetes_id: befizetesId,
    kiadas_id: kiadasId,
    megjegyzes: d.megjegyzes || null,
    userid: user.id,
    deleted: false,
  })

  if (vaError) {
    // Ha a UNIQUE constraint sér (van már átértékelés erre az évre + bankszámlára),
    // a felhasználó pontos üzenetet kap.
    const message = vaError.message.includes('valuta_atert_unique_per_bank_year')
      ? `Erre az évre (${d.ev}) ehhez a bankszámlához már létezik átértékelés. Ha javítani szeretnél, először töröld a meglévőt.`
      : `Átértékelés mentése sikertelen: ${vaError.message}`
    return { error: message }
  }

  revalidatePath('/penzugy')
  return {
    success: true,
    tipus: calc.tipus,
    kulonbozet: calc.kulonbozet,
    ujRonErtek: calc.ujRonErtek,
  }
}

/**
 * Bevételi / kiadási kategóriák auto-seed-elése a szamadasicel táblából.
 *
 * Amikor a `befizetescel` (type=B) vagy `kiadascel` (type=K) tábla üres, a
 * bevétel/kiadás rögzítés modalban nem jelenik meg kategória — a felhasználó
 * nem tud tételt rögzíteni. Ezzel a művelettel a szamadasicel minden B/K
 * típusú rekordjához létrejön egy befizetescel/kiadascel sor.
 *
 * FONTOS: a `befizetescel` és `kiadascel` táblák GLOBÁLISAK (nem per-
 * congregation), ezért ez a művelet az ÖSSZES gyülekezetet érinti, de mivel
 * globálisan várt ráncprofilok, ez nem probléma.
 *
 * Használat:
 *   - Automatikus trigger: ha az income/expense dialog nyitásakor `categories`
 *     üres, felkínáljuk ezt az akciót
 *   - Idempotens: már meglévő sorokat nem duplikál
 */
export async function seedFinanceCategories(): Promise<{
  seededBev: number
  seededKia: number
  totalBev: number
  totalKia: number
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { seededBev: 0, seededKia: 0, totalBev: 0, totalKia: 0, error: 'Nincs bejelentkezve.' }

  // 1) Összes szamadasicel — a `nev`, `nevro` is kell, mert a befizetescel/
  //    kiadascel tábláknak KÖTELEZŐ oszlopai (NOT NULL)
  const { data: cellek, error: cellErr } = await access.supabase
    .from('szamadasicel')
    .select('id, nev, nevro, type')

  if (cellErr) return { seededBev: 0, seededKia: 0, totalBev: 0, totalKia: 0, error: `szamadasicel lekérés sikertelen: ${cellErr.message}` }

  type CelRow = { id: string; nev: string | null; nevro: string | null; type: string }
  const bevCells = ((cellek || []) as CelRow[]).filter(c => c.type === 'B')
  const kiaCells = ((cellek || []) as CelRow[]).filter(c => c.type === 'K')

  // 2) Meglévő mapping-ek
  const [bevRes, kiaRes] = await Promise.all([
    access.supabase.from('befizetescel').select('id_szamadasicel'),
    access.supabase.from('kiadascel').select('id_szamadasicel'),
  ])

  if (bevRes.error) return { seededBev: 0, seededKia: 0, totalBev: 0, totalKia: 0, error: `befizetescel olvasás sikertelen: ${bevRes.error.message}` }
  if (kiaRes.error) return { seededBev: 0, seededKia: 0, totalBev: 0, totalKia: 0, error: `kiadascel olvasás sikertelen: ${kiaRes.error.message}` }

  const existingBev = new Set((bevRes.data || []).map((r: { id_szamadasicel: string }) => String(r.id_szamadasicel)))
  const existingKia = new Set((kiaRes.data || []).map((r: { id_szamadasicel: string }) => String(r.id_szamadasicel)))

  // 3) Hiányzó sorok beszúrása (a szamadasicel `id` a kulcs, pl. "100.01")
  //    A `nev` és `nevro` NOT NULL oszlopok — fallback ha a szamadasicel-ben üresek.
  const newBev = bevCells
    .filter(c => !existingBev.has(String(c.id)))
    .map(c => ({
      id_szamadasicel: c.id,
      nev: c.nev || c.id,
      nevro: c.nevro || c.nev || c.id,
      aktiv: true,
    }))

  const newKia = kiaCells
    .filter(c => !existingKia.has(String(c.id)))
    .map(c => ({
      id_szamadasicel: c.id,
      nev: c.nev || c.id,
      nevro: c.nevro || c.nev || c.id,
      aktiv: true,
    }))

  let seededBev = 0
  let seededKia = 0

  if (newBev.length > 0) {
    const { error } = await access.supabase.from('befizetescel').insert(newBev)
    if (error) return {
      seededBev: 0, seededKia: 0,
      totalBev: existingBev.size, totalKia: existingKia.size,
      error: `befizetescel insert sikertelen: ${error.message}`
    }
    seededBev = newBev.length
  }

  if (newKia.length > 0) {
    const { error } = await access.supabase.from('kiadascel').insert(newKia)
    if (error) return {
      seededBev, seededKia: 0,
      totalBev: existingBev.size + seededBev, totalKia: existingKia.size,
      error: `kiadascel insert sikertelen: ${error.message}`
    }
    seededKia = newKia.length
  }

  revalidatePath('/penzugy')
  return {
    seededBev,
    seededKia,
    totalBev: existingBev.size + seededBev,
    totalKia: existingKia.size + seededKia,
  }
}

