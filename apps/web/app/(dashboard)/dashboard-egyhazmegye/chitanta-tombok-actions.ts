'use server'

/**
 * Egyházmegyei nyugtatömbök (chitanta_tombok, scope='egyhazmegye')
 * szerver akciói.
 *
 * A táblán a 2026-04-18-i migráció bővítette a scope ('gyulekezet'/'egyhazmegye')
 * + diocese_id oszlopokat. Ezeket az action-okat az egyházmegyei dashboardon
 * használjuk. Nyitni / lezárni / törölni az esperes, az egyházmegyei admin és a
 * rendszergazda tud; 2026-08-11 óta az egyházmegyei SZÁMVEVŐ is LÁTJA a tömböket
 * (a nyugtatömb-tartomány a pénzügyi ellenőrzés része), de nem módosíthatja őket.
 *
 * A gyülekezeti oldal változatlanul működik a `penzugy/chitanta-tombok-actions.ts`
 * action-okkal.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { assertDioceseInScope } from '@/lib/auth/admin-scope'
import {
  describeDioceseWriteBlock,
  resolveDioceseReadScopeIds,
  resolveDioceseScopeIds,
} from '@/lib/auth/level-scope'

export interface DioceseChitantaTomb {
  id: string
  diocese_id: string
  scope: 'egyhazmegye'
  block_nr: string | null
  seria: string
  szam_kezdet: number
  szam_veg: number
  darabszam_ossz: number
  felhasznalt_darabszam: number
  vasarlas_datuma: string
  vasarlas_ara: number | null
  elso_hasznalat_datum: string | null
  utolso_hasznalat_datum: string | null
  aktiv: boolean
  megjegyzes: string | null
  created_at: string
}

// ─────────────────────────────────────────────────────────────────────────
// Jogosultság
// ─────────────────────────────────────────────────────────────────────────
/**
 * @param mode `'write'` (alapértelmezés, fail-closed) = tömb nyitása/lezárása/
 *   törlése; `'read'` = listázás, státusz-lekérdezés. 2026-08-11 (számvevő-kör):
 *   az egyházmegyei SZÁMVEVŐ `'read'`-re átmegy (a nyugtatömb-tartomány a
 *   pénzügyi ellenőrzés része), `'write'`-ra beszédes magyarázatot kap.
 */
async function requireDioceseAccess(
  dioceseIdFromInput?: string,
  mode: 'read' | 'write' = 'write',
) {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' as const }

  // 2026-08-09: a hatókör az aktív profile_role-ból oldódik fel (a skalár
  // profiles.diocese_id csak fallback) — lásd lib/auth/level-scope.ts.
  const resolvedIds = resolveDioceseScopeIds(access)
  const targetId = dioceseIdFromInput || resolvedIds[0] || null
  if (!targetId) return { error: 'Nincs egyházmegye megadva.' as const }

  let canManage = !!access.admin || !!access.master

  // Esperes / egyházmegyei admin: csak a SAJÁT (feloldott) egyházmegyéje
  if (!canManage && !!access.esperes && resolvedIds.includes(targetId)) {
    canManage = true
  }

  // 2026-08-09 FIX: a kerületi admin korábban BÁRMELY egyházmegye nyugtatömbjeit
  // kezelhette — mostantól csak a saját kerületébe tartozó egyházmegyéét.
  if (!canManage && !!access.egyhazkeruletiAdmin) {
    try {
      await assertDioceseInScope(access, targetId)
      canManage = true
    } catch {
      canManage = false
    }
  }

  // 2026-08-11 (számvevő-kör): OLVASÁSHOZ az ellenőri hatókör is elég.
  const readIds = resolveDioceseReadScopeIds(access)
  if (!canManage && mode === 'read' && readIds.includes(targetId)) {
    return { supabase: access.supabase, userId: access.user.id, dioceseId: targetId }
  }

  if (!canManage) {
    if (readIds.includes(targetId)) {
      const reason = describeDioceseWriteBlock(access)
      if (reason) return { error: reason as string }
    }
    return { error: 'Nincs jogosultság.' as const }
  }
  return { supabase: access.supabase, userId: access.user.id, dioceseId: targetId }
}

// ─────────────────────────────────────────────────────────────────────────
// 1) Listázás
// ─────────────────────────────────────────────────────────────────────────
export async function listDioceseChitantaTombok(): Promise<{
  data?: DioceseChitantaTomb[]
  error?: string
}> {
  // 2026-08-11 (számvevő-kör): puszta lekérdezés → az ellenőri hatókör is elég.
  const ctx = await requireDioceseAccess(undefined, 'read')
  if ('error' in ctx) return { error: ctx.error }

  const { data, error } = await ctx.supabase
    .from('chitanta_tombok')
    .select('*')
    .eq('scope', 'egyhazmegye')
    .eq('diocese_id', ctx.dioceseId)
    .order('szam_kezdet', { ascending: true })

  if (error) return { error: error.message }
  return { data: (data || []) as DioceseChitantaTomb[] }
}

// ─────────────────────────────────────────────────────────────────────────
// 2) Aktív tömb státusza (maradék darabszám)
// ─────────────────────────────────────────────────────────────────────────
export async function getActiveDioceseChitantaTombStatus(): Promise<{
  active?: {
    id: string
    seria: string
    szam_kezdet: number
    szam_veg: number
    felhasznalt: number
    maradek: number
    kovetkezo_szam: number | null
  } | null
  error?: string
}> {
  // 2026-08-11 (számvevő-kör): puszta lekérdezés → az ellenőri hatókör is elég.
  const ctx = await requireDioceseAccess(undefined, 'read')
  if ('error' in ctx) return { error: ctx.error }

  const { data, error } = await ctx.supabase
    .from('chitanta_tombok')
    .select('id, seria, szam_kezdet, szam_veg, darabszam_ossz, felhasznalt_darabszam')
    .eq('scope', 'egyhazmegye')
    .eq('diocese_id', ctx.dioceseId)
    .eq('aktiv', true)
    .order('szam_kezdet', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { active: null }

  const row = data as {
    id: string; seria: string; szam_kezdet: number; szam_veg: number
    darabszam_ossz: number; felhasznalt_darabszam: number
  }
  const felhasznalt = row.felhasznalt_darabszam || 0
  const maradek = (row.darabszam_ossz || 0) - felhasznalt

  return {
    active: {
      id: row.id,
      seria: row.seria,
      szam_kezdet: row.szam_kezdet,
      szam_veg: row.szam_veg,
      felhasznalt,
      maradek,
      kovetkezo_szam: maradek > 0 ? row.szam_kezdet + felhasznalt : null,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3) Új nyugtatömb rögzítése
// ─────────────────────────────────────────────────────────────────────────
const createSchema = z.object({
  block_nr: z.string().optional().or(z.literal('')),
  seria: z.string().min(1, 'A széria kötelező.'),
  szam_kezdet: z.number().int().positive(),
  szam_veg: z.number().int().positive(),
  darabszam_ossz: z.number().int().positive(),
  vasarlas_datuma: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ÉÉÉÉ-HH-NN formátum.'),
  vasarlas_ara: z.number().min(0).optional().nullable(),
  megjegyzes: z.string().optional().or(z.literal('')),
})

export type CreateDioceseChitantaTombInput = z.infer<typeof createSchema>

export async function createDioceseChitantaTomb(
  input: CreateDioceseChitantaTombInput,
): Promise<{ id?: string; error?: string; fieldErrors?: Record<string, string> }> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Érvénytelen adat.', fieldErrors }
  }

  if (parsed.data.szam_veg < parsed.data.szam_kezdet) {
    return { error: 'A végszám nem lehet kisebb a kezdőszámnál.' }
  }
  const computedDarab = parsed.data.szam_veg - parsed.data.szam_kezdet + 1
  if (computedDarab !== parsed.data.darabszam_ossz) {
    return { error: `A darabszám (${parsed.data.darabszam_ossz}) nem egyezik a kezdő-vég szám közötti darabokkal (${computedDarab}).` }
  }

  const ctx = await requireDioceseAccess()
  if ('error' in ctx) return { error: ctx.error }

  // Átfedés ellenőrzés ugyanazon szérián belül
  const { data: overlap } = await ctx.supabase
    .from('chitanta_tombok')
    .select('id, seria, szam_kezdet, szam_veg')
    .eq('scope', 'egyhazmegye')
    .eq('diocese_id', ctx.dioceseId)
    .eq('seria', parsed.data.seria)
    .gte('szam_veg', parsed.data.szam_kezdet)
    .lte('szam_kezdet', parsed.data.szam_veg)
  if (overlap && overlap.length > 0) {
    return { error: `Átfedés van a "${parsed.data.seria}" szériánál egy korábbi tömbbel.` }
  }

  const payload = {
    scope: 'egyhazmegye',
    diocese_id: ctx.dioceseId,
    congregation_id: null,  // egyházmegyei scope-nál NULL
    block_nr: parsed.data.block_nr || null,
    seria: parsed.data.seria,
    szam_kezdet: parsed.data.szam_kezdet,
    szam_veg: parsed.data.szam_veg,
    darabszam_ossz: parsed.data.darabszam_ossz,
    felhasznalt_darabszam: 0,
    vasarlas_datuma: parsed.data.vasarlas_datuma,
    vasarlas_ara: parsed.data.vasarlas_ara ?? null,
    aktiv: true,
    megjegyzes: parsed.data.megjegyzes || null,
  }

  const { data, error } = await ctx.supabase
    .from('chitanta_tombok')
    .insert([payload])
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard-egyhazmegye')
  return { id: (data as { id: string }).id }
}

// ─────────────────────────────────────────────────────────────────────────
// 4) Tömb lezárása (kézi befejezés)
// ─────────────────────────────────────────────────────────────────────────
export async function closeDioceseChitantaTomb(id: string): Promise<{ ok?: true; error?: string }> {
  const ctx = await requireDioceseAccess()
  if ('error' in ctx) return { error: ctx.error }

  const { error } = await ctx.supabase
    .from('chitanta_tombok')
    .update({ aktiv: false, utolso_hasznalat_datum: new Date().toISOString().slice(0, 10) })
    .eq('id', id)
    .eq('scope', 'egyhazmegye')
    .eq('diocese_id', ctx.dioceseId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard-egyhazmegye')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────
// 5) Tömb törlése (csak ha nincs használatban)
// ─────────────────────────────────────────────────────────────────────────
export async function deleteDioceseChitantaTomb(id: string): Promise<{ ok?: true; error?: string }> {
  const ctx = await requireDioceseAccess()
  if ('error' in ctx) return { error: ctx.error }

  // Csak akkor engedjük törölni, ha még nincs használatban (felhasznalt = 0)
  const { data: row } = await ctx.supabase
    .from('chitanta_tombok')
    .select('felhasznalt_darabszam')
    .eq('id', id)
    .eq('scope', 'egyhazmegye')
    .eq('diocese_id', ctx.dioceseId)
    .maybeSingle()
  if (!row) return { error: 'Nem található.' }
  if ((row as { felhasznalt_darabszam?: number }).felhasznalt_darabszam ?? 0 > 0) {
    return { error: 'Csak használatlan tömböt lehet törölni. Használtatot zárd le.' }
  }

  const { error } = await ctx.supabase
    .from('chitanta_tombok')
    .delete()
    .eq('id', id)
    .eq('scope', 'egyhazmegye')
    .eq('diocese_id', ctx.dioceseId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard-egyhazmegye')
  return { ok: true }
}
