'use server'

/**
 * Anyakönyvi import server action.
 *
 * A wizard 7 lépéses flow-ja végén hívódik. A wizard előzetesen elvégzi:
 *   1. Fájl parse + mapping (excel-parser, transformSheet)
 *   2. Person-link (resolveLookups quad-lookup) → id_szemely / id_ferfi / id_no
 *   3. Locality (findLocalityMatchBatch) → helyid / honnanid / hovaid / hhelyid / thelyid
 *   4. Special-fields (konfirmáció keresztelés-stub, esketés vegyes, mozgás triplet)
 *
 * Ezért az `executeRegistryImport` csak a végeredményt küldi az
 * `import_registry_batch` RPC-nek (8 anyakönyv-típus egyetlen RPC-ben).
 *
 * Az RPC végzi:
 *   - Profil-szerinti target tábla INSERT
 *   - UNIQUE / FK ütközések soronként → skipped + warning
 *   - Konfirmációnál `create_baptism_first` JSONB → előbb keresztseg INSERT
 *   - Temetésnél trigger automatikusan beállítja szemely.meghalt = true
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

import type { RowIssue, RowIssueSeverity } from './family-head-import-actions'

export type RegistryProfileKey =
  | 'baptism'
  | 'confirmation'
  | 'marriage'
  | 'burial'
  | 'movement_bekoltozott'
  | 'movement_elkoltozott'
  | 'movement_attert'
  | 'movement_kitert'

export interface RegistryImportResult {
  success?: boolean
  error?: string
  insertedCount?: number
  skippedCount?: number
  rowErrors?: RowIssue[]
}

const VALID_PROFILES: RegistryProfileKey[] = [
  'baptism', 'confirmation', 'marriage', 'burial',
  'movement_bekoltozott', 'movement_elkoltozott',
  'movement_attert', 'movement_kitert',
]

// Sor/batch limit — egyszerre max ennyit küldünk az RPC-nek (a wizard
// szeletekre bontja a nagyobb XML-eket). A 200 a tagnyilvántartás-import
// gyakorlatából tükröződik.
const MAX_ROWS_PER_BATCH = 200

/**
 * Fő belépési pont — egyetlen RPC-hívás az anyakönyvi importhoz.
 *
 * @param formData FormData ami:
 *   - profileKey: RegistryProfileKey
 *   - rows: JSON string — a wizard által teljesen előkészített rekordok
 *   - defaultMunkanaploba?: 'true' | 'false' (default: false)
 *   - targetCongregationId?: string — ha admin más gyülekezethez importál
 */
export async function executeRegistryImport(
  formData: FormData,
): Promise<RegistryImportResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const profileKeyRaw = formData.get('profileKey') as string | null
  const rowsRaw = formData.get('rows') as string | null
  const defaultMunkanaplobaRaw = formData.get('defaultMunkanaploba') as string | null
  const targetCongregationId =
    (formData.get('targetCongregationId') as string | null) ||
    access.effectiveCongregationId

  // Validáció — profil kulcs
  if (!profileKeyRaw || !VALID_PROFILES.includes(profileKeyRaw as RegistryProfileKey)) {
    return { error: `Érvénytelen profil-kulcs: ${profileKeyRaw || '(üres)'}` }
  }
  const profileKey = profileKeyRaw as RegistryProfileKey

  // Validáció — gyülekezet
  if (!targetCongregationId) {
    return { error: 'Nincs cél gyülekezet kiválasztva.' }
  }

  // Validáció — rows JSON
  if (!rowsRaw) {
    return { error: 'Nincs importálandó adat.' }
  }
  let rows: Array<Record<string, unknown>>
  try {
    const parsed = JSON.parse(rowsRaw)
    if (!Array.isArray(parsed)) {
      return { error: 'Az importálandó adat formátuma érvénytelen (nem tömb).' }
    }
    rows = parsed
  } catch (e) {
    return {
      error: `Az importálandó adat nem értelmezhető JSON: ${e instanceof Error ? e.message : 'ismeretlen hiba'}`,
    }
  }

  if (rows.length === 0) {
    return { error: 'Egyetlen importálandó sor sincs.' }
  }
  if (rows.length > MAX_ROWS_PER_BATCH) {
    return {
      error: `Túl sok sor egy körben (${rows.length}). Max ${MAX_ROWS_PER_BATCH} / batch — a wizard szeletekre bontja.`,
    }
  }

  const defaultMunkanaploba = defaultMunkanaplobaRaw === 'true'

  // RPC hívás
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('import_registry_batch', {
    p_target_congregation_id: targetCongregationId,
    p_profile_key: profileKey,
    p_rows: rows,
    p_default_munkanaploba: defaultMunkanaploba,
  })

  if (error) {
    return { error: `A szerver-oldali import sikertelen: ${error.message}` }
  }

  const firstRow = Array.isArray(data) ? data[0] : data
  const insertedCount = (firstRow?.inserted_count as number) ?? 0
  const skippedCount = (firstRow?.skipped_count as number) ?? 0
  const rpcErrors = ((firstRow?.errors as RowIssue[]) ?? [])

  const rowErrors: RowIssue[] = rpcErrors.map((e) => ({
    row: e.row,
    message: e.message,
    severity: (e.severity ?? 'error') as RowIssueSeverity,
    name: e.name,
  }))

  // Cache-invalidálás — a tagnyilvántartás registry-tab és az anyakönyv lista is frissül
  revalidatePath('/anyakonyv')
  revalidatePath('/tagnyilvantartas')

  return {
    success: true,
    insertedCount,
    skippedCount,
    rowErrors,
  }
}
