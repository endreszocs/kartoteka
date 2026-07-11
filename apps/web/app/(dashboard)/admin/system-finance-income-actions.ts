'use server'

/**
 * Admin → Rendszer pénzügyei: BEVÉTEL-könyvelés (system_finance_income).
 *
 * A "személyre szabott könyvelés" bevétel-oldala — a kiadás a meglévő
 * system_finance_costs. Ide kerül minden bevétel: előfizetési díj-befizetés,
 * egyszeri kifizetés, adomány, speciális igény felára.
 *
 * Jogosultság: csak rendszer-szintű admin (a system-finance-actions.ts guard
 * mintája). RON-tól eltérő pénznem esetén az osszeg_ron-t a getFxRates valós
 * árfolyamával számoljuk mentéskor (az arfolyam mezőbe is eltéve).
 *
 * ELLENÁLLÓ: ha a system_finance_income tábla még nem létezik (a 2026-07-11
 * migráció nem futott), világos hibaüzenet, nem 500.
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getFxRates } from './system-finance-actions'

// ─────────────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────────────

export type IncomeCategory = 'elofizetes' | 'egyszeri' | 'adomany' | 'felar' | 'egyeb'

const VALID_CATEGORIES: IncomeCategory[] = ['elofizetes', 'egyszeri', 'adomany', 'felar', 'egyeb']

export interface SystemIncomeRow {
  id: number
  /** NULL = nem gyülekezethez kötött általános bevétel/adomány. */
  congregation_id: string | null
  congregation_name: string | null
  kategoria: IncomeCategory
  megnevezes: string | null
  osszeg: number
  penznem: string
  arfolyam: number | null
  osszeg_ron: number | null
  datum: string
  megjegyzes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SystemIncomeFilter {
  congregationId?: string | null
  kategoria?: IncomeCategory
  /** Dátum-tól (inkluzív, 'YYYY-MM-DD'). */
  from?: string
  /** Dátum-ig (inkluzív, 'YYYY-MM-DD'). */
  to?: string
}

export interface UpsertSystemIncomeInput {
  id?: number
  congregation_id?: string | null
  kategoria: IncomeCategory
  megnevezes?: string | null
  osszeg: number
  penznem?: string
  /** Kézi árfolyam-felülírás; ha nincs, a getFxRates-ből számoljuk. */
  arfolyam?: number | null
  datum?: string
  megjegyzes?: string | null
}

const INCOME_TABLE = 'system_finance_income'
const MIGRATION_HINT =
  'A system_finance_income tábla még nem létezik — futtasd a migration-docs/sql/2026-07-11-system-finance-income.sql migrációt.'

// ─────────────────────────────────────────────────────────────────────────
// Jogosultság + hibafelismerés
// ─────────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' as const }
  if (!access.admin && !access.master) {
    return { error: 'Csak rendszergazda férhet hozzá.' as const }
  }
  return { supabase: access.supabase, userId: access.user.id }
}

function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  return error.code === '42P01' || (msg.includes('relation') && msg.includes('does not exist'))
}

// ─────────────────────────────────────────────────────────────────────────
// Árfolyam-konverzió (RON-ra)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Az adott pénznem → RON árfolyam meghatározása:
 *   - RON → 1;
 *   - explicit `arfolyam` felülírás → azt használjuk;
 *   - különben a getFxRates valós árfolyamából (USD/EUR/HUF);
 *   - ismeretlen pénznem árfolyam nélkül → null (nem konvertálható).
 */
async function resolveArfolyam(
  penznem: string,
  explicit: number | null | undefined,
): Promise<number | null> {
  if (penznem === 'RON') return 1
  if (explicit != null && Number.isFinite(Number(explicit)) && Number(explicit) > 0) {
    return Number(explicit)
  }
  const fx = await getFxRates()
  const rates = fx.data
  if (!rates) return null
  switch (penznem) {
    case 'USD':
      return rates.usd_ron > 0 ? rates.usd_ron : null
    case 'EUR':
      return rates.eur_ron > 0 ? rates.eur_ron : null
    case 'HUF':
      return rates.huf_ron > 0 ? rates.huf_ron : null
    default:
      return null
  }
}

// ─────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────

export async function listSystemIncome(
  filter?: SystemIncomeFilter,
): Promise<{ data?: SystemIncomeRow[]; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  let query = ctx.supabase
    .from(INCOME_TABLE)
    .select('*, congregations(name)')
    .order('datum', { ascending: false })
    .order('id', { ascending: false })

  if (filter?.congregationId) query = query.eq('congregation_id', filter.congregationId)
  if (filter?.kategoria) query = query.eq('kategoria', filter.kategoria)
  if (filter?.from) query = query.gte('datum', filter.from)
  if (filter?.to) query = query.lte('datum', filter.to)

  const { data, error } = await query
  if (error) {
    if (isMissingRelationError(error)) return { data: [] }
    return { error: error.message }
  }

  const rows: SystemIncomeRow[] = (data || []).map((r: Record<string, unknown>) => {
    const cong = r['congregations'] as { name?: string } | null
    return {
      id: Number(r['id']),
      congregation_id: (r['congregation_id'] as string | null) ?? null,
      congregation_name: cong?.name ?? null,
      kategoria: (r['kategoria'] as IncomeCategory) ?? 'egyeb',
      megnevezes: (r['megnevezes'] as string | null) ?? null,
      osszeg: Number(r['osszeg']) || 0,
      penznem: (r['penznem'] as string) ?? 'RON',
      arfolyam: r['arfolyam'] != null ? Number(r['arfolyam']) : null,
      osszeg_ron: r['osszeg_ron'] != null ? Number(r['osszeg_ron']) : null,
      datum: (r['datum'] as string) ?? '',
      megjegyzes: (r['megjegyzes'] as string | null) ?? null,
      created_by: (r['created_by'] as string | null) ?? null,
      created_at: (r['created_at'] as string) ?? '',
      updated_at: (r['updated_at'] as string) ?? '',
    }
  })
  return { data: rows }
}

export async function upsertSystemIncome(
  input: UpsertSystemIncomeInput,
): Promise<{ id?: number; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  if (!VALID_CATEGORIES.includes(input.kategoria)) {
    return { error: 'Érvénytelen kategória.' }
  }
  const osszeg = Number(input.osszeg)
  if (!Number.isFinite(osszeg)) {
    return { error: 'Az összeg érvényes szám kell legyen.' }
  }

  const penznem = (input.penznem || 'RON').toUpperCase()
  const arfolyam = await resolveArfolyam(penznem, input.arfolyam)
  const osszeg_ron = arfolyam != null ? Math.round(osszeg * arfolyam * 100) / 100 : null

  const payload: Record<string, unknown> = {
    congregation_id: input.congregation_id ?? null,
    kategoria: input.kategoria,
    megnevezes: input.megnevezes ?? null,
    osszeg,
    penznem,
    arfolyam,
    osszeg_ron,
    datum: input.datum ?? new Date().toISOString().slice(0, 10),
    megjegyzes: input.megjegyzes ?? null,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { error } = await ctx.supabase.from(INCOME_TABLE).update(payload).eq('id', input.id)
    if (error) {
      if (isMissingRelationError(error)) return { error: MIGRATION_HINT }
      return { error: error.message }
    }
    revalidatePath('/admin')
    return { id: input.id }
  }

  const { data, error } = await ctx.supabase
    .from(INCOME_TABLE)
    .insert([{ ...payload, created_by: ctx.userId }])
    .select('id')
    .single()
  if (error) {
    if (isMissingRelationError(error)) return { error: MIGRATION_HINT }
    return { error: error.message }
  }
  revalidatePath('/admin')
  return { id: (data as { id: number }).id }
}

export async function deleteSystemIncome(id: number): Promise<{ error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }
  const { error } = await ctx.supabase.from(INCOME_TABLE).delete().eq('id', id)
  if (error) {
    if (isMissingRelationError(error)) return { error: MIGRATION_HINT }
    return { error: error.message }
  }
  revalidatePath('/admin')
  return {}
}
