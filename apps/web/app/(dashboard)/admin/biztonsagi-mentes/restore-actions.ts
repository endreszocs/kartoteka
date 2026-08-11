'use server'

/**
 * VISSZAÁLLÍTÁS — szerver-akciók. 2026-08-11.
 *
 * ⚠️ MINDEN `'use server'` export ÉLŐ POST-VÉGPONT. Az, hogy a felület elrejti
 *    a gombot, SEMMIT nem véd. Ezért minden függvény SAJÁT kaput kap:
 *      · a veszélyes műveletek: `requireAdminAccess({ requireMaster: true })`,
 *      · a napló olvasása: kerületi admin is, de a HATÓKÖRÉRE szűkítve,
 *        fail-closed (üres hatókör → üres lista, nem az egész ország).
 *
 * A visszaállítás CSAK a fő rendszergazdának elérhető, kerületi adminnak SOHA:
 * ez a rendszer legveszélyesebb művelete, és nem osztható meg.
 */

import { revalidatePath } from 'next/cache'

import { requireAdminAccess } from '@/lib/auth/admin-access'
import { getScopedCongregationIds } from '@/lib/auth/admin-scope'
import { executeRestore } from '@/lib/restore/apply'
import { buildRestorePreview } from '@/lib/restore/preview'
import type {
  RestorableBackup,
  RestoreExecuteInput,
  RestoreExecuteResult,
  RestoreLogEntry,
  RestorePreviewResult,
} from '@/lib/restore/types'

import { RESTORE_NAPLO_LIMIT } from './restore-shared'

/** A `.in()` darabolása — több száz UUID egy query-stringben átlépné a limitet. */
const IN_DARAB = 120

function jogosultsagiHiba(e: unknown): string {
  return e instanceof Error ? e.message : 'Ehhez a művelethez nincs jogosultsága.'
}

/**
 * A választható gyülekezetek. RLS-szűrt lista — a `requireMaster` mellett ez a
 * második védvonal.
 */
export async function listRestoreCongregationsAction(): Promise<{
  success: boolean
  error?: string
  /** true = nem hiba történt, csak nincs jogosultság. A felület ilyenkor
   *  magyarázatot mutat, nem hibaüzenetet — végigjárni egy garantáltan
   *  elutasuló folyamatot értelmetlen és ijesztő. */
  nincsJog?: boolean
  rows: Array<{ id: string; nev: string }>
}> {
  let access
  try {
    access = await requireAdminAccess({ requireMaster: true })
  } catch (e) {
    return { success: false, error: jogosultsagiHiba(e), nincsJog: true, rows: [] }
  }

  const { data, error } = await access.supabase
    .from('congregations')
    .select('id, nev_hu, name')
  if (error) {
    return { success: false, error: error.message, rows: [] }
  }

  const rows = ((data ?? []) as Array<{ id: string; nev_hu: string | null; name: string | null }>)
    .map((c) => ({
      id: c.id,
      // FONTOS: pontosan az a kifejezés, amit az SQL-oldal is vár
      // (COALESCE(NULLIF(nev_hu,''), name)) — a begépelendő névnek egyeznie kell.
      nev: (c.nev_hu && c.nev_hu.length > 0 ? c.nev_hu : c.name) || '',
    }))
    .filter((c) => !!c.id && !!c.nev)
    .sort((a, b) => a.nev.localeCompare(b.nev, 'hu'))

  return { success: true, rows }
}

/**
 * Egy gyülekezet VISSZAÁLLÍTHATÓ mentései.
 *
 * Csak az IGAZOLT mentések kerülnek a listába: a `status='ok'` önmagában
 * kevés, kell hozzá a `drive_verified_at` is. Egy „ok" sor, aminek nincs
 * igazolása, NEM mentés — csak remény.
 */
export async function listRestorableBackupsAction(congregationId: string): Promise<{
  success: boolean
  error?: string
  rows: RestorableBackup[]
}> {
  let access
  try {
    access = await requireAdminAccess({ requireMaster: true })
  } catch (e) {
    return { success: false, error: jogosultsagiHiba(e), rows: [] }
  }
  if (!congregationId) {
    return { success: true, rows: [] }
  }

  const { data, error } = await access.supabase
    .from('backup_log')
    .select('id, congregation_id, congregation_nev, run_date, kind, finished_at, total_rows, status, drive_verified_at')
    .eq('congregation_id', congregationId)
    .eq('scope', 'gyulekezet')
    .eq('status', 'ok')
    .not('drive_verified_at', 'is', null)
    .order('run_date', { ascending: false })
    .order('finished_at', { ascending: false })
    .limit(90)

  if (error) {
    return { success: false, error: error.message, rows: [] }
  }

  const rows: RestorableBackup[] = (
    (data ?? []) as Array<{
      id: number
      congregation_id: string | null
      congregation_nev: string | null
      run_date: string
      kind: string
      finished_at: string | null
      total_rows: number | null
      drive_verified_at: string | null
    }>
  ).map((r) => ({
    backupLogId: Number(r.id),
    congregationId: r.congregation_id || congregationId,
    congregationNev: r.congregation_nev || '',
    runDate: r.run_date,
    kind: r.kind,
    keszult: r.finished_at,
    totalRows: Number(r.total_rows ?? 0),
    igazolt: !!r.drive_verified_at,
  }))

  return { success: true, rows }
}

/**
 * SZÁRAZ FUTÁS — ez a lépés NEM hagyható ki.
 *
 * Semmit nem módosít az élő adatokon. A visszatérő terv-token az EGYETLEN
 * módja annak, hogy a végrehajtás elinduljon.
 */
export async function restorePreviewAction(
  backupLogId: number,
  jelszo: string,
): Promise<RestorePreviewResult> {
  let access
  try {
    access = await requireAdminAccess({ requireMaster: true })
  } catch (e) {
    return { success: false, error: jogosultsagiHiba(e) }
  }

  const id = Number(backupLogId)
  if (!Number.isFinite(id) || id <= 0) {
    return { success: false, error: 'Érvénytelen mentés-azonosító.' }
  }

  try {
    const res = await buildRestorePreview({
      backupLogId: id,
      passphrase: jelszo,
      actor: { profileId: access.userId, email: access.user?.email ?? null },
    })
    if (!res.ok) return { success: false, error: res.error }
    return { success: true, preview: res.preview }
  } catch (error: unknown) {
    // ⚠️ Csak a message — a nyers hibaobjektum a lekérdezést, és így
    //    SORÉRTÉKEKET is kiírhatna.
    const uzenet = error instanceof Error ? error.message : 'A száraz futás nem sikerült.'
    console.error('[visszaallitas] elonezet hiba:', uzenet)
    return { success: false, error: uzenet }
  }
}

/**
 * A VÉGREHAJTÁS. Öt kapu: terv-token (száraz futás) + a gyülekezet pontos neve
 * + a mentés dátuma + a mentési jelszó + kötelező indoklás.
 * A hatodik, csendes kapu az adatbázisban van: kötelező, IGAZOLT elő-mentés.
 */
export async function restoreExecuteAction(
  input: RestoreExecuteInput,
): Promise<RestoreExecuteResult> {
  let access
  try {
    access = await requireAdminAccess({ requireMaster: true })
  } catch (e) {
    return { success: false, error: jogosultsagiHiba(e) }
  }

  try {
    const res = await executeRestore({
      ...input,
      actor: { profileId: access.userId, email: access.user?.email ?? null },
    })

    if (res.success) {
      // A visszaállítás minden nagy felületet érint.
      revalidatePath('/admin')
      revalidatePath('/admin/veszelyes-zona')
      revalidatePath('/tagnyilvantartas')
      revalidatePath('/penzugy')
      revalidatePath('/munkanaplo')
      revalidatePath('/anyakonyv')
    }
    return res
  } catch (error: unknown) {
    const uzenet = error instanceof Error ? error.message : 'A visszaállítás nem sikerült.'
    console.error('[visszaallitas] vegrehajtas hiba:', uzenet)
    return { success: false, error: uzenet }
  }
}

/**
 * A visszaállítás-napló olvasása.
 *
 * A kerületi admin LÁTHATJA a saját kerülete bejegyzéseit (átláthatóság), de
 * visszaállítást nem indíthat. FAIL-CLOSED: üres hatókör → üres lista.
 */
export async function listRestoreLogAction(
  limit: number = RESTORE_NAPLO_LIMIT,
): Promise<{ success: boolean; error?: string; rows: RestoreLogEntry[] }> {
  let access
  try {
    access = await requireAdminAccess({ allowDistrictAdmin: true })
  } catch (e) {
    return { success: false, error: jogosultsagiHiba(e), rows: [] }
  }

  const scoped = await getScopedCongregationIds(access)
  if (scoped !== null && scoped.length === 0) {
    return { success: true, rows: [] }
  }

  const oszlopok =
    'id, tipus, actor_email, congregation_nev, backup_run_date, indoklas, outcome, started_at, finished_at, error_message, diff_summary'

  type Row = {
    id: number
    tipus: string
    actor_email: string | null
    congregation_nev: string | null
    backup_run_date: string | null
    indoklas: string | null
    outcome: string
    started_at: string | null
    finished_at: string | null
    error_message: string | null
    diff_summary: { osszesen?: { beszuras?: number; modositas?: number; torles?: number } } | null
    congregation_id?: string | null
  }

  const darabok: Array<string[] | null> = scoped === null ? [null] : []
  if (scoped !== null) {
    for (let i = 0; i < scoped.length; i += IN_DARAB) {
      darabok.push(scoped.slice(i, i + IN_DARAB))
    }
  }

  const gyujtott: Row[] = []
  for (const ids of darabok) {
    let query = access.supabase
      .from('backup_restore_log')
      .select(`${oszlopok}, congregation_id`)
      .order('started_at', { ascending: false })
      .limit(limit)
    if (ids) query = query.in('congregation_id', ids)

    const { data, error } = await query
    if (error) {
      return { success: false, error: error.message, rows: [] }
    }
    gyujtott.push(...((data ?? []) as unknown as Row[]))
  }

  // Védő utószűrés: ha a szerver-oldali `.in(...)` valaha kiesne, a kerületen
  // kívüli sor akkor se juthasson ki a felületre.
  const engedett = scoped === null ? null : new Set(scoped)
  const rows: RestoreLogEntry[] = gyujtott
    .filter((r) => engedett === null || (r.congregation_id != null && engedett.has(r.congregation_id)))
    .sort((a, b) => String(b.started_at ?? '').localeCompare(String(a.started_at ?? '')))
    .slice(0, limit)
    .map((r) => ({
      id: Number(r.id),
      tipus: r.tipus,
      actorEmail: r.actor_email,
      congregationNev: r.congregation_nev,
      backupRunDate: r.backup_run_date,
      indoklas: r.indoklas,
      outcome: r.outcome,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      errorMessage: r.error_message,
      diffSummary: r.diff_summary?.osszesen
        ? {
            beszuras: Number(r.diff_summary.osszesen.beszuras ?? 0),
            modositas: Number(r.diff_summary.osszesen.modositas ?? 0),
            torles: Number(r.diff_summary.osszesen.torles ?? 0),
          }
        : null,
    }))

  return { success: true, rows }
}
