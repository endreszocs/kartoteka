'use server'

import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
// 2026-07-11 (S6): visszamenőleges kassza↔bank átvezetésnél a következő évi
// automatikus ('carryover') nyitó újraszámolása.
import { refreshNextYearCarryoverUseCase, resolveNyitoEgyenlegekUseCase } from '@kartoteka/core'
// 2026-08-11 (5. kör, P3 #15): a lapozott „hozd le a TELJES halmazt" helper közös forrása.
import { selectAllPaged } from '@kartoteka/supabase-client'
// 2026-08-11 (5. kör, P3 #4): a járulék-besoroló pár közös forrása (web ⇄ desktop).
import {
  getPaymentGoalCode,
  isChurchMaintenanceCode,
  type PaymentGoalCodeRef,
} from '@kartoteka/ui-app'
import {
  incomeSchema,
  expenseSchema,
  incomeBatchSchema,
  expenseBatchSchema,
  rentalContractSchema,
  fxRevaluationSchema,
  type IncomeInput,
  type ExpenseInput,
  type IncomeBatchRowInput,
  type ExpenseBatchRowInput,
  type LinkedInventoryFromExpenseInput,
  type RentalContractInput,
  type FxRevaluationInput,
} from '@/lib/validations/finance'
import {
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
  MissingReceipt,
  ReceiptChronologyIssue,
  RentalContractRow,
  RentalDebtRow,
  FxRevaluationRow,
} from '@/lib/constants/finance'
import { getEffectiveCongregationContext, getEffectiveAccessContext } from '@/lib/auth/effective-access'
// 2026-08-15 (egységes véglegesítés): a séma-drift felismerés KÖZÖS helperből
// (a korábbi lokális isMissingColumnError odaköltözött — széthúzó másolat tilos).
import { isMissingColumnError } from '@/lib/utils/schema-errors'
import { inventoryItemSchema } from '@/lib/validations/inventory'
import { INVENTORY_CATEGORY_PREFIXES, normalizeInventoryCategory, serializeInventoryCategory } from '@/lib/constants/inventory.next'
import {
  allocateFamilyPayments,
  computeBaseExpectedForMemberYear,
  computeJarulekForMemberYear,
  isJarulekExcludedMemberStatus,
  todayInBucharest,
  JARULEK_MINOR_RULE,
  type JarulekDiscountRule,
  type JarulekExemption,
  type JarulekPaymentLike,
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
  financeWriteBlock,
  getFinanceScopeContext,
  isYearFinalized,
  tablesFor,
  yearFinalizedCheckErrorMessage,
  yearValueFor,
  type FinanceScopeContext,
  type FinanceScopeTableMap,
} from '@/lib/auth/finance-scope'
// 2026-07-10 (S3-#4): a költségvetés-mentés SZERVER-oldalra kerül — a compat réteg
// a supabase klienst paraméterként kapja, így a szerver-klienssel is működik.
import {
  saveBudgetRowsCompat,
  saveBudgetModification as saveBudgetModificationCompat,
  type BudgetCompatRow,
} from '@/lib/finance/budget-compat'
// 2026-07-10 (#4/4): a zár-először véglegesítés+beküldés (finalizeAndSubmitAccounting)
// szerveroldalon hívja a beküldést — server action server actionből hívható.
import { submitDocument } from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
// 2026-08-15 (S6): a diocese_bealitas → BealitasRow leképezés közös normalizálója
// (a módosítás-flagek korábban itt inline, hardkódolt false-szal „normalizálódtak").
import { normalizeDioceseBealitas } from '@/lib/finance/diocese-bealitas'
// 2026-08-15 (S6, terv 3.6): a megye→egyházkerület felküldés KÖZÖS adatrétege —
// a számadás, a költségvetés és a költségvetés-módosítás ugyanazon az úton megy.
import {
  olvasDioceseFelterjesztesek,
  rogzitDioceseFelterjesztes,
  type DioceseFelterjesztesSor,
} from '@/lib/finance/diocese-felterjesztes'
// 2026-08-15 (terv 4.2): egyházmegye-név duplázás-védő közös helper.
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'

// ── Tag-státusz segéd ────────────────────────────────────────

/**
 * 2026-07-16: a `szemely`-nek NINCS `elkoltozott` boolean oszlopa (az egy külön
 * TÁBLA, id_szemely FK-val) — a költözés/kitérés a `member_status` szövegmezőben
 * van kódolva. A korábbi `!member.elkoltozott` szűrő ezért egy nem létező oszlopra
 * hivatkozott, ami a teljes member-selectet elrontotta.
 *
 * Mindkét írásmódot felsoroljuk, mert az éles adatban 'elköltözött' és
 * 'elkoltozott' is előfordul (a tagnyilvántartás ékezet-érzéketlenül normalizál,
 * a desktop explicit listát használ — itt a listás megoldás a félreérthetetlenebb).
 * A kizárt halmaz megegyezik a desktopéval (finance-debt-compute.ts).
 */
// 2026-07-17 (F5): a kizárt-státusz predikátum a KÖZÖS motorba került
// (isJarulekExcludedMemberStatus) — web és desktop, lista ÉS családi felosztási
// roster ugyanazt használja, különben képernyőnként más felosztás jönne ki.
const isExcludedMemberStatus = isJarulekExcludedMemberStatus

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

/**
 * 2026-08-11 (számvevő-kör, review-fix): ÍRÁSI KAPU — MINDEN mutáló pénzügyi
 * action-ben a `getFinanceScope()` után KÖTELEZŐ:
 *
 *   const scope = await getFinanceScope()
 *   if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
 *   const writeBlock = financeWriteBlock(scope)      // ← EZ
 *   if (writeBlock) return writeBlock
 *
 * MIÉRT NEM A KÖZÖS `getFinanceScope()`-BA TETTÜK: a wrappert TISZTÁN OLVASÓ
 * action-ök is hívják (`initFinance`, `getNextReceiptNumbers`,
 * `getLastRecordedDate`) — azokat az egyházmegyei számvevőnek JOGOSAN kell
 * tudnia futtatni. Ha a kapu a wrapperben lenne, az ellenőr megint üres
 * képernyőt kapna: pontosan az a tünet, amit ez a kör megszüntet.
 *
 * A kapu SZÁNDÉKOSAN a szerver oldalon is ott van, nem csak a felületen:
 * a letiltott gomb kényelem, a szerver akció a valódi zár (fail-closed).
 */

/**
 * 2026-08-15 (egyházmegyei szelet): KI ad javítási engedélyt? A gyülekezetnek
 * az egyházmegye, az egyházmegyének az egyházkerület. Egy helyen él, hogy a
 * zár-üzenetek ne húzzanak szét (a megyei felület eddig „az egyházmegyétől"
 * kért engedélyt — vagyis önmagától).
 */
function felettesSzintTol(ctx: FinanceScopeContext): string {
  return ctx.scope === 'diocese' ? 'az egyházkerülettől' : 'az egyházmegyétől'
}

/**
 * 2026-07-10 (#4/3): véglegesített évbe ÚJ tétel sem rögzíthető — eddig csak a
 * szerkesztés/stornó volt védve (edit-storno-actions), így a véglegesítés +
 * beküldés UTÁN is lehetett új tételt rögzíteni, és a beküldött snapshot
 * csendben elévült. Egy vagy több dátumra ellenőrzi az érintett év(ek) zártságát.
 *
 * 2026-08-11 (K5-#32, 2. lépés): az `isYearFinalized` mostantól DOB, ha a
 * zár-állapot lekérdezése hibára fut (fail-closed — elnyelt hiba sosem nyithat
 * ki egy már beküldött évet). Ezt itt elkapjuk, és a függvény szokásos
 * `string | null` alakjában adjuk vissza a magyar üzenetet: a hívók
 * `if (lockError) return { error: lockError }`-t csinálnak, tehát a rögzítés
 * továbbra is MEGHIÚSUL, de a lelkész tudja, mit tegyen — nyers szerver-action
 * hiba helyett.
 */
async function assertYearsNotFinalized(
  ctx: FinanceScopeContext,
  dates: Array<string | null | undefined>,
  blockedMessage: (year: number) => string,
): Promise<string | null> {
  const years = new Set<number>()
  for (const d of dates) {
    const y = Number(String(d || '').slice(0, 4))
    if (Number.isFinite(y) && y >= 2000) years.add(y)
  }
  for (const year of years) {
    let finalized: boolean
    try {
      finalized = await isYearFinalized(ctx, year)
    } catch (err) {
      return yearFinalizedCheckErrorMessage(err, year)
    }
    if (finalized) return blockedMessage(year)
  }
  return null
}

async function assertYearsNotFinalizedForCreate(
  ctx: FinanceScopeContext,
  dates: Array<string | null | undefined>,
): Promise<string | null> {
  return assertYearsNotFinalized(
    ctx,
    dates,
    (year) =>
      `A ${year}. évi számadás már véglegesítve van — új tétel nem rögzíthető. ` +
      `Először kérj javítási engedélyt ${felettesSzintTol(ctx)}.`,
  )
}

/**
 * 2026-08-15 (átvilágítás, ⛔1): TÖRLÉS-zár — ugyanaz a kapu, mint a
 * létrehozásnál/szerkesztésnél/stornónál, csak a törlésre szabott üzenettel.
 *
 * MI VOLT A HIBA: a `deleted = true` volt az EGYETLEN pénzügyi írási út, amely
 * NEM olvasta a `bealitas.accounting_finalized` zászlót. Egy már véglegesített,
 * aláírt és az egyházmegyének BEKÜLDÖTT év tétele egyetlen kattintással
 * eltüntethető volt: a kassza-egyenleg, a Registru, a Csoportnapló és a
 * Számadás tény-oszlopa azonnal elmozdult, a beküldött papír viszont nem —
 * és a lelkész SEMMILYEN visszajelzést nem kapott róla.
 *
 * A helper NEM külön másolat: az `assertYearsNotFinalized` közös törzsét hívja,
 * ami a kanonikus, fail-closed `isYearFinalized`-re (lib/auth/finance-scope.ts)
 * épül — ha a zár-állapot nem olvasható, a törlés MEGHIÚSUL, nem megy át némán.
 */
async function assertYearsNotFinalizedForDelete(
  ctx: FinanceScopeContext,
  dates: Array<string | null | undefined>,
): Promise<string | null> {
  return assertYearsNotFinalized(
    ctx,
    dates,
    (year) =>
      `A ${year}. évi számadás már véglegesítve (és beküldve) van, ezért ebből az évből tétel ` +
      'nem törölhető — a beküldött számadás és a rendszer adatai különben csendben szétcsúsznának. ' +
      `Kérj feloldást (javítási engedélyt) ${felettesSzintTol(ctx)}, és csak a jóváhagyás után töröld.`,
  )
}

/**
 * 2026-07-10 (S3-#3): create-zár a getProfileCongregation-os (CSAK gyülekezeti)
 * utakhoz — közvetlen `bealitas.accounting_finalized` SELECT-tel, ugyanazzal a
 * hibaüzenettel, mint az assertYearsNotFinalizedForCreate. Olyan action-ökben
 * használjuk, ahol nincs FinanceScopeContext (saveInternalTransfer,
 * saveFxRevaluation), de befizetes/kiadas sor jön létre.
 *
 * 2026-08-11 (5. kör, K5-#32 hibaosztály-lezárás) FAIL-CLOSED JAVÍTÁS
 * ───────────────────────────────────────────────────────────────────
 * MI VOLT A HIBA: `const { data } = await …` — az `error` eldobva —, majd
 * `for (const row of (data || []))`. Hibánál a `data` `null`, a ciklus nulla
 * kört fut, a függvény `null`-t ad vissza, aminek a jelentése: „egyik érintett
 * év sincs véglegesítve" → a hívó SIMÁN BESZÚRJA az új tételt. Vagyis a
 * `bealitas` olvasásának bármilyen hibája (RLS, hálózat, séma-drift) NÉMÁN
 * kinyitotta a már véglegesített ÉS az egyházmegyének beküldött évet.
 *
 * MIÉRT HELYES A JAVÍTÁS: zárás-integritási kapunál nincs olyan hiba, ami után
 * „biztos, ami biztos, engedjük" lenne a jó válasz — a beküldött, aláírt
 * számadás és az adatbázis széthúzása visszafordíthatatlan bizalmi kár. Ha nem
 * tudjuk ellenőrizni, elutasítunk, és megmondjuk a lelkésznek, mit tegyen.
 * (Az ÜRES találat viszont NEM hiba: ha nincs `bealitas` sor az évre, az évet
 * még nem konfigurálták, tehát tényleg nincs véglegesítve.)
 */
async function assertYearsNotFinalizedDirect(
  supabase: Awaited<ReturnType<typeof createClient>>,
  congregationId: string,
  dates: Array<string | null | undefined>,
): Promise<string | null> {
  const years = new Set<number>()
  for (const d of dates) {
    const y = Number(String(d || '').slice(0, 4))
    if (Number.isFinite(y) && y >= 2000) years.add(y)
  }
  if (years.size === 0) return null
  const { data, error } = await supabase
    .from('bealitas')
    .select('id, accounting_finalized')
    .eq('congregation_id', congregationId)
    .in('id', Array.from(years).map(String))
  if (error) {
    console.error(
      '[penzugy] A zárás-állapot (bealitas.accounting_finalized) lekérdezése HIBÁRA FUTOTT ' +
        '— fail-closed, a rögzítés nem futhat le.',
      error,
    )
    return (
      'Nem sikerült ellenőrizni, hogy az érintett év(ek) számadása véglegesítve van-e ' +
      `(${error.message}), ezért a rögzítést biztonságból megszakítottuk — egy már lezárt ` +
      'évet nem nyithatunk ki véletlenül. Ellenőrizd az internetkapcsolatot, és próbáld újra; ' +
      'ha újra hibázik, jelezd a rendszergazdának.'
    )
  }
  for (const row of (data || []) as Array<{ id: string; accounting_finalized: boolean | null }>) {
    if (row.accounting_finalized) {
      return `A ${Number(row.id)}. évi számadás már véglegesítve van — új tétel nem rögzíthető. Először kérj javítási engedélyt az egyházmegyétől.`
    }
  }
  return null
}

// 2026-07-17 (F1-1 P0): a szamadasicel táblában NINCS `kod` oszlop (az `id` maga a
// kód, pl. '101.01') — a korábbi `befizetescel(szamadasicel(kod))` beágyazás miatt
// a PostgREST az EGÉSZ befizetés-lekérdezést hibára buktatta, a `(data || [])` pedig
// némán üres tömbre esett → minden tag paid=0-val, teljes hátralékosként jelent meg
// (ugyanaz a hibaosztály, mint a v0.9.78-as szemely-select). A befizetescel saját
// `id_szamadasicel` oszlopát olvassuk — bit-azonos a tagnyilvántartás mintájával.
//
// 2026-08-11 (5. kör, P3 #4): a `getPaymentGoalCode` / `isChurchMaintenanceCode` pár
// itteni MÁSOLATA törölve — a közös implementáció a `@kartoteka/ui-app`-ban van
// (packages/ui-app/src/finance/payment-goal-code.ts). Négy kézzel karbantartott
// másolat volt belőle, egyikük eltérő (`??`) fallback-szemantikával; a járulék
// besorolásának egyetlen igazság-forrása kell legyen.

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

// 2026-07-10 (ÚJ #6): a nyugtafigyelő bemeneti sor-típusa + a numerikus sorrá alakított alak.
type ReceiptHealthInputRow = Pick<BefitetesRow, 'datum' | 'iratszam' | 'nyugta' | 'irattipus' | 'deleted' | 'belso_mozgas_xkey' | 'bankszamla_id'>
type NumberedReceiptRow = { number: number; date: string; base: string; keruletiNum: number | null; keruletiRaw: string }

// 2026-07-10 (ÚJ #6): a numberedRows-előállító lánc segédfüggvénybe kiemelve, hogy a
// KÖVETKEZŐ évi sorokra (évhatár-horgony) IS pontosan ugyanezek a kizárások fussanak.
function extractNumberedReceiptRows(rows: ReceiptHealthInputRow[]): NumberedReceiptRow[] {
  return rows
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
      // #Endre (issue 2): a KERÜLETI szám numerikus + nyers alakja — a hiányzó nyugta kerületi
      // számának kikövetkeztetéséhez (interpoláció a legközelebbi ismert szomszédokból).
      keruletiNum: extractNumericDocumentNumber(row.iratszam),
      keruletiRaw: String(row.iratszam || ''),
    }))
    .filter((row): row is NumberedReceiptRow => row.number != null)
    .sort((a, b) => a.number - b.number)
}

/**
 * 2026-07-10 (S5-#4): hézag-gyűjtő segéd — egy (sorszám szerint rendezett) sorozat
 * BELSŐ hiányzóit adja vissza, a kerületi szám interpolációjával. Az opcionális
 * ALSÓ horgony (előző év utolsó nyugtája) az évhatár-kiterjesztéshez való: ha a
 * horgony+1 kisebb a sorozat legkisebbjénél, a keresés a horgony utáni számtól indul.
 */
function collectMissingReceipts(
  numbered: NumberedReceiptRow[],
  anchor: NumberedReceiptRow | null,
): { missingNumbers: number[]; missingReceipts: MissingReceipt[] } {
  const missingNumbers: number[] = []
  const missingReceipts: MissingReceipt[] = []
  const lowest = numbered[0]?.number ?? null
  const highest = numbered[numbered.length - 1]?.number ?? null
  if (lowest == null || highest == null) return { missingNumbers, missingReceipts }
  const anchorExtendsDown = anchor != null && anchor.number + 1 < lowest
  const lowerBound = anchorExtendsDown && anchor ? anchor.number + 1 : lowest
  const existing = new Set(numbered.map(row => row.number))
  // #Endre (issue 2): a hiányzó gyülekezeti Irat sz. KERÜLETI számát a legközelebbi ismert
  // ALSÓ és FELSŐ szomszéd kerületi számai közt lineárisan interpoláljuk (a két sorozat éven
  // belül együtt lép). Vezető-nulla szélesség = a szomszédok kerületi nyers-szélességének maximuma.
  const neighborRows = anchorExtendsDown && anchor ? [anchor, ...numbered] : numbered
  let prevIdx = 0
  for (let receipt = lowerBound; receipt <= highest; receipt += 1) {
    if (existing.has(receipt)) continue
    missingNumbers.push(receipt)
    while (prevIdx + 1 < neighborRows.length && neighborRows[prevIdx + 1].number < receipt) prevIdx += 1
    const prev = neighborRows[prevIdx]?.number < receipt ? neighborRows[prevIdx] : undefined
    const next = neighborRows.find(r => r.number > receipt)
    let keruletiSz: string | null = null
    if (prev?.keruletiNum != null && next?.keruletiNum != null && next.number !== prev.number) {
      const ratio = (receipt - prev.number) / (next.number - prev.number)
      const guess = Math.round(prev.keruletiNum + ratio * (next.keruletiNum - prev.keruletiNum))
      const width = Math.max(
        prev.keruletiRaw.match(/\d+/)?.[0].length ?? 0,
        next.keruletiRaw.match(/\d+/)?.[0].length ?? 0,
      )
      keruletiSz = width > 0 ? String(guess).padStart(width, '0') : String(guess)
    } else if (prev?.keruletiNum != null) {
      const guess = prev.keruletiNum + (receipt - prev.number)
      const width = prev.keruletiRaw.match(/\d+/)?.[0].length ?? 0
      keruletiSz = width > 0 ? String(guess).padStart(width, '0') : String(guess)
    }
    missingReceipts.push({ iratSz: receipt, keruletiSz })
  }
  return { missingNumbers, missingReceipts }
}

function computeReceiptHealth(rows: ReceiptHealthInputRow[], prevYearRows?: ReceiptHealthInputRow[]): ReceiptHealth {
  const numberedRows = extractNumberedReceiptRows(rows)

  // 2026-07-10 (#7 — irányváltás): a gyülekezeti sorszámozás ÉVHATÁRON ÁT folytonos,
  // ezért az ELŐZŐ év UTOLSÓ (legnagyobb sorszámú) nyugtája ALSÓ horgonyként szolgál:
  // ha az idei legkisebb sorszám nagyobb, mint a horgony+1, a köztes számok az ELŐZŐ
  // év végéről MARADTAK EL — és a FOLYÓ év figyelője hozza át őket (a pótlásuk is itt,
  // a folyó évben történik a Decont-tal). EGYOLDALÚ (csak alsó) horgony — a hézag nem
  // jelenik meg duplán. (A korábbi ÚJ #6 felső horgonyt használt — az előző év nézetében
  // mutatta a hézagot —, de a felhasználó a folyó évben várja, jogosan.)
  const prevYearNumbered = prevYearRows?.length ? extractNumberedReceiptRows(prevYearRows) : []
  const prevAnchor: NumberedReceiptRow | null =
    prevYearNumbered.length > 0 ? prevYearNumbered[prevYearNumbered.length - 1] : null

  // 2026-07-10 (S5-#4): az ELŐZŐ év SAJÁT (éven belüli) hiányzóit is átvisszük a
  // folyó évbe — a pótlás a folyó évben történik, ott kell a riasztás. A folyó
  // évben már pótolt sorszámok lentebb kiszűrődnek.
  const prevYearGaps = prevYearNumbered.length > 0
    ? collectMissingReceipts(prevYearNumbered, null)
    : { missingNumbers: [] as number[], missingReceipts: [] as MissingReceipt[] }

  // 2026-07-11 (S7): az előző év ÉVE — a riasztás kiírja, honnan jött az áthozott hiányzó.
  const prevYear =
    prevYearNumbered.length > 0
      ? Number(String(prevYearNumbered[prevYearNumbered.length - 1].date).slice(0, 4)) || null
      : null

  if (numberedRows.length === 0) {
    // 2026-07-10 (S5-#4): eddig itt MINDEN kiürült — pedig év elején (amikor még
    // nincs idei nyugta) a tavalyi hiányzók riasztása pont a legfontosabb.
    return {
      missingNumbers: prevYearGaps.missingNumbers,
      missingReceipts: prevYearGaps.missingReceipts,
      duplicateNumbers: [],
      chronologyIssues: [],
      trackedReceiptCount: 0,
      highestReceiptNumber: null,
      // 2026-07-11 (S7): ilyenkor MINDEN hiányzó az előző évből áthozott.
      prevYearMissingNumbers: prevYearGaps.missingNumbers,
      prevYear,
    }
  }

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
  // 2026-07-10 (#7): ALSÓ horgony — ha az előző évi utolsó nyugta sorszáma+1 kisebb
  // az idei legkisebbnél, az évhatáron elmaradt számokat is a FOLYÓ év jelzi.
  // 2026-07-10 (S5-#4): PLUSZ az előző év BELSŐ hiányzói is áthozódnak — kivéve,
  // amit a folyó évben már pótoltak (az idei sorszám-készletben szerepel).
  const highestReceiptNumber = numberedRows[numberedRows.length - 1]?.number ?? null
  const currentGaps = collectMissingReceipts(numberedRows, prevAnchor)
  const existingNow = new Set(numberedRows.map(row => row.number))
  const carriedNumbers = prevYearGaps.missingNumbers.filter(n => !existingNow.has(n))
  const carriedSet = new Set(carriedNumbers)
  const missingNumbers = [
    ...carriedNumbers,
    ...currentGaps.missingNumbers.filter(n => !carriedSet.has(n)),
  ].sort((a, b) => a - b)
  const missingReceipts = [
    ...prevYearGaps.missingReceipts.filter(m => carriedSet.has(m.iratSz)),
    ...currentGaps.missingReceipts.filter(m => !carriedSet.has(m.iratSz)),
  ].sort((a, b) => a.iratSz - b.iratSz)

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

  // 2026-07-11 (S7): melyik hiányzó jött az ELŐZŐ évből? Minden olyan sorszám,
  // ami az idei LEGKISEBB meglévő nyugta alatt van — ez lefedi a tavalyi éven
  // BELÜLI hézagokat ÉS az évhatáron (tavalyi utolsó → idei első közt) elmaradt
  // számokat is; egyik sem az idei évben maradt el.
  const lowestNow = numberedRows[0]?.number ?? null
  const prevYearMissingNumbers =
    lowestNow != null ? missingNumbers.filter(n => n < lowestNow) : []

  return {
    missingNumbers,
    missingReceipts,
    duplicateNumbers: Array.from(duplicateNumbers).sort((a, b) => a - b),
    chronologyIssues,
    trackedReceiptCount: numberedRows.length,
    highestReceiptNumber,
    prevYearMissingNumbers,
    prevYear,
  }
}

/**
 * 2026-07-10 (S5-#3): egy TETSZŐLEGES év bevétel/kiadás sorai + nyitó egyenlegei
 * a Nyomtatási központnak. Eddig a nyomtatási központ saját évválasztója a
 * memóriában lévő (az OLDAL évére szűrt) sorokat szűrte — múltbeli évre így
 * MINDEN nyomtatvány (Registru, Csoportnapló, számadás-tényadat) üres volt.
 * A select-ek és a nyitó-számítás BIT-AZONOSAK az initFinance-ével.
 */
export async function getYearFinanceRecords(year: number): Promise<{
  income?: BefitetesRow[]
  expense?: KiadasRow[]
  carryoverCash?: number
  carryoverBank?: number
  bankNyitoMap?: Record<number, number>
  /** 2026-08-11 (6. kör, P1 #7): sikerült-e a nyitók feloldása. `false` esetén
   *  a nyitó a naiv fallbackből jön — a RÉSZSZÁMADÁS ilyenkor NEM nyomtatható
   *  (minden száma a nyitóra épül). Eddig ez a hiba NÉMÁN esett vissza. */
  nyitoOk?: boolean
  /** true → a nyitó LEVEZETETT, rögzített bázis-sor nélkül (0-ról indult a
   *  lánc). Nem hiba, de lábjegyzetet érdemel a nyomtatványon. */
  nyitoBizonytalan?: boolean
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }
  const supabase = access.supabase

  // 2026-07-25 (F6.1): a 4 tétel-lekérdezés LAPOZVA — ez a Számadás/Registru
  // nyomtatvány forrása, a PostgREST 1000-es plafonja némán hibás összegeket adott volna.
  // 2026-08-11 (K5-#7): a lapozás MELLÉ determinisztikus `.order('id')` is kell.
  // A `fetchAllPaged` minden lapja KÜLÖN HTTP-kérés = külön DB-snapshot; ORDER BY
  // nélkül a Postgres nem garantálja a lapok közti stabil sorrendet (más terv,
  // párhuzamos seq scan, közben történt UPDATE), így 1000+ tételes évnél EGY TÉTEL
  // KÉTSZER is beeshet (dupla összeg) vagy kimaradhat — némán hamis Számadás/Registru.
  const [bevRes, kiaRes, prevBevRes, prevKiaRes, cashNyitoRes, bankNyitoRes] = await Promise.all([
    fetchAllPaged(supabase.from('befizetes').select('id, osszeg, osszeg_ron, arfolyam, datum, id_befizetescel, id_szemely, id_csalad, forrasa, nyugta, iratszam, irattipus, fizetettev, megjegyzes, belso_mozgas_xkey, bankszamla_id, deleted, stornozott, stornozott_indok, stornozott_at').eq('congregation_id', congregationId).eq('deleted', false).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`).order('id', { ascending: true })),
    fetchAllPaged(supabase.from('kiadas').select('id, osszeg, osszeg_ron, arfolyam, datum, id_kiadascel, atvevo, atvevoid, nyugta, iratszam, irattipus, megjegyzes, belso_mozgas_xkey, bankszamla_id, deleted, stornozott, stornozott_indok, stornozott_at').eq('congregation_id', congregationId).eq('deleted', false).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`).order('id', { ascending: true })),
    fetchAllPaged(supabase.from('befizetes').select('osszeg, osszeg_ron, bankszamla_id').eq('congregation_id', congregationId).eq('deleted', false).eq('stornozott', false).gte('datum', `${year - 1}-01-01`).lte('datum', `${year - 1}-12-31`).order('id', { ascending: true })),
    fetchAllPaged(supabase.from('kiadas').select('osszeg, osszeg_ron, bankszamla_id').eq('congregation_id', congregationId).eq('deleted', false).eq('stornozott', false).gte('datum', `${year - 1}-01-01`).lte('datum', `${year - 1}-12-31`).order('id', { ascending: true })),
    supabase.from('keszpenz_nyito_egyenleg').select('eve, nyito_egyenleg')
      .eq('congregation_id', congregationId).in('eve', [year - 1, year]),
    supabase.from('bankszamla_nyito_egyenleg').select('eve, nyito_egyenleg_ron, bankszamla_id')
      .eq('congregation_id', congregationId).in('eve', [year - 1, year]),
  ])
  // 2026-07-17 (F4): a nyitó-selectek hibája is HANGOS — a rögzített nyitó mostantól
  // a Registru Banca elsődleges forrása, néma kiesése hamis regisztert nyomtatna
  // (v0.9.78-as néma-üres hibaosztály).
  const firstErr =
    bevRes.error || kiaRes.error || prevBevRes.error || prevKiaRes.error ||
    cashNyitoRes.error || bankNyitoRes.error
  if (firstErr) return { error: firstErr.message }

  let recCashCur = 0, recCashPrev = 0, hasCashCur = false
  for (const r of (cashNyitoRes.data || []) as { eve: number; nyito_egyenleg: number }[]) {
    if (r.eve === year) { recCashCur += Number(r.nyito_egyenleg) || 0; hasCashCur = true }
    else recCashPrev += Number(r.nyito_egyenleg) || 0
  }
  // 2026-07-17 (F4): bankszámlánkénti nyitó-térkép is (Registru Banca, initFinance-parítás)
  let recBankCur = 0, recBankPrev = 0, hasBankCur = false
  const bankNyitoMap: Record<number, number> = {}
  for (const r of (bankNyitoRes.data || []) as { eve: number; nyito_egyenleg_ron: number; bankszamla_id: number }[]) {
    if (r.eve === year) {
      recBankCur += Number(r.nyito_egyenleg_ron) || 0
      hasBankCur = true
      if (r.bankszamla_id != null) bankNyitoMap[r.bankszamla_id] = Number(r.nyito_egyenleg_ron) || 0
    } else recBankPrev += Number(r.nyito_egyenleg_ron) || 0
  }
  // 2026-07-11 (S9): a könyvelés RON-ban — a bank-carryover a RON-ekvivalenst
  // (osszeg_ron) használja, nem a deviza-összeget. RON számlán osszeg==osszeg_ron.
  let carryoverCashNet = 0, carryoverBankNet = 0
  type PrevFlowRow = { osszeg: number; osszeg_ron?: number | null; bankszamla_id: number | null }
  ;((prevBevRes.data || []) as unknown as PrevFlowRow[]).forEach((r) => {
    if (r.bankszamla_id == null) carryoverCashNet += Number(r.osszeg_ron ?? r.osszeg) || 0
    else carryoverBankNet += Number(r.osszeg_ron ?? r.osszeg) || 0
  })
  ;((prevKiaRes.data || []) as unknown as PrevFlowRow[]).forEach((r) => {
    if (r.bankszamla_id == null) carryoverCashNet -= Number(r.osszeg_ron ?? r.osszeg) || 0
    else carryoverBankNet -= Number(r.osszeg_ron ?? r.osszeg) || 0
  })

  // 2026-07-25 (G5): „előző évi záró = következő évi nyitó" — OLVASÁS-ONLY
  // feloldás számlánként (a rögzített sor mindig hiteles; ha nincs, a legutolsó
  // korábbi sor + a közte lévő évek nettó forgalma adja). Így a nyitót CSAK
  // EGYSZER, a rendszer indulásakor kell megadni. A DB-t NEM írjuk (lezárt év
  // sérthetetlensége + nyomtatási út olvasó marad).
  const resolved = await resolveNyitoEgyenlegekUseCase(
    { congregationId, eve: year },
    { supabase, runtime: 'web' },
  )
  const resolvedBankMap: Record<number, number> = { ...bankNyitoMap }
  if (resolved.success) {
    for (const [id, r] of Object.entries(resolved.bank)) resolvedBankMap[Number(id)] = r.value
  }

  // 2026-08-11 (6. kör, P1 #7): a feloldás állapotát HANGOSSÁ tesszük. Eddig a
  // `resolved.success === false` némán a naiv (előző évi sor + forgalom)
  // fallbackre esett vissza, és a hívó nem tudott róla. A Részszámadás MINDEN
  // száma a nyitóra épül, ezért ott ez fail-closed kapu lesz.
  // A `baseYear === null` azt jelenti, hogy nem volt rögzített bázis-sor a
  // láncablakban → a nyitó 0-ról vezetve, tehát bizonytalan.
  const nyitoBizonytalan =
    resolved.success &&
    (resolved.cash.baseYear === null ||
      Object.values(resolved.bank).some((b) => b.baseYear === null))
  if (!resolved.success) {
    console.error(
      `[getYearFinanceRecords] a(z) ${year}. évi nyitók feloldása NEM sikerült — a nyitó a naiv fallbackből jön:`,
      resolved.error,
    )
  }

  return {
    income: (bevRes.data || []) as BefitetesRow[],
    expense: (kiaRes.data || []) as KiadasRow[],
    carryoverCash: resolved.success
      ? resolved.cash.value
      : hasCashCur
        ? recCashCur
        : recCashPrev + carryoverCashNet,
    carryoverBank: resolved.success
      ? resolved.bankTotal
      : hasBankCur
        ? recBankCur
        : recBankPrev + carryoverBankNet,
    bankNyitoMap: resolvedBankMap,
    nyitoOk: resolved.success,
    nyitoBizonytalan,
  }
}

// 2026-08-15: az isMissingColumnError a KÖZÖS @/lib/utils/schema-errors
// helperből jön (fenti import) — a lokális másolat megszűnt.

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

// 2026-08-11 (K5-#4): a `rollbackInsertedIncome` TÖRÖLVE — egyetlen hívója a
// szintén törölt `saveIncomeWithLinkedInventory` volt (a soha be nem kötött v1
// pénzügy→leltár híd).

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
    // A partner/kedvezményezett a `atvevo`/`atvevoid` oszlopba kerül (lent, referencePayload) —
    // a `kiadas` táblában NINCS `kedvezmenyzett` és NINCS `id_szemely` oszlop sem (a személy =
    // `atvevoid`). Ezért ezeket TILOS beszúrni: a PostgREST akkor is elutasít (schema cache),
    // ha az érték null. Enélkül a canonical/reference payload eddig MINDIG elbukott (→ a hiba a
    // végső bizonylatszam-fallbackot mutatta).
    iratszam: documentNumber,
    irattipus: input.irattipus,
    megjegyzes: input.megjegyzes || null,
    deleted: false,
    congregation_id: congregationId,
  }

  // 2026-08-09: az xkey-t kiemelve tartjuk számon — a pénzügy→leltár híd a
  // leltar_tetelek.penzugy_xkey mezőbe ezt írja (legacy-kompatibilis kapcsolat).
  const referenceXkey = randomUUID().replace(/-/g, '').slice(0, 20)
  const referencePayload = {
    ...canonicalPayload,
    nyugta: documentNumber,
    xkey: referenceXkey,
    atvevo: input.kedvezmenyzett || 'Kézi rögzítés',
    atvevoid: 'id_szemely' in input ? input.id_szemely || null : null,
    userid: userId,
  }

  const legacyAliasPayload = {
    ...canonicalPayload,
    bizonylatszam: documentNumber,
  }

  let usedXkey: string | null = referenceXkey
  let insertResult = await supabase.from('kiadas').insert([referencePayload]).select('id')
  if (insertResult.error && isMissingColumnError(insertResult.error.message)) {
    usedXkey = null
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
    xkey: usedXkey,
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

  // 2026-08-09 (review-fix): LAPOZVA olvassuk az összes számot — a PostgREST
  // 1000 soros néma plafonja miatt limit nélkül 1000+ tételnél (pl. könyvtár,
  // 'K-%') már kiadott leltári szám ismétlődne (ugyanaz a hibaosztály, mint a
  // korábbi nyugtaszám-P0). Szöveges szám miatt order+limit(1) sem lenne jó
  // ('K-999' > 'K-1000' szövegként).
  // 2026-08-11 (5. kör, P3 #15): KÖZÖS `selectAllPaged` + FAIL-CLOSED hiba.
  // Két baj volt: (1) a `rows.length < PAGE` stop-feltétel leszállított
  // szerver-plafonnál az első lap után kilépett, (2) az `if (error) break` a
  // lekérdezés hibáját ELNYELTE, és a függvény `max = 0`-val „PREFIX-001"-et
  // adott vissza — egy hálózati hiba után tehát egy MÁR HASZNÁLT leltári számot
  // javasolt. Számot kiosztó kapunál nincs olyan hiba, ami után a tippelés a jó
  // válasz, ezért most hangosan dobunk (a hívó `{ error }`-rá fordítja).
  const { data: rows, error } = await selectAllPaged<{ leltari_szam?: string | null }>(
    supabase
      .from('leltar_tetelek')
      .select('leltari_szam')
      .eq('congregation_id', congregationId)
      .ilike('leltari_szam', `${prefix}-%`),
  )
  if (error) {
    throw new Error(
      'Nem sikerült lekérdezni a már kiadott leltári számokat ' +
        `(${error.message}), ezért a kapcsolt leltári tétel nem hozható létre — ` +
        'különben egy már használt leltári szám ismétlődne. Ellenőrizd az ' +
        'internetkapcsolatot, és próbáld újra.',
    )
  }

  let max = 0
  for (const row of rows) {
    const match = String(row.leltari_szam || '').match(/-(\d+)$/)
    if (match) {
      const parsed = Number.parseInt(match[1], 10)
      if (parsed > max) max = parsed
    }
  }

  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

// 2026-08-11 (K5-#4): az `insertLinkedInventoryFromIncome` TÖRÖLVE. A v1
// pénzügy→leltár híd bevétel-oldala volt: egyetlen hívója a szintén törölt
// `saveIncomeWithLinkedInventory`, azt pedig már csak a (szintén törölt) v1/v2/v3
// income-dialog fájlok importálták — élő útvonalról soha nem futott. Ráadásul
// EGYETLEN inserttel dolgozott, 23505-ös újrapróbálkozás NÉLKÜL (két párhuzamos
// mentés ugyanazt a leltári számot kapta volna), és sem a `penzugy_xkey`-t, sem a
// `userid`-t nem állította be — vagyis pont a két review-javítás hiányzott belőle,
// amit az ÉLŐ kiadás-oldali híd (`insertLinkedInventoryFromExpenseRow`) megkapott.

/**
 * 2026-08-09: a Tétel rögzítő (CombinedEntryBody) kiadás-sorához kapcsolt
 * leltári tétel beszúrása — a pénzügy→leltár híd szerver-oldala.
 *
 * A KANONIKUS oszlopnevekkel ír (beszerzesi_ertek, hasznalati_ido_ev,
 * felelos_neve, is_deleted) és hibánál a régi nevekre esik vissza — a korábbi
 * (soha be nem kötött) saveExpenseWithLinkedInventory csak a régi neveket írta,
 * ami a mai sémán elbukott volna. Újdonság: penzugy_xkey = a kiadás xkey-e +
 * userid — így a kiadás és a leltári tétel az adatbázisban is összekapcsolódik
 * (a legacy alkalmazás is így kötötte össze a kettőt).
 */
async function insertLinkedInventoryFromExpenseRow(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  congregationId: string
  userId: string
  expense: ExpenseBatchRowInput
  inventory: LinkedInventoryFromExpenseInput
  documentNumber: string
  expenseXkey: string | null
}): Promise<{ error?: string }> {
  const { supabase, congregationId, userId, expense, inventory, documentNumber, expenseXkey } = params

  const kategoriaKey = normalizeInventoryCategory(inventory.kategoria)
  if (!kategoriaKey) {
    return { error: `Ismeretlen leltári kategória: ${inventory.kategoria}` }
  }

  const parsed = inventoryItemSchema.safeParse({
    megnevezes: inventory.megnevezes,
    kategoria: kategoriaKey,
    beszerzes_erteke: expense.osszeg,
    beszerzes_datuma: expense.datum,
    beszerzes_bizonylat: documentNumber,
    katalogus_kod: inventory.katalogus_kod || null,
    hasznalati_ido: inventory.hasznalati_ido ?? null,
    helyszin: inventory.helyszin || null,
    felelos_nev: inventory.felelos_nev || null,
    megjegyzes: inventory.megjegyzes || null,
    mennyiseg: 1,
    mertekegyseg: 'db',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const d = parsed.data
  const serializedCategory = serializeInventoryCategory(kategoriaKey)

  // 2026-08-09 (review-fix): párhuzamos mentésnél két hívó ugyanazt a következő
  // számot kaphatja — az egyediségi index (2026-08-09-leltari-szam-unique-index.sql)
  // 23505-tel utasítja el a másodikat, ilyenkor ÚJ számmal (max 3x) újrapróbálunk.
  let lastError: { code?: string; message: string } | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // 2026-08-11 (5. kör, P3 #15): a szám-generátor mostantól DOB, ha nem tudja
    // hitelesen megállapítani a következő számot — itt fordítjuk a lelkésznek
    // megjeleníthető válasszá (korábban némán „PREFIX-001"-et kapott volna).
    let leltariSzam: string
    try {
      leltariSzam = await generateNextInventoryNumberForCategory(supabase, congregationId, kategoriaKey)
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'A leltári szám generálása nem sikerült.' }
    }

    const shared = {
      megnevezes: d.megnevezes,
      kategoria: serializedCategory,
      beszerzes_datuma: d.beszerzes_datuma || null,
      katalogus_kod: d.katalogus_kod || null,
      helyszin: d.helyszin || null,
      megjegyzes: d.megjegyzes || null,
      congregation_id: congregationId,
      mennyiseg: 1,
      mertekegyseg: 'db',
      beszerzes_bizonylat: d.beszerzes_bizonylat || null,
      leltari_szam: leltariSzam,
      penzugy_xkey: expenseXkey,
      userid: userId,
    }
    const canonicalRecord = {
      ...shared,
      beszerzesi_ertek: d.beszerzes_erteke,
      hasznalati_ido_ev: d.hasznalati_ido || null,
      felelos_neve: d.felelos_nev || null,
      is_deleted: false,
    }
    const modernFallback = {
      ...shared,
      beszerzes_erteke: d.beszerzes_erteke,
      hasznalati_ido: d.hasznalati_ido || null,
      felelos_nev: d.felelos_nev || null,
      deleted: false,
    }
    // Végső fallback: penzugy_xkey/userid nélkül (ha egy régebbi séma nem ismerné őket).
    const minimalFallback = (() => {
      const rest = { ...modernFallback } as Record<string, unknown>
      delete rest.penzugy_xkey
      delete rest.userid
      return rest
    })()

    let { error } = await supabase.from('leltar_tetelek').insert([canonicalRecord])
    if (error && isMissingColumnError(error.message)) {
      const retry = await supabase.from('leltar_tetelek').insert([modernFallback])
      error = retry.error
    }
    if (error && isMissingColumnError(error.message)) {
      const retry = await supabase.from('leltar_tetelek').insert([minimalFallback])
      error = retry.error
    }

    if (!error) return {}
    lastError = error
    if (error.code !== '23505') break
  }

  return { error: `Hiba: ${lastError?.message || 'ismeretlen'}` }
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
    // 2026-08-11 (K5-#8): LAPOZOTT lekérés. A PostgREST 1000-es plafonja alatt a
    // legrégebbi évek egyszerűen KIMARADTAK az év-választóból (a lelkész nem
    // tudott visszalépni a korábbi évekre), méghozzá determinisztikus sorrend
    // nélkül, kiszámíthatatlanul.
    if (isDiocese) {
      const did = access.activeProfileRole!.scopeId as string
      const [bev, kia] = await Promise.all([
        fetchAllPaged(access.supabase.from('diocese_befizetes').select('id, datum').eq('diocese_id', did).eq('deleted', false).order('id', { ascending: true })),
        fetchAllPaged(access.supabase.from('diocese_kiadas').select('id, datum').eq('diocese_id', did).eq('deleted', false).order('id', { ascending: true })),
      ])
      addYears((bev.data || []) as { datum: string | null }[])
      addYears((kia.data || []) as { datum: string | null }[])
    } else if (access.effectiveCongregationId) {
      const cid = access.effectiveCongregationId
      const [bev, kia] = await Promise.all([
        fetchAllPaged(access.supabase.from('befizetes').select('id, datum').eq('congregation_id', cid).eq('deleted', false).order('id', { ascending: true })),
        fetchAllPaged(access.supabase.from('kiadas').select('id, datum').eq('congregation_id', cid).eq('deleted', false).order('id', { ascending: true })),
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
    // 2026-07-10 (ÚJ #6, #7-tel javítva): a TÖMB VÉGÉN, hogy a meglévő indexek ne csússzanak el!
    prevAnchorBevRes,
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
    // 2026-08-11 (K5-#7): `.order('id')` a lapozáshoz. A négy pénz-lekérdezés eddig
    // rendezés nélkül lapozott: külön HTTP-kérés = külön DB-snapshot, ORDER BY nélkül
    // a .range() ablakok átfedhetnek/kihagyhatnak sorokat — a Pénzügy nyitóképernyője
    // és a belőle készülő nyomtatványok némán dupláztak vagy vesztettek egy-egy tételt.
    fetchAllPaged(supabase.from('befizetes').select('id, osszeg, osszeg_ron, arfolyam, datum, id_befizetescel, id_szemely, id_csalad, forrasa, nyugta, iratszam, irattipus, fizetettev, megjegyzes, belso_mozgas_xkey, bankszamla_id, deleted, stornozott, stornozott_indok, stornozott_at').eq('congregation_id', congregationId).eq('deleted', false).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`).order('id', { ascending: true })),
    fetchAllPaged(supabase.from('kiadas').select('id, osszeg, osszeg_ron, arfolyam, datum, id_kiadascel, atvevo, atvevoid, nyugta, iratszam, irattipus, megjegyzes, belso_mozgas_xkey, bankszamla_id, deleted, stornozott, stornozott_indok, stornozott_at').eq('congregation_id', congregationId).eq('deleted', false).gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`).order('id', { ascending: true })),
    // Előző évi adatok az átviteli egyenleghez (bankszamla_id: NULL=kassza, egyébként bank)
    // 2026-07-10 (S3 audit KRITIKUS #1): a carryover-lánc a stornózott tételeket
    // is kihagyja — a calculateBalances-szel azonos szemantika.
    fetchAllPaged(supabase.from('befizetes').select('osszeg, osszeg_ron, bankszamla_id').eq('congregation_id', congregationId).eq('deleted', false).eq('stornozott', false).gte('datum', `${year - 1}-01-01`).lte('datum', `${year - 1}-12-31`).order('id', { ascending: true })),
    fetchAllPaged(supabase.from('kiadas').select('osszeg, osszeg_ron, bankszamla_id').eq('congregation_id', congregationId).eq('deleted', false).eq('stornozott', false).gte('datum', `${year - 1}-01-01`).lte('datum', `${year - 1}-12-31`).order('id', { ascending: true })),
    supabase.from('bealitas').select('id, eves_jarulek').eq('congregation_id', congregationId),
    // 2026-07-16 (P0 JAVÍTÁS): a select KÉT NEM LÉTEZŐ oszlopot kért — `prefix` és
    // `elkoltozott`. A `szemely`-nek egyik sem oszlopa (information_schema-val
    // igazolva az éles DB-n): az `elkoltozott` KÜLÖN TÁBLA (id_szemely FK-val), a
    // költözés pedig a `member_status`-ban van kódolva. A hibás select miatt a
    // PostgREST hibát adott, a `membersRes.data` null lett, a lenti
    // `(membersRes.data || [])` pedig üres tömbre esett vissza → a TARTOZÁSOK
    // LISTA VÉGIG ÜRES VOLT élesben. Némán, mert a hibát senki nem nézte meg.
    // 2026-08-11 (K5-#8): LAPOZOTT lekérés. A PostgREST implicit 1000-es sor-plafonja
    // NÉMÁN levágta a tag-listát: 1200 látható tagnál 200 tag egyáltalán nem jelent
    // meg a Tartozások-listán (sem hátralékosként, sem rendezettként). A
    // determinisztikus `.order('id')` a lapozáshoz KÖTELEZŐ — enélkül a .range()
    // ablakok átfedhetnek/kihagyhatnak sorokat.
    fetchAllPaged(
      supabase
        .from('szemely')
        .select('id, csaladnev, k_nev, sz_datum, foglalkozas, meghalt, member_status')
        .eq('congregation_id', congregationId)
        .eq('isvisible', true)
        .order('id', { ascending: true }),
    ),
    // 2026-07-17 (F1-1 + F1-4): id_szamadasicel a nem létező szamadasicel(kod) helyett;
    // + a STORNÓZOTT befizetés nem számít fizetettnek (a stornó eddig „Rendezett"-nek
    // mutatta a tagot, miközben a könyvelési listákból helyesen kimaradt).
    // 2026-08-11 (K5-#8): LAPOZOTT — 1000+ járulék-befizetés-sornál (1000 tag ×
    // 2-3 részlet teljesen reális) a plafon feletti befizetések eltűntek, és a
    // hozzájuk tartozó tagok TELJES ÉVES DÍJJAL látszottak hátralékosnak: a
    // lelkész alaptalanul küldött volna fizetési felszólítást.
    fetchAllPaged(
      supabase
        .from('befizetes')
        .select('id, id_szemely, id_csalad, datum, fizetettev, osszeg, befizetescel(id_szamadasicel)')
        .eq('congregation_id', congregationId)
        .eq('fizetettev', year)
        .or('deleted.eq.false,deleted.is.null')
        .or('stornozott.eq.false,stornozott.is.null')
        .order('id', { ascending: true }),
    ),
    supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').eq('congregation_id', congregationId),
    // 2026-06-01 (hibrid család-modell Fázis 2): új haztartas_tag-ból mapping
    // 2026-08-11 (K5-#8): LAPOZOTT — a csonkolt család-mapping az
    // `allocateFamilyPayments` családi felosztását is elrontotta (a rosteren
    // kívül maradt tagok nem kaptak részt a családi befizetésből).
    fetchAllPaged(
      supabase.from('haztartas_tag')
        .select('id, id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
        .eq('congregation_id', congregationId)
        .is('ervenyes_ig', null)
        .order('id', { ascending: true }),
    ),
    supabase
      .from('jarulek_kedvezmeny')
      .select('id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
      .eq('congregation_id', congregationId)
      .eq('aktiv', true)
      // 2026-07-17 (F5): determinisztikus sorrend — azonos árú szabályoknál a
      // megjelenített címke ne a DB véletlen sor-sorrendjétől függjön.
      .order('sorrend', { ascending: true }),
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
    // 2026-07-10 (#7 — irányváltás): az ELŐZŐ év befizetései a nyugtafigyelő
    // évhatár-horgonyához. A gyülekezeti sorszámozás évhatáron át folytonos; az
    // előző év UTOLSÓ nyugtája az ALSÓ horgony — az évhatáron elmaradt nyugtákat
    // a FOLYÓ év nézete hozza át (ott is pótolja őket a pénztáros a Decont-tal).
    // Szűkített mezőlista: csak a computeReceiptHealth bemenete kell.
    // 2026-08-11 (K5-#8): LAPOZOTT — a nyugtafigyelő évhatár-horgonya (az előző
    // év UTOLSÓ nyugtája) a plafon feletti soroknál hibás lett volna, és hamis
    // „hiányzó nyugta" riasztást adott volna a folyó évre.
    fetchAllPaged(
      supabase.from('befizetes')
        .select('id, datum, nyugta, iratszam, irattipus, deleted, belso_mozgas_xkey, bankszamla_id')
        .eq('congregation_id', congregationId)
        .eq('deleted', false)
        .gte('datum', `${year - 1}-01-01`)
        .lte('datum', `${year - 1}-12-31`)
        .order('id', { ascending: true }),
    ),
  ])

  let internalTransfers: InternalTransferRow[] = []
  if (!transferRes.error) {
    internalTransfers = normalizeInternalTransfers((transferRes.data || []) as Record<string, unknown>[])
  }

  let congregationName = ''
  let congregationNameRo = '' // hivatalos román név (pl. „Parohia Reformată Brateș") a nyomtatványokhoz
  // 2026-08-11 (K5, lint-higiénia): `let` → `const`. A 2026-07-17-es F5/Q6 döntés
  // óta (a `tartozas_szamitas_mod` kivezetve, mindig 'akkori') SEHOL nem kap új
  // értéket — a `prefer-const` szabály ezt errorként jelezte.
  const debtCalcMode: 'akkori' | 'aktualis' = 'akkori'

  // A primary congregations-lekérdezés már a fenti Promise.all-ban futott (congRes).
  // Ha a `tartozas_szamitas_mod` oszlop hiányzik (régi séma), a ritka fallback ág fut.
  if (congRes.error?.message?.includes('tartozas_szamitas_mod')) {
    const fallbackRes = await supabase
      .from('congregations')
      .select('nev_hu, nev_ro, name')
      .eq('id', congregationId)
      .single()

    // 2026-08-15 (Endre): a nyomtatványokra a HIVATALOS név (name) megy —
    // a rövid magyar név (nev_hu) csak tartalék. (Memória-szabály: name = hivatalos.)
    congregationName = fallbackRes.data?.name || fallbackRes.data?.nev_hu || ''
    congregationNameRo = (fallbackRes.data?.nev_ro as string | null) || ''
  } else {
    congregationName = congRes.data?.name || congRes.data?.nev_hu || ''
    congregationNameRo = (congRes.data?.nev_ro as string | null) || ''
    // 2026-07-17 (F5, Q6 — user-döntés): a tartozas_szamitas_mod KIVEZETVE — mindig
    // 'akkori' (a régi tartozás a saját éve beállításaival számol). Az 'aktualis'
    // mód a listákon amúgy is no-op volt, egyetlen helyen élt (tag-adatlap), és ott
    // képernyők közti inkonzisztenciát okozott. A DB-oszlop megmarad, de nem hat.
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
    supabase.from('bankszamla_nyito_egyenleg').select('eve, nyito_egyenleg_ron, bankszamla_id')
      .eq('congregation_id', congregationId).in('eve', [year - 1, year]),
  ])
  // 2026-07-17 (F4): a nyitó-selectek hibája ne legyen néma — a rögzített nyitó a
  // KPI-k és a Registru Banca elsődleges forrása (v0.9.78-as hibaosztály elleni védelem).
  if (cashNyitoRes.error || bankNyitoRes.error) {
    console.error(
      '[initFinance] A rögzített nyitó egyenlegek lekérdezése HIBÁZOTT — a nyitók fallback-számítással mennek:',
      cashNyitoRes.error?.message || bankNyitoRes.error?.message,
    )
  }
  let recCashCur = 0, recCashPrev = 0, hasCashCur = false
  for (const r of (cashNyitoRes.data || []) as { eve: number; nyito_egyenleg: number }[]) {
    if (r.eve === year) { recCashCur += Number(r.nyito_egyenleg) || 0; hasCashCur = true }
    else recCashPrev += Number(r.nyito_egyenleg) || 0
  }
  // 2026-07-17 (F4): bankszámlánkénti nyitó-térkép az idei évre — a Registru Banca
  // egy-számlás nyitója ebből jön (a legacy bankszamlak.nyito_egyenleg helyett).
  let recBankCur = 0, recBankPrev = 0, hasBankCur = false
  const bankNyitoMap: Record<number, number> = {}
  for (const r of (bankNyitoRes.data || []) as { eve: number; nyito_egyenleg_ron: number; bankszamla_id: number }[]) {
    if (r.eve === year) {
      recBankCur += Number(r.nyito_egyenleg_ron) || 0
      hasBankCur = true
      if (r.bankszamla_id != null) bankNyitoMap[r.bankszamla_id] = Number(r.nyito_egyenleg_ron) || 0
    } else recBankPrev += Number(r.nyito_egyenleg_ron) || 0
  }
  // Előző évi NETTÓ forgalom — bankszamla_id szerint szétválasztva (NULL=kassza, egyébként bank).
  // 2026-07-11 (S9): a könyvelés RON-ban — a RON-ekvivalens (osszeg_ron) számít,
  // nem a deviza-összeg. RON számlán osszeg == osszeg_ron (fallback).
  let carryoverCashNet = 0, carryoverBankNet = 0
  ;(prevBevRes.data || []).forEach((r: { osszeg: number; osszeg_ron?: number | null; bankszamla_id: number | null }) => {
    if (r.bankszamla_id == null) carryoverCashNet += Number(r.osszeg_ron ?? r.osszeg) || 0
    else carryoverBankNet += Number(r.osszeg_ron ?? r.osszeg) || 0
  })
  ;(prevKiaRes.data || []).forEach((r: { osszeg: number; osszeg_ron?: number | null; bankszamla_id: number | null }) => {
    if (r.bankszamla_id == null) carryoverCashNet -= Number(r.osszeg_ron ?? r.osszeg) || 0
    else carryoverBankNet -= Number(r.osszeg_ron ?? r.osszeg) || 0
  })
  // 2026-07-25 (G5): „előző évi záró = következő évi nyitó" — OLVASÁS-ONLY
  // feloldás számlánként (lásd resolve-nyito.ts). A rögzített sor mindig
  // hiteles; ha az évre nincs, a legutolsó korábbi + a közte lévő évek nettó
  // forgalma adja. Hibánál a korábbi (aggregát) fallback marad érvényben.
  const resolvedNyito = await resolveNyitoEgyenlegekUseCase(
    { congregationId, eve: year },
    { supabase, runtime: 'web' },
  )
  if (resolvedNyito.success) {
    for (const [id, r] of Object.entries(resolvedNyito.bank)) bankNyitoMap[Number(id)] = r.value
  }
  const carryoverCash = resolvedNyito.success
    ? resolvedNyito.cash.value
    : hasCashCur
      ? recCashCur
      : recCashPrev + carryoverCashNet
  const carryoverBank = resolvedNyito.success
    ? resolvedNyito.bankTotal
    : hasBankCur
      ? recBankCur
      : recBankPrev + carryoverBankNet

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
      .eq('congregation_id', congregationId).eq('aktiv', true).order('sorrend', { ascending: true })
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

  // 2026-07-16: a member-lekérdezés hibáját EDDIG SENKI NEM NÉZTE MEG — emiatt egy
  // elgépelt oszlopnév némán üres tartozás-listát okozott (lásd a select fölötti
  // megjegyzést). Legalább a szerver-logban legyen nyoma, ha újra elromlik.
  if (membersRes.error) {
    console.error(
      '[initFinance] A tagok lekérdezése HIBÁRA FUTOTT — a Tartozások lista üres lesz!',
      membersRes.error,
    )
  }
  // 2026-07-17 (F1-1): ugyanaz a hibaosztály a befizetés-ágon — ha ez hibázik,
  // minden tag teljes hátralékosnak látszik. Némán eddig senki nem vette észre.
  if (debtPaymentsRes.error) {
    console.error(
      '[initFinance] A tartozás-befizetések lekérdezése HIBÁRA FUTOTT — minden tag fizetetlennek látszana!',
      debtPaymentsRes.error,
    )
  }

  // 2026-07-16: a korai-fizetési kedvezmény az AKTUÁLIS időszak árát mutassa a még
  // nem fizetőknél is (eddig csak akkor járt, ha már ki is fizette). A „ma" a
  // SZERVERTŐL jön, Europe/Bucharest szerint — nem a klienstől, mert az eltérő
  // szerver/kliens összeget és elállított gépóránál hibás számlázást adna.
  const asOfDate = todayInBucharest()

  const eligibleDebtMembers = ((membersRes.data || []) as Array<{
    id: number
    csaladnev: string | null
    k_nev: string | null
    sz_datum: string | null
    foglalkozas: string | null
    meghalt: boolean | null
    member_status: string | null
  }>).filter((member) => !member.meghalt && !isExcludedMemberStatus(member.member_status))

  // 2026-07-17 (F5, Q7 — user-döntés): a tisztán családi befizetések FELOSZTÁSA a
  // család tagjai közt (idősebb előbb, kinek-kinek az évi alap elvárásáig) — eddig
  // a családi tétel minden tagnál teljes összegként jelent meg (többszörös jóváírás).
  const allocationMembers = eligibleDebtMembers.map((member) => ({
    id: member.id,
    sz_datum: member.sz_datum,
    familyId: personToFamilyMap[member.id] ?? null,
    foglalkozas: member.foglalkozas,
  }))
  const allocatedPayments = allocateFamilyPayments(maintenancePayments, allocationMembers, (mem, y) =>
    computeBaseExpectedForMemberYear({
      member: mem,
      year: y,
      currentYear: year,
      debtCalcMode,
      yearSettings,
      discounts,
      exemptions,
    }),
  )

  const debtRows: DebtRow[] = eligibleDebtMembers
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
        payments: allocatedPayments,
        asOfDate,
      })

      // A `prefix` oszlop nem létezik a `szemely`-en — a desktop is [csaladnev, k_nev]-ből
      // építi a nevet (finance-debt-compute.ts), így a két kiadás neve is egyezik.
      const nameParts = [member.csaladnev, member.k_nev].filter(Boolean)
      // 2026-07-16: a kiskorúság ELŐBB dől el, mint a „felmentett”. Az `expected === 0`
      // önmagában nem elég: a 18 alatti tagra is 0 az elvárás, de ő NEM felmentett
      // (az a `felmentes` tábla szerinti presbitériumi döntés). A motor saját
      // címkét ad (JARULEK_MINOR_RULE), abból ismerjük fel.
      const isMinor = result.appliedRules.includes(JARULEK_MINOR_RULE)
      const status: DebtRow['status'] = isMinor
        ? 'kiskoru'
        : result.expected === 0
          ? 'felmentett'
          : result.debt > 0
            ? 'hatralekos'
            : 'rendezve'

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
        // A kiskorúak a lista VÉGÉRE (a felmentettek után) — ők nem járulékkötelesek,
        // a hátralék-lista pedig a beszedendő pénzről szól.
        const priority = { hatralekos: 0, rendezve: 1, felmentett: 2, kiskoru: 3 }
        return priority[a.status] - priority[b.status]
      }
      if (a.debt !== b.debt) return b.debt - a.debt
      return a.name.localeCompare(b.name, 'hu')
    })

  // 2026-07-10 (#7): az előző évi sorok az évhatár ALSÓ horgonyához — az előző év
  // végén elmaradt nyugták a FOLYÓ év figyelőjében jelennek meg.
  const receiptHealth = computeReceiptHealth(
    (bevRes.data || []) as BefitetesRow[],
    (prevAnchorBevRes.data || []) as ReceiptHealthInputRow[],
  )

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
    bankNyitoMap,
    internalTransfers,
    congregationName,
    congregationNameRo,
    // A megyei nyomtatvány-borító felső blokkjának neve — gyülekezeti
    // hatókörben nem értelmezett (ott az egyházmegye blokkja áll, sablonnal).
    districtName: null as string | null,
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
  // 2026-08-15 (terv 4.2): a duplázás-védő közös helperen át — a dioceses.name
  // a seedben már tartalmazza a „Református Egyházmegye" toldatot, egy régi/kézi
  // sor viszont nem biztos; a helper mindkét esetben a teljes hivatalos nevet adja.
  let dioceseName = ''
  const dioRes = await supabase
    .from('dioceses')
    .select('name, district_id')
    .eq('id', dioceseId)
    .single()
  dioceseName = formatEgyhazmegyeNev(dioRes.data?.name)

  // ── Egyházkerület neve (a megyei nyomtatvány-borító felső blokkjához) ──
  // 2026-08-15 (terv 2.1/3): a megye SAJÁT íve az egyházkerülethez megy fel,
  // ezért a borító felső blokkjában a KERÜLET neve áll (a gyülekezeti íven ott
  // az egyházmegye áll). Ez KIZÁRÓLAG felirat: ha nem sikerül lekérdezni, a
  // nyomtatvány semleges „REFORMÁTUS EGYHÁZKERÜLET" feliratot ír — jogosultságot
  // vagy zárást nem befolyásol, ezért a hiba elnyelése itt biztonságos.
  let districtName: string | null = null
  const districtId = (dioRes.data as { district_id?: string | null } | null)?.district_id || null
  if (districtId) {
    try {
      const { data: distRow } = await supabase
        .from('districts')
        .select('name')
        .eq('id', districtId)
        .maybeSingle()
      districtName = (distRow as { name?: string | null } | null)?.name ?? null
    } catch {
      districtName = null
    }
  }

  // ── Bealitas normalizálása BealitasRow-kompatibilisra ──
  // 2026-08-15 (terv 2.1/2): a leképezés a KÖZÖS normalizálóba költözött
  // (lib/finance/diocese-bealitas.ts) — a korábbi inline változat a
  // költségvetés-módosítás flageket hardkódolt false-szal töltötte, így a
  // véglegesített megyei módosítás nyitottnak látszott. A BudgetPrintDialog
  // ugyanezt a normalizálót hívja — közös helper, soha széthúzó másolat.
  const rawSettings = settingsRes.data as Record<string, unknown> | null
  const settings: BealitasRow | null = normalizeDioceseBealitas(rawSettings, dioceseId, year)

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
    bankNyitoMap: {} as Record<number, number>, // diocese módban nincs per-számla nyitó-tábla
    internalTransfers: [] as InternalTransferRow[], // Phase 5-re halasztott
    congregationName: dioceseName, // UI label, diocese módban a diocese neve
    congregationNameRo: '', // diocese módban nincs külön román gyülekezetnév
    // A felettes szint neve a nyomtatvány-borítóra (csak megyei hatókörben).
    districtName,
    debtCalcMode: 'akkori' as 'akkori' | 'aktualis',
    yearlyFees: {} as Record<number, number>, // diocese-nél nincs tag-járulék
    debtRows: [] as DebtRow[], // tag-szintű adósság diocese-ben nincs
    receiptHealth: {
      missingNumbers: [],
      missingReceipts: [],
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
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock

  const d = parsed.data
  const {
    data: { user },
  } = await scope.supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // 2026-07-10 (#4/3): véglegesített év create-zárja
  const lockError = await assertYearsNotFinalizedForCreate(scope, [d.datum])
  if (lockError) return { error: lockError }

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

// 2026-08-11 (K5-#4): a `saveIncomeWithLinkedInventory` TÖRÖLVE — a v1
// pénzügy→leltár híd bevétel-oldalát csak a (szintén törölt) income-dialog
// fájlok importálták, élő útvonalról soha nem hívódott.

// ── Kiadás mentés ────────────────────────────────────────────

export async function saveExpense(data: ExpenseInput) {
  const parsed = expenseSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock

  const d = parsed.data
  const {
    data: { user },
  } = await scope.supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // 2026-07-10 (#4/3): véglegesített év create-zárja
  const lockError = await assertYearsNotFinalizedForCreate(scope, [d.datum])
  if (lockError) return { error: lockError }

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

// 2026-08-11 (K5-#4): a `saveExpenseWithLinkedInventory` TÖRÖLVE. Exportált
// szerver-akció volt, de a repóban SEMMI nem importálta. Nem csak használaton
// kívüli volt, hanem HIBÁS is: a leltár-payload már nem létező oszlopneveket írt
// (`beszerzes_erteke`, `hasznalati_ido`, `felelos_nev`, `deleted`) — a mai
// sémában ezek `beszerzesi_ertek`, `hasznalati_ido_ev`, `felelos_neve`,
// `is_deleted` —, és fallback-ág sem volt. Ha valaki visszaköti abban a hitben,
// hogy ez a pénzügy→leltár híd, minden hívás PGRST204-gyel bukik, és mivel a
// rollback is nem létező `deleted` oszlopra írt volna, a már beszúrt `kiadas` sor
// árván maradt volna. Az ÉLŐ híd: `insertLinkedInventoryFromExpenseRow` (2026-08-09).

export async function saveIncomeBatch(rows: IncomeBatchRowInput[]) {
  const parsed = incomeBatchSchema.safeParse(rows)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock

  const {
    data: { user },
  } = await scope.supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // 2026-07-10 (#4/3): véglegesített év create-zárja (a batch minden dátumára)
  const lockError = await assertYearsNotFinalizedForCreate(scope, parsed.data.map((r) => r.datum))
  if (lockError) return { error: lockError }

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
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock

  const {
    data: { user },
  } = await scope.supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // 2026-07-10 (#4/3): véglegesített év create-zárja (a batch minden dátumára)
  const lockError = await assertYearsNotFinalizedForCreate(scope, parsed.data.map((r) => r.datum))
  if (lockError) return { error: lockError }

  // 2026-08-09: pénzügy→leltár híd — a leltár-köteles sorokhoz (row.inventory)
  // a kiadással EGYÜTT leltári tétel is készül. Review-fix: a köteg gyülekezeti
  // ága MINDEN-VAGY-SEMMI — bármely sor hibájánál az addig beszúrt kiadások is
  // visszavonódnak, különben az újrapróbálkozás duplikálná a már mentett sorokat.
  let anyInventory = false
  const insertedExpenses: Array<{ id: number | null; xkey: string | null }> = []

  const rollbackInsertedExpenses = async () => {
    for (const rec of insertedExpenses) {
      try {
        if (Number.isFinite(rec.id) && (rec.id as number) > 0) {
          await scope.supabase.from('kiadas').update({ deleted: true }).eq('id', rec.id).eq('congregation_id', scope.scopeId)
        } else if (rec.xkey) {
          await scope.supabase.from('kiadas').update({ deleted: true }).eq('xkey', rec.xkey).eq('congregation_id', scope.scopeId)
        }
      } catch {
        /* best-effort — a többi sort ettől még visszavonjuk */
      }
    }
  }

  for (let index = 0; index < parsed.data.length; index += 1) {
    const row = parsed.data[index]

    if (scope.scope === 'diocese') {
      if (row.inventory) {
        return { error: `${index + 1}. sor: a leltárba vétel egyházmegyei módban nem elérhető — külön rögzítsd a kiadást és a leltári tételt.` }
      }
      const result = await insertDioceseExpenseRecord({
        supabase: scope.supabase,
        dioceseId: scope.scopeId,
        userId: user.id,
        input: row,
      })
      if ('error' in result) {
        return { error: `${index + 1}. sor: ${result.error}` }
      }
      continue
    }

    const result = await insertExpenseRecord({
      supabase: scope.supabase,
      congregationId: scope.scopeId,
      userId: user.id,
      input: row,
    })
    if ('error' in result) {
      await rollbackInsertedExpenses()
      return {
        error: insertedExpenses.length
          ? `${index + 1}. sor: ${result.error} — a köteg minden kiadása visszavonva; javítsd a hibát és mentsd újra.`
          : `${index + 1}. sor: ${result.error}`,
      }
    }
    insertedExpenses.push({
      id: Number.isFinite(result.id) ? result.id : null,
      xkey: result.xkey ?? null,
    })

    if (row.inventory) {
      const invResult = await insertLinkedInventoryFromExpenseRow({
        supabase: scope.supabase,
        congregationId: scope.scopeId,
        userId: user.id,
        expense: row,
        inventory: row.inventory,
        documentNumber: result.documentNumber,
        expenseXkey: result.xkey ?? null,
      })
      if (invResult.error) {
        await rollbackInsertedExpenses()
        return { error: `${index + 1}. sor: a kapcsolt leltári tétel mentése nem sikerült, ezért a köteg minden kiadása visszavonva. ${invResult.error}` }
      }
      anyInventory = true
    }
  }

  revalidatePath('/penzugy')
  if (anyInventory) revalidatePath('/leltar')
  return { success: true }
}

// ── Tranzakció törlés (soft delete) ──────────────────────────

export async function deleteTransaction(type: 'befizetes' | 'kiadas', id: number) {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock
  const { supabase, T } = scope

  // Diocese path — egyszerűbb (nincs belsomozgas_xkey pairing MVP-ben)
  if (scope.scope === 'diocese') {
    const table = type === 'befizetes' ? T.befizetes : T.kiadas
    // 2026-08-15 (átvilágítás, ⛔1): ÉV-ZÁR a törlés ELŐTT — az egyházmegyei
    // oldalon is (a `diocese_bealitas.szamadas_veglegesitve` zászlót ugyanaz a
    // scope-tudatos `isYearFinalized` olvassa).
    const { data: dRec, error: dRecErr } = await supabase
      .from(table)
      .select('datum')
      .eq('id', id)
      .eq('diocese_id', scope.scopeId)
      .maybeSingle()
    if (dRecErr) {
      return {
        error:
          `A tétel ellenőrzése nem sikerült (${dRecErr.message}), ezért a törlést biztonságból ` +
          'megszakítottuk. Próbáld újra néhány perc múlva; ha újra hibázik, jelezd a rendszergazdának.',
      }
    }
    if (!dRec) return { error: 'A tétel nem található (talán már törölték).' }
    const dLock = await assertYearsNotFinalizedForDelete(scope, [
      (dRec as { datum?: string | null }).datum,
    ])
    if (dLock) return { error: dLock }

    const { error } = await supabase
      .from(table)
      .update({ deleted: true })
      .eq('id', id)
      .eq('diocese_id', scope.scopeId)
    if (error) return { error: `Hiba: ${error.message}` }
    revalidatePath('/penzugy')
    return { success: true }
  }

  // Congregation path — belsomozgas pairing
  const congregationId = scope.scopeId

  // 2026-08-15 (átvilágítás, ⛔1): a törlendő sort ELŐSZÖR lekérdezzük (dátum +
  // belső-mozgás kulcs). A korábbi kód `const { data: rec } = … .single()`-t
  // használt: az `error`-t ELDOBTA, így egy nem létező vagy nem olvasható sor is
  // „nincs belső mozgás"-nak látszott, és a törlés a végén szó nélkül lefutott.
  const { data: rec, error: recErr } = await supabase
    .from(type)
    .select('datum, belso_mozgas_xkey')
    .eq('id', id)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (recErr) {
    return {
      error:
        `A tétel ellenőrzése nem sikerült (${recErr.message}), ezért a törlést biztonságból ` +
        'megszakítottuk. Próbáld újra néhány perc múlva; ha újra hibázik, jelezd a rendszergazdának.',
    }
  }
  if (!rec) {
    return { error: 'A tétel nem található (talán már törölték, vagy másik gyülekezeté).' }
  }
  const r = rec as { datum: string | null; belso_mozgas_xkey: string | null }

  // Belső mozgás: a törlés MINDKÉT oldalt (bevétel + kiadás sort) érinti, ezért
  // MINDKETTŐ évét ellenőrizni kell — egy év végi kassza↔bank átvezetés két
  // oldala eltérő évre eshet, és ilyenkor a zárt év oldalának eltüntetése
  // ugyanúgy elmozdítaná a beküldött számadást.
  const datesToCheck: Array<string | null | undefined> = [r.datum]
  if (r.belso_mozgas_xkey) {
    const [befRes, kiaRes] = await Promise.all([
      supabase
        .from('befizetes')
        .select('datum')
        .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
        .eq('congregation_id', congregationId),
      supabase
        .from('kiadas')
        .select('datum')
        .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
        .eq('congregation_id', congregationId),
    ])
    const pairErr = befRes.error || kiaRes.error
    if (pairErr) {
      // Fail-closed: ha a párt nem tudjuk felderíteni, nem tudjuk azt sem, hogy
      // melyik év(ek)et érintené a törlés → nem törlünk.
      return {
        error:
          `A belső mozgás párjának ellenőrzése nem sikerült (${pairErr.message}), ezért a törlést ` +
          'biztonságból megszakítottuk. Próbáld újra néhány perc múlva; ha újra hibázik, jelezd a ' +
          'rendszergazdának.',
      }
    }
    for (const row of [...(befRes.data || []), ...(kiaRes.data || [])]) {
      datesToCheck.push((row as { datum?: string | null }).datum)
    }
  }

  const lockError = await assertYearsNotFinalizedForDelete(scope, datesToCheck)
  if (lockError) return { error: lockError }

  if (r.belso_mozgas_xkey) {
    const { error: befErr } = await supabase
      .from('befizetes')
      .update({ deleted: true })
      .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
      .eq('congregation_id', congregationId)
    if (befErr) return { error: `Hiba: ${befErr.message}` }
    const { error: kiaErr } = await supabase
      .from('kiadas')
      .update({ deleted: true })
      .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
      .eq('congregation_id', congregationId)
    if (kiaErr) {
      return {
        error:
          `A belső mozgás bevétel-oldala törlődött, a kiadás-oldala viszont NEM (${kiaErr.message}). ` +
          'Kérlek nézd meg a Belső mozgások listát, és jelezd a rendszergazdának.',
      }
    }
    revalidatePath('/penzugy')
    return { success: true }
  }

  const { error } = await supabase.from(type).update({ deleted: true }).eq('id', id).eq('congregation_id', congregationId)
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/penzugy')
  return { success: true }
}

// ── Következő nyugtaszám ─────────────────────────────────────
//
// 2026-08-11 (5. kör, P3 #5): a `getNextReceiptNumber(year)` TÖRÖLVE.
// Két baja volt, mindkettő a 2026-07-25-i F6.1 nyugtaszám-P0 hibaosztálya:
//   (1) LAPOZÁS NÉLKÜL számolt MAX-ot — a PostgREST 1000-es plafonja fölött a
//       legnagyobb iratszám kimaradhatott, és a rendszer ÚJRA KIADOTT volna egy
//       már használt nyugtaszámot;
//   (2) `const { data } = await q` — az `error` eldobva, tehát bármilyen
//       lekérdezési hiba (RLS, hálózat, séma-drift) némán „1"-et adott vissza.
// Hívója már nem volt: az egyetlen három (`components/modals/income-dialog.tsx`,
// `-v2`, `-v3`) maga is halott volt, és a mai takarítás törölte őket. Egy
// `'use server'` export viszont akkor is ÉLŐ POST-végpont marad, és bárki, aki
// valaha visszaköti egy dialógushoz, azonnal duplikált nyugtaszámot kap —
// ezért nem kommentbe tesszük, hanem megszüntetjük. Az ÉLŐ út a
// `getNextReceiptNumbers` (lapozott + `bankszamla_id IS NULL` + stornó-kizáró),
// a desktopé pedig a `nextReceiptNumbersOnline`.

// ── #3 (Endre): következő nyugtaszámok — kerületi (nyomdai) + gyülekezeti ──
// A nyugtán KÉT szám van: a kerületi (a kerülettől kapott, előre nyomtatott szám —
// `befizetes.iratszam`) és a gyülekezeti (a gyülekezet saját sorszáma — `befizetes.nyugta`).
// Mindkettő FOLYAMATOS (hézagmentes): a következő = az UTOLSÓ nyugta számai + 1.
// „Utolsó" = a legnagyobb kerületi számú sor — ennek a sornak vesszük MINDKÉT számát,
// és léptetjük +1-gyel (lépésben), a vezető nullák megőrzésével (pl. „0115301" → „0115302").
// Így a két szám együtt lép, és a régi (tükrözött nyugta=iratszam) adat sem rontja el a
// gyülekezeti sorozatot az első valódi tétel után (önjavító).
/**
 * 2026-07-25 (F6.1): LAPOZOTT lekérés — a PostgREST implicit sor-plafonja
 * (tipikusan 1000) NÉMÁN levágja a nagy lekérdezéseket. A nyugtaszám-generátor
 * MAX-számítása ezen a plafonon ült: rendezés nélkül a legnagyobb iratszám
 * kimaradhatott, és a rendszer ÚJRA KIADHATOTT egy már használt nyugtaszámot.
 * Csak az ÜRES lap a biztos stop (leszállított szerver-plafonnál a rövid lap
 * még nem a vége) — a desktop selectAllPaged-del azonos szemantika.
 *
 * 2026-08-11 (K5-#7) SZERZŐDÉS: az ide beadott lekérdezésre KÖTELEZŐ a
 * determinisztikus rendezés — `.order('id', { ascending: true })`. Minden lap
 * külön HTTP-kérés, tehát külön DB-snapshot; ORDER BY nélkül a Postgres nem
 * garantálja a lapok közti stabil sorrendet (más terv, párhuzamos seq scan,
 * időközbeni UPDATE), így ugyanaz a sor két lapon is megjelenhet, más sor pedig
 * kimaradhat. Pénz-összegeknél ez néma, nem reprodukálható eltérés a hivatalos
 * nyomtatványokon. Új hívót CSAK `.order()`-rel vegyél fel.
 *
 * 2026-08-11 (5. kör, P3 #15): a saját ciklus KIVEZETVE — a törzs mostantól a
 * KÖZÖS `selectAllPaged` (@kartoteka/supabase-client), hogy a web és a desktop
 * ugyanazt a lapozó-szemantikát futtassa. A helper itt marad vékony burkolóként,
 * mert a fájlban ~20 hívása van, és a szerződés (a hívó rendez) változatlan.
 */
async function fetchAllPaged<
  // A supabase-lekérdezés sor-típusa a hívó oldalán dől el; `any` az alapérték,
  // hogy a helper DROP-IN cseréje legyen a nyers `await query`-nek.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T = any,
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  return selectAllPaged<T>(query, { pageSize, orderColumn: null, dedupeBy: 'id' })
}

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
  // 2026-07-10 (S3-#12): mindhárom lekérdezésből kizárjuk a stornózott sorokat —
  // a stornó után a szám újra kiadható, ne tolja feljebb a MAX-ot. Or-szűrés,
  // mert a régi (storno-funkció előtti) sorokban a stornozott oszlop NULL.
  let allQ = supabase.from(T.befizetes)
    .select('iratszam, nyugta')
    .eq(T.scopeCol, scope.scopeId)
    .eq('deleted', false)
    .or('stornozott.eq.false,stornozott.is.null')
    .is('bankszamla_id', null)
    // A lapozáshoz KÖTELEZŐ a determinisztikus rendezés (id ASC) — enélkül a
    // .range() ablakok átfedhetnek/kihagyhatnak sorokat.
    .order('id', { ascending: true })
  if (scope.scope === 'congregation') allQ = allQ.is('belso_mozgas_xkey', null)

  // #Endre 2026-07-01 (perf): a 3 FÜGGETLEN lekérdezés PÁRHUZAMOSAN (nem sorosan): kerületi (allQ),
  // ezévi (yearQ) és korábbi évi (prevQ). A prevQ-t is mindig lekérjük — ha van ezévi szám, nem
  // használjuk (olcsóbb, mint egy plusz soros round-trip). A kliens per-évre cache-eli a hívást.
  let yearQ = supabase.from(T.befizetes)
    .select('iratszam, nyugta')
    .eq(T.scopeCol, scope.scopeId)
    .eq('deleted', false)
    .or('stornozott.eq.false,stornozott.is.null') // 2026-07-10 (S3-#12)
    .is('bankszamla_id', null)
    .gte('datum', `${year}-01-01`)
    .lte('datum', `${year}-12-31`)
    .order('id', { ascending: true })
  if (scope.scope === 'congregation') yearQ = yearQ.is('belso_mozgas_xkey', null)
  let prevQ = supabase.from(T.befizetes)
    .select('iratszam, nyugta, datum')
    .eq(T.scopeCol, scope.scopeId)
    .eq('deleted', false)
    .or('stornozott.eq.false,stornozott.is.null') // 2026-07-10 (S3-#12)
    .is('bankszamla_id', null)
    .lt('datum', `${year}-01-01`)
    // 2026-07-25 (F6.1): a .limit(500) KIVEZETVE — évi ~470 tételnél már egyetlen
    // korábbi év sem fért bele, így a „tavalyi utolsó" szám hibás lehetett.
    .order('id', { ascending: true })
  if (scope.scope === 'congregation') prevQ = prevQ.is('belso_mozgas_xkey', null)
  const [allRes, yearRes, prevRes] = await Promise.all([
    fetchAllPaged<{ iratszam: string | null; nyugta: string | null }>(allQ),
    fetchAllPaged<{ iratszam: string | null; nyugta: string | null }>(yearQ),
    fetchAllPaged<{ iratszam: string | null; nyugta: string | null; datum: string }>(prevQ),
  ])
  // A lekérdezés hibája NEM maradhat néma: hibás MAX = újra kiadott nyugtaszám.
  const firstErr = allRes.error || yearRes.error || prevRes.error
  if (firstErr) {
    console.error('[getNextReceiptNumbers] a nyugtaszám-lekérdezés HIBÁZOTT:', firstErr.message)
    return { keruleti: '', gyulekezeti: '' }
  }
  const allData = allRes.data
  const yearData = yearRes.data
  const prevData = prevRes.data
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
  const thisYear = maxNumOf(
    ((yearData || []) as Array<{ iratszam: string | null; nyugta: string | null }>)
      .filter((r) => r.nyugta && r.nyugta !== r.iratszam)
      .map((r) => r.nyugta),
  )
  if (thisYear.num > 0) {
    // Folytonos az éven belül — nincs kérdés, csak +1.
    return { keruleti, gyulekezeti: pad(thisYear.num + 1, thisYear.width) }
  }

  // Nincs ezévi gyülekezeti szám → van-e KORÁBBI évi? (ÚJ ÉV → a hívó kérdezzen rá) — a prevData
  // már megvan a fenti Promise.all-ból.
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
): Promise<{ expected: number; paid: number; debt: number; hasBase: boolean } | null> {
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return null

  // 1. fázis: tag + beállítás + kedvezmények + felmentések + család + számítási mód (párhuzamosan).
  const [memberRes, bealitasRes, discRes, exRes, famRes, congRes] = await Promise.all([
    supabase.from('szemely').select('id, sz_datum, foglalkozas').eq('id', personId).eq('congregation_id', congregationId).maybeSingle(),
    supabase.from('bealitas').select('id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid').eq('congregation_id', congregationId).eq('id', String(year)).maybeSingle(),
    supabase.from('jarulek_kedvezmeny').select('id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras').eq('congregation_id', congregationId).eq('aktiv', true).eq('ev', year).order('sorrend', { ascending: true }),
    supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').eq('congregation_id', congregationId),
    supabase.from('haztartas_tag').select('id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)').eq('congregation_id', congregationId).eq('id_szemely', personId).is('ervenyes_ig', null),
    supabase.from('congregations').select('tartozas_szamitas_mod, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid').eq('id', congregationId).maybeSingle(),
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
  // 2026-07-17 (F1-1 + F1-4): id_szamadasicel a nem létező szamadasicel(kod) helyett
  // + stornó-szűrés — bit-azonos az initFinance Tartozás-lekérdezésével.
  let payQ = supabase.from('befizetes')
    .select('id_szemely, id_csalad, datum, fizetettev, osszeg, befizetescel(id_szamadasicel)')
    .eq('congregation_id', congregationId)
    .eq('fizetettev', year)
    .or('deleted.eq.false,deleted.is.null')
    .or('stornozott.eq.false,stornozott.is.null')
  // FONTOS: id_csalad.eq.null tilos Supabase-ben — ha nincs család, csak személyre szűrünk.
  payQ = familyId != null ? payQ.or(`id_szemely.eq.${personId},id_csalad.eq.${familyId}`) : payQ.eq('id_szemely', personId)
  const { data: payData, error: payError } = await payQ
  if (payError) {
    console.error('[getExpectedJarulek] A befizetés-lekérdezés HIBÁRA FUTOTT — az auto-összeg a teljes díjat ajánlaná:', payError)
  }
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
  // #Endre 2026-07-01: ha az adott ÉVRE nincs `bealitas` sor (vagy 0 az alap), a welcome-ben a
  // `congregations`-be írt éves járulék az ALAP (fallback) — így az auto-összeg akkor is működik,
  // ha csak a gyülekezeti alapadat van beállítva (nincs külön per-évi bealitas, pl. új/teszt gyülekezet).
  const cong = congRes.error ? null : (congRes.data as {
    tartozas_szamitas_mod?: unknown; eves_jarulek?: number | null; jarulek_kedvezmenyes?: number | null; jarulek_hatarid?: string | null
  } | null)
  // ── 2026-08-15 (Endre hibajelzése) — AZ ÉVRE RÖGZÍTETT DÍJ ELŐBBRE VALÓ ────
  // A hiba: a lelkész a „Gyülekezet beállítása → Évenkénti díjak" panelen
  // beállította a 2024-es díjat (100), a rögzítő mégis a MAI díjat (220)
  // ajánlotta. Oka: a panel a hiányzó `bealitas` évekre a RÉGI
  // `congregation_annual_fees` tükör-táblából pótol (congregation/actions.ts
  // getAnnualFeeRowsCompat), tehát 100-at MUTAT — a motor viszont csak a
  // `bealitas`-t nézte, és annak hiányában egyenesen a MAI gyülekezeti alapra
  // esett vissza. A panel „működni látszott", a számítás mégis rossz volt.
  //
  // Javítás: a visszaesési sorrend mostantól
  //   bealitas(év) → congregation_annual_fees(év) → congregations (MAI).
  // Az ÉVRE szóló érték MINDIG előbbre való a mai globális alapnál.
  if ((yearSettings[year]?.eves_jarulek || 0) <= 0) {
    const { data: legacyFee } = await supabase
      .from('congregation_annual_fees')
      .select('eves_jarulek, jarulek_hatarid')
      .eq('congregation_id', congregationId)
      .eq('year', year)
      .maybeSingle()
    const legacyAmount = Number(legacyFee?.eves_jarulek) || 0
    if (legacyAmount > 0) {
      yearSettings[year] = {
        year,
        // A visszamenőleges évekhez nem jár kedvezmény (a panel ígérete) —
        // ugyanaz a szabály, mint a saveAnnualFee createYearlySettings-ágán.
        eves_jarulek: legacyAmount,
        jarulek_kedvezmenyes: 0,
        jarulek_hatarid: legacyFee?.jarulek_hatarid || cong?.jarulek_hatarid || null,
      }
    }
  }
  if ((yearSettings[year]?.eves_jarulek || 0) <= 0 && (Number(cong?.eves_jarulek) || 0) > 0) {
    yearSettings[year] = {
      year,
      eves_jarulek: Number(cong?.eves_jarulek) || 0,
      jarulek_kedvezmenyes: cong?.jarulek_kedvezmenyes == null ? null : Number(cong?.jarulek_kedvezmenyes) || 0,
      jarulek_hatarid: cong?.jarulek_hatarid || null,
    }
  }
  // Van-e egyáltalán beállított éves járulék-alap erre az évre (bealitas VAGY congregations)?
  const hasBase = (yearSettings[year]?.eves_jarulek || 0) > 0
  // Ellenálló a `kezdet` oszlop hiányára (régi séma): ha a lekérdezés HIBÁZOTT, újrapróbáljuk
  // `kezdet` nélkül — különben a SELECT némán [] -t adna, és az ÖSSZES mentett kedvezmény kiesne
  // (ez a „van mentett adat, mégsem alkalmazza" tünet leggyakoribb oka). A kezdet ekkor null (nyitott ablak).
  let discData: Array<Record<string, unknown>> | null = discRes.data as Array<Record<string, unknown>> | null
  if (discRes.error) {
    const retry = await supabase.from('jarulek_kedvezmeny')
      .select('id, ev, tipus, aktiv, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
      .eq('congregation_id', congregationId).eq('aktiv', true).eq('ev', year).order('sorrend', { ascending: true })
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
  // 2026-07-17 (F5, Q6): a tartozas_szamitas_mod kivezetve — mindig 'akkori'.
  const debtCalcMode = 'akkori' as const

  // 2026-07-17 (F5, Q7 — bit-azonos a Tartozás-listával): a tisztán családi
  // befizetések felosztása a család tagjai közt. Ehhez a család rostere kell —
  // csak akkor kérjük le, ha van felosztandó (tisztán családi) tétel.
  let paymentsForCalc: JarulekPaymentLike[] = maintenancePayments
  // (A vegyes — személy+család — tétel is felosztás-köteles: a megnevezett tag
  // elvárása feletti többlet a család többi tagjára folyik.)
  if (familyId != null && maintenancePayments.some((p) => p.id_csalad != null)) {
    const { data: famTagData } = await supabase
      .from('haztartas_tag')
      .select('id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
      .eq('congregation_id', congregationId)
      .is('ervenyes_ig', null)
    const famMemberIds = new Set<number>()
    for (const row of (famTagData || []) as Array<{
      id_szemely: number
      haztartas: { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null } | { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null }[] | null
    }>) {
      const h = Array.isArray(row.haztartas) ? row.haztartas[0] : row.haztartas
      if (h && h.isaktiv === true && h.ervenyes_ig == null && h.legacy_csalad_id === familyId && row.id_szemely) {
        famMemberIds.add(row.id_szemely)
      }
    }
    famMemberIds.add(personId)
    const { data: famSzemely } = await supabase
      .from('szemely')
      .select('id, sz_datum, foglalkozas, meghalt, member_status')
      .eq('congregation_id', congregationId)
      .in('id', [...famMemberIds])
    const roster = ((famSzemely || []) as Array<{
      id: number; sz_datum: string | null; foglalkozas: string | null; meghalt: boolean | null; member_status: string | null
    }>)
      .filter((m) => !m.meghalt && !isExcludedMemberStatus(m.member_status))
      .map((m) => ({ id: m.id, sz_datum: m.sz_datum, familyId, foglalkozas: m.foglalkozas }))
    paymentsForCalc = allocateFamilyPayments(maintenancePayments, roster, (mem, y) =>
      computeBaseExpectedForMemberYear({
        member: mem,
        year: y,
        currentYear: year,
        debtCalcMode,
        yearSettings,
        discounts,
        exemptions,
      }),
    )
  }

  const prospectiveDate = prospectiveDateIso ? new Date(prospectiveDateIso) : null
  const result = computeJarulekForMemberYear({
    member: { id: member.id, sz_datum: member.sz_datum, familyId, foglalkozas: member.foglalkozas },
    year,
    currentYear: year, // D2: bit-azonos a Tartozások-listával
    debtCalcMode,
    yearSettings,
    discounts,
    exemptions,
    payments: paymentsForCalc,
    prospectiveDate: prospectiveDate && !Number.isNaN(prospectiveDate.getTime()) ? prospectiveDate : null,
  })
  return { expected: result.expected, paid: result.paid, debt: result.debt, hasBase }
}

// ── H2 javítás: Iratszám duplikáció ellenőrzés ──────────────

/**
 * 2026-08-11 (5. kör, K5-#32 testvér-vizsgálat): ez a függvény is elnyelte a
 * Supabase-hibát (`const { data } = …` → `return (data?.length || 0) > 0`), és
 * hibánál `false`-t, azaz „nincs duplikátum"-ot adott. TUDATOSAN MARAD boolean:
 * ez NEM zár/jogosultsági kapu, hanem a rögzítő űrlap FIGYELMEZTETŐ jelzése
 * (`onCheckReceiptDuplicate` → badge); a mentést nem engedélyezi és nem tiltja.
 * Dobás vagy fail-closed blokk itt a gépelés közben futó ellenőrzést buktatná
 * el, és a nyugtaszámozás naiv szigorítása amúgy is tiltott (az iratszám-index
 * inert). Amit javítunk: a hiba NEM tűnik el némán — szerver-oldalon logoljuk,
 * hogy a badge kimaradása diagnosztizálható legyen.
 */
export async function checkReceiptDuplicate(iratszam: string): Promise<boolean> {
  if (!iratszam.trim()) return false
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return false
  const { data, error } = await supabase.from('befizetes')
    .select('id').eq('congregation_id', congregationId).eq('iratszam', iratszam.trim()).eq('deleted', false).limit(1)
  if (error) {
    console.error(
      '[penzugy] Az iratszám-duplikáció ellenőrzése hibára futott — a figyelmeztető ' +
        'jelzés ezért kimarad (a mentést ez nem befolyásolja).',
      error,
    )
    return false
  }
  return (data?.length || 0) > 0
}

// ── H7 javítás: Éves beállítás létrehozás ────────────────────

export async function createYearlySettings(
  year: number,
  evesJarulek: number,
  jarulekHatarid: string,
  // A render-útvonal (page.tsx) NEM hívhat revalidatePath-ot renderelés közben (Next 16
  // hiba). Onnan revalidate:false-szal hívjuk; a kliens-modalból marad az alapértelmezett true.
  // 2026-07-17 (F1-3): jarulekKedvezmenyes felülbírálás — a visszamenőleges év-sorokhoz
  // (saveAnnualFee) 0 kell (régi évekhez nincs kedvezmény), egyébként a congregations-ből jön.
  opts?: { revalidate?: boolean; jarulekKedvezmenyes?: number },
) {
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const yearId = String(year)
  // 2026-07-17 (F1-5): a jarulek_kedvezmenyes-t is átvesszük a gyülekezeti alapadatból —
  // korábban fixen 0 került az új év sorába, így az onboardingban beállított
  // kedvezményes alapösszeg (korai fizetés) minden következő évben némán elveszett.
  const { data: congregation } = await supabase
    .from('congregations')
    .select('adrstreet_id, adrlocality_id, jarulek_kedvezmenyes')
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

  // 2026-07-17 (F5): a határidő csak érvényes HH-NN alakban mehet az adatbázisba —
  // a '2026-07-01' / '07.01' / '13-01' formák a motorban néma hibát okoztak volna.
  const safeHatarid =
    jarulekHatarid && /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(jarulekHatarid)
      ? jarulekHatarid
      : '07-01'

  const basePayload = {
    id: yearId,
    congregation_id: congregationId,
    eves_jarulek: evesJarulek,
    jarulek_hatarid: safeHatarid,
    jarulek_kedvezmenyes: opts?.jarulekKedvezmenyes ?? (Number(congregation?.jarulek_kedvezmenyes) || 0),
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

  // 2026-07-17 (F1 hardening): ignoreDuplicates — ez a függvény LÉTREHOZ, sosem ír
  // felül. Korábban sima upsert volt: egy verseny-helyzetben (a hívó „nincs sor"
  // ellenőrzése és az upsert közt létrejövő sor) a teljes basePayload ráíródott a
  // meglévő sorra, kinullázva a véglegesítés-zászlókat és a záró-adatokat.
  let { error } = await supabase
    .from('bealitas')
    .upsert([basePayload], { onConflict: 'id,congregation_id', ignoreDuplicates: true })

  if (error && shouldRetryLegacySettingsInsert(error.message)) {
    // Bármely meglévő év-sor jó mintának a NOT NULL mezők pótlásához (a basePayload
    // úgyis mindent felülír, ami számít) — a korábbi .lt('id', yearId) szűrő
    // visszamenőleges évnél elakadt, ha csak újabb év-sor létezett.
    const { data: previousSettings } = await supabase
      .from('bealitas')
      .select('*')
      .eq('congregation_id', congregationId)
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
        .upsert([legacyCompatiblePayload], { onConflict: 'id,congregation_id', ignoreDuplicates: true })
      error = retry.error
    }
  }

  // 2026-08-11 (P2 #29): ez a szöveg ÉKEZET NÉLKÜL, elgépeléssel
  // („letrehozasahez") és fejlesztői zsargonnal jutott el a lelkészhez — a
  // „legacy mező-kompatibilitást egészítsük ki" fordulat egyrészt
  // értelmezhetetlen, másrészt olyan cselekvést írt elő, amit ő nem tud
  // elvégezni. Most kimondja, mi történt, mit tehet ő, és mit kell a
  // rendszergazdának tennie.
  if (error && shouldRetryLegacySettingsInsert(error.message)) {
    return {
      error: 'Az évi pénzügyi alapbeállítást nem sikerült létrehozni: az adatbázis olyan mezőket is kötelezőnek jelöl, amelyeket a program még nem tölt ki. Ha egy korábbi évhez már van beállításod, előbb azt az évet nyisd meg a Pénzügy → Éves beállítások ablakban — a program abból pótolja a hiányzó mezőket. Ha nincs ilyen éved, szólj a rendszergazdának, hogy egészítse ki az adatbázis évi beállítás-tábláját.'
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
  // 2026-08-15 (Endre 4. szakasz — egységes véglegesítés-gomb): a zöld pecsét
  // dátum/szerző pecsét-mezői. OPCIONÁLISAK: a 2026-08-15-veglegesites-egyseges.sql
  // előtt az oszlop nem létezik — ilyenkor az írás a pecsét NÉLKÜL fut újra
  // (a zászló maga nem veszhet el egy hiányzó dísz-oszlop miatt).
  budget_finalized_at?: string | null
  budget_finalized_by?: string | null
}

/**
 * A pecsét-mezők (opcionális *_finalized_at / *_finalized_by) kulcsai — ezeket
 * a séma-fallback eldobhatja, a kötelező zászlókat SOHA.
 */
const FINALIZE_STAMP_KEYS = ['budget_finalized_at', 'budget_finalized_by'] as const

function stripFinalizeStampKeys(updates: YearlyFinanceFlagUpdates): YearlyFinanceFlagUpdates {
  const stripped = { ...updates }
  for (const key of FINALIZE_STAMP_KEYS) delete stripped[key]
  return stripped
}

/**
 * 2026-08-11 (6. kör, P0 néma no-op): az évi zár-/kérelem-zászlók írása.
 *
 * MI VOLT A HIBA: az UPDATE `.select()` nélkül futott, a PostgREST pedig 0
 * érintett sornál sem ad hibát. Ha az évre nem volt `bealitas` sor (vagy az RLS
 * elnyelte az írást), a `finalizeBudget` „siker"-t adott — a BudgetTab erre
 * ZÖLD ÚTNAK vette, és beküldte az egyházmegyének a költségvetést egy olyan
 * évre, amelyik közben NYITVA maradt. Ugyanez a `requestBudgetUnlock` /
 * `requestAccountingUnlock` esetében: a lelkész „Elküldve!" visszajelzést kapott,
 * az esperes viszont soha nem látta a kérelmet — javítási zsákutca fejlesztő
 * nélkül. Mostantól a 0 soros írás HANGOS, magyar hibaüzenet.
 *
 * @param muvelet a hibaüzenetbe kerülő, lelkésznek is érthető művelet-név.
 */
async function updateYearlyFinanceFlags(
  year: number,
  updates: YearlyFinanceFlagUpdates,
  muvelet = 'A művelet',
) {
  const { supabase, congregationId } = await getProfileCongregation()
  // 2026-08-11 (P2 #29): ékezetesítve — a fájl 20+ másik pontján már helyesen
  // „Nincs bejelentkezett felhasználó." szerepel, ez az egy sor lógott ki.
  if (!congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  let { data: updated, error } = await supabase
    .from('bealitas')
    .update(updates)
    .eq('id', String(year))
    .eq('congregation_id', congregationId)
    .select('id')

  // 2026-08-15: séma-fallback CSAK a pecsét-mezőkre (*_finalized_at/_by) —
  // migráció előtti adatbázison a zászló pecsét nélkül is beíródik. A kötelező
  // zászlók hiányzó oszlopa továbbra is hangos hiba.
  const strippable = FINALIZE_STAMP_KEYS.some((k) => k in updates)
  if (error && strippable && isMissingColumnError(error.message)) {
    const retry = await supabase
      .from('bealitas')
      .update(stripFinalizeStampKeys(updates))
      .eq('id', String(year))
      .eq('congregation_id', congregationId)
      .select('id')
    updated = retry.data
    error = retry.error
  }

  if (error) return { error: `Hiba: ${error.message}` }
  if (!updated || updated.length === 0) {
    return {
      error:
        `${muvelet} nem történt meg: a ${year}. évhez nincs mentett évi pénzügyi ` +
        'beállítás, vagy nincs írási jogosultságod hozzá. Nyisd meg a Pénzügy oldalon ' +
        'ezt az évet, majd próbáld újra. Ha újra ezt írja, jelezd a rendszergazdának.',
    }
  }
  revalidatePath('/penzugy')
  return { success: true }
}

export async function finalizeBudget(year: number) {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock

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

  // 2026-08-15 (Endre 4. szakasz): dátum/szerző pecsét a zöld jelvényhez —
  // migráció előtti adatbázison a fallback pecsét nélkül írja a zászlót.
  return updateYearlyFinanceFlags(
    year,
    {
      budget_finalized: true,
      budget_finalized_at: new Date().toISOString(),
      budget_finalized_by: scope.userId ?? null,
    },
    'A költségvetés véglegesítése',
  )
}

export async function requestBudgetUnlock(year: number, reason?: string | null) {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock

  if (scope.scope === 'diocese') {
    // 2026-08-15 (S6, Endre 4. döntése — egységes véglegesítés-gomb): a kérelem
    // megyei szinten is RÖGZÜL (a szamadas_unlock_* meglévő mintájára). Az
    // elbíráló a felettes szint (egyházkerület) — a fogadó oldala a 3. szint
    // külön körében épül; addig a kérelem a diocese_bealitas-ban áll.
    const { error } = await scope.supabase
      .from('diocese_bealitas')
      .upsert(
        {
          diocese_id: scope.scopeId,
          eve: year,
          koltsegvetes_unlock_requested: true,
          koltsegvetes_unlock_request_reason: reason?.trim() || null,
          koltsegvetes_unlock_request_at: new Date().toISOString(),
        },
        { onConflict: 'diocese_id,eve' },
      )
    if (error) {
      // Hiányzó oszlop = a migráció még nem futott le — mondjuk ki magyarul,
      // mit kell tenni, ne nyers PostgREST-hibát adjunk.
      if (isMissingColumnError(error.message)) {
        return {
          error:
            'A költségvetés feloldás-kérelméhez szükséges adatbázis-oszlopok még hiányoznak — ' +
            'futtasd le a 2026-08-15-egyhazmegyei-konyveles-s6.sql fájlt, majd próbáld újra.',
        }
      }
      return { error: `Hiba: ${error.message}` }
    }
    revalidatePath('/penzugy')
    return { success: true }
  }

  return updateYearlyFinanceFlags(
    year,
    {
      unlock_requested: true,
      unlock_reason: reason?.trim() || null,
    },
    'A költségvetés javítási kérelmének elküldése',
  )
}

export async function finalizeAccounting(
  year: number,
  meta?: {
    jegyzokonyviSzam?: string | null
    targyalasDatuma?: string | null
    alairok?: string[] | null
  },
  /**
   * A wizard/AccountingTab KANONIKUS (kód-kulcsú, a hivatalos ív végpont-
   * kódjaira szűrt, belső mozgás és stornó nélküli) pillanatképe.
   *
   * 2026-08-11 (6. kör, P0 — KÉT PILLANATKÉP): ha ez meg van adva (gyülekezeti
   * véglegesítés), akkor EZ — és KIZÁRÓLAG ez — a hivatalos záró-adat. Ugyanaz
   * az objektum kerül a `bealitas.szamadas_zaro_adatok` mezőbe, amit a hívó a
   * visszatérési érték `hivatalosPillanatkep` mezőjében visszakap és beküld az
   * egyházmegyének — nincs két, egymással „szinkronban tartott" számítás.
   */
  canonicalSnapshot?: Record<string, unknown>,
): Promise<{
  success?: boolean
  error?: string
  /**
   * A TÉNYLEGESEN eltárolt hivatalos pillanatkép (gyülekezeti ág). A hívónak
   * EZT kell beküldenie — így a tárolt és a beküldött irat ugyanaz az objektum.
   */
  hivatalosPillanatkep?: Record<string, unknown>
}> {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock
  const { supabase, T } = scope

  // Aggregáljuk a tényleges adatokat
  // Scope-aware: befizetes/kiadas vs diocese_befizetes/diocese_kiadas
  const categoryColBef = T.categoryColBefizetes
  const categoryColKia = T.categoryColKiadas

  // 2026-07-10 (S3 audit KRITIKUS #2): a véglegesített/beküldött snapshotból a
  // STORNÓZOTT és (congregation scope-ban) a BELSŐ MOZGÁS (xkey-s) tétel is
  // kimarad — eddig csak a deleted=false szűrt, így a hivatalos záró-adat
  // felfújható volt. FIGYELEM: a diocese_befizetes/diocese_kiadas táblában
  // NINCS belso_mozgas_xkey oszlop — az xkey-szűrő csak congregation-scope!
  // 2026-08-11 (K5-#9): a snapshot-lekérdezés (a) LAPOZATLAN volt — 1000+ tételes
  // évnél a hivatalos záró-adat némán alulmért lett —, és (b) az `error` mezőt
  // EGYIK ág sem olvasta: séma-drift / RLS / timeout esetén a `(data || [])` üres
  // tömbre esett, a snapshot `totalIncome: 0, totalExpense: 0` lett, és a lenti
  // kód EZZEL ZÁRTA LE az évet. Egyházmegyei scope-ban ez a snapshot MAGA a
  // beküldött hivatalos dokumentum (diocese_annual_reports.snapshot_data),
  // gyülekezetiben pedig a Lelkészi jelentés VII.6/VII.7 rubrikájának forrása.
  // Mostantól: lapozott olvasás determinisztikus `.order('id')`-vel, és HIBA
  // esetén hangos visszalépés — a zárás ELŐTT (getYearFinanceRecords mintája).
  let incomeQ = supabase.from(T.befizetes)
    .select(`id, ${categoryColBef}, osszeg, osszeg_ron`)
    .eq(T.scopeCol, scope.scopeId)
    .eq('deleted', false)
    .eq('stornozott', false)
    .gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`)
    .order('id', { ascending: true })
  if (scope.scope === 'congregation') incomeQ = incomeQ.is('belso_mozgas_xkey', null)
  let expenseQ = supabase.from(T.kiadas)
    .select(`id, ${categoryColKia}, osszeg, osszeg_ron`)
    .eq(T.scopeCol, scope.scopeId)
    .eq('deleted', false)
    .eq('stornozott', false)
    .gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`)
    .order('id', { ascending: true })
  if (scope.scope === 'congregation') expenseQ = expenseQ.is('belso_mozgas_xkey', null)
  const [incomeRes, expenseRes] = await Promise.all([
    fetchAllPaged<Record<string, unknown>>(incomeQ),
    fetchAllPaged<Record<string, unknown>>(expenseQ),
  ])
  const snapshotErr = incomeRes.error || expenseRes.error
  if (snapshotErr) {
    console.error('[finalizeAccounting] a záró-snapshot lekérdezése HIBÁRA FUTOTT — a véglegesítés MEGSZAKÍTVA:', snapshotErr.message)
    return {
      error:
        'A számadás záró-adatainak összesítése nem sikerült, ezért az évet NEM zártuk le. ' +
        'Próbáld újra néhány perc múlva; ha újra hibázik, jelezd a rendszergazdának ' +
        `(részlet: ${snapshotErr.message}).`,
    }
  }
  const incomeData = incomeRes.data
  const expenseData = expenseRes.data

  // 2026-08-11 (6. kör, P0): SZÁNDÉKOSAN átnevezve `snapshot` → `szerverOsszesito`.
  // Ez NEM a hivatalos záró-adat: nyers junction-FK-id-kkal kulcsolt, a hivatalos
  // ív végpont-kódjaira NEM szűrt szerveroldali összesítés. Gyülekezeti ágon
  // mostantól csak KERESZTELLENŐRZÉS (`szerverEllenorzes`), a hivatalos szám a
  // kanonikus pillanatkép. Egyházmegyei ágon (ahol nincs kanonikus pillanatkép)
  // továbbra is ez MAGA a hivatalos irat — ezért marad a hangos hiba fentebb.
  const szerverOsszesito: Record<string, unknown> = {
    income: {},
    expense: {},
    totalIncome: 0,
    totalExpense: 0,
    generatedAt: new Date().toISOString(),
    ...(meta?.jegyzokonyviSzam ? { jegyzokonyviSzam: meta.jegyzokonyviSzam } : {}),
    ...(meta?.targyalasDatuma ? { targyalasDatuma: meta.targyalasDatuma } : {}),
    ...(meta?.alairok ? { alairok: meta.alairok } : {}),
  }

  // 2026-08-11 (K5-#6): a hivatalos záró-snapshot is a RON-ekvivalenst
  // (`osszeg_ron`) összegzi, nem a nyers deviza-összeget. Ez ugyanaz a javítás,
  // ami a Számadás/Költségvetés nyomtatványokon megtörtént — enélkül a KINYOMTATOTT
  // és a BEKÜLDÖTT szám térne el egymástól devizás banki tételnél (pl. 1000 EUR:
  // papíron 4 970 lej, a snapshotban 1 000 lej). RON-számlán a kettő azonos.
  let totalInc = 0
  let totalExp = 0
  for (const r of (incomeData || []) as Array<Record<string, unknown>>) {
    const key = String(r[categoryColBef] || 0)
    const amt = Number((r.osszeg_ron ?? r.osszeg) as number | string | null) || 0
    ;(szerverOsszesito.income as Record<string, number>)[key] = ((szerverOsszesito.income as Record<string, number>)[key] || 0) + amt
    totalInc += amt
  }
  for (const r of (expenseData || []) as Array<Record<string, unknown>>) {
    const key = String(r[categoryColKia] || 0)
    const amt = Number((r.osszeg_ron ?? r.osszeg) as number | string | null) || 0
    ;(szerverOsszesito.expense as Record<string, number>)[key] = ((szerverOsszesito.expense as Record<string, number>)[key] || 0) + amt
    totalExp += amt
  }
  szerverOsszesito.totalIncome = totalInc
  szerverOsszesito.totalExpense = totalExp

  // ── A hivatalos záró-pillanatkép — MINDKÉT hatókörben EGY forrásból ───────
  //
  // 2026-08-11 (6. kör, P0 — „a véglegesítéskor két különböző pillanatkép készül,
  // és nem egyeznek"). TULAJDONOSI DÖNTÉS: „javítsd".
  //
  // MI VOLT A HIBA: a véglegesítés KÉT, egymástól független záró-adatot gyártott
  // ugyanarra az évre.
  //   (a) a fenti `szerverOsszesito`: nyers junction-FK-id kulcsokkal, a hivatalos
  //       ív végpont-kódjaira NEM szűrve — tehát az íven kívülre könyvelt pénzt és
  //       a nem-levél/kategória nélküli tételeket IS beleszámolva. Ez ment a
  //       `bealitas.szamadas_zaro_adatok` mezőbe (`totalIncome`/`totalExpense`),
  //   (b) a wizard kanonikus pillanatképe: kód-kulcsú, a hivatalos ív végpont-
  //       kódjaira szűrve. Ez ment BE az egyházmegyének.
  // A kettő minden olyan gyülekezetnél SZÉTHÚZOTT, ahol volt íven kívüli tétel —
  // és mivel a Lelkészi jelentés VII.6/VII.7 rubrikája az (a)-ból olvas, a lelkész
  // ALÁÍRT jelentése MÁS bevétel-/kiadás-végösszeget mutatott, mint az ugyanarra az
  // évre BEKÜLDÖTT Számadás. Két hivatalos nyomtatvány, két különböző szám.
  //
  // MI A JAVÍTÁS: nem „szinkronban tartjuk" a kettőt (az egy éven belül újra
  // széthúzna), hanem EGY forrás marad. Ha van kanonikus pillanatkép, AZ a
  // hivatalos záró-adat; a hívó pontosan ezt az objektumot kapja vissza és küldi
  // be — a tárolt és a beküldött irat így nem eltérhet, hanem UGYANAZ.
  // A szerveroldali összesítés nem vész el: KERESZTELLENŐRZÉSKÉNT kerül a
  // pillanatképbe (`szerverEllenorzes`), így utólag is látszik, mennyi pénz esett
  // a hivatalos íven kívülre a zárás pillanatában.
  //
  // 2026-08-15 (S6, terv 3.4): eddig ez az összeállítás CSAK a gyülekezeti ágon
  // futott — a megyei zárszámadás snapshotja a NYERS `szerverOsszesito` maradt
  // (a régi kód saját kommentje szerint sem kanonikus). Mostantól a wizard a
  // megyei ágon IS átadja a kanonikus (kód-kulcsú, ív-szűrt) pillanatképet, és
  // a `diocese_annual_reports.snapshot_data` ugyanazt az alakot kapja, mint a
  // gyülekezeti záró-adat (alakVerzio 2 + szerverEllenorzes). Régi hívónál
  // (snapshot nélkül) a szerveroldali összesítés marad — fokozatos átállás.
  let storedSnapshot: Record<string, unknown> = szerverOsszesito
  if (canonicalSnapshot) {
    // `withCanonicalAccountingKeys` idempotens: ha a hívó már normalizált
    // objektumot ad (finalizeAndSubmitAccounting), ez érintetlenül hagyja.
    const hivatalos = withCanonicalAccountingKeys(canonicalSnapshot)
    const kerekit = (n: number) => Math.round(n * 100) / 100
    const szam = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
    storedSnapshot = {
      ...hivatalos,
      generatedAt: szerverOsszesito.generatedAt,
      // A pillanatkép alakjának verziója. 2 = a felső szint MAGA a hivatalos
      // (kanonikus) adat. A régi, 1-es alakban a felső szint a nyers
      // szerver-összesítés volt, a hivatalos pedig a `kanonikus` alobjektum —
      // az olvasóknak MINDKETTŐT ismerniük kell (lásd lelkeszi-jelentes-actions.ts).
      alakVerzio: 2,
      szerverEllenorzes: {
        nyersBevetel: kerekit(totalInc),
        nyersKiadas: kerekit(totalExp),
        // Pozitív érték = ennyi pénz esett a hivatalos íven KÍVÜLRE (ugyanaz,
        // amire az AccountingTab „nem fér rá az ívre" figyelmeztetése hívja fel
        // a lelkész figyelmét MÉG a véglegesítés előtt).
        ivenKivuliBevetel: kerekit(totalInc - szam(hivatalos.totalIncome)),
        ivenKivuliKiadas: kerekit(totalExp - szam(hivatalos.totalExpense)),
        kulcs: 'nyers junction-FK-id, ív-szűrés nélkül — NEM hivatalos összeg',
      },
    }
  }

  // ── Egyházmegyei ág ───────────────────────────────────────────────────────
  if (scope.scope === 'diocese') {
    // 1. diocese_bealitas upsert — zár + pecsét (dátum/aláíró) + a jóváhagyó
    //    gyűlés határozat-adatai a megyei nyomtatvány-borítóhoz (S6 SQL hozza az
    //    oszlopokat; migráció előtti adatbázison séma-fallbackkel, a határozat-
    //    mezők NÉLKÜL fut újra az írás — a zárás nem bukhat el rajtuk).
    const dioZarasAlap = {
      diocese_id: scope.scopeId,
      eve: year,
      szamadas_veglegesitve: true,
      szamadas_veglegesites_datuma: new Date().toISOString().slice(0, 10),
      szamadas_veglegesitette: scope.userId,
    }
    let bealitasErr = (
      await supabase.from('diocese_bealitas').upsert(
        {
          ...dioZarasAlap,
          ...(meta?.jegyzokonyviSzam ? { szamadas_hatarozat_szam: meta.jegyzokonyviSzam } : {}),
          ...(meta?.targyalasDatuma ? { szamadas_hatarozat_datum: meta.targyalasDatuma } : {}),
        },
        { onConflict: 'diocese_id,eve' },
      )
    ).error
    if (bealitasErr && isMissingColumnError(bealitasErr.message)) {
      bealitasErr = (
        await supabase
          .from('diocese_bealitas')
          .upsert(dioZarasAlap, { onConflict: 'diocese_id,eve' })
      ).error
    }
    if (bealitasErr) return { error: `Hiba (diocese_bealitas): ${bealitasErr.message}` }

    // 2. diocese_annual_reports upsert — a megye SAJÁT zárszámadás-tára (terv
    //    3.4: mostantól van fogyasztója — a megyei Pénzügy „Számadás" fülének
    //    „Véglegesített évek" kártyája innen olvas). A snapshot a fenti KÖZÖS
    //    kanonikus pillanatkép; a „felküldés" célja az egyházkerület — a
    //    tényleges kerületi fogadó oldal a 3. szint külön körében épül, itt a
    //    véglegesítés + pecsét rögzül.
    const nowIso = new Date().toISOString()
    const { error: arErr } = await supabase
      .from('diocese_annual_reports')
      .upsert(
        {
          diocese_id: scope.scopeId,
          year,
          status: 'finalized',
          snapshot_data: storedSnapshot,
          submitted_at: nowIso,
          submitted_by: scope.userId,
          finalized_at: nowIso,
          finalized_by: scope.userId,
        },
        { onConflict: 'diocese_id,year' },
      )
    if (arErr) {
      return {
        error:
          'A(z) ' + year + '. évi megyei számadás lezárása megtörtént, de a zárszámadás ' +
          'pillanatképét nem sikerült elmenteni, ezért a felküldés is elmaradt. Jelezd a ' +
          `rendszergazdának (részlet: ${arErr.message}).`,
      }
    }

    // 3. FELTERJESZTÉS az egyházkerületnek (terv 3.6 + Endre 3. döntése): a
    //    véglegesítés és a felküldés EGY mozdulat — ugyanaz a gomb, ugyanott,
    //    mint a gyülekezeteknél. A kerületi FOGADÓ oldal a 3. szint külön
    //    körében épül; a felküldés ténye, ideje és tartalma MÁR MOST rögzül.
    //    Ha ez nem sikerül, a zárás akkor is érvényes — ezért NEM „sikeres"
    //    választ adunk, hanem elmondjuk, hol lehet a felküldést pótolni.
    const felt = await rogzitDioceseFelterjesztes(supabase, {
      dioceseId: scope.scopeId,
      userId: scope.userId,
      docType: 'megyei_szamadas',
      year,
      snapshot: storedSnapshot,
    })

    revalidatePath('/penzugy')
    revalidatePath('/dashboard-egyhazmegye')
    if (felt.error) {
      return {
        error:
          `A(z) ${year}. évi megyei számadás VÉGLEGESÍTVE lett, de a felküldés nem rögzült: ` +
          felt.error,
      }
    }
    // Itt is a TÉNYLEGESEN eltárolt objektumot adjuk vissza, hogy a szerződés
    // egységes legyen: „amit ez a függvény visszaad, azt írta ki".
    return { success: true, hivatalosPillanatkep: storedSnapshot }
  }

  // ── Gyülekezeti ág ────────────────────────────────────────────────────────
  // 2026-08-11 (6. kör, P0 néma no-op): a zárás UPDATE-je eddig `.select()` NÉLKÜL
  // futott. A PostgREST 0 érintett sornál NEM ad hibát — ha az évre nincs `bealitas`
  // sor (desktopról indított zárás, vagy a lelkész még sosem nyitotta meg az évet a
  // Pénzügy oldalon), vagy ha az RLS elnyeli az írást, ez a hívás `success: true`-val
  // tért vissza. A `finalizeAndSubmitAccounting` ilyenkor VIDÁMAN TOVÁBBMENT a
  // beküldésre: az egyházmegye megkapta a számadást, a gyülekezeti év viszont NYITVA
  // maradt (és a `szamadas_zaro_adatok` sem íródott ki) — pontosan az a
  // „beküldött-de-nyitott, némán elévülő snapshot" állapot, amit a zár-előszőr
  // sorrend meg akart szüntetni. Mostantól a 0 soros zárás HANGOS hiba.
  // 2026-08-15 (Endre 4. szakasz): + dátum/szerző pecsét (accounting_finalized_at/_by)
  // a zöld jelvényhez. Séma-fallback: migráció előtti adatbázison a pecsét-mezők
  // NÉLKÜL fut újra az írás — a zárás nem bukhat el egy hiányzó dísz-oszlopon.
  const zarasPayload = {
    accounting_finalized: true,
    szamadas_zaro_adatok: storedSnapshot,
    ...(meta?.jegyzokonyviSzam ? { szamadas_hatarozat_szam: meta.jegyzokonyviSzam } : {}),
    ...(meta?.targyalasDatuma ? { szamadas_hatarozat_datum: meta.targyalasDatuma } : {}),
  }
  let { data: finalizedRows, error } = await supabase
    .from('bealitas')
    .update({
      ...zarasPayload,
      accounting_finalized_at: new Date().toISOString(),
      accounting_finalized_by: scope.userId ?? null,
    })
    .eq('id', String(year))
    .eq('congregation_id', scope.scopeId)
    .select('id')
  if (error && isMissingColumnError(error.message)) {
    const retry = await supabase
      .from('bealitas')
      .update(zarasPayload)
      .eq('id', String(year))
      .eq('congregation_id', scope.scopeId)
      .select('id')
    finalizedRows = retry.data
    error = retry.error
  }

  if (error) return { error: `Hiba: ${error.message}` }
  if (!finalizedRows || finalizedRows.length === 0) {
    return {
      error:
        `A ${year}. évi számadás lezárása nem történt meg: nincs mentett évi pénzügyi ` +
        'beállítás erre az évre, vagy nincs írási jogosultságod hozzá. Nyisd meg a Pénzügy ' +
        'oldalon ezt az évet (ilyenkor a program létrehozza az évi beállítást), majd próbáld ' +
        'újra a véglegesítést. Ha újra ezt írja, jelezd a rendszergazdának.',
    }
  }
  revalidatePath('/penzugy')
  // 2026-08-11 (6. kör, P0): a hívó a TÉNYLEGESEN eltárolt objektumot kapja vissza,
  // és pontosan azt küldi be — így a `bealitas.szamadas_zaro_adatok` és a beküldött
  // `document_submissions.snapshot_data` nem „egyezik", hanem UGYANAZ.
  return { success: true, hivatalosPillanatkep: storedSnapshot }
}

/**
 * 2026-08-11 (6. kör, P0 — „a beküldött papír 0 lejt mutatott").
 *
 * MI VOLT A HIBA: a véglegesítő wizard `actualIncome` / `actualExpense` /
 * `totalActualIncome` / `totalActualExpense` kulcsokkal építi a pillanatképet, az
 * egyházmegyei dokumentumközpont (components/dashboard/document-center.tsx)
 * viszont `income` / `expense` / `totalIncome` / `totalExpense` kulcsokat olvas —
 * ezek a `finalizeAccounting` BELSŐ (lokálisan tárolt, INT-kulcsú) snapshotjának a
 * mezőnevei, nem a beküldöttéi. Következmény: MINDEN beküldött Számadásnál az
 * esperes „Összes bevétel: 0 RON / Összes kiadás: 0 RON / Nincs tétel." képet
 * látott, és a dokumentumközpontból nyomtatott hivatalos ív is 0 lejjel készült,
 * miközben a gyülekezetnél aláírt papíron a valós összegek álltak.
 *
 * A javítás KÉT irányban zár: a viewer mostantól mindkét alakot elfogadja (a
 * MÁR beküldött iratok kedvéért), ez a normalizáló pedig a beküldés PILLANATÁBAN
 * odateszi a kanonikus kulcsokat is — így az új beküldések bármely olvasónak
 * (mostani és jövőbeli) helyesek. Az eredeti kulcsokat MEGTARTJUK: a pillanatkép
 * hivatalos irat, nem alakítjuk át, csak kiegészítjük.
 *
 * 2026-08-11 (6. kör, „két pillanatkép"): ezt a normalizálót MOSTANTÓL EGYETLEN
 * helyen hívjuk — a `finalizeAccounting`-ban, a tárolás előtt. A beküldés a tárolt
 * objektumot veszi át, tehát nem normalizál másodszor. A függvény idempotens
 * (csak a hiányzó kulcsokat tölti ki), így az ismételt hívás sem árt.
 */
function withCanonicalAccountingKeys(
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  const asMap = (v: unknown): Record<string, number> | null => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null
    const out: Record<string, number> = {}
    for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
      const n = Number(raw)
      if (Number.isFinite(n)) out[k] = n
    }
    return out
  }
  const asNum = (v: unknown): number | null => {
    if (v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const out = { ...snapshot }
  if (out.income == null) {
    const m = asMap(snapshot.actualIncome)
    if (m) out.income = m
  }
  if (out.expense == null) {
    const m = asMap(snapshot.actualExpense)
    if (m) out.expense = m
  }
  if (out.totalIncome == null) {
    const n = asNum(snapshot.totalActualIncome)
    if (n != null) out.totalIncome = n
  }
  if (out.totalExpense == null) {
    const n = asNum(snapshot.totalActualExpense)
    if (n != null) out.totalExpense = n
  }
  return out
}

/**
 * 2026-07-10 (#4/4 + #4/2): VÉGLEGESÍTÉS + BEKÜLDÉS egy szerver-akcióban,
 * ZÁR-ELŐSZÖR sorrenddel (gyülekezeti scope). Korábban a wizard előbb küldött be,
 * aztán zárt — ha a zárás elbukott, beküldött-de-nyitott (elévülő snapshotú)
 * állapot maradt. Most: (1) finalize (lock + kanonikus snapshot tárolás),
 * (2) submitDocument; ha a beküldés bukik, a zárat SZERVEROLDALON visszavonjuk
 * (nem kitett unlock-akció), és a felhasználó tisztán újrapróbálhat.
 */
export async function finalizeAndSubmitAccounting(
  year: number,
  meta: {
    jegyzokonyviSzam?: string | null
    targyalasDatuma?: string | null
    alairok?: string[] | null
  },
  snapshot: Record<string, unknown>,
): Promise<{ success?: boolean; error?: string }> {
  // 2026-07-10 (S3-#10): a finalize ELŐTT kiolvassuk a bealitas.szamadas_zaro_adatok
  // RÉGI értékét — a finalizeAccounting felülírja, és a korábbi rollback csak a
  // flaget vonta vissza, a felülírt záró-adatok ottmaradtak (adat-korrupció egy
  // sikertelen beküldés után is). A scope-ot itt EGYSZER kérjük le (a hibaágban
  // korábban másodszor is lekértük).
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock
  let previousZaroAdatok: { value: unknown } | null = null
  if (scope.scope === 'congregation') {
    const { data: prevRow, error: prevErr } = await scope.supabase
      .from('bealitas')
      .select('szamadas_zaro_adatok')
      .eq('id', String(year))
      .eq('congregation_id', scope.scopeId)
      .maybeSingle()
    if (!prevErr && prevRow) {
      previousZaroAdatok = { value: (prevRow as Record<string, unknown>).szamadas_zaro_adatok ?? null }
    }
  }

  // 1) Zár + a hivatalos pillanatkép eltárolása
  const fin = await finalizeAccounting(year, meta, snapshot)
  if (fin.error) return { error: `Véglegesítés sikertelen: ${fin.error}` }

  // 2) Beküldés az egyházmegyének — PONTOSAN azzal az objektummal, amit az
  //    előbbi lépés a `bealitas.szamadas_zaro_adatok` mezőbe ÍRT.
  //
  // 2026-08-11 (6. kör, P0 — „két különböző pillanatkép"): itt korábban egy MÁSIK
  // hívás állt (`withCanonicalAccountingKeys(snapshot)`), vagyis ugyanabból a
  // nyersanyagból KÉTSZER, két helyen készült el a hivatalos adat. Amíg két
  // számítás van, előbb-utóbb széthúznak — ezért most a tárolt objektumot vesszük
  // át. Ha az bármiért hiányzik, NEM számoljuk újra (az hozná vissza a hibát),
  // hanem hangosan megbukunk, és a lenti ág visszavonja a zárat.
  const hivatalosPillanatkep = fin.hivatalosPillanatkep
  const sub = hivatalosPillanatkep
    ? await submitDocument('szamadas', year, hivatalosPillanatkep)
    : {
        error:
          'a program nem kapta vissza az imént eltárolt záró-pillanatképet, ' +
          'ezért a beküldést biztonsági okból nem indítottuk el',
      }
  if (sub.error) {
    // Rollback: a zár visszavonása, hogy ne maradjon zárt-de-nem-beküldött állapot.
    // 2026-07-10 (S3-#10): a régi szamadas_zaro_adatok-ot IS visszaállítjuk (ha a
    // finalize előtti kiolvasás sikerült — különben csak a flaget, mint eddig).
    // 2026-08-11 (6. kör): a rollback SIKERÉT is ellenőrizzük. Ha a visszavonás
    // maga bukik el (RLS/hálózat), a lelkész zárt évvel, beküldés nélkül marad —
    // és ha erről nem tud, hiába próbálkozik újra: a gomb el is tűnt a felületről.
    // Ilyenkor kimondjuk, mi a helyzet, és megmondjuk a következő lépést.
    if (scope.scope === 'congregation') {
      const { data: rolledBack, error: rollbackErr } = await scope.supabase
        .from('bealitas')
        .update({
          accounting_finalized: false,
          ...(previousZaroAdatok ? { szamadas_zaro_adatok: previousZaroAdatok.value } : {}),
        })
        .eq('id', String(year))
        .eq('congregation_id', scope.scopeId)
        .select('id')
      revalidatePath('/penzugy')
      if (rollbackErr || !rolledBack || rolledBack.length === 0) {
        console.error(
          '[finalizeAndSubmitAccounting] a beküldés elbukott, ÉS a zár visszavonása sem sikerült — ' +
            'a gyülekezet zárt évvel, beküldés nélkül maradt.',
          rollbackErr?.message,
        )
        return {
          error:
            `A beküldés nem sikerült (${sub.error}), és a véglegesítést sem sikerült ` +
            'visszavonni, ezért a(z) ' + year + '. év LEZÁRVA maradt, de az egyházmegye ' +
            'nem kapta meg a számadást. Kérj javítási engedélyt az egyházmegyétől, majd a ' +
            'feloldás után véglegesíts és küldd be újra. Ha sürgős, jelezd a rendszergazdának.',
        }
      }
    }
    return {
      error: `Beküldés sikertelen: ${sub.error} — a véglegesítés visszavonva, próbáld újra.`,
    }
  }

  return { success: true }
}

export async function requestAccountingUnlock(year: number, reason?: string | null) {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock

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

  return updateYearlyFinanceFlags(
    year,
    {
      accounting_unlock_requested: true,
      accounting_unlock_reason: reason?.trim() || null,
    },
    'A számadás javítási kérelmének elküldése',
  )
}

/**
 * 2026-08-15 (S6, terv 3.4): a megye SAJÁT zárszámadás-tárának olvasója.
 *
 * MIÉRT: a `diocese_annual_reports` táblát a `finalizeAccounting` megyei ága
 * évek óta ÍRTA, de SENKI nem olvasta (0 fogyasztó — a terv „zsákutcaként"
 * rögzítette). Ez az action a megyei Pénzügy „Számadás" fülének
 * „Véglegesített évek" kártyáját táplálja: a véglegesített évek listája a
 * pecsét dátumával és a hivatalos végösszegekkel.
 *
 * FAIL-CLOSED: csak diocese-hatókörben ad adatot; hibánál `{ error }`, soha
 * szűretlen lista. A számvevő (readOnly) is olvashatja — ez olvasó action.
 */
export async function getDioceseFinalizedAccountings(): Promise<{
  years?: Array<{
    year: number
    finalizedAt: string | null
    totalIncome: number | null
    totalExpense: number | null
  }>
  error?: string
}> {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (scope.scope !== 'diocese') {
    return { error: 'Ez a nézet csak egyházmegyei hatókörben érhető el.' }
  }

  const { data, error } = await scope.supabase
    .from('diocese_annual_reports')
    .select('year, status, finalized_at, snapshot_data')
    .eq('diocese_id', scope.scopeId)
    .eq('deleted', false)
    .eq('status', 'finalized')
    .order('year', { ascending: false })
  if (error) return { error: `A véglegesített évek betöltése sikertelen: ${error.message}` }

  const szam = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return {
    years: ((data || []) as Array<{
      year: number
      finalized_at: string | null
      snapshot_data: Record<string, unknown> | null
    }>).map((r) => ({
      year: r.year,
      finalizedAt: r.finalized_at,
      // A snapshot mindkét alakja (alakVerzio 1: nyers szerver-összesítő;
      // alakVerzio 2: kanonikus) `totalIncome`/`totalExpense` kulcsot hordoz.
      totalIncome: szam(r.snapshot_data?.totalIncome),
      totalExpense: szam(r.snapshot_data?.totalExpense),
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// FELTERJESZTÉS az egyházkerületnek (terv 3.6 + Endre 3. döntése)
// ─────────────────────────────────────────────────────────────────────────
//
// A megye SAJÁT iratainál a véglegesítés és a felküldés EGY mozdulat — ugyanaz
// a gomb, ugyanott, mint a gyülekezeteknél. A kerületi FOGADÓ oldal a 3. szint
// külön körében épül; addig a felküldés ténye, ideje és fagyasztott tartalma a
// `diocese_felterjesztes` táblában rögzül.

/**
 * A megye SAJÁT költségvetésének (vagy 1–3. módosításának) felküldése.
 *
 * A közös BudgetTab „Véglegesítés és beküldés" gombja hívja — megyei
 * hatókörben a gyülekezeti `submitDocument` HELYETT (az a beküldő a
 * gyülekezet→megye úthoz való, és megyei profilban „Nincs aktív gyülekezet."
 * hibával állt meg).
 *
 * FAIL-CLOSED: csak megyei hatókörben, csak írási joggal, és csak akkor, ha az
 * adott szint TÉNYLEG véglegesítve van — felküldött, de le nem zárt irat nem
 * keletkezhet.
 */
export async function felterjesztMegyeiKoltsegvetes(
  year: number,
  modNumber: 1 | 2 | 3 | null,
  /**
   * A képernyőn látott, ÉPP LEZÁRT terv pillanatképe (a BudgetTab adja). Ha
   * hiányzik (PÓTLÁS a „Felküldés az egyházkerületnek" kártyáról), a szerver a
   * MENTETT `diocese_koltsegvetes` sorokból állítja össze — így a pótolt
   * felküldés is a tárolt valóságot viszi, nem üres csomagot.
   */
  snapshot?: Record<string, unknown> | null,
): Promise<{ success?: boolean; error?: string }> {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (scope.scope !== 'diocese') {
    return { error: 'A felküldés az egyházkerületnek csak egyházmegyei nézetben értelmezhető.' }
  }
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock

  // Zár-ellenőrzés: a felküldés csak LEZÁRT iratra igaz állítás.
  const flagOszlop = modNumber
    ? `koltsegvetes_mod${modNumber}_veglegesitve`
    : 'koltsegvetes_veglegesitve'
  const { data: bealitasSor, error: bealitasErr } = await scope.supabase
    .from('diocese_bealitas')
    .select('*')
    .eq('diocese_id', scope.scopeId)
    .eq('eve', year)
    .maybeSingle()
  if (bealitasErr) {
    return {
      error:
        'A véglegesítés állapotát most nem sikerült ellenőrizni, ezért a felküldést nem ' +
        'rögzítettük. Próbáld újra néhány perc múlva.',
    }
  }
  if (!(bealitasSor as Record<string, unknown> | null)?.[flagOszlop]) {
    return {
      error:
        `A(z) ${year}. évi ${modNumber ? `${modNumber}. költségvetés-módosítás` : 'költségvetés'} ` +
        'még nincs véglegesítve, ezért nem küldhető fel az egyházkerületnek. Előbb véglegesítsd.',
    }
  }

  // PÓTLÁS: a mentett terv-sorokból építjük a csomagot. A végösszegeket
  // SZÁNDÉKOSAN nem számoljuk itt újra (az a hivatalos ív szabálya szerint a
  // nyomtatóban dől el — két külön számítás széthúzna); a csomag a SOROKAT
  // viszi, és megjelöli magát pótlásként.
  let felkuldottCsomag: Record<string, unknown> | null = snapshot ?? null
  if (!felkuldottCsomag) {
    const { data: tervSorok, error: tervErr } = await scope.supabase
      .from('diocese_koltsegvetes')
      .select('szamadasicelid, tervezett, osszeg_mod_1, osszeg_mod_2, osszeg_mod_3')
      .eq('diocese_id', scope.scopeId)
      .eq('eve', year)
    if (tervErr) {
      return {
        error:
          'A költségvetés sorai most nem olvashatók, ezért a felküldést nem rögzítettük. ' +
          'Próbáld újra néhány perc múlva.',
      }
    }
    felkuldottCsomag = {
      budgetSorok: tervSorok || [],
      year,
      modNumber,
      potlas: true,
      megjegyzes:
        'Pótlólag rögzített felküldés: a csomag a mentett költségvetési sorokat tartalmazza.',
    }
  }

  const res = await rogzitDioceseFelterjesztes(scope.supabase, {
    dioceseId: scope.scopeId,
    userId: scope.userId,
    docType: modNumber ? 'megyei_koltsegvetes_modositas' : 'megyei_koltsegvetes',
    year,
    modificationNumber: modNumber,
    snapshot: felkuldottCsomag,
  })
  if (res.error) return { error: res.error }
  revalidatePath('/penzugy')
  return { success: true }
}

/**
 * A megye SAJÁT számadásának felküldése — PÓTLÁS/ÚJRAPRÓBÁLÁS.
 *
 * Rendes úton a `finalizeAccounting` megyei ága rögzíti a felküldést a
 * véglegesítéssel EGYÜTT. Ha az a lépés elbukott (hálózat, hiányzó migráció,
 * be nem állított egyházkerület), a lelkész itt pótolhatja — a felküldött
 * tartalom a MÁR ELTÁROLT zárszámadás-pillanatkép, nem újraszámolt adat.
 */
export async function felterjesztMegyeiSzamadas(
  year: number,
): Promise<{ success?: boolean; error?: string }> {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (scope.scope !== 'diocese') {
    return { error: 'A felküldés az egyházkerületnek csak egyházmegyei nézetben értelmezhető.' }
  }
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock

  const { data, error } = await scope.supabase
    .from('diocese_annual_reports')
    .select('snapshot_data, status')
    .eq('diocese_id', scope.scopeId)
    .eq('year', year)
    .eq('deleted', false)
    .maybeSingle()
  if (error) {
    return {
      error:
        'A véglegesített számadás most nem olvasható, ezért a felküldést nem rögzítettük. ' +
        'Próbáld újra néhány perc múlva.',
    }
  }
  const sor = data as { snapshot_data?: Record<string, unknown>; status?: string } | null
  if (!sor || sor.status !== 'finalized') {
    return {
      error:
        `A(z) ${year}. évi egyházmegyei számadás még nincs véglegesítve, ezért nem küldhető fel ` +
        'az egyházkerületnek. Előbb véglegesítsd a Számadás fülön.',
    }
  }

  const res = await rogzitDioceseFelterjesztes(scope.supabase, {
    dioceseId: scope.scopeId,
    userId: scope.userId,
    docType: 'megyei_szamadas',
    year,
    snapshot: sor.snapshot_data ?? {},
  })
  if (res.error) return { error: res.error }
  revalidatePath('/penzugy')
  revalidatePath('/dashboard-egyhazmegye')
  return { success: true }
}

/**
 * A megye adott évi felküldéseinek állapota — a Pénzügy „Felküldés az
 * egyházkerületnek" kártyájához. Olvasó action: a számvevő is hívhatja.
 */
export async function getDioceseFelterjesztesAllapot(year: number): Promise<{
  rows?: DioceseFelterjesztesSor[]
  error?: string
}> {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (scope.scope !== 'diocese') {
    return { error: 'Ez a nézet csak egyházmegyei hatókörben érhető el.' }
  }
  return await olvasDioceseFelterjesztesek(scope.supabase, scope.scopeId, year)
}

// ── Költségvetés módosítás véglegesítés ──────────────────────

export async function finalizeBudgetModification(year: number, modNumber: 1 | 2 | 3) {
  // 2026-08-15 (S6, terv 2.1/2): scope-aware — eddig getProfileCongregation-nel
  // CSAK gyülekezeti ág volt, megyei profilból a művelet némán a (nem létező)
  // gyülekezeti sorra futott. Most: diocese-ágon a diocese_bealitas
  // koltsegvetes_modN_veglegesitve flagje + pecsét; és a számvevői írás-kapu
  // (financeWriteBlock) mindkét ágon érvényes.
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock

  if (scope.scope === 'diocese') {
    const { error } = await scope.supabase
      .from('diocese_bealitas')
      .upsert(
        {
          diocese_id: scope.scopeId,
          eve: year,
          [`koltsegvetes_mod${modNumber}_veglegesitve`]: true,
          [`koltsegvetes_mod${modNumber}_veglegesites_datuma`]: new Date()
            .toISOString()
            .slice(0, 10),
          [`koltsegvetes_mod${modNumber}_veglegesitette`]: scope.userId,
        },
        { onConflict: 'diocese_id,eve' },
      )
    if (error) {
      // Hiányzó oszlop = a migráció még nem futott le. SZÁNDÉKOSAN nincs
      // „flagek nélküli" fallback: a véglegesítés lényege maga a flag — enélkül
      // hamis „siker" lenne (a 0-soros UPDATE hibaosztály testvére).
      if (isMissingColumnError(error.message)) {
        return {
          error:
            'A költségvetés-módosítás véglegesítéséhez szükséges adatbázis-oszlopok még ' +
            'hiányoznak — futtasd le a 2026-08-15-egyhazmegyei-uj-tablak.sql fájlt, majd próbáld újra.',
        }
      }
      return { error: `Hiba: ${error.message}` }
    }
    revalidatePath('/penzugy')
    return { success: true }
  }

  const flagKey = `budget_mod${modNumber}_finalized` as const
  const dateKey = `budget_mod${modNumber}_date` as const

  // 2026-08-11 (6. kör, P0 néma no-op): `.select('id')` + 0 soros detektálás — a
  // néma „siker" után a BudgetTab beküldte volna az egyházmegyének a módosítást
  // egy le nem zárt körre. Lásd az `updateYearlyFinanceFlags` docblockját.
  const { data: updated, error } = await scope.supabase
    .from('bealitas')
    .update({
      [flagKey]: true,
      [dateKey]: new Date().toISOString().split('T')[0],
    })
    .eq('id', String(year))
    .eq('congregation_id', scope.scopeId)
    .select('id')

  if (error) return { error: `Hiba: ${error.message}` }
  if (!updated || updated.length === 0) {
    return {
      error:
        `A ${modNumber}. költségvetés-módosítás véglegesítése nem történt meg: a ${year}. ` +
        'évhez nincs mentett évi pénzügyi beállítás, vagy nincs írási jogosultságod hozzá. ' +
        'Nyisd meg a Pénzügy oldalon ezt az évet, majd próbáld újra.',
    }
  }

  revalidatePath('/penzugy')
  return { success: true }
}

// ── 2026-07-10 (S3-#4): költségvetés-mentés SZERVER-oldali zárral ────────────
// A webes budget-tab eddig KLIENS-oldali supabase-szel írta a koltsegvetes
// táblát (saveBudgetRowsCompat/saveBudgetModification + createClient), így a
// budget_finalized / budget_modN_finalized zár csak UI-dísz volt — konzolból
// megkerülhető. Mostantól a mentés szerver-akció: getFinanceScope + a bealitas
// zár-flagek ellenőrzése UTÁN hívja a compat save-eket (a compat réteg a
// supabase klienst paraméterként kapja, ezért szerver-klienssel is megy).
// A loadBudgetRows olvasás kliens-oldali maradhat (read-only).

export async function saveBudgetRowsAction(
  year: number,
  rows: BudgetCompatRow[],
): Promise<{ success?: boolean; error?: string }> {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock
  const { supabase, T } = scope

  // Zár-ellenőrzés: véglegesített költségvetés nem írható felül (scope-aware flag).
  const { data: lockRow } = await supabase
    .from(T.bealitas)
    .select(T.budgetFinalizedCol)
    .eq(T.scopeCol, scope.scopeId)
    .eq(T.yearColBealitas, yearValueFor(scope.scope, year))
    .maybeSingle()
  if (lockRow && Boolean((lockRow as Record<string, unknown>)[T.budgetFinalizedCol])) {
    // A feloldást a FELETTES szint bírálja el: a gyülekezetét az egyházmegye,
    // az egyházmegyéét az egyházkerület (2026-08-15, egyházmegyei szelet) — a
    // megnevezés a KÖZÖS helperből jön, hogy a zár-üzenetek ne húzzanak szét.
    return {
      error:
        `A ${year}. évi költségvetés már véglegesítve van — a mentés nem engedélyezett. ` +
        `Először kérj feloldást ${felettesSzintTol(scope)}.`,
    }
  }

  try {
    await saveBudgetRowsCompat(supabase, year, scope.scopeId, rows, scope.scope)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Mentési hiba' }
  }
  revalidatePath('/penzugy')
  return { success: true }
}

export async function saveBudgetModificationAction(
  year: number,
  modNum: 1 | 2 | 3,
  rows: Array<{ szamadasicelid: string; value: number }>,
): Promise<{ success?: boolean; error?: string }> {
  const scope = await getFinanceScope()
  if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-08-11 (számvevő-kör): ÍRÁSI KAPU — ellenőri (számvevői) nézetben a
  // művelet beszédes magyar üzenettel áll meg, nem nyers RLS-hibával.
  const writeBlock = financeWriteBlock(scope)
  if (writeBlock) return writeBlock
  const { supabase } = scope

  // Zár-ellenőrzés: a MÁR VÉGLEGESÍTETT módosítási kör nem írható felül.
  // 2026-08-15 (S6, terv 2.1/2): scope-aware — megyei ágon a diocese_bealitas
  // koltsegvetes_modN_veglegesitve flagje a zár (eddig a diocese-ág „nem
  // támogatott" hibával állt le, a megyei módosítás nem volt menthető).
  if (scope.scope === 'diocese') {
    const dioFlagKey = `koltsegvetes_mod${modNum}_veglegesitve`
    const { data: lockRow, error: lockErr } = await supabase
      .from('diocese_bealitas')
      // `select('*')`: a mod-oszlopok csak a 2026-08-15-egyhazmegyei-uj-tablak.sql
      // után léteznek — explicit oszloplistával a lekérés 42703-mal bukna.
      .select('*')
      .eq('diocese_id', scope.scopeId)
      .eq('eve', year)
      .maybeSingle()
    // Fail-closed: ha a zár-állapot nem olvasható, NEM mentünk „vakon" — egy
    // már véglegesített kört nem írhatunk felül egy elnyelt hiba miatt.
    if (lockErr) {
      return {
        error:
          `A ${year}. évi módosítás zár-állapotát nem sikerült ellenőrizni, ezért a mentés ` +
          `biztonsági okból elmaradt. Próbáld újra (részlet: ${lockErr.message}).`,
      }
    }
    if (lockRow && Boolean((lockRow as Record<string, unknown>)[dioFlagKey])) {
      return {
        error: `A ${year}. évi ${modNum}. költségvetés-módosítás már véglegesítve van — a mentés nem engedélyezett.`,
      }
    }
  } else {
    const flagKey = `budget_mod${modNum}_finalized`
    const { data: lockRow } = await supabase
      .from('bealitas')
      .select(flagKey)
      .eq('id', String(year))
      .eq('congregation_id', scope.scopeId)
      .maybeSingle()
    if (lockRow && Boolean((lockRow as unknown as Record<string, unknown>)[flagKey])) {
      return {
        error: `A ${year}. évi ${modNum}. költségvetés-módosítás már véglegesítve van — a mentés nem engedélyezett.`,
      }
    }
  }

  try {
    await saveBudgetModificationCompat(supabase, year, scope.scopeId, modNum, rows, scope.scope)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Mentési hiba' }
  }
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

/**
 * 2026-07-10 (#3/B+#3/C): kassza↔bank belső mozgás → befizetes/kiadas PÁR közös
 * `belso_mozgas_xkey`-vel, irányfüggő + számla-neves címkével — pontosan az import
 * kanonikus modellje szerint (import-transactions.ts internal-transfer ág):
 *   - LETÉTEL  (kassza_bank): kassza-KIADÁS 400.01 + bank-BEVÉTEL 301.01
 *   - FELVÉTEL (bank_kassza): bank-KIADÁS 401.01 + kassza-BEVÉTEL 300.01
 * Így a calculateBalances (kassza/bank egyenleg), a Registru Casa/Banca és a
 * carryover-lánc automatikusan helyes — a korábbi mester-táblás út ezekből kimaradt.
 */
async function saveKasszaBankTransferPair(
  supabase: Awaited<ReturnType<typeof getProfileCongregation>>['supabase'],
  congregationId: string,
  userId: string,
  data: {
    tipus: 'kassza_bank' | 'bank_kassza'
    datum: string
    forras: string
    cel: string
    osszeg: number
    megjegyzes?: string
  },
) {
  const isDeposit = data.tipus === 'kassza_bank' // letétel: kassza → bank
  const bankIdRaw = isDeposit ? data.cel : data.forras
  const bankId = Number(bankIdRaw)
  if (!Number.isFinite(bankId) || bankId <= 0) {
    return { error: 'Érvénytelen bankszámla-azonosító a belső mozgáshoz.' }
  }

  // Bankszámla neve az irányfüggő címkéhez ("Készpénzletétel a(z) X számlára")
  const { data: bank } = await supabase
    .from('bankszamlak')
    .select('bank_neve')
    .eq('id', bankId)
    .maybeSingle()
  const bankNeve = (bank?.bank_neve as string | undefined) || 'bank'

  // Kanonikus kód → befizetescel/kiadascel id feloldás
  const bevKod = isDeposit ? '301.01' : '300.01'
  const kiaKod = isDeposit ? '400.01' : '401.01'
  const [befCelRes, kiaCelRes] = await Promise.all([
    supabase.from('befizetescel').select('id').eq('id_szamadasicel', bevKod).maybeSingle(),
    supabase.from('kiadascel').select('id').eq('id_szamadasicel', kiaKod).maybeSingle(),
  ])
  const befCelId = befCelRes.data?.id ? Number(befCelRes.data.id) : null
  const kiaCelId = kiaCelRes.data?.id ? Number(kiaCelRes.data.id) : null
  if (!befCelId || !kiaCelId) {
    return {
      error: `Hiányzik a belső mozgás könyvelési célja (${bevKod} / ${kiaKod}) — futtasd le a 2026-06-10-belso-mozgas-kodok-INSTALL.sql-t.`,
    }
  }

  const label = isDeposit
    ? `Készpénzletétel a(z) ${bankNeve} számlára`
    : `Készpénzfelvétel a(z) ${bankNeve} számláról`
  const pairXkey = randomUUID() // közös belso_mozgas_xkey — a pár két oldalát linkeli
  const docNumber = buildDocumentNumber(null, data.datum)
  const fizetettev = Number(data.datum.slice(0, 4))

  // 1) KIADÁS-oldal (letételnél kassza, felvételnél bank)
  const kiadasPayload = {
    osszeg: data.osszeg,
    datum: data.datum,
    id_kiadascel: kiaCelId,
    iratszam: docNumber,
    nyugta: docNumber,
    irattipus: isDeposit ? 'készpénz' : 'banki',
    bankszamla_id: isDeposit ? null : bankId,
    belso_mozgas_xkey: pairXkey,
    megjegyzes: data.megjegyzes || null,
    deleted: false,
    congregation_id: congregationId,
    xkey: randomUUID().replace(/-/g, '').slice(0, 20),
    atvevo: label,
    userid: userId,
  }
  const kiaIns = await supabase.from('kiadas').insert([kiadasPayload]).select('id').single()
  if (kiaIns.error) return { error: `Belső mozgás (kiadás-oldal): ${kiaIns.error.message}` }

  // 2) BEVÉTEL-oldal (letételnél bank, felvételnél kassza)
  const befizetesPayload = {
    osszeg: data.osszeg,
    datum: data.datum,
    id_befizetescel: befCelId,
    id_szemely: null,
    id_csalad: null,
    forrasa: label,
    iratszam: docNumber,
    nyugta: docNumber,
    irattipus: isDeposit ? 'banki' : 'készpénz',
    bankszamla_id: isDeposit ? bankId : null,
    belso_mozgas_xkey: pairXkey,
    megjegyzes: data.megjegyzes || null,
    deleted: false,
    congregation_id: congregationId,
    fizetettev,
    is_potlas: false,
    csalad: false,
    xkey: randomUUID().replace(/-/g, '').slice(0, 20),
    userid: userId,
  }
  const befIns = await supabase.from('befizetes').insert([befizetesPayload]).select('id').single()
  if (befIns.error) {
    // Rollback: ne maradjon fél pár — a már beszúrt kiadás-oldalt töröljük
    await supabase
      .from('kiadas')
      .update({ deleted: true })
      .eq('id', kiaIns.data?.id as number)
      .eq('congregation_id', congregationId)
    return { error: `Belső mozgás (bevétel-oldal): ${befIns.error.message}` }
  }

  // 2026-07-11 (S6): ha VISSZAMENŐLEGESEN (pl. 2026-os nézetben 2025-ös dátummal)
  // rögzítünk átvezetést, a KÖVETKEZŐ évi automatikusan áthozott ('carryover')
  // banki nyitó elavul — újraszámoljuk. Kézzel rögzített nyitót nem bántunk.
  // Best-effort: hibája nem buktatja a mentést.
  try {
    const changedYear = Number(String(data.datum).slice(0, 4))
    if (Number.isFinite(changedYear) && changedYear >= 2000) {
      await refreshNextYearCarryoverUseCase(
        { congregationId, bankszamlaId: bankId, changedYear },
        { supabase, runtime: 'web', userId },
      )
    }
  } catch {
    // néma — kényelmi frissítés
  }

  revalidatePath('/penzugy')
  return { success: true }
}

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

  // 2026-07-10 (S3-#3): véglegesített évbe belső mozgás sem rögzíthető — a
  // kassza↔bank pár KÉT könyvelt sort (kiadas+befizetes) hoz létre, a
  // belsomozgas-ág pedig az egyenlegekbe számít. A pár mindkét oldala a
  // data.datum-ra könyvelődik, ezért egyetlen dátum-ellenőrzés elég.
  const transferLockError = await assertYearsNotFinalizedDirect(supabase, congregationId, [data.datum])
  if (transferLockError) return { error: transferLockError }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return { error: 'Nincs bejelentkezett felhasználó.' }

  // 2026-07-10 (#3/B): kassza↔bank → kanonikus befizetes/kiadas PÁR (lásd fent).
  // A `belsomozgas` mester-tábla KIZÁRÓLAG a valutacsere + bank_bank mozgásoké marad
  // (azok deviza-logikáját a bank-balance.ts / FX-átértékelés kezeli).
  if (data.tipus === 'kassza_bank' || data.tipus === 'bank_kassza') {
    return await saveKasszaBankTransferPair(supabase, congregationId, user.id, {
      tipus: data.tipus,
      datum: data.datum,
      forras: data.forras,
      cel: data.cel,
      osszeg: data.osszeg,
      megjegyzes: data.megjegyzes,
    })
  }

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
    created_by: user.id,
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

  // A tipus alapján auto-kitöltjük az id_szamadasicel-t, ha nincs megadva vagy üres.
  // 2026-07-10 (S4-#2 audit): ha a beküldött kód a KÉT bérleti kód egyike, de NEM
  // a tipus-hoz tartozó (pl. szerkesztéskor terulet→epulet váltás történt, és a
  // dialog a régi 104.05-öt küldte vissza), akkor is a tipus szerinti helyes kódra
  // korrigálunk — különben a befizetés-párosítás rossz kategóriát figyelne.
  // Egyedi (nem bérleti) kódot változatlanul tiszteletben tartunk.
  const beErkezettKod = d.id_szamadasicel?.trim() || ''
  const id_szamadasicel =
    beErkezettKod.length > 0 &&
    !(
      RENTAL_SZAMADASICEL_CODES.includes(beErkezettKod) &&
      beErkezettKod !== RENTAL_SZAMADASICEL_MAP[d.tipus]
    )
      ? beErkezettKod
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
      // 2026-07-10 (S4-#2 audit): a STORNÓZOTT befizetés nem számít befizetett
      // bérleti díjnak — eddig beleszámított, így a hátralék alábecsült volt.
      // Or-szűrés, mert a storno-funkció előtti sorokban a stornozott IS NULL.
      .or('stornozott.eq.false,stornozott.is.null')
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

  // 2026-07-10 (S3-#3): az FX-átértékelés nyereség/veszteség KÖNYVELT sort
  // (befizetes/kiadas, dátuma az év vége) hoz létre — véglegesített évre tilos.
  const fxLockError = await assertYearsNotFinalizedDirect(supabase, congregationId, [`${d.ev}-12-31`])
  if (fxLockError) return { error: fxLockError }

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
          // 2026-08-11 (K5-#7): a `bankszamla_id` HIÁNYZOTT a payloadból → NULL
          // maradt, a kódbázis kanonikus szabálya szerint viszont
          // `bankszamla_id IS NULL` = KÉSZPÉNZ (reporting.ts filterCash,
          // helpers.ts calculateBalances). Az árfolyam-nyereség így a KASSZÁBA
          // könyvelődött: a Registru Casa egy nem létező készpénz-bevételt
          // mutatott, a kassza könyv szerinti egyenlege eltért a fizikai
          // pénztártól, a bank RON-egyenlege pedig NEM változott — pedig épp
          // azt kellett átértékelni. Az `irattipus: 'Banki'` csak a nyomtatott
          // „Fel/Irat" oszlopot állítja, a kassza/bank besorolást NEM.
          bankszamla_id: d.bankszamla_id,
          // A különbözet MÁR RON-ban van (a régi és az új RON-érték különbsége),
          // ezért az árfolyam 1 és az osszeg_ron = osszeg — különben a RON-alapú
          // egyenleg-számítás újra átváltaná.
          osszeg_ron: osszeg,
          arfolyam: 1,
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
          // 2026-08-11 (K5-#7): lásd a nyereség-ág kommentjét — `bankszamla_id`
          // nélkül a veszteség a KASSZÁBÓL ment volna ki, nem a bankszámláról.
          bankszamla_id: d.bankszamla_id,
          osszeg_ron: osszeg,
          arfolyam: 1,
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

// ── Előző évi tény (2026-07-10, #2) ──────────────────────────

/**
 * 2026-07-10 (#2): az ELŐZŐ évi TÉNY (számadás) kódonkénti aggregátuma a
 * Költségvetés/Számadás fülek halvány „Előző évi tény" referencia-oszlopához.
 *
 * A `year` a NÉZETT év — a lekérdezés a `year - 1` évi befizetes/kiadas
 * sorokat aggregálja szamadasicel-kód szerint (minta:
 * `budget-print-dialog.tsx` computeActuals). A belső mozgás kódok
 * (100.xx legacy pénztármaradvány/belső mozgás + 3xx/4xx kassza↔bank
 * átvezetés) KIMARADNAK az aggregátumból — azok sosem számadási tételek
 * (a képernyős tétel-szűrővel azonos szabály, lásd #3/A).
 */
export async function getPreviousYearActuals(year: number): Promise<{
  actualIncome?: Record<string, number>
  actualExpense?: Record<string, number>
  error?: string
}> {
  try {
    // 2026-08-15 (S6): scope-aware — megyei profilnál eddig a (null)
    // gyülekezet-azonosítóval a gyülekezeti táblákra futott, így a megyei
    // Költségvetés/Számadás „Előző évi tény" oszlopa mindig üres volt.
    const scope = await getFinanceScope()
    if (!scope) return { error: 'Nincs bejelentkezett felhasználó.' }
    const prevYear = year - 1

    if (scope.scope === 'diocese') {
      // A diocese_befizetes/diocese_kiadas kategória-oszlopa (id_szamadasicel)
      // KÖZVETLENÜL a kód — junction-térkép nem kell.
      const [bevRes, kiaRes] = await Promise.all([
        scope.supabase
          .from('diocese_befizetes')
          .select('id_szamadasicel, osszeg, osszeg_ron')
          .eq('diocese_id', scope.scopeId)
          .eq('deleted', false)
          .eq('stornozott', false)
          .gte('datum', `${prevYear}-01-01`)
          .lte('datum', `${prevYear}-12-31`),
        scope.supabase
          .from('diocese_kiadas')
          .select('id_szamadasicel, osszeg, osszeg_ron')
          .eq('diocese_id', scope.scopeId)
          .eq('deleted', false)
          .eq('stornozott', false)
          .gte('datum', `${prevYear}-01-01`)
          .lte('datum', `${prevYear}-12-31`),
      ])
      const dioError = bevRes.error || kiaRes.error
      if (dioError) {
        return { error: `Előző évi tény betöltése sikertelen: ${dioError.message}` }
      }
      const isInternalCode = (code: string) => /^(100|[34])/.test(code)
      const actualIncome: Record<string, number> = {}
      ;((bevRes.data || []) as Array<{ id_szamadasicel: string | null; osszeg: number; osszeg_ron?: number | null }>).forEach((r) => {
        const code = r.id_szamadasicel
        if (!code || isInternalCode(code)) return
        actualIncome[code] = (actualIncome[code] || 0) + (Number(r.osszeg_ron ?? r.osszeg) || 0)
      })
      const actualExpense: Record<string, number> = {}
      ;((kiaRes.data || []) as Array<{ id_szamadasicel: string | null; osszeg: number; osszeg_ron?: number | null }>).forEach((r) => {
        const code = r.id_szamadasicel
        if (!code || isInternalCode(code)) return
        actualExpense[code] = (actualExpense[code] || 0) + (Number(r.osszeg_ron ?? r.osszeg) || 0)
      })
      return { actualIncome, actualExpense }
    }

    const { supabase } = scope
    const congregationId = scope.scopeId

    // 2026-07-10 (S3 audit KRITIKUS #1): stornózott tétel a referencia-ténybe sem számít.
    const [bevRes, kiaRes, bevCelRes, kiaCelRes] = await Promise.all([
      supabase
        .from('befizetes')
        .select('id_befizetescel, osszeg, osszeg_ron')
        .eq('congregation_id', congregationId)
        .eq('deleted', false)
        .eq('stornozott', false)
        .gte('datum', `${prevYear}-01-01`)
        .lte('datum', `${prevYear}-12-31`),
      supabase
        .from('kiadas')
        .select('id_kiadascel, osszeg, osszeg_ron')
        .eq('congregation_id', congregationId)
        .eq('deleted', false)
        .eq('stornozott', false)
        .gte('datum', `${prevYear}-01-01`)
        .lte('datum', `${prevYear}-12-31`),
      supabase.from('befizetescel').select('id, id_szamadasicel'),
      supabase.from('kiadascel').select('id, id_szamadasicel'),
    ])

    const firstError = bevRes.error || kiaRes.error || bevCelRes.error || kiaCelRes.error
    if (firstError) {
      return { error: `Előző évi tény betöltése sikertelen: ${firstError.message}` }
    }

    // befizetescel/kiadascel id → szamadasicel kód (az id_szamadasicel MÁR a kód)
    const bevMap: Record<number, string> = {}
    ;((bevCelRes.data || []) as Array<{ id: number; id_szamadasicel: string | null }>).forEach(
      (r) => {
        if (r.id_szamadasicel) bevMap[r.id] = r.id_szamadasicel
      },
    )
    const kiaMap: Record<number, string> = {}
    ;((kiaCelRes.data || []) as Array<{ id: number; id_szamadasicel: string | null }>).forEach(
      (r) => {
        if (r.id_szamadasicel) kiaMap[r.id] = r.id_szamadasicel
      },
    )

    // Belső mozgás kódok kizárása: 100-zal, 3-mal vagy 4-gyel kezdődő kódok.
    const isInternalCode = (code: string) => /^(100|[34])/.test(code)

    // 2026-07-11 (S9): a könyvelés RON-ban — a tény-referencia a RON-ekvivalenst
    // (osszeg_ron) összegzi. RON számlán osszeg == osszeg_ron (fallback).
    const actualIncome: Record<string, number> = {}
    ;((bevRes.data || []) as Array<{ id_befizetescel: number | null; osszeg: number; osszeg_ron?: number | null }>).forEach(
      (r) => {
        const code = r.id_befizetescel != null ? bevMap[r.id_befizetescel] : undefined
        if (!code || isInternalCode(code)) return
        actualIncome[code] = (actualIncome[code] || 0) + (Number(r.osszeg_ron ?? r.osszeg) || 0)
      },
    )

    const actualExpense: Record<string, number> = {}
    ;((kiaRes.data || []) as Array<{ id_kiadascel: number | null; osszeg: number; osszeg_ron?: number | null }>).forEach(
      (r) => {
        const code = r.id_kiadascel != null ? kiaMap[r.id_kiadascel] : undefined
        if (!code || isInternalCode(code)) return
        actualExpense[code] = (actualExpense[code] || 0) + (Number(r.osszeg_ron ?? r.osszeg) || 0)
      },
    )

    return { actualIncome, actualExpense }
  } catch (e) {
    return {
      error:
        e instanceof Error ? e.message : 'Ismeretlen hiba az előző évi tény betöltésekor.',
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────
// 2026-08-14 (K2): a hivatalos Számadás 116–133. sorai — Tartozások (Datorii)
// és Kintlévőségek (Creanţe) év végi rögzítése.
//
// A tároló a bealitas.szamadas_tartozasok jsonb (migráció:
// migration-docs/sql/2026-08-14-szamadas-tartozasok.sql). A kulcs a HIVATALOS
// Nr. rând. Az olvasás nem külön action: az initFinance a teljes bealitas
// sort adja (select '*'), a nyomtatvány és a szerkesztő a settings-ből kapja.
// ─────────────────────────────────────────────────────────────────────────

/** A hivatalos ív megengedett sorai — más kulcsot NEM fogadunk el. */
const TARTOZAS_SOROK = new Set([117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127])
const KINTLEVOSEG_SOROK = new Set([129, 130, 131, 132, 133])

export async function saveSzamadasTartozasok(
  year: number,
  payload: {
    tartozasok: Record<string, number>
    kintlevosegek: Record<string, number>
  },
): Promise<{ error?: string }> {
  try {
    const { supabase, congregationId } = await getProfileCongregation()
    if (!congregationId) return { error: 'Nincs kiválasztott gyülekezet.' }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return { error: 'Érvénytelen év.' }
    }

    // Csak a hivatalos sorok, csak véges, nem-negatív számok. Az ismeretlen
    // kulcs HANGOS hiba (nem néma eldobás): egy elütött sorszám különben
    // észrevétlenül veszne el, a lelkész pedig azt hinné, rögzítette.
    const tisztit = (
      bemenet: Record<string, number>,
      megengedett: Set<number>,
      cimke: string,
    ): { ok: Record<string, number> } | { error: string } => {
      const ki: Record<string, number> = {}
      for (const [kulcs, ertek] of Object.entries(bemenet || {})) {
        const nr = Number(kulcs)
        if (!megengedett.has(nr)) {
          return { error: `Ismeretlen ${cimke}-sor: ${kulcs} — a hivatalos ív sorai: ${[...megengedett].join(', ')}.` }
        }
        const n = Number(ertek)
        if (!Number.isFinite(n) || n < 0) {
          return { error: `A(z) ${kulcs}. sor értéke nem érvényes szám (${String(ertek)}).` }
        }
        // 2 tizedesre kerekítve tárolunk — a nyomtatvány is így számol.
        ki[String(nr)] = Math.round(n * 100) / 100
      }
      return { ok: ki }
    }
    const t = tisztit(payload?.tartozasok || {}, TARTOZAS_SOROK, 'tartozás')
    if ('error' in t) return { error: t.error }
    const k = tisztit(payload?.kintlevosegek || {}, KINTLEVOSEG_SOROK, 'kintlévőség')
    if ('error' in k) return { error: k.error }

    // Véglegesített évbe nem írunk — a beküldött, aláírt számadás és a tároló
    // nem húzhat szét. FAIL-CLOSED: ha az ellenőrzés hibázik, nem mentünk.
    const { data: evSor, error: evHiba } = await supabase
      .from('bealitas')
      .select('id, accounting_finalized')
      .eq('congregation_id', congregationId)
      .eq('id', String(year))
      .maybeSingle()
    if (evHiba) {
      return {
        error:
          `Nem sikerült ellenőrizni az év zárás-állapotát (${evHiba.message}) — a mentést ` +
          'biztonságból megszakítottuk. Próbáld újra; ha újra hibázik, jelezd a rendszergazdának.',
      }
    }
    if (!evSor) {
      return {
        error: `A(z) ${year}. évhez még nincs pénzügyi beállítás-sor — előbb nyisd meg az évet a Pénzügy modulban.`,
      }
    }
    if (evSor.accounting_finalized) {
      return {
        error: `A(z) ${year}. évi számadás már véglegesítve van — a tartozások nem módosíthatók. Először kérj javítási engedélyt az egyházmegyétől.`,
      }
    }

    const { error } = await supabase
      .from('bealitas')
      .update({ szamadas_tartozasok: { tartozasok: t.ok, kintlevosegek: k.ok } })
      .eq('congregation_id', congregationId)
      .eq('id', String(year))
    if (error) {
      // 42703 = nincs ilyen oszlop → a migráció még nem futott le élesben.
      if (error.code === '42703' || /szamadas_tartozasok/.test(error.message)) {
        return {
          error:
            'A tároló oszlop (bealitas.szamadas_tartozasok) még nincs az adatbázisban — ' +
            'futtasd le a migration-docs/sql/2026-08-14-szamadas-tartozasok.sql fájlt, majd próbáld újra.',
        }
      }
      return { error: error.message }
    }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ismeretlen hiba a tartozások mentésekor.' }
  }
}
