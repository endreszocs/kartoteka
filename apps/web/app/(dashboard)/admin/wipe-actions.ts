'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminAccess } from '@/lib/auth/admin-access'
import { getScopedCongregationIds } from '@/lib/auth/admin-scope'

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
  // #2 (döntés): az adattisztítás (wipe) CSAK fő rendszergazda / teljes admin.
  // A kerületi admin (egyhazkeruleti_admin) ezt a visszafordíthatatlan műveletet
  // nem végezheti. (allowDistrictAdmin: false → kerületi adminra dob.)
  let access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: false })
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Ehhez a művelethez nincs jogosultsága.',
    }
  }
  const supabase = access.supabase

  // RPC hívás — a jogosultsági check szerver-oldalon is megvan (utolsó védvonal)
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
 * Admin: PÉNZÜGY-ONLY végleges törlés (teszt-reset).
 *
 * Meghívja a `public.wipe_finance_data(uuid, text)` RPC-t, amely CSAK a tranzakciós
 * pénzügyi táblákat üríti (befizetes, kiadas, belsomozgas, oblio_szamlak, chitanta_tombok,
 * monetar, decont, dispozitie). A tagnyilvántartás, kategóriák, bankszámla-konfig és az
 * éves költségvetés ÉRINTETLEN marad — így az import újra-tesztelhető.
 *
 * Jogosultság: CSAK fő rendszergazda (admin) — `allowDistrictAdmin: false`.
 */
export async function wipeFinanceDataAction(
  congregationId: string,
  confirmName: string,
): Promise<WipeResult> {
  let access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: false })
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Ehhez a művelethez nincs jogosultsága.',
    }
  }
  const supabase = access.supabase

  const { data, error } = await supabase.rpc('wipe_finance_data', {
    target_congregation_id: congregationId,
    confirm_name: confirmName,
  })

  if (error) {
    return { success: false, error: translateRpcError(error.message) }
  }

  const deletedTables = Array.isArray(data)
    ? (data as Array<{ deleted_table: string; rows_deleted: number | string }>).map((r) => ({
        table: String(r.deleted_table),
        rows: Number(r.rows_deleted) || 0,
      }))
    : []

  const rowsTotal = deletedTables.reduce((acc, r) => acc + r.rows, 0)

  revalidatePath('/penzugy')

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
  if (msg.includes('Csak fő rendszergazda')) {
    return 'Csak fő rendszergazda (admin) végezheti el a pénzügyi adatok végleges törlését.'
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
 *
 * BIZTONSÁGI FIX 2026-08-11 (5. kör, P3 #6): ez a függvény nyers `createClient()`-tel
 * dolgozott, `requireAdminAccess()` NÉLKÜL — szemben a fájl két testvérével (a
 * `wipeCongregationDataAction` és a `wipeFinanceDataAction` mindkettő guardolt).
 * Egy `'use server'` export ÉLŐ POST-végpont, így bárki meghívhatta; az egyetlen
 * védelem az RLS `data_wipe_log_admin_read` policy volt, ami viszont
 * `role IN ('admin','master','egyhazkeruleti_admin')`-t néz `status='active'` és
 * kerület-feltétel NÉLKÜL. Emiatt egy „A" kerületi admin (vagy egy már
 * felfüggesztett, de még 'admin' szerepű profil) végig tudta olvasni az ORSZÁG
 * ÖSSZES adattörlését — gyülekezet-név, ki indította, hány sor tűnt el —, ami
 * pontosan az a kerületközi információ, amit a #2 hatókör-döntés megtagad tőle
 * („más kerületet NE is lásson", admin-scope.ts fejléce).
 *
 * Most: (1) `requireAdminAccess({ allowDistrictAdmin: true })` — a kerületi admin
 * LÁTHATJA a saját kerülete törléseit, csak nem indíthat újat; (2) a hatókörön
 * kívüli sorok kiszűrése `getScopedCongregationIds` alapján, MÁR A LEKÉRDEZÉSBEN
 * (hogy a `limit` a szűkített halmazon érvényesüljön), plusz egy védő utószűrés.
 * FAIL-CLOSED: ha a hatókör üres (nincs beállított kerület, vagy a hatókör-lekérdezés
 * hibázott), üres listát adunk vissza — nem az egészet.
 *
 * A gyülekezet-lista DARABOLVA megy az `.in()`-be: egy egyházkerület több száz
 * gyülekezetet tarthat, és 500+ UUID egyetlen query-stringben átlépné a PostgREST
 * URL-hossz plafonját (a `dashboard-egyhazmegye/document-actions.ts` ugyanezért
 * darabol). Darabonként kérünk `limit` sort, majd a UNIÓT rendezzük és vágjuk —
 * a globális „legutóbbi N" mindig benne van a darabonkénti „legutóbbi N" uniójában.
 */
const WIPE_LOG_IN_CHUNK = 120

export async function listRecentWipesAction(limit: number = 10) {
  let access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: true })
  } catch (e) {
    return {
      success: false as const,
      error: e instanceof Error ? e.message : 'Ehhez a művelethez nincs jogosultsága.',
      rows: [],
    }
  }

  // null = korlátlan (master / teljes admin); tömb = a kerületi admin gyülekezetei
  const scopedCongIds = await getScopedCongregationIds(access)
  if (scopedCongIds !== null && scopedCongIds.length === 0) {
    // Nincs egyetlen hatókörbe eső gyülekezet sem → nem mutatunk semmit.
    return { success: true as const, rows: [] }
  }

  const columns =
    'id, congregation_id, congregation_name, initiated_by, initiated_at, total_rows_deleted'
  type WipeLogRow = {
    id: string
    congregation_id: string | null
    congregation_name: string | null
    initiated_by: string | null
    initiated_at: string | null
    total_rows_deleted: number | null
  }

  const idChunks: Array<string[] | null> = scopedCongIds === null ? [null] : []
  if (scopedCongIds !== null) {
    for (let i = 0; i < scopedCongIds.length; i += WIPE_LOG_IN_CHUNK) {
      idChunks.push(scopedCongIds.slice(i, i + WIPE_LOG_IN_CHUNK))
    }
  }

  const collected: WipeLogRow[] = []
  for (const ids of idChunks) {
    let query = access.supabase
      .from('data_wipe_log')
      .select(columns)
      .order('initiated_at', { ascending: false })
      .limit(limit)
    if (ids) query = query.in('congregation_id', ids)

    const { data, error } = await query
    if (error) {
      return { success: false as const, error: error.message, rows: [] }
    }
    collected.push(...((data ?? []) as unknown as WipeLogRow[]))
  }

  // Védő utószűrés: ha a szerver-oldali `.in(...)` valaha kiesne (PostgREST-hiba,
  // átírt lekérdezés), a kerületen kívüli sor akkor se juthasson ki a UI-ra.
  const scopedSet = scopedCongIds === null ? null : new Set(scopedCongIds)
  const rows = collected
    .filter((r) => scopedSet === null || (r.congregation_id != null && scopedSet.has(r.congregation_id)))
    .sort((a, b) => String(b.initiated_at ?? '').localeCompare(String(a.initiated_at ?? '')))
    .slice(0, limit)

  return { success: true as const, rows }
}
