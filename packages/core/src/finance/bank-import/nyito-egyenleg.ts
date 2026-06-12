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
