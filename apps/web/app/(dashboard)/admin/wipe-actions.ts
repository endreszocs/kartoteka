'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Admin: gyülekezeti adatok törlése (wipe).
 *
 * Meghívja a `public.wipe_congregation_data(uuid, text)` SQL RPC-t, amely:
 *   - Ellenőrzi a hívó jogosultságát (admin / master / egyházkerületi admin)
 *   - Ellenőrzi a scope-ot (saját gyülekezet, kivéve master)
 *   - Ellenőrzi, hogy a `confirm_name` egyezik a gyülekezet nevével
 *   - Dinamikusan törli a `congregation_id`-ra szűrt sorokat minden táblából
 *     (kivéve a megtartandó táblákat)
 *   - Kiegészítő: `gyerek` + `csalad` kezelése (ezekben nincs congregation_id)
 *   - Audit-logot ír a `data_wipe_log` táblába
 *
 * Kliens-oldali védelem NINCS itt — a UI-ban van a 2-szintű megerősítés.
 * A szerver-oldali RPC az utolsó védelmi vonal.
 */

export interface WipeResult {
  success: boolean
  rowsTotal?: number
  deletedTables?: Array<{ table: string; rows: number }>
  error?: string
}

export async function wipeCongregationDataAction(
  congregationId: string,
  confirmName: string,
): Promise<WipeResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nincs bejelentkezett felhasználó.' }

  // RPC hívás — a jogosultsági check szerver-oldalon
  const { data, error } = await supabase.rpc('wipe_congregation_data', {
    target_congregation_id: congregationId,
    confirm_name: confirmName,
  })

  if (error) {
    // A szerver-oldali RAISE EXCEPTION üzenetét tisztán visszaadjuk a UI-nak
    return {
      success: false,
      error: translateRpcError(error.message),
    }
  }

  // A function TABLE(...)-t ad vissza — Supabase array-ként kapjuk
  const deletedTables = Array.isArray(data)
    ? (data as Array<{ deleted_table: string; rows_deleted: number | string }>).map(
        (r) => ({
          table: String(r.deleted_table),
          rows: Number(r.rows_deleted) || 0,
        }),
      )
    : []

  const rowsTotal = deletedTables.reduce((acc, r) => acc + r.rows, 0)

  revalidatePath('/admin')
  revalidatePath('/tagnyilvantartas')
  revalidatePath('/penzugy')
  revalidatePath('/munkanaplo')

  return { success: true, rowsTotal, deletedTables }
}

/**
 * A szerver-oldali hibaüzenetek barátságosítása a lelkésznek.
 */
function translateRpcError(msg: string): string {
  if (msg.includes('Bejelentkezés szükséges')) {
    return 'A munkamenet lejárt — jelentkezz be újra.'
  }
  if (msg.includes('admin / master / egyházkerületi')) {
    return 'Csak admin, master vagy egyházkerületi admin felhasználó végezheti el ezt a műveletet.'
  }
  if (msg.includes('nem létezik')) {
    return 'A megadott gyülekezet nem található.'
  }
  if (msg.includes('nem egyezik a gyülekezet nevével')) {
    return 'A begépelt név nem egyezik a gyülekezet hivatalos nevével.'
  }
  if (msg.includes('Nincs jogosultságod ehhez a gyülekezethez')) {
    return 'Nincs jogosultságod ehhez a gyülekezethez — csak a saját gyülekezeted adatait törölheted.'
  }
  return `Hiba: ${msg}`
}

/**
 * Admin: utolsó wipe-bejegyzések listája a `data_wipe_log`-ból (history).
 */
export async function listRecentWipesAction(limit: number = 10) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('data_wipe_log')
    .select('id, congregation_id, congregation_name, initiated_by, initiated_at, total_rows_deleted')
    .order('initiated_at', { ascending: false })
    .limit(limit)

  if (error) {
    return { success: false as const, error: error.message, rows: [] }
  }
  return { success: true as const, rows: data ?? [] }
}
