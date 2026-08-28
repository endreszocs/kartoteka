/**
 * importBankTransactionsUseCase — banki kivonat-import közös use-case
 * (2026-06-12, Endre #4 bank-import).
 *
 * A webes `apps/web/app/(dashboard)/penzugy/bank-import-actions.ts`
 * `importBcrTransactions` server actionjének PONTOS portja, hogy a desktop
 * (Tauri) ugyanazzal a logikával importáljon, mint a web:
 *
 *   - duplikáció-védelem (dátum + bankszámla + összeg ±1 cent),
 *   - valuta + árfolyam blokk (bankszamla_nyito_egyenleg éves árfolyamai),
 *   - bevétel / kiadás / belső-mozgás (kassza ↔ bank) három ág + skip,
 *   - belső mozgásnál AKTÍV PÁROSÍTÁS a kassza-import által létrehozott,
 *     párosítatlan kassza-oldali sorral (xkey-újrahasználat),
 *   - kiadás-insert legacy kétlépcsős (reference → canonical) fallback-kal.
 *
 * BŐVÍTÉS a webhez képest: a result `importedRows` tömbje minden sikeres
 * befizetés/kiadás insert id-ját visszaadja (a belső-mozgás BANK-oldali
 * sorát is) — a desktop Excel-write-through (E3) ebből enqueue-ol.
 *
 * A web-oldali revalidatePath a WEB shim-ben marad — a core nem Next-függő.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// 2026-07-11 (S6): visszamenőleges rögzítésnél a következő évi 'carryover'
// nyitó újraszámolásához. (A nyito-egyenleg.ts CSAK típusokat importál innen,
// így futásidejű kör-import nem keletkezik.)
import { assertYearsNotFinalizedForCreate } from '../year-lock'
import { refreshNextYearCarryoverUseCase } from './nyito-egyenleg'
// 2026-08-27: a kanonikus belső-mozgás kódpár — TISZTA, import nélküli modul,
// hogy FUTTATHATÓ teszttel legyen bizonyítható (selftest-belso-mozgas-kodpar.mjs),
// ne csak szövegkereséssel.
import { belsoMozgasKodpar } from './belso-mozgas-kodok'

export type BankImportItemAction = 'income' | 'expense' | 'internal-transfer' | 'skip'

export type BankImportItem = {
  /** Sor index a parse-ból (debug). */
  rowIndex: number
  date: string // YYYY-MM-DD
  description: string
  reference?: string
  /** Előjeles összeg (negatív = kiadás, pozitív = bevétel). */
  amount: number
  counterparty?: string
  /** Mit csinálunk vele. */
  action: BankImportItemAction
  /** Target bankszámla ID — minden action-höz szükséges kivéve skip. */
  bankszamlaId: number
  /** Kategória (bevétel / kiadás esetén kötelező). */
  categoryId?: number
  /** Belső mozgás esetén — a MÁSIK oldal (kasszára / másik bankra). */
  transferTo?: 'kassza' | number
  /** Személy ID (opcionális, bevétel esetén). */
  personId?: number
  megjegyzes?: string
  /** Iratszám (számla szám, nyugta szám stb.). Ha megadva, ezt használjuk a `reference`/`description` alapú auto-generálás helyett. */
  iratszam?: string
}

/** Egy sikeresen beszúrt sor — a desktop Excel-enqueue (E3) bemenete. */
export type BankImportedRow = {
  rowIndex: number
  side: 'income' | 'expense'
  /** A beszúrt befizetes/kiadas sor szerver-PK-ja. */
  id: number
  iratszam: string
  bankszamlaId: number
  date: string
  /** Előjeles összeg (az input item amount-ja) — Excel-hez Math.abs-szal. */
  amount: number
  categoryId: number | null
  counterparty: string | null
  megjegyzes: string | null
}

export type BankImportResult = {
  totalItems: number
  imported: number
  skipped: number
  /** Duplikációk miatt átugrott tételek (már benne volt a rendszerben). */
  duplicates: number
  errors: Array<{ rowIndex: number; error: string }>
  /** Sikeresen beszúrt sorok (a belső-mozgás bank-oldali sora is). */
  importedRows: BankImportedRow[]
}

export interface ImportBankTransactionsInput {
  congregationId: string
  items: BankImportItem[]
  /**
   * 2026-07-10 (ÚJ #10): NAPI árfolyamok deviza (nem-RON) számlákhoz.
   * Kulcs: a tranzakció dátuma ("YYYY-MM-DD"), érték: 1 deviza = X RON
   * (a célszámla devizájában). A HÍVÓ réteg tölti fel (web: fetchBnrRates
   * napi historikus BNR/ECB árfolyam) — a core platform-független, ezért
   * itt NEM kérünk le árfolyamot. Ha egy dátum hiányzik a map-ből, a
   * meglévő éves (bankszamla_nyito_egyenleg) árfolyam a fallback.
   */
  dailyRates?: Record<string, number>
}

export interface ImportBankTransactionsCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  userId: string
}

/** Olvasó use-case-ek ctx-e — userId itt nem kötelező. */
export interface BankImportReadCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  userId?: string
}

// ─────────────────────────────────────────────────────────────────────────
// UUID helperek — `globalThis.crypto` web + desktop (Tauri webview) alatt is
// elérhető; a Node-os `crypto` modult NEM importálhatjuk (browser-bundle).
// ─────────────────────────────────────────────────────────────────────────

/**
 * 20 hex karakteres xkey — a legacy DB-n a befizetes.xkey/kiadas.xkey
 * varchar(20) volt (ma TEXT, de a kódbeli minta marad):
 * `randomUUID().replace(/-/g,'').slice(0,20)`.
 */
function generateXkey20(): string {
  const cryptoObj =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID().replace(/-/g, '').slice(0, 20)
  // Fallback — nem kriptográfiai, csak egyediségért
  return Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

/** Teljes UUID a `belso_mozgas_xkey`-hez (mint a weben a randomUUID()). */
function generateBelsoMozgasXkey(): string {
  const cryptoObj =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID()
  // Fallback — 32 hex + időbélyeg (egyediség)
  const rand = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${rand}-${Date.now().toString(16)}`
}

// ─────────────────────────────────────────────────────────────────────────
// Belső helperek — a webes action 1:1 portjai
// ─────────────────────────────────────────────────────────────────────────

/**
 * Visszaadja, hogy egy adott bankszámlán található-e már (datum, osszeg) párra
 * illeszkedő tranzakció. Duplikáció-védelemhez.
 *
 * A heurisztika: ha ugyanazon a napon, ugyanazon a bankszámlán, ugyanazon az
 * összeggel (±1 cent) van rekord, az nagy valószínűséggel ugyanaz a tétel.
 *
 * 2026-08-11 (5. kör): FAIL-CLOSED JAVÍTÁS. Korábban `const { data } = await …`
 * volt (az `error` eldobva), majd `return !!(data && data.length > 0)` — vagyis
 * a lekérdezés BÁRMILYEN hibája (RLS, hálózat, séma-drift) `false`-t adott,
 * ami azt jelenti: „nincs ilyen tétel" → az import NÉMÁN BESZÚRTA a sort
 * MÉGEGYSZER. Egy banki kivonat újraimportálásakor így az egész hónap
 * megduplázódhatott a könyvben, és a duplikátumok csak az egyenleg-eltérésből
 * derültek volna ki. Duplikáció-védelemnél a fail-OPEN ugyanolyan rossz
 * alapértelmezés, mint az év-zárnál: ha nem tudjuk ellenőrizni, NEM szúrunk be.
 */
async function hasExistingBankTransaction(
  supabase: SupabaseClient,
  congregationId: string,
  params: { date: string; amount: number; bankszamlaId: number; side: 'income' | 'expense' },
): Promise<{ exists: boolean } | { error: string }> {
  const absAmount = Math.abs(params.amount)
  const table = params.side === 'income' ? 'befizetes' : 'kiadas'
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('congregation_id', congregationId)
    .eq('bankszamla_id', params.bankszamlaId)
    .eq('datum', params.date)
    // 2026-07-11 (S9): a STORNÓZOTT (érvénytelenített) tétel NEM blokkolja az
    // újraimportot — így egy hibás (pl. át nem váltott) tételt stornózni lehet,
    // majd a javított kivonatot újraimportálni (a stornó a listában marad).
    .eq('stornozott', false)
    .gte('osszeg', absAmount - 0.01)
    .lte('osszeg', absAmount + 0.01)
    .eq('deleted', false)
    .limit(1)
  if (error) return { error: error.message }
  return { exists: !!(data && data.length > 0) }
}

/** A duplikáció-ellenőrzés hibájának egységes, lelkész-barát magyar üzenete. */
function duplicateCheckFailedMessage(detail: string): string {
  return (
    `Nem sikerült ellenőrizni, hogy ez a tétel már szerepel-e a könyvben (${detail}), ` +
    'ezért a sort biztonságból KIHAGYTUK — így nem kerülhet be kétszer. ' +
    'Ellenőrizd az internetkapcsolatot, és indítsd újra az importot ezekre a sorokra.'
  )
}

/** ISO dátum (YYYY-MM-DD) ± N nap, időzóna-biztosan (UTC). */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Két ISO-dátum napban mért távolsága (abszolút). */
function dateProximityDays(a: string, b: string): number {
  const ta = new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime()
  const tb = new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime()
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity
  return Math.abs((ta - tb) / 86_400_000)
}

/**
 * Egy `belso_mozgas_xkey` PÁROSÍTOTT-e már a bank-oldalon? (Van-e olyan befizetés/kiadás
 * ugyanazzal az xkey-vel, aminek `bankszamla_id` ki van töltve.) Ha igen, a mozgás teljes.
 *
 * 2026-08-11 (5. kör): FAIL-CLOSED JAVÍTÁS — korábban `const { data } = await …`
 * (az `error` eldobva) + `return false` a végén. A `false` jelentése „még NINCS
 * bank-oldali párja", vagyis egy elnyelt lekérdezési hiba miatt a hívó egy MÁR
 * PÁROSÍTOTT kassza-sort választott volna párnak: a banki sor egy olyan
 * `belso_mozgas_xkey`-t kapott volna, amihez már tartozik bank-oldal → három
 * sor egy kulcson, felborult belső-mozgás egyeztetés. Hibánál nem tippelünk.
 */
async function isXkeyPairedOnBankSide(
  supabase: SupabaseClient,
  congregationId: string,
  xkey: string,
): Promise<{ paired: boolean } | { error: string }> {
  for (const table of ['befizetes', 'kiadas'] as const) {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .eq('congregation_id', congregationId)
      .eq('belso_mozgas_xkey', xkey)
      .not('bankszamla_id', 'is', null)
      .eq('deleted', false)
      .limit(1)
    if (error) return { error: error.message }
    if (data && data.length > 0) return { paired: true }
  }
  return { paired: false }
}

/**
 * AKTÍV PÁROSÍTÁS: keres egy MEGLÉVŐ, párosítatlan KASSZA-oldali belső mozgást, amihez a most
 * importált banki tétel a pár. (A Kassza-import a 400.01/300.01 sorokat kassza-oldalon, banki
 * párja nélkül hozta létre — ezeket kötjük most össze a banki kivonat tételeivel.)
 *
 * Kritériumok: kassza-oldal (`bankszamla_id IS NULL`), van `belso_mozgas_xkey`, az adott
 * irány (befizetés/kiadás), azonos összeg (±0.01), a dátum ±7 napon belül (2026-07-10 #3/D:
 * ±3-ról szélesítve — a valós adatban a kassza- és bank-oldal több nappal is eltérhet, emiatt
 * a közös-xkey párosítás egyszer sem jött létre; a ±7 az internal-movement-health
 * PAIRING_WINDOW_DAYS-szel konzisztens), NEM törölt, és az xkey-je még NINCS bank-oldalon párosítva.
 *
 * @returns `{ match }` — a megtalált kassza-oldali sor (vagy `null`, ha nincs) — vagy `{ error }`.
 *
 * 2026-08-11 (5. kör): FAIL-CLOSED JAVÍTÁS — a jelöltek lekérdezése is
 * `const { data: candidates } = await …` volt (az `error` eldobva), és a
 * `if (!candidates …) return null` a hibát „nincs párosítatlan kassza-oldal"-nak
 * hazudta. Következmény: az import ÚJ kassza-oldalt hozott létre egy olyan
 * mozgáshoz, aminek már volt kassza-oldala → duplikált kassza-tétel + örökre
 * párosítatlan (piros) belső mozgás. Ha az ellenőrzés nem fut le, a sort
 * inkább kihagyjuk, mint hogy rossz párt vagy duplikátumot gyártsunk.
 */
async function findUnpairedCashCounterpart(
  supabase: SupabaseClient,
  congregationId: string,
  params: { side: 'income' | 'expense'; amount: number; date: string },
): Promise<{ match: { id: number; xkey: string } | null } | { error: string }> {
  const table = params.side === 'income' ? 'befizetes' : 'kiadas'
  const { data: candidates, error: candidatesErr } = await supabase
    .from(table)
    .select('id, belso_mozgas_xkey, datum')
    .eq('congregation_id', congregationId)
    .is('bankszamla_id', null)
    .not('belso_mozgas_xkey', 'is', null)
    .gte('osszeg', params.amount - 0.01)
    .lte('osszeg', params.amount + 0.01)
    .eq('deleted', false)
    .gte('datum', addDaysIso(params.date, -7))
    .lte('datum', addDaysIso(params.date, 7))

  if (candidatesErr) return { error: candidatesErr.message }
  if (!candidates || candidates.length === 0) return { match: null }

  // Dátum-közelség szerint (legközelebbi elöl)
  const sorted = [...candidates].sort(
    (a, b) =>
      dateProximityDays(String(a.datum), params.date) -
      dateProximityDays(String(b.datum), params.date),
  )

  for (const c of sorted) {
    const xkey = c.belso_mozgas_xkey as string | null
    if (!xkey) continue
    const paired = await isXkeyPairedOnBankSide(supabase, congregationId, xkey)
    if ('error' in paired) return { error: paired.error }
    if (!paired.paired) return { match: { id: c.id as number, xkey } }
  }
  return { match: null }
}

/**
 * Kiadás-sor beszúrása a `kiadas` tábla MAI sémája szerint.
 * Az `id`-t `.select('id').single()`-lel kérjük vissza (Excel-write-through-hoz).
 *
 * 2026-08-27 — A KORÁBBI KÉTLÉPCSŐS „reference → canonical” FALLBACK ELTÁVOLÍTVA.
 * Nulla védelmet adott, viszont elrejtette a valódi hibát, és élesben MINDEN
 * banki kiadás-sort megbuktatott (93 hibás sor egyetlen importban). Három
 * független okból volt halott:
 *   1. a `reference` a `canonical` SPREADJE volt (`{ ...canonical, … }`), így egy
 *      nem létező oszlop MINDKÉT próbálkozást ugyanúgy megbuktatta;
 *   2. a hívók `kedvezmenyzett` néven adták át a partnert — ilyen oszlop a
 *      `kiadas` táblán SOHA nem létezett (élesben igazolva, information_schema);
 *   3. a `canonical` a NOT NULL `xkey` és `nyugta` oszlopokat nem is tartalmazta,
 *      tehát a „tartalék” ág önmagában sem sikerülhetett volna.
 *
 * A `kiadas` partner-oszlopa `atvevo`, a személy-hivatkozásé `atvevoid`.
 * NE tévesszen meg a `kedvezmenyezett_cui` (más cél) és a megyei/kerületi
 * tükör-táblák `kedvezmenyezett` oszlopa (egy plusz „e”, MÁS tábla).
 *
 * A partnert KÜLÖN paraméterként kérjük, hogy a hívó ne tudja véletlenül
 * rossz oszlopnéven becsempészni a mezők közé.
 */
/**
 * A belső mozgás KANONIKUS kódjaihoz tartozó junction-tábla azonosítók feloldása.
 *
 * ⛔ 2026-08-27 — MIÉRT KELLETT (élesben elsülő adathiba):
 * A belső mozgás ág korábban a varázslótól kapott EGYETLEN `item.categoryId`-t írta
 * a pár MINDKÉT oldalára — egyszer `id_befizetescel`-ként, egyszer `id_kiadascel`-ként.
 * Ez KÉT KÜLÖN TÁBLA, KÉT KÜLÖN azonosító-térrel: ugyanaz a szám az egyik táblában
 * mást jelent, mint a másikban. Ráadásul a varázsló belső mozgásnál MINDIG a
 * kiadás-listát adja (`d.action === 'income' ? incomeCategories : expenseCategories`),
 * tehát a kapott szám egy `kiadascel.id` — amit a bevétel-oldal `id_befizetescel`
 * FK-jába írva vagy FK-hibára fut, vagy (rosszabb) NÉMÁN egy TELJESEN MÁS
 * befizetési célra mutat.
 *
 * A helyes minta a kézi rögzítőé (actions.ts saveInternalTransfer): a kódot NEM a
 * felülettől kérjük, hanem a kanonikus kódból oldjuk fel, MINDKÉT táblából külön.
 * FAIL-CLOSED: ha egy kód nem oldható fel, inkább hibázunk, mint hogy rosszat írjunk.
 */
async function resolveBelsoMozgasCelIds(
  supabase: SupabaseClient,
): Promise<{ bev: Map<string, number>; kia: Map<string, number> } | { error: string }> {
  const KODOK = ['300.01', '301.01', '400.01', '401.01', '402.02']
  const [bevRes, kiaRes] = await Promise.all([
    supabase.from('befizetescel').select('id, id_szamadasicel').in('id_szamadasicel', KODOK),
    supabase.from('kiadascel').select('id, id_szamadasicel').in('id_szamadasicel', KODOK),
  ])
  if (bevRes.error) return { error: `befizetescel: ${bevRes.error.message}` }
  if (kiaRes.error) return { error: `kiadascel: ${kiaRes.error.message}` }
  const bev = new Map<string, number>()
  for (const r of (bevRes.data || []) as Array<{ id: number; id_szamadasicel: string }>) {
    bev.set(String(r.id_szamadasicel), Number(r.id))
  }
  const kia = new Map<string, number>()
  for (const r of (kiaRes.data || []) as Array<{ id: number; id_szamadasicel: string }>) {
    kia.set(String(r.id_szamadasicel), Number(r.id))
  }
  return { bev, kia }
}


async function insertKiadas(
  supabase: SupabaseClient,
  fields: Record<string, unknown>,
  partner: string | null,
  userId: string,
): Promise<{ error: { message: string } | null; id: number | null }> {
  const payload: Record<string, unknown> = {
    ...fields,
    // A `kiadas` NOT NULL oszlopai, alapérték nélkül: xkey, nyugta, userid,
    // iratszam, irattipus, datum, osszeg, id_kiadascel, deleted.
    atvevo: partner,
    atvevoid: null,
    nyugta: fields.iratszam,
    xkey: generateXkey20(),
    userid: userId,
  }
  const ins = await supabase.from('kiadas').insert([payload]).select('id').single()
  if (ins.error) return { error: ins.error, id: null }
  return { error: null, id: (ins.data?.id as number | undefined) ?? null }
}

// ─────────────────────────────────────────────────────────────────────────
// Use-case: legutolsó banki tranzakció dátuma
// ─────────────────────────────────────────────────────────────────────────

export interface GetLatestBankTransactionDateInput {
  congregationId: string
  bankszamlaId: number
}

/**
 * A legutolsó banki tranzakció dátuma egy adott bankszámlán.
 * A wizard ezt használja default szűrőként: csak az ennél későbbi
 * tranzakciókat ajánlja fel alapértelmezetten.
 */
export async function getLatestBankTransactionDateUseCase(
  input: GetLatestBankTransactionDateInput,
  ctx: BankImportReadCtx,
): Promise<{ date?: string | null; error?: string }> {
  if (!input.congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const [inc, exp] = await Promise.all([
    ctx.supabase
      .from('befizetes')
      .select('datum')
      .eq('congregation_id', input.congregationId)
      .eq('bankszamla_id', input.bankszamlaId)
      .eq('deleted', false)
      .order('datum', { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from('kiadas')
      .select('datum')
      .eq('congregation_id', input.congregationId)
      .eq('bankszamla_id', input.bankszamlaId)
      .eq('deleted', false)
      .order('datum', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const incDate = (inc.data?.datum as string | null) ?? null
  const expDate = (exp.data?.datum as string | null) ?? null
  if (!incDate && !expDate) return { date: null }
  if (!incDate) return { date: expDate }
  if (!expDate) return { date: incDate }
  return { date: incDate > expDate ? incDate : expDate }
}

// ─────────────────────────────────────────────────────────────────────────
// Use-case: batch-import (a webes importBcrTransactions portja)
// ─────────────────────────────────────────────────────────────────────────

export async function importBankTransactionsUseCase(
  input: ImportBankTransactionsInput,
  ctx: ImportBankTransactionsCtx,
): Promise<BankImportResult & { error?: string }> {
  const emptyResult: BankImportResult = {
    totalItems: 0,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    errors: [],
    importedRows: [],
  }
  if (!ctx.userId) return { ...emptyResult, error: 'Nincs bejelentkezve.' }
  if (!input.congregationId) return { ...emptyResult, error: 'Nincs aktív gyülekezet.' }

  // P0-4 (audit 2026-08-28): ÉV-ZÁR a KÖZÖS magban — a webes wrapper eddig is
  // ellenőrzött a saját rétegében, de a desktop hívó semmit: véglegesített
  // (beküldött) évbe is be lehetett importálni a kivonatot, némán elévültetve
  // a beadott számadás-pillanatképet. A nyito-egyenleg.ts elve szerint a
  // mellékutak nem lehetnek gyengébbek a kanonikus helynél, ezért a kapu itt,
  // az ELSŐ insert előtt fut (fail-closed a core year-lock szerint).
  const evZarHiba = await assertYearsNotFinalizedForCreate(
    ctx.supabase,
    input.congregationId,
    input.items.filter((i) => i.action !== 'skip').map((i) => i.date),
  )
  if (evZarHiba) {
    return { ...emptyResult, totalItems: input.items.length, error: evZarHiba }
  }

  const items = input.items
  const result: BankImportResult = {
    totalItems: items.length,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    errors: [],
    importedRows: [],
  }

  const userId = ctx.userId
  const congregationId = input.congregationId
  const supabase = ctx.supabase

  // ── VALUTA + ÁRFOLYAM előkészítés ──
  // A tranzakciók RON ekvivalensét a bankszámla valutája + az év eleji
  // nyitó egyenleg árfolyam alapján számoljuk. Ha a bankszámla RON, az
  // arfolyam=1 és az osszeg_ron=osszeg.
  //
  // 2026-07-10 (ÚJ #10): ha a hívó `input.dailyRates`-ben megadta a
  // tranzakció NAPJÁRA érvényes árfolyamot, deviza-számlánál AZT
  // használjuk; az éves nyitó-árfolyam csak fallback marad.
  //
  // A `bankszamlak` táblából egyszer lekérdezzük minden érintett számlát.
  const uniqueBankIds = Array.from(new Set(items.map((i) => i.bankszamlaId)))
  const { data: banksData } = await supabase
    .from('bankszamlak')
    .select('id, valuta')
    .in('id', uniqueBankIds)
    .eq('congregation_id', congregationId)
  const bankValutaMap = new Map<number, string>()
  for (const b of banksData || []) {
    bankValutaMap.set(b.id as number, (b.valuta as string) || 'RON')
  }

  // Éves árfolyamok: (bankszamla_id + eve) → arfolyam
  const arfolyamKulcs = (bid: number, ev: number) => `${bid}:${ev}`
  const arfolyamMap = new Map<string, number>()
  const years = Array.from(
    new Set(items.map((i) => new Date(i.date).getFullYear())),
  )
  for (const bid of uniqueBankIds) {
    const val = bankValutaMap.get(bid) || 'RON'
    if (val === 'RON') {
      for (const y of years) arfolyamMap.set(arfolyamKulcs(bid, y), 1)
      continue
    }
    // Valutás: lekérdezzük a nyitó egyenleg árfolyamokat
    const { data: nyitoData } = await supabase
      .from('bankszamla_nyito_egyenleg')
      .select('eve, arfolyam')
      .eq('bankszamla_id', bid)
      .eq('congregation_id', congregationId)
      .in('eve', years)
    for (const n of nyitoData || []) {
      const arf = n.arfolyam != null ? Number(n.arfolyam) : 0
      if (arf > 0) arfolyamMap.set(arfolyamKulcs(bid, n.eve as number), arf)
    }
  }

  // 2026-07-11 (S8): a `unconverted` jelző — ha egy DEVIZÁS számla tételéhez
  // SEMMILYEN árfolyam nem áll rendelkezésre (sem napi BNR/ECB, sem éves nyitó),
  // a rendszer NEM tárolja csendben 1:1-ben RON-ként (ez elrontaná a könyvelést)
  // — a sort HIBÁVAL kihagyjuk, és a felhasználó megkapja az okot.
  function computeOsszegRon(item: BankImportItem): {
    osszegRon: number
    arfolyam: number
    unconverted?: boolean
    valuta?: string
  } {
    const valuta = bankValutaMap.get(item.bankszamlaId) || 'RON'
    if (valuta === 'RON') {
      // RON számla: az összeg már RON, árfolyam = 1.
      return { osszegRon: Math.abs(item.amount), arfolyam: 1 }
    }
    // 2026-07-10 (ÚJ #10): deviza-számlánál ELSŐDLEGESEN az adott NAPI
    // árfolyam (a hívó által feltöltött dailyRates map-ből, kulcs: dátum).
    const napiArf = input.dailyRates?.[item.date]
    if (napiArf != null && napiArf > 0) {
      return {
        osszegRon: Number((Math.abs(item.amount) * napiArf).toFixed(2)),
        arfolyam: napiArf,
      }
    }
    // Fallback: éves nyitó-árfolyam.
    const year = new Date(item.date).getFullYear()
    const arf = arfolyamMap.get(arfolyamKulcs(item.bankszamlaId, year))
    if (arf && arf > 0) {
      return {
        osszegRon: Number((Math.abs(item.amount) * arf).toFixed(2)),
        arfolyam: arf,
      }
    }
    // 2026-07-11 (S8): NINCS árfolyam — NEM tárolunk 1:1 RON-t némán.
    return { osszegRon: Math.abs(item.amount), arfolyam: 0, unconverted: true, valuta }
  }

  // ── BELSŐ MOZGÁS: a kanonikus kódok feloldása (2026-08-27) ───────────────
  // Csak akkor kérdezünk, ha van egyáltalán belső mozgás tétel — a sima
  // bevétel/kiadás import viselkedése így BÁJTRA változatlan marad.
  let bmCelIds: { bev: Map<string, number>; kia: Map<string, number> } | null = null
  if (items.some((i) => i.action === 'internal-transfer')) {
    const res = await resolveBelsoMozgasCelIds(supabase)
    if ('error' in res) {
      return {
        ...result,
        error:
          `Nem sikerült feloldani a belső mozgás könyvelési céljait (${res.error}), ezért az ` +
          'importot biztonságból megszakítottuk — rossz kategóriával nem szúrunk be tételt. ' +
          'Próbáld újra; ha újra hibázik, jelezd a rendszergazdának.',
      }
    }
    bmCelIds = res
  }

  for (const item of items) {
    if (item.action === 'skip') {
      result.skipped++
      continue
    }

    // ── DUPLIKÁCIÓ VÉDELEM ──
    // A (dátum, bankszámla, összeg) hármas ha már létezik, ne duplikáljunk.
    // A belső mozgás speciális — mindkét oldalt együttesen ellenőrizzük
    // (ha az egyik oldal megvan, feltehetően a párja is)
    // 2026-08-11 (5. kör): a `hasExistingBankTransaction` mostantól FAIL-CLOSED —
    // ha a duplikáció-lekérdezés hibára fut, NEM „nincs duplikátum" a válasz,
    // hanem hiba, és a sort kihagyjuk (a modul szokásos `result.errors` +
    // `continue` konvenciójával). Így egy pillanatnyi RLS-/hálózati hiba nem
    // duplikálhatja be az egész banki kivonatot a könyvbe.
    if (item.action === 'income' || item.action === 'expense' || item.action === 'internal-transfer') {
      // Belső mozgásnál az amount előjele adja a bank-oldal irányát.
      const dupSide: 'income' | 'expense' =
        item.action === 'internal-transfer'
          ? item.amount < 0
            ? 'expense'
            : 'income'
          : item.action
      const dup = await hasExistingBankTransaction(supabase, congregationId, {
        date: item.date,
        amount: item.amount,
        bankszamlaId: item.bankszamlaId,
        side: dupSide,
      })
      if ('error' in dup) {
        result.errors.push({
          rowIndex: item.rowIndex,
          error: duplicateCheckFailedMessage(dup.error),
        })
        continue
      }
      if (dup.exists) {
        result.duplicates++
        continue
      }
    }

    // Közös dokument-szám: a felhasználó által megadott iratszám > bank referencia > leírás alapú generálás
    // FONTOS: a legacy DB-n `befizetes.nyugta` és `befizetes.iratszam` varchar(20) volt,
    // ezért MAX 20 karakterre csonkolunk (webes paritás — a viselkedés marad).
    // A BCR referencia (pl. "SGW1000026269926") általában 16–20 karakter, de a
    // leírás-alapú fallback hosszabb lehet.
    const rawDocNumber =
      item.iratszam?.trim() ||
      item.reference?.trim() ||
      item.description.slice(0, 30).replace(/\s+/g, '-').toLowerCase()
    const docNumber = rawDocNumber.slice(0, 20)

    try {
      if (item.action === 'income') {
        // BEVÉTEL a bankba
        if (!item.categoryId) {
          result.errors.push({ rowIndex: item.rowIndex, error: 'Hiányzó kategória (bevétel)' })
          continue
        }
        const { osszegRon: incOsszegRon, arfolyam: incArfolyam, unconverted: incUnc, valuta: incVal } = computeOsszegRon(item)
        // 2026-07-11 (S8): devizás számla árfolyam nélkül — NEM tárolunk 1:1 RON-t.
        if (incUnc) {
          result.errors.push({
            rowIndex: item.rowIndex,
            error: `Nincs ${incVal} → RON árfolyam a ${item.date} dátumra. Add meg a nyitó egyenleg árfolyamát a bankszámlához (vagy ellenőrizd a BNR-kapcsolatot), majd indítsd újra az importot.`,
          })
          continue
        }
        // A `befizetes` táblán az `xkey`, `nyugta`, `csalad` ÉS `userid` oszlopok
        // NOT NULL — mindet meg kell adnunk, különben a beszúrás constraint-hibával
        // bukik. 2026-07-10 (S4 #8): a `csalad: false` hiányzott; 2026-07-11 (S6):
        // a `userid` is hiányzott — a csalad-fix után EZ volt a következő NOT NULL
        // hiba ("null value in column userid"), ami minden bevétel-importot elvitt.
        // Most a TELJES NOT NULL oszloplistát átvizsgáltuk (xkey, forrasa,
        // id_befizetescel, datum, osszeg, nyugta, iratszam, irattipus, csalad,
        // deleted, fizetettev, userid) — mind szerepel.
        const payload = {
          osszeg: Math.abs(item.amount),
          osszeg_ron: incOsszegRon,
          arfolyam: incArfolyam,
          datum: item.date,
          id_befizetescel: item.categoryId,
          id_szemely: item.personId ?? null,
          id_csalad: null,
          csalad: false,
          forrasa: item.counterparty || item.description.slice(0, 100),
          iratszam: docNumber,
          nyugta: docNumber,
          irattipus: 'banki',
          bankszamla_id: item.bankszamlaId,
          megjegyzes: item.megjegyzes || item.description,
          deleted: false,
          congregation_id: congregationId,
          fizetettev: Number(item.date.slice(0, 4)),
          is_potlas: false,
          xkey: generateXkey20(),
          userid: userId,
        }
        const ins = await supabase.from('befizetes').insert([payload]).select('id').single()
        if (ins.error) {
          result.errors.push({ rowIndex: item.rowIndex, error: ins.error.message })
        } else {
          result.imported++
          result.importedRows.push({
            rowIndex: item.rowIndex,
            side: 'income',
            id: (ins.data?.id as number | undefined) ?? 0,
            iratszam: docNumber,
            bankszamlaId: item.bankszamlaId,
            date: item.date,
            amount: item.amount,
            categoryId: item.categoryId ?? null,
            counterparty: item.counterparty ?? null,
            megjegyzes: item.megjegyzes || item.description || null,
          })
        }
      } else if (item.action === 'expense') {
        // KIADÁS a bankból
        if (!item.categoryId) {
          result.errors.push({ rowIndex: item.rowIndex, error: 'Hiányzó kategória (kiadás)' })
          continue
        }
        const { osszegRon: expOsszegRon, arfolyam: expArfolyam, unconverted: expUnc, valuta: expVal } = computeOsszegRon(item)
        // 2026-07-11 (S8): devizás számla árfolyam nélkül — NEM tárolunk 1:1 RON-t.
        if (expUnc) {
          result.errors.push({
            rowIndex: item.rowIndex,
            error: `Nincs ${expVal} → RON árfolyam a ${item.date} dátumra. Add meg a nyitó egyenleg árfolyamát a bankszámlához (vagy ellenőrizd a BNR-kapcsolatot), majd indítsd újra az importot.`,
          })
          continue
        }
        // 2026-08-27: a partner KÜLÖN megy az insertKiadas()-nak — a mezők közé
        // korábban `kedvezmenyzett` néven került, ami nem létező oszlop.
        const expPartner = item.counterparty || item.description.slice(0, 100)
        const ins = await insertKiadas(
          supabase,
          {
            osszeg: Math.abs(item.amount),
            osszeg_ron: expOsszegRon,
            arfolyam: expArfolyam,
            datum: item.date,
            id_kiadascel: item.categoryId,
            iratszam: docNumber,
            irattipus: 'banki',
            bankszamla_id: item.bankszamlaId,
            megjegyzes: item.megjegyzes || item.description,
            deleted: false,
            congregation_id: congregationId,
          },
          expPartner,
          userId,
        )
        if (ins.error) {
          result.errors.push({ rowIndex: item.rowIndex, error: ins.error.message })
        } else {
          result.imported++
          result.importedRows.push({
            rowIndex: item.rowIndex,
            side: 'expense',
            id: ins.id ?? 0,
            iratszam: docNumber,
            bankszamlaId: item.bankszamlaId,
            date: item.date,
            amount: item.amount,
            categoryId: item.categoryId ?? null,
            counterparty: item.counterparty ?? null,
            megjegyzes: item.megjegyzes || item.description || null,
          })
        }
      } else if (item.action === 'internal-transfer') {
        // BELSŐ MOZGÁS: kassza ↔ bank, vagy bank ↔ bank — AKTÍV PÁROSÍTÁSSAL.
        const isKasszaTarget = item.transferTo === 'kassza'
        // Az amount előjele határozza meg az irányt:
        //   amount < 0 (terhelés): a bankból KIMENT → bank-oldal KIADÁS
        //   amount > 0 (jóváírás): a bankba BEMENT → bank-oldal BEVÉTEL
        const isBankToKassza = item.amount < 0
        const absAmount = Math.abs(item.amount)
        // (2026-07-10: a bmTipus a belsomozgas audit-inserttel együtt megszűnt — lásd lent)

        // A bank-oldal iránya az item.bankszamlaId számlán, és a counterpart (másik oldal) iránya.
        const bankSide: 'income' | 'expense' = isBankToKassza ? 'expense' : 'income'
        const counterpartSide: 'income' | 'expense' = bankSide === 'income' ? 'expense' : 'income'
        // Counterpart számla: kassza-célnál NULL (kassza), bank-banknál a transferTo számla.
        const counterpartBankId: number | null =
          isKasszaTarget ? null : (typeof item.transferTo === 'number' ? item.transferTo : null)

        // ⛔ 2026-08-27 — A KATEGÓRIA NEM a varázslótól jön, hanem a KANONIKUS KÓDBÓL.
        // Korábban az `item.categoryId` ment MINDKÉT oldalra: egyszer `id_befizetescel`-ként,
        // egyszer `id_kiadascel`-ként. Ez KÉT KÜLÖN TÁBLA, KÉT KÜLÖN azonosító-térrel —
        // a bevétel-oldal vagy FK-hibára futott, vagy NÉMÁN teljesen más befizetési célra
        // mutatott. (A varázsló belső mozgásnál ráadásul MINDIG a kiadás-listát adja.)
        //
        // ⚠️ ÉS NEM az `isKasszaTarget`-ből döntünk, hanem a `counterpartBankId`-ből.
        // Miért: az `isKasszaTarget` az `item.transferTo`-ra épül, azt viszont a
        // `d.transferToKassza` zászlóból származtatja a varázsló — amit a TELJES
        // forrásban SEMMI nem állít be (nincs hozzá UI-kapcsoló). Így a `transferTo`
        // MINDIG `undefined`, az `isKasszaTarget` MINDIG `false`, miközben a
        // `counterpartBankId` ugyanott `null` — azaz a pénz VALÓJÁBAN a kasszába megy.
        // Az `isKasszaTarget`-re építve tehát bank↔bank kódot (402.02) írnánk egy
        // kassza-oldali sorra. A `counterpartBankId` az EGYETLEN megbízható jel:
        // az mondja meg, hova kerül ténylegesen a pár másik lába.
        const counterpartIsKassza = counterpartBankId === null
        const { bevKod, kiaKod } = belsoMozgasKodpar(counterpartIsKassza, isBankToKassza)

        // ── DEVIZA (2026-08-27) ───────────────────────────────────────────
        // A belső mozgás sorok EDDIG SEM kaptak `osszeg_ron`/`arfolyam` értéket
        // — a séma nem ad defaultot, tehát NULL maradt. A `calculateBalances`
        // `osszeg_ron ?? osszeg`-et számol, így devizás számlán a NYERS deviza-
        // összeg került lejként az egyenlegbe (1000 EUR → 1000 lej).
        //
        // A helyes modell (amit az egészség-ellenőrző MÁR MA IS elvár, lásd az
        // internal-movement-health.ts kereszt-devizás ágát): a két fél NYERS
        // összege KÜLÖNBÖZŐ, a RON-ekvivalensük viszont AZONOS.
        //   · bank-oldal: osszeg = a számla devizájában, osszeg_ron = átváltva
        //   · kassza-oldal: a kassza lejt tart → osszeg = osszeg_ron = a RON-érték
        const bmRon = computeOsszegRon(item)
        if (bmRon.unconverted) {
          result.errors.push({
            rowIndex: item.rowIndex,
            error:
              `Nincs ${bmRon.valuta} → RON árfolyam a ${item.date} dátumra, ezért ezt a belső ` +
              'mozgást nem tudjuk átvezetni — enélkül a kassza és a bank egyenlege elcsúszna. ' +
              'Add meg a bankszámla nyitó árfolyamát (vagy ellenőrizd a BNR-kapcsolatot), ' +
              'majd indítsd újra az importot erre a sorra.',
          })
          continue
        }
        // A counterpart deviza-neme: kassza = mindig RON; másik bankszámla = a sajátja.
        const cpValuta = counterpartBankId === null
          ? 'RON'
          : (bankValutaMap.get(counterpartBankId) || 'RON')
        if (cpValuta !== 'RON') {
          // Bank↔bank KÉT KÜLÖNBÖZŐ devizában: ehhez a fogadó számla saját napi
          // árfolyama kellene. Nem tippelünk — inkább kihagyjuk a sort.
          result.errors.push({
            rowIndex: item.rowIndex,
            error:
              `Ez az átvezetés két KÜLÖNBÖZŐ devizájú számla között menne (${cpValuta}), amit az ` +
              'import még nem tud helyesen átváltani. Rögzítsd kézzel a Tétel rögzítésével, ' +
              'hogy az árfolyam biztosan helyes legyen.',
          })
          continue
        }
        // A bank-oldal a saját devizájában, a counterpart (RON) a RON-értéken áll.
        const bmBankOsszeg = absAmount
        const bmCpOsszeg = bmRon.osszegRon
        const bmBevCelId = bmCelIds?.bev.get(bevKod) ?? null
        const bmKiaCelId = bmCelIds?.kia.get(kiaKod) ?? null
        if (bmBevCelId == null || bmKiaCelId == null) {
          result.errors.push({
            rowIndex: item.rowIndex,
            error:
              `Hiányzik a belső mozgás könyvelési célja (${bevKod} / ${kiaKod}) — a sort ` +
              'kihagytuk, hogy ne kerüljön be rossz kategóriával. Futtasd le a ' +
              '2026-06-10-belso-mozgas-kodok-INSTALL.sql-t, majd indítsd újra az importot.',
          })
          continue
        }

        // ── AKTÍV PÁROSÍTÁS ──
        // Kassza-célnál megnézzük: van-e MÁR egy párosítatlan kassza-oldali mozgás (a Kassza-import
        // hozta létre a 400.01/300.01 sort). Ha igen, annak az xkey-jét ÚJRAHASZNÁLJUK a banki sorhoz,
        // és NEM hozunk létre második kassza-oldalt → a pár teljes lesz, a piros jelzés eltűnik.
        let xkey: string = generateBelsoMozgasXkey()
        let counterpartAlreadyExists = false
        if (isKasszaTarget) {
          const counterpart = await findUnpairedCashCounterpart(supabase, congregationId, {
            side: counterpartSide,
            amount: absAmount,
            date: item.date,
          })
          // 2026-08-11 (5. kör): FAIL-CLOSED — ha a párosítás-keresés hibára fut,
          // NEM tippelünk „nincs pár"-ra (az új kassza-oldalt gyártana egy már
          // meglévő mellé), hanem kihagyjuk a sort a szokásos error-konvencióval.
          if ('error' in counterpart) {
            result.errors.push({
              rowIndex: item.rowIndex,
              error:
                `Nem sikerült megkeresni ennek a belső mozgásnak a kassza-oldali párját ` +
                `(${counterpart.error}), ezért a sort biztonságból KIHAGYTUK — így nem jön ` +
                'létre fölösleges második kassza-tétel. Ellenőrizd az internetkapcsolatot, ' +
                'és indítsd újra az importot ezekre a sorokra.',
            })
            continue
          }
          const existing = counterpart.match
          if (existing) {
            xkey = existing.xkey
            counterpartAlreadyExists = true
            const cpTable = counterpartSide === 'income' ? 'befizetes' : 'kiadas'
            await supabase
              .from(cpTable)
              .update({ megjegyzes: `✓ Banki párja egyeztetve (${item.date})` })
              .eq('id', existing.id)
              .eq('congregation_id', congregationId)
          }
        }

        // ── 1. Bank-oldali sor (az item.bankszamlaId számlán) ──
        if (bankSide === 'income') {
          const befPayload = {
            osszeg: bmBankOsszeg, datum: item.date,
            osszeg_ron: bmRon.osszegRon, arfolyam: bmRon.arfolyam,
            id_befizetescel: bmBevCelId,
            id_szemely: null, id_csalad: null,
            csalad: false, // 2026-07-10 (S4 #8): NOT NULL oszlop — enélkül elbukott
            forrasa: 'Belső mozgás — bankba',
            iratszam: docNumber, nyugta: docNumber,
            irattipus: 'banki', bankszamla_id: item.bankszamlaId,
            belso_mozgas_xkey: xkey,
            megjegyzes: item.megjegyzes || item.description,
            deleted: false, congregation_id: congregationId,
            fizetettev: Number(item.date.slice(0, 4)), is_potlas: false,
            xkey: generateXkey20(),
            userid: userId, // 2026-07-11 (S6): NOT NULL — enélkül elbukott
          }
          const ins = await supabase.from('befizetes').insert([befPayload]).select('id').single()
          if (ins.error) {
            result.errors.push({ rowIndex: item.rowIndex, error: `Bank oldal: ${ins.error.message}` })
            continue
          }
          result.importedRows.push({
            rowIndex: item.rowIndex,
            side: 'income',
            id: (ins.data?.id as number | undefined) ?? 0,
            iratszam: docNumber,
            bankszamlaId: item.bankszamlaId,
            date: item.date,
            amount: item.amount,
            // 2026-08-27: a TÉNYLEGESEN beszúrt cél megy vissza, nem a varázslóé —
            // ebből keresi ki a desktop Excel-write-through a kategória nevét.
            categoryId: bmBevCelId,
            counterparty: 'Belső mozgás — bankba',
            megjegyzes: item.megjegyzes || item.description || null,
          })
        } else {
          const insRes = await insertKiadas(
            supabase,
            {
              osszeg: bmBankOsszeg, datum: item.date,
              osszeg_ron: bmRon.osszegRon, arfolyam: bmRon.arfolyam,
              id_kiadascel: bmKiaCelId,
              iratszam: docNumber, irattipus: 'banki',
              bankszamla_id: item.bankszamlaId, belso_mozgas_xkey: xkey,
              megjegyzes: item.megjegyzes || item.description,
              deleted: false, congregation_id: congregationId,
            },
            'Belső mozgás — kasszába',
            userId,
          )
          if (insRes.error) {
            result.errors.push({ rowIndex: item.rowIndex, error: `Bank oldal: ${insRes.error.message}` })
            continue
          }
          result.importedRows.push({
            rowIndex: item.rowIndex,
            side: 'expense',
            id: insRes.id ?? 0,
            iratszam: docNumber,
            bankszamlaId: item.bankszamlaId,
            date: item.date,
            amount: item.amount,
            categoryId: bmKiaCelId,
            counterparty: 'Belső mozgás — kasszába',
            megjegyzes: item.megjegyzes || item.description || null,
          })
        }

        // ── 2. Counterpart-oldal — CSAK ha még nem létezik (aktív párosításnál kihagyjuk) ──
        if (!counterpartAlreadyExists) {
          const cpIrattipus = counterpartBankId === null ? 'készpénz' : 'banki'
          if (counterpartSide === 'income') {
            const befPayload = {
              osszeg: bmCpOsszeg, datum: item.date,
              osszeg_ron: bmRon.osszegRon, arfolyam: 1,
              id_befizetescel: bmBevCelId,
              id_szemely: null, id_csalad: null,
              csalad: false, // 2026-07-10 (S4 #8): NOT NULL oszlop — enélkül elbukott
              forrasa: isKasszaTarget ? 'Belső mozgás — bankból' : 'Belső mozgás — másik számláról',
              iratszam: docNumber, nyugta: docNumber,
              irattipus: cpIrattipus, bankszamla_id: counterpartBankId,
              belso_mozgas_xkey: xkey,
              megjegyzes: item.megjegyzes || item.description,
              deleted: false, congregation_id: congregationId,
              fizetettev: Number(item.date.slice(0, 4)), is_potlas: false,
              xkey: generateXkey20(),
              userid: userId, // 2026-07-11 (S6): NOT NULL — enélkül elbukott
            }
            const { error } = await supabase.from('befizetes').insert([befPayload])
            if (error) {
              result.errors.push({ rowIndex: item.rowIndex, error: `Másik oldal: ${error.message}` })
              continue
            }
          } else {
            const insRes = await insertKiadas(
              supabase,
              {
                osszeg: bmCpOsszeg, datum: item.date,
                osszeg_ron: bmRon.osszegRon, arfolyam: 1,
                id_kiadascel: bmKiaCelId,
                iratszam: docNumber, irattipus: cpIrattipus,
                bankszamla_id: counterpartBankId, belso_mozgas_xkey: xkey,
                megjegyzes: item.megjegyzes || item.description,
                deleted: false, congregation_id: congregationId,
              },
              isKasszaTarget ? 'Belső mozgás — bankba' : 'Belső mozgás — másik számlára',
              userId,
            )
            if (insRes.error) {
              result.errors.push({ rowIndex: item.rowIndex, error: `Másik oldal: ${insRes.error.message}` })
              continue
            }
          }
        }

        // 2026-07-10 (#3/B holtkód-tisztítás): a korábbi `belsomozgas` audit-insert
        // ELTÁVOLÍTVA. Bizonyítottan némán elbukott (a valós DB-ben 16 importált
        // belső mozgás után is 0 sor volt a táblában — az insert eredményét senki
        // nem ellenőrizte), és az új, egységes modellben redundáns is: a mozgás
        // KANONIKUS nyilvántartása a befizetes/kiadas pár közös belso_mozgas_xkey-vel.
        // A `belsomozgas` mester-tábla kizárólag a manuális valutacsere/bank_bank
        // mozgásoké (deviza-logika: bank-balance.ts). Így a törlés (xkey-páros)
        // sem hagyhat árva audit-sort.

        result.imported++
      }
    } catch (e) {
      result.errors.push({
        rowIndex: item.rowIndex,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // 2026-07-11 (S6): VISSZAMENŐLEGES rögzítés kezelése — ha egy KORÁBBI évre
  // importáltunk (pl. 2026-os költségvetési évben 2025-ös kivonatot), és a
  // KÖVETKEZŐ év nyitója korábban AUTOMATIKUSAN lett áthozva (forrasa =
  // 'carryover'), az az érték most elavult: újraszámoljuk a friss tavalyi
  // záróból. Kézzel rögzített ('manual') vagy importált ('import') nyitót
  // SOHA nem írunk felül. Best-effort: hibája nem buktatja az importot.
  if (result.imported > 0) {
    try {
      const touched = new Map<string, { bankszamlaId: number; changedYear: number }>()
      for (const row of result.importedRows) {
        const y = Number(String(row.date || '').slice(0, 4))
        if (!Number.isFinite(y) || y < 2000) continue
        const key = `${row.bankszamlaId}:${y}`
        if (!touched.has(key)) touched.set(key, { bankszamlaId: row.bankszamlaId, changedYear: y })
      }
      for (const t of touched.values()) {
        await refreshNextYearCarryoverUseCase({ congregationId, ...t }, ctx)
      }
    } catch {
      // Szándékosan némán — a nyitó-frissítés kényelmi lépés, az import már sikerült.
    }
  }

  return result
}
