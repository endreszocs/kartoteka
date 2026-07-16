/**
 * Bankszámla éves nyitó egyenleg use-case-ek (2026-06-12, Endre #4 bank-import).
 *
 * A webes `apps/web/app/(dashboard)/penzugy/bank-nyito-egyenleg-actions.ts`
 * három actionjének (get / upsert / checkYearStart) PONTOS portja, hogy a
 * desktop BCR-import wizard ugyanazt a logikát használja:
 *
 *   - a `bankszamla_nyito_egyenleg` tábla per-év nyitó egyenlegei,
 *   - valutás számláknál RON-ekvivalens + árfolyam,
 *   - év eleji állapot-ellenőrzés a KÖNYVELÉSI gyakorlat szerint (az
 *     FX revaluation DECEMBER 31-i dátummal — nem január 1-gyel).
 *
 * A web-oldali revalidatePath a WEB shim-ben marad — a core nem Next-függő.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import type { BankImportReadCtx, ImportBankTransactionsCtx } from './import-transactions'

/**
 * Egy bankszámla éves nyitó egyenlege a `bankszamla_nyito_egyenleg` táblából.
 * (Lokális definíció — a core nem importálhat a ui-app-ból; szerkezetileg
 * azonos a `@kartoteka/ui-app` NyitoEgyenlegRow-jával.)
 */
export interface NyitoEgyenlegRow {
  id: number
  bankszamla_id: number
  eve: number
  nyito_egyenleg_valuta: number
  nyito_egyenleg_ron: number
  arfolyam: number | null
  forrasa: 'manual' | 'import' | 'carryover'
  megjegyzes: string | null
  created_at: string
  updated_at: string
}

export interface UpsertNyitoEgyenlegInput {
  bankszamla_id: number
  eve: number
  nyito_egyenleg_valuta: number
  /** Ha nincs megadva, és a bankszámla RON, automatikusan az első értékkel egyenlő. */
  nyito_egyenleg_ron?: number | null
  /** Csak valutás számlához szükséges. */
  arfolyam?: number | null
  forrasa?: 'manual' | 'import' | 'carryover'
  megjegyzes?: string | null
}

// ─────────────────────────────────────────────────────────────
// 1. Lekérdezés
// ─────────────────────────────────────────────────────────────

export interface GetBankszamlaNyitoEgyenlegInput {
  congregationId: string
  bankszamlaId: number
  eve: number
}

/**
 * Egy bankszámla éves nyitó egyenlegének lekérdezése.
 */
export async function getBankszamlaNyitoEgyenlegUseCase(
  input: GetBankszamlaNyitoEgyenlegInput,
  ctx: BankImportReadCtx,
): Promise<{ data?: NyitoEgyenlegRow | null; error?: string }> {
  if (!input.congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data, error } = await ctx.supabase
    .from('bankszamla_nyito_egyenleg')
    .select('*')
    .eq('bankszamla_id', input.bankszamlaId)
    .eq('eve', input.eve)
    .eq('congregation_id', input.congregationId)
    .maybeSingle()

  if (error) return { error: error.message }
  return { data: (data as NyitoEgyenlegRow) ?? null }
}

// ─────────────────────────────────────────────────────────────
// 2. Upsert
// ─────────────────────────────────────────────────────────────

export interface UpsertBankszamlaNyitoEgyenlegInput extends UpsertNyitoEgyenlegInput {
  congregationId: string
}

/**
 * Nyitó egyenleg rögzítés / frissítés (upsert).
 *
 * Ha a bankszámla RON, a `nyito_egyenleg_ron` automatikusan egyenlő a
 * `nyito_egyenleg_valuta`-val. Ha valutás (EUR/HUF), a RON-t az
 * árfolyammal számoljuk (ha van) vagy a megadott értéket vesszük.
 */
export async function upsertBankszamlaNyitoEgyenlegUseCase(
  input: UpsertBankszamlaNyitoEgyenlegInput,
  ctx: ImportBankTransactionsCtx,
): Promise<{ success?: boolean; id?: number; error?: string }> {
  if (!ctx.userId) return { error: 'Nincs bejelentkezve.' }
  if (!input.congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const supabase: SupabaseClient = ctx.supabase

  // Kikérdezzük a bankszámla valutáját (RON vagy más)
  const { data: bs, error: bsErr } = await supabase
    .from('bankszamlak')
    .select('id, valuta, congregation_id')
    .eq('id', input.bankszamla_id)
    .eq('congregation_id', input.congregationId)
    .maybeSingle()

  if (bsErr) return { error: bsErr.message }
  if (!bs) return { error: 'A bankszámla nem található.' }

  const valuta = (bs.valuta as string) || 'RON'
  const isRon = valuta === 'RON'

  // Értékek validáció
  if (!Number.isFinite(input.nyito_egyenleg_valuta)) {
    return { error: 'Adj meg érvényes nyitó egyenleget a bankszámla valutájában.' }
  }

  let nyitoRon: number
  let arfolyam: number | null = null
  if (isRon) {
    nyitoRon = input.nyito_egyenleg_valuta
    arfolyam = 1
  } else {
    // Valutás: kötelező vagy az árfolyam + valuta-egyenleg, VAGY a RON érték
    if (typeof input.nyito_egyenleg_ron === 'number' && Number.isFinite(input.nyito_egyenleg_ron)) {
      nyitoRon = input.nyito_egyenleg_ron
      if (typeof input.arfolyam === 'number' && input.arfolyam > 0) {
        arfolyam = input.arfolyam
      } else if (input.nyito_egyenleg_valuta > 0) {
        arfolyam = Number((nyitoRon / input.nyito_egyenleg_valuta).toFixed(4))
      }
    } else if (typeof input.arfolyam === 'number' && input.arfolyam > 0) {
      nyitoRon = Number((input.nyito_egyenleg_valuta * input.arfolyam).toFixed(2))
      arfolyam = input.arfolyam
    } else {
      return { error: `Valutás (${valuta}) bankszámlánál adj meg vagy RON ekvivalenst vagy árfolyamot.` }
    }
  }

  const userId = ctx.userId
  const congregationId = input.congregationId

  // Upsert: meglévő van-e (bankszamla_id + eve)
  const { data: existing } = await supabase
    .from('bankszamla_nyito_egyenleg')
    .select('id')
    .eq('bankszamla_id', input.bankszamla_id)
    .eq('eve', input.eve)
    .eq('congregation_id', congregationId)
    .maybeSingle()

  const payload = {
    bankszamla_id: input.bankszamla_id,
    congregation_id: congregationId,
    eve: input.eve,
    nyito_egyenleg_valuta: input.nyito_egyenleg_valuta,
    nyito_egyenleg_ron: nyitoRon,
    arfolyam,
    forrasa: input.forrasa || 'manual',
    megjegyzes: input.megjegyzes?.trim() || null,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }

  if (existing) {
    const { error } = await supabase
      .from('bankszamla_nyito_egyenleg')
      .update(payload)
      .eq('id', existing.id)
    if (error) return { error: `Frissítés hiba: ${error.message}` }
    return { success: true, id: existing.id as number }
  }

  const { data: inserted, error } = await supabase
    .from('bankszamla_nyito_egyenleg')
    .insert({
      ...payload,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) return { error: `Rögzítés hiba: ${error.message}` }
  return { success: true, id: inserted?.id as number }
}

// ─────────────────────────────────────────────────────────────
// 3. Év eleji ellenőrzés — a KÖNYVELÉSI gyakorlatnak megfelelően.
//
// FONTOS: a román (OMFP 1802/2014) és magyar egyházi számvitel szerint
// az árfolyam-nyereség/veszteség könyvelése DECEMBER 31-I dátummal
// történik (év végi FX revaluation), NEM január 1-gyel.
//
// Az új év január 1. nyitó RON egyenlege = az előző év december 31-i
// ÁTÉRTÉKELT záró RON = valuta × dec. 31. BNR árfolyam.
// Mivel a január 1-i árfolyam ugyanez, nincs új FX tranzakció.
//
// Ez az ellenőrzés megnézi, hogy az előző évi FX revaluation
// MEGTÖRTÉNT-e (`valuta_atert` tábla). Ha nem, figyelmeztet, és a
// lelkészt a meglévő FX revaluation dialoghoz irányítja.
// ─────────────────────────────────────────────────────────────

export interface YearStartCheckResult {
  /** Bankszámla valutája (EUR/HUF/RON stb). RON esetén nincs FX ellenőrzés. */
  valuta: string
  /** Van-e rögzített előző évi nyitó egyenleg (a lelkész importált-e). */
  hasPreviousYear: boolean
  /** Van-e december 31-re rögzített FX revaluation (valuta_atert tábla). */
  hasPreviousYearFxRevaluation: boolean
  /** Az előző év záró valuta egyenlege (a revaluation alapján). */
  prevYearClosingValuta: number | null
  /** Az előző év december 31-i ÁTÉRTÉKELT záró RON (= január 1. nyitó RON). */
  prevYearRevaluedRon: number | null
  /** Az előző év használt záró BNR árfolyama. */
  prevYearArfolyam: number | null
  /** Az új évre megadott valuta-egyenleg (wizard input). */
  newYearValuta: number
  /** Az új évre megadott árfolyam. */
  newYearArfolyam: number
  /** Az új évre számolt RON = valuta × árfolyam. */
  newYearRon: number
  /** A status összegzés — UI-hoz. */
  status:
    | 'ok_matching'        // ✅ Előző évi FX revaluation meg van, egyenlegek egyeznek
    | 'ok_no_previous'     // ⚪ Nincs előző évi rekord, ez egy új bankszámla
    | 'fx_revaluation_needed' // 🟡 Kell még az előző évi FX revaluation dec 31-re
    | 'arfolyam_mismatch'  // 🟠 Az új árfolyam eltér az előző évi záró árfolyamtól
  /** Részletes üzenet a UI-hoz. */
  message: string
  /** Ha status='arfolyam_mismatch': a különbség RON-ban (csak tájékoztató). */
  mismatchDiff: number | null
}

export interface CheckYearStartStateInput {
  congregationId: string
  bankszamlaId: number
  eve: number
  newYearValuta: number
  newYearArfolyam: number
}

/**
 * Év eleji állapot ellenőrzés — a könyvelési gyakorlatnak megfelelően.
 *
 * NEM számolunk FX különbséget januárra! A helyes könyvelés:
 *   1. December 31-én FX revaluation (már meglévő `FxRevaluationDialog`)
 *   2. A december 31-i átértékelt RON = január 1-i nyitó RON (= ugyanaz)
 *   3. Nincs új FX tranzakció január 1-re
 *
 * Ez a függvény azt ellenőrzi, hogy:
 *   - Van-e előző évi rögzített nyitó egyenleg
 *   - MEG VAN-E az előző évre az FX revaluation (`valuta_atert` táblában)
 *   - Az új árfolyam egyezik-e a december 31-i használt árfolyammal
 */
// ─────────────────────────────────────────────────────────────
// 4. Automatikus áthozás (carryover) az előző évből — 2026-07-10 (Endre).
//
// Ha az ELŐZŐ évben már volt import / könyvelt banki forgalom ezen a
// számlán, az új év nyitó egyenlege NEM kézi adat: a tavalyi záró.
//   RON számla:  záró = tavalyi nyitó (nyito_egyenleg_ron)
//                       + tavalyi banki bevételek − tavalyi banki kiadások
//                (storno + deleted kizárva; a belső mozgás bank-lába
//                 BELESZÁMÍT — pontosan úgy, ahogy a BankTab és a
//                 carryoverBank számol, lásd helpers.calculateBalances)
//   Valutás:     a hiteles záró a december 31-i FX ÁTÉRTÉKELÉS
//                (valuta_atert): deviza_egyenleg + uj_ron_ertek + uj_arfolyam.
//                Ha az átértékelés még hiányzik, a deviza-összeget a
//                forgalomból számoljuk elő (RON-t nem — azt az átértékelés
//                adja), és a wizard a meglévő fx_revaluation_needed úton
//                tereli a felhasználót.
// A `bankszamla_nyito_egyenleg.forrasa='carryover'` érték kezdettől létezik
// a CHECK-ben — ez a use-case tölti ki először.
// ─────────────────────────────────────────────────────────────

export interface CarryoverNyitoResult {
  /** Van-e automatikusan áthozható nyitó egyenleg. */
  available: boolean
  /** Ha nem: miért. */
  reason?: 'no_prev_data' | 'missing_prev_nyito' | 'fx_revaluation_needed'
  /** A cél (új) év. */
  eve: number
  prevYear: number
  valuta: string
  /** Az áthozott nyitó a számla valutájában (RON számlán = RON). */
  nyitoValuta?: number
  /** Az áthozott nyitó RON-ban (valutásnál az átértékelt záró RON). */
  nyitoRon?: number
  arfolyam?: number | null
  /** Részletezés a UI-nak: tavalyi nyitó + forgalom. */
  prevNyito?: number
  prevBevetel?: number
  prevKiadas?: number
  prevTetelDb?: number
  /** fx_revaluation_needed esetén: a forgalomból előszámolt deviza-záró (segéd-előtöltés). */
  fallbackValuta?: number
}

export interface ComputeCarryoverNyitoInput {
  congregationId: string
  bankszamlaId: number
  /** A cél (új) év — az előző év (eve-1) adataiból számolunk. */
  eve: number
}

/**
 * Egy számla előző évi banki forgalmának összegzése lapozva (1000/lap),
 * hogy nagy forgalmú év se csonkuljon a PostgREST sor-limitje miatt.
 * A `kiadas.datum` timestamp, a `befizetes.datum` date — mindkettőre a
 * fél-nyílt [jan 1, köv. év jan 1) tartomány helyes.
 */
async function sumBankForgalom(
  supabase: SupabaseClient,
  table: 'befizetes' | 'kiadas',
  congregationId: string,
  bankszamlaId: number,
  year: number,
): Promise<{ osszeg: number; db: number } | { error: string }> {
  const from = `${year}-01-01`
  const to = `${year + 1}-01-01`
  let osszeg = 0
  let db = 0
  const PAGE = 1000
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from(table)
      .select('osszeg')
      .eq('congregation_id', congregationId)
      .eq('bankszamla_id', bankszamlaId)
      .eq('deleted', false)
      .eq('stornozott', false)
      .gte('datum', from)
      .lt('datum', to)
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) return { error: error.message }
    const rows = (data || []) as Array<{ osszeg: number | string | null }>
    for (const r of rows) osszeg += Number(r.osszeg) || 0
    db += rows.length
    if (rows.length < PAGE) break
  }
  return { osszeg, db }
}

/**
 * Előző évi záróból számolt nyitó egyenleg az új évre — CSAK számol,
 * nem ír semmit. A mentés a meglévő upsert-tel történik (forrasa:'carryover').
 */
export async function computeCarryoverNyitoEgyenlegUseCase(
  input: ComputeCarryoverNyitoInput,
  ctx: BankImportReadCtx,
): Promise<{ data?: CarryoverNyitoResult; error?: string }> {
  if (!input.congregationId) return { error: 'Nincs aktív gyülekezet.' }
  const prevYear = input.eve - 1
  const base: Pick<CarryoverNyitoResult, 'eve' | 'prevYear'> = {
    eve: input.eve,
    prevYear,
  }

  const { data: bs, error: bsErr } = await ctx.supabase
    .from('bankszamlak')
    .select('valuta')
    .eq('id', input.bankszamlaId)
    .eq('congregation_id', input.congregationId)
    .maybeSingle()
  if (bsErr) return { error: bsErr.message }
  if (!bs) return { error: 'A bankszámla nem található.' }
  const valuta = (bs.valuta as string) || 'RON'

  // Előző évi nyitó rekord + forgalom — párhuzamosan.
  const [prevNyitoRes, bevRes, kiadRes] = await Promise.all([
    ctx.supabase
      .from('bankszamla_nyito_egyenleg')
      .select('nyito_egyenleg_valuta, nyito_egyenleg_ron')
      .eq('bankszamla_id', input.bankszamlaId)
      .eq('congregation_id', input.congregationId)
      .eq('eve', prevYear)
      .maybeSingle(),
    sumBankForgalom(ctx.supabase, 'befizetes', input.congregationId, input.bankszamlaId, prevYear),
    sumBankForgalom(ctx.supabase, 'kiadas', input.congregationId, input.bankszamlaId, prevYear),
  ])
  if (prevNyitoRes.error) return { error: prevNyitoRes.error.message }
  if ('error' in bevRes) return { error: bevRes.error }
  if ('error' in kiadRes) return { error: kiadRes.error }

  const prevNyitoRow = prevNyitoRes.data as
    | { nyito_egyenleg_valuta: number | string; nyito_egyenleg_ron: number | string }
    | null
  const prevTetelDb = bevRes.db + kiadRes.db

  // Semmi tavalyi adat → első import, marad a kézi megadás.
  if (!prevNyitoRow && prevTetelDb === 0) {
    return { data: { ...base, available: false, reason: 'no_prev_data', valuta } }
  }

  if (valuta !== 'RON') {
    // Valutás számla: a hiteles záró a december 31-i átértékelés.
    const { data: fxReval, error: fxErr } = await ctx.supabase
      .from('valuta_atert')
      .select('deviza_egyenleg, uj_arfolyam, uj_ron_ertek')
      .eq('bankszamla_id', input.bankszamlaId)
      .eq('congregation_id', input.congregationId)
      .eq('ev', prevYear)
      .eq('deleted', false)
      .order('arfolyam_datum', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fxErr) return { error: fxErr.message }

    if (fxReval) {
      return {
        data: {
          ...base,
          available: true,
          valuta,
          nyitoValuta: Number(fxReval.deviza_egyenleg),
          nyitoRon: Number(fxReval.uj_ron_ertek),
          arfolyam: Number(fxReval.uj_arfolyam),
          prevTetelDb,
        },
      }
    }
    // Nincs még átértékelés → a deviza-összeget előszámoljuk segítségnek.
    const fallbackValuta =
      prevNyitoRow != null
        ? Number(
            (Number(prevNyitoRow.nyito_egyenleg_valuta) + bevRes.osszeg - kiadRes.osszeg).toFixed(2),
          )
        : undefined
    return {
      data: {
        ...base,
        available: false,
        reason: 'fx_revaluation_needed',
        valuta,
        fallbackValuta,
        prevTetelDb,
      },
    }
  }

  // RON számla: záró = tavalyi nyitó + bevételek − kiadások.
  if (!prevNyitoRow) {
    // Volt tavalyi forgalom, de nincs rögzített tavalyi nyitó → nincs bázis.
    return {
      data: { ...base, available: false, reason: 'missing_prev_nyito', valuta, prevTetelDb },
    }
  }
  const prevNyito = Number(prevNyitoRow.nyito_egyenleg_ron)
  const zaro = Number((prevNyito + bevRes.osszeg - kiadRes.osszeg).toFixed(2))
  return {
    data: {
      ...base,
      available: true,
      valuta,
      nyitoValuta: zaro,
      nyitoRon: zaro,
      arfolyam: 1,
      prevNyito,
      prevBevetel: Number(bevRes.osszeg.toFixed(2)),
      prevKiadas: Number(kiadRes.osszeg.toFixed(2)),
      prevTetelDb,
    },
  }
}

/**
 * 2026-07-11 (S6): egy számla KÖVETKEZŐ évi nyitójának frissítése, HA az
 * automatikusan áthozott ('carryover') — visszamenőleges rögzítés után az
 * elavul. Kézzel rögzített ('manual') vagy importált ('import') nyitót SOHA
 * nem ír felül. Best-effort: a hívó ne bukjon el rajta.
 */
export async function refreshNextYearCarryoverUseCase(
  input: { congregationId: string; bankszamlaId: number; changedYear: number },
  ctx: ImportBankTransactionsCtx,
): Promise<{ refreshed: boolean }> {
  const nextYear = input.changedYear + 1
  const { data: nextNyito } = await ctx.supabase
    .from('bankszamla_nyito_egyenleg')
    .select('id, forrasa')
    .eq('bankszamla_id', input.bankszamlaId)
    .eq('congregation_id', input.congregationId)
    .eq('eve', nextYear)
    .maybeSingle()
  if (!nextNyito || (nextNyito as { forrasa: string }).forrasa !== 'carryover') {
    return { refreshed: false }
  }
  const carry = await computeCarryoverNyitoEgyenlegUseCase(
    { congregationId: input.congregationId, bankszamlaId: input.bankszamlaId, eve: nextYear },
    ctx,
  )
  if (!carry.data?.available || typeof carry.data.nyitoValuta !== 'number') {
    return { refreshed: false }
  }
  const res = await upsertBankszamlaNyitoEgyenlegUseCase(
    {
      congregationId: input.congregationId,
      bankszamla_id: input.bankszamlaId,
      eve: nextYear,
      nyito_egyenleg_valuta: carry.data.nyitoValuta,
      nyito_egyenleg_ron: typeof carry.data.nyitoRon === 'number' ? carry.data.nyitoRon : null,
      arfolyam: typeof carry.data.arfolyam === 'number' ? carry.data.arfolyam : null,
      forrasa: 'carryover',
      megjegyzes: `Automatikusan újraszámolva a ${input.changedYear}. évi visszamenőleges rögzítés után.`,
    },
    ctx,
  )
  return { refreshed: !!res.success }
}

export async function checkYearStartStateUseCase(
  input: CheckYearStartStateInput,
  ctx: BankImportReadCtx,
): Promise<{ data?: YearStartCheckResult; error?: string }> {
  if (!input.congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data: bs } = await ctx.supabase
    .from('bankszamlak')
    .select('valuta')
    .eq('id', input.bankszamlaId)
    .eq('congregation_id', input.congregationId)
    .maybeSingle()
  if (!bs) return { error: 'A bankszámla nem található.' }

  const valuta = (bs.valuta as string) || 'RON'
  const prevYear = input.eve - 1
  const newYearRon = Number((input.newYearValuta * input.newYearArfolyam).toFixed(2))

  // 1) Van-e előző évi nyitó egyenleg rekord?
  const { data: prevNyito } = await ctx.supabase
    .from('bankszamla_nyito_egyenleg')
    .select('nyito_egyenleg_ron')
    .eq('bankszamla_id', input.bankszamlaId)
    .eq('congregation_id', input.congregationId)
    .eq('eve', prevYear)
    .maybeSingle()
  const hasPreviousYear = !!prevNyito

  // 2) Van-e előző évi FX revaluation (`valuta_atert`)?
  const { data: fxReval } = await ctx.supabase
    .from('valuta_atert')
    .select('deviza_egyenleg, uj_arfolyam, uj_ron_ertek, arfolyam_datum')
    .eq('bankszamla_id', input.bankszamlaId)
    .eq('congregation_id', input.congregationId)
    .eq('ev', prevYear)
    .eq('deleted', false)
    .order('arfolyam_datum', { ascending: false })
    .limit(1)
    .maybeSingle()

  const hasPreviousYearFxRevaluation = !!fxReval
  const prevYearClosingValuta = fxReval ? Number(fxReval.deviza_egyenleg) : null
  const prevYearRevaluedRon = fxReval ? Number(fxReval.uj_ron_ertek) : null
  const prevYearArfolyam = fxReval ? Number(fxReval.uj_arfolyam) : null

  // Eredmény státusz meghatározása
  let status: YearStartCheckResult['status'] = 'ok_no_previous'
  let message = ''
  let mismatchDiff: number | null = null

  if (!hasPreviousYear) {
    status = 'ok_no_previous'
    message = 'Ez új bankszámla vagy első import — nincs előző évi adat. Csak a januári nyitó egyenleg kerül rögzítésre.'
  } else if (valuta === 'RON') {
    status = 'ok_matching'
    message = 'RON bankszámla: nincs FX revaluation szükséges.'
  } else if (!hasPreviousYearFxRevaluation) {
    status = 'fx_revaluation_needed'
    message =
      `A ${prevYear}. évi FX revaluation MÉG NEM történt meg ezen a bankszámlán. ` +
      `A könyvelési gyakorlat szerint az árfolyam-nyereséget/veszteséget DECEMBER 31-I dátummal kell könyvelni (nem január 1-i). ` +
      `Nyisd meg a Pénzügy → Bank fülön az „Évvégi átértékelés" gombot a ${prevYear}. évre, majd térj vissza ide.`
  } else {
    // Van FX revaluation — ellenőrizzük az árfolyam-egyezést
    if (prevYearArfolyam == null) {
      status = 'ok_matching'
      message = 'Az előző évi FX revaluation megtörtént, a nyitó egyenleg rögzíthető.'
    } else {
      const arfolyamDiff = Math.abs(input.newYearArfolyam - prevYearArfolyam)
      if (arfolyamDiff > 0.005) {
        status = 'arfolyam_mismatch'
        mismatchDiff = Number(((input.newYearValuta * input.newYearArfolyam) - (prevYearClosingValuta! * prevYearArfolyam)).toFixed(2))
        message =
          `Az új év megadott árfolyama (${input.newYearArfolyam}) eltér a ${prevYear}. december 31-i FX revaluation-nál használtól (${prevYearArfolyam}). ` +
          `A könyvelési gyakorlat szerint az új év január 1. nyitó árfolyama = előző év december 31. záró árfolyam (ugyanaz a nap). ` +
          `Ellenőrizd: vagy az előző évi FX revaluation árfolyama pontos (és az új árfolyam is azt kell legyen), vagy az új év egy friss BNR árfolyamot kér.`
      } else {
        status = 'ok_matching'
        message =
          `✅ Az előző (${prevYear}.) év FX revaluation-ja megtörtént, az új év nyitó árfolyama egyezik a december 31-i záró árfolyammal. ` +
          `A január 1. RON nyitó egyenleg ugyanaz, mint a december 31. átértékelt záró — nincs új FX tranzakció szükséges.`
      }
    }
  }

  return {
    data: {
      valuta,
      hasPreviousYear,
      hasPreviousYearFxRevaluation,
      prevYearClosingValuta,
      prevYearRevaluedRon,
      prevYearArfolyam,
      newYearValuta: input.newYearValuta,
      newYearArfolyam: input.newYearArfolyam,
      newYearRon,
      status,
      message,
      mismatchDiff,
    },
  }
}
