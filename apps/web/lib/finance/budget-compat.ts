import type { SupabaseClient } from '@supabase/supabase-js'

export interface BudgetCompatRow {
  szamadasicelid: string
  tervezett: number
  modositott: number | null
  mod2: number | null
  mod3: number | null
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

type RawRow = {
  szamadasicelid: string
  tervezett?: number | null
  modositott?: number | null
  osszeg?: number | null
  osszeg_modositott?: number | null
  osszeg_mod_2?: number | null
  osszeg_mod_3?: number | null
}

function normalizeBudgetRow(row: RawRow): BudgetCompatRow {
  return {
    szamadasicelid: row.szamadasicelid,
    tervezett: Number(row.tervezett ?? row.osszeg ?? 0),
    modositott: row.modositott ?? row.osszeg_modositott ?? null,
    mod2: row.osszeg_mod_2 ?? null,
    mod3: row.osszeg_mod_3 ?? null,
  }
}

export async function loadBudgetRowsCompat(
  supabase: SupabaseClient,
  year: number,
  scopeId: string,
  scope: 'congregation' | 'diocese' = 'congregation',
) {
  // 2026-04-18 SCOPE-AWARE: diocese módban a diocese_koltsegvetes táblára fut
  if (scope === 'diocese') {
    const { data, error } = await supabase
      .from('diocese_koltsegvetes')
      .select('szamadasicelid, tervezett, osszeg_mod_1, osszeg_mod_2, osszeg_mod_3')
      .eq('eve', year)
      .eq('diocese_id', scopeId)
    if (error) throw error
    return (data || []).map((r) => ({
      szamadasicelid: r.szamadasicelid as string,
      tervezett: Number(r.tervezett ?? 0),
      modositott: r.osszeg_mod_1 ?? null,
      mod2: r.osszeg_mod_2 ?? null,
      mod3: r.osszeg_mod_3 ?? null,
    }))
  }

  // Congregation path (eredeti logika)
  const congregationId = scopeId
  // Próbáljuk a teljes oszlopkészlettel (canonical + mod oszlopok)
  let result: {
    data: RawRow[] | null
    error: Error | null
  } = await supabase
    .from('koltsegvetes')
    .select('szamadasicelid, tervezett, modositott, osszeg_mod_2, osszeg_mod_3')
    .eq('bealitasid', String(year))
    .eq('congregation_id', congregationId)

  if (result.error && isMissingColumnError(result.error.message)) {
    // Fallback: alap oszlopok
    result = await supabase
      .from('koltsegvetes')
      .select('szamadasicelid, osszeg, osszeg_modositott, osszeg_mod_2, osszeg_mod_3')
      .eq('bealitasid', String(year))
      .eq('congregation_id', congregationId)
  }

  if (result.error && isMissingColumnError(result.error.message)) {
    // Minimális fallback
    result = await supabase
      .from('koltsegvetes')
      .select('szamadasicelid, osszeg, osszeg_modositott')
      .eq('bealitasid', String(year))
      .eq('congregation_id', congregationId)
  }

  if (result.error) throw result.error
  return (result.data || []).map(normalizeBudgetRow)
}

export async function saveBudgetRowsCompat(
  supabase: SupabaseClient,
  year: number,
  scopeId: string,
  rows: BudgetCompatRow[],
  scope: 'congregation' | 'diocese' = 'congregation',
) {
  // 2026-04-18 SCOPE-AWARE: diocese módban a diocese_koltsegvetes táblára fut
  if (scope === 'diocese') {
    const { error: deleteError } = await supabase
      .from('diocese_koltsegvetes')
      .delete()
      .eq('eve', year)
      .eq('diocese_id', scopeId)
    if (deleteError) throw deleteError

    const activeRows = rows.filter((row) => row.tervezett > 0 || (row.modositott && row.modositott > 0) || (row.mod2 && row.mod2 > 0) || (row.mod3 && row.mod3 > 0))
    if (activeRows.length === 0) return

    const payload = activeRows.map((row) => ({
      diocese_id: scopeId,
      eve: year,
      szamadasicelid: row.szamadasicelid,
      tervezett: row.tervezett,
      osszeg_mod_1: row.modositott ?? 0,
      osszeg_mod_2: row.mod2 ?? 0,
      osszeg_mod_3: row.mod3 ?? 0,
    }))

    const { error } = await supabase.from('diocese_koltsegvetes').insert(payload)
    if (error) throw error
    return
  }

  // Congregation path (eredeti)
  const congregationId = scopeId
  const yearId = String(year)
  const { error: deleteError } = await supabase
    .from('koltsegvetes')
    .delete()
    .eq('bealitasid', yearId)
    .eq('congregation_id', congregationId)

  if (deleteError) throw deleteError

  const activeRows = rows.filter((row) => row.tervezett > 0 || (row.modositott && row.modositott > 0) || (row.mod2 && row.mod2 > 0) || (row.mod3 && row.mod3 > 0))
  if (activeRows.length === 0) return

  const canonicalPayload = activeRows.map((row) => ({
    bealitasid: yearId,
    szamadasicelid: row.szamadasicelid,
    tervezett: row.tervezett,
    modositott: row.modositott,
    osszeg_mod_2: row.mod2 ?? 0,
    osszeg_mod_3: row.mod3 ?? 0,
    congregation_id: congregationId,
  }))

  let insertResult = await supabase.from('koltsegvetes').insert(canonicalPayload)
  if (insertResult.error && isMissingColumnError(insertResult.error.message)) {
    const fallbackPayload = activeRows.map((row) => ({
      bealitasid: yearId,
      szamadasicelid: row.szamadasicelid,
      osszeg: row.tervezett,
      osszeg_modositott: row.modositott,
      osszeg_mod_2: row.mod2 ?? 0,
      osszeg_mod_3: row.mod3 ?? 0,
      congregation_id: congregationId,
    }))
    insertResult = await supabase.from('koltsegvetes').insert(fallbackPayload)
  }

  if (insertResult.error) throw insertResult.error
}

/**
 * Egy adott módosítási kör értékeinek mentése.
 * Nem törli az egész sort, hanem UPDATE-el a megfelelő oszlopra.
 */
export async function saveBudgetModification(
  supabase: SupabaseClient,
  year: number,
  congregationId: string,
  modNumber: 1 | 2 | 3,
  rows: Array<{ szamadasicelid: string; value: number }>,
) {
  const yearId = String(year)
  const column = modNumber === 1 ? 'modositott' : modNumber === 2 ? 'osszeg_mod_2' : 'osszeg_mod_3'

  // Fallback oszlopnév
  const fallbackColumn = modNumber === 1 ? 'osszeg_modositott' : column

  for (const row of rows) {
    let result = await supabase
      .from('koltsegvetes')
      .update({ [column]: row.value })
      .eq('bealitasid', yearId)
      .eq('congregation_id', congregationId)
      .eq('szamadasicelid', row.szamadasicelid)

    if (result.error && isMissingColumnError(result.error.message) && column !== fallbackColumn) {
      result = await supabase
        .from('koltsegvetes')
        .update({ [fallbackColumn]: row.value })
        .eq('bealitasid', yearId)
        .eq('congregation_id', congregationId)
        .eq('szamadasicelid', row.szamadasicelid)
    }

    if (result.error) throw result.error
  }
}
