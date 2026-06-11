/**
 * updateTransactionUseCase + isLastTransactionOfTypeUseCase — C-hullám C1c (2026-06-10).
 *
 * A web `updateTransactionBasic` / `isLastTransactionOfType`
 * (apps/web/app/(dashboard)/penzugy/edit-storno-actions.ts) PONTOS tükre a
 * gyülekezeti (congregation) scope-ra — hogy az asztali Kassza-fül szerkesztője
 * azonosan viselkedjen a webbel.
 *
 * Szerkeszthető mezők (a Kassza-fül gyors szerkesztője): dátum, összeg, jogcím
 * (kategória), iratszám, megjegyzés. (Partner — személy/család — itt NEM; ahhoz
 * a webbel egyezően stornózni + újrarögzíteni kell.)
 *
 * Védelmek (mint a web):
 *   - DÁTUM csak az éven belüli UTOLSÓ (azonos típusú) tételnél módosítható
 *     (kronológia + iratszám-sorrend védelme) → `isLastTransactionOfTypeUseCase`.
 *   - Véglegesített (számadás lezárva) évre a módosítás blokkolva.
 *   - Belső mozgás (kassza↔bank) sor NEM szerkeszthető — a hívó (CashbookTab)
 *     a szerkesztés gombot eleve elrejti a `isBm` soroknál.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type UpdateTransactionType = 'befizetes' | 'kiadas'

export interface UpdateTransactionInput {
  congregationId: string
  type: UpdateTransactionType
  id: number
  /** Csak akkor küldd, ha módosítható (az év utolsó tétele) — egyébként marad. */
  datum?: string
  osszeg?: number
  megjegyzes?: string | null
  /** Jogcím: befizetes → id_befizetescel, kiadas → id_kiadascel. */
  id_cel?: number | null
  iratszam?: string | null
  /** Csak befizetésnél értelmezett (partner-mezők — a Kassza szerkesztő nem küldi). */
  id_szemely?: number | null
  id_csalad?: number | null
  forrasa?: string | null
}

export interface UpdateTransactionCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  userId: string
}

export type UpdateTransactionResult =
  | { success: true }
  | {
      success: false
      error: string
      /** Az év számadása véglegesítve — blokkolva. */
      yearFinalized?: boolean
      /** Nem adtál meg módosítandó mezőt. */
      noChange?: boolean
    }

/**
 * Év-véglegesítés check a `bealitas` táblán (id = év stringként). Megegyezik a
 * `befizetes/storno.ts` és az `undo-storno.ts` helperével.
 */
async function isYearFinalized(
  supabase: SupabaseClient,
  congregationId: string,
  year: number,
): Promise<boolean> {
  const { data } = await supabase
    .from('bealitas')
    .select('accounting_finalized')
    .eq('congregation_id', congregationId)
    .eq('id', String(year))
    .maybeSingle()
  if (!data) return false
  return Boolean((data as { accounting_finalized?: boolean }).accounting_finalized)
}

// ─────────────────────────────────────────────────────────────────────────
// isLastTransactionOfTypeUseCase — a dátum-szerkeszthetőség eldöntéséhez
// ─────────────────────────────────────────────────────────────────────────

export interface IsLastTransactionInput {
  congregationId: string
  type: UpdateTransactionType
  id: number
}

export interface IsLastTransactionCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type IsLastTransactionResult = { isLast: boolean; error?: string }

/**
 * Megmondja, hogy a tétel az ADOTT TÍPUSÚ utolsó-e az évében + gyülekezetben.
 * A dátum-szerkesztést csak az utolsó tételre engedjük — köztes dátum
 * elrontaná a kronológiát és a nyugtaszámozást.
 */
export async function isLastTransactionOfTypeUseCase(
  input: IsLastTransactionInput,
  ctx: IsLastTransactionCtx,
): Promise<IsLastTransactionResult> {
  if (input.type !== 'befizetes' && input.type !== 'kiadas') {
    return { isLast: false, error: 'Érvénytelen tétel-típus.' }
  }
  const table = input.type === 'befizetes' ? 'befizetes' : 'kiadas'

  try {
    const { data: current } = await ctx.supabase
      .from(table)
      .select('datum')
      .eq('id', input.id)
      .eq('congregation_id', input.congregationId)
      .maybeSingle()

    const datum = (current as { datum?: string } | null)?.datum
    if (!datum) return { isLast: false }

    const year = new Date(datum).getFullYear()
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const { data: later } = await ctx.supabase
      .from(table)
      .select('id')
      .eq('congregation_id', input.congregationId)
      .eq('deleted', false)
      .gt('datum', datum)
      .lte('datum', yearEnd)
      .gte('datum', yearStart)
      .limit(1)

    return { isLast: !later || later.length === 0 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { isLast: false, error: `Ellenőrzési hiba: ${msg}` }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// updateTransactionUseCase — a tényleges módosítás
// ─────────────────────────────────────────────────────────────────────────

export async function updateTransactionUseCase(
  input: UpdateTransactionInput,
  ctx: UpdateTransactionCtx,
): Promise<UpdateTransactionResult> {
  // Alap-validálás
  if (!input.congregationId || typeof input.congregationId !== 'string') {
    return { success: false, error: 'Hiányzó gyülekezet-azonosító.' }
  }
  if (input.type !== 'befizetes' && input.type !== 'kiadas') {
    return { success: false, error: 'Érvénytelen tétel-típus.' }
  }
  if (!Number.isInteger(input.id) || input.id <= 0) {
    return { success: false, error: 'Érvénytelen tétel-azonosító.' }
  }
  if (input.osszeg !== undefined && (!Number.isFinite(input.osszeg) || input.osszeg <= 0)) {
    return { success: false, error: 'Az összeg pozitív szám legyen.' }
  }

  const table = input.type === 'befizetes' ? 'befizetes' : 'kiadas'
  const nowIso = new Date().toISOString()

  // Véglegesített év védelme (ha a dátum változik)
  if (input.datum) {
    const year = new Date(input.datum).getFullYear()
    const finalized = await isYearFinalized(ctx.supabase, input.congregationId, year)
    if (finalized) {
      return {
        success: false,
        error: `A ${year}. évi számadás már véglegesítve van. Először kérj javítási engedélyt az egyházmegyétől.`,
        yearFinalized: true,
      }
    }
  }

  // Csak a megadott mezőket írjuk
  const updateData: Record<string, unknown> = {}
  if (input.datum !== undefined) updateData.datum = input.datum
  if (input.osszeg !== undefined) updateData.osszeg = input.osszeg
  if (input.megjegyzes !== undefined) updateData.megjegyzes = input.megjegyzes?.trim() || null
  if (input.iratszam !== undefined) updateData.iratszam = input.iratszam?.trim() || null
  if (input.id_cel !== undefined) {
    if (input.type === 'befizetes') updateData.id_befizetescel = input.id_cel
    else updateData.id_kiadascel = input.id_cel
  }
  // Partner-mezők csak befizetésnél (a Kassza szerkesztő nem küldi, de a use-case támogatja)
  if (input.type === 'befizetes') {
    if (input.id_szemely !== undefined) updateData.id_szemely = input.id_szemely
    if (input.id_csalad !== undefined) updateData.id_csalad = input.id_csalad
    if (input.forrasa !== undefined) updateData.forrasa = input.forrasa?.trim() || null
  }
  updateData.updated_at = nowIso

  // Ha csak az updated_at van → nincs valódi módosítás
  if (Object.keys(updateData).length === 1) {
    return { success: false, error: 'Nem adtál meg módosítandó mezőt.', noChange: true }
  }

  try {
    const { error } = await ctx.supabase
      .from(table)
      .update(updateData)
      .eq('id', input.id)
      .eq('congregation_id', input.congregationId)

    if (error) {
      return { success: false, error: `Mentés sikertelen: ${error.message}` }
    }
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Mentési hiba: ${msg}` }
  }
}
