'use server'

import type { SupabaseClient } from '@supabase/supabase-js'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import type { ImportModule } from './import-profiles'
import type { ResolveStats } from './lookup-resolver'

/**
 * Import log — minden `executeBatchImport` futtatás egy auditsorrá válik.
 *
 * A logImportRun-t a `batch-import-actions.ts` hívja a futtatás végén.
 * A listImportLogs-t az admin UI használja (god-mode panel).
 */

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface ImportLogEntry {
  id: string
  congregation_id: string
  user_id: string
  module: ImportModule
  file_name: string
  total_inserted: number
  total_skipped: number
  per_sheet: Array<{ sheet: string; profile: string; inserted: number; skipped: number }>
  lookup_stats: {
    personResolved?: number
    personUnresolved?: number
    categoryResolved?: number
    categoryUnresolved?: number
    warnings?: string[]
  }
  errors: Array<{ sheet: string; row: number; message: string }>
  created_at: string
}

export interface ImportLogEnriched extends ImportLogEntry {
  user_name: string | null
  congregation_name: string | null
}

// ─────────────────────────────────────────────────────────────────
// Rögzítés (a batch-import-actions hívja)
// ─────────────────────────────────────────────────────────────────

export async function logImportRun(input: {
  supabase: SupabaseClient
  congregationId: string
  userId: string
  module: ImportModule
  fileName: string
  totalInserted: number
  totalSkipped: number
  perSheetLog: Array<{ sheet: string; profile: string; inserted: number; skipped: number }>
  lookupStats: ResolveStats
  errors: Array<{ sheet: string; row: number; message: string }>
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await input.supabase.from('import_logs').insert({
    congregation_id: input.congregationId,
    user_id: input.userId,
    module: input.module,
    file_name: input.fileName,
    total_inserted: input.totalInserted,
    total_skipped: input.totalSkipped,
    per_sheet: input.perSheetLog,
    lookup_stats: input.lookupStats,
    errors: input.errors.slice(0, 50), // limit
  })

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// Lista (admin UI)
// ─────────────────────────────────────────────────────────────────

export async function listImportLogs(opts?: {
  module?: ImportModule
  limit?: number
}): Promise<{ data?: ImportLogEnriched[]; error?: string }> {
  const { supabase, user } = await getEffectiveAccessContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // MEGJEGYZÉS: az `import_logs.user_id` FK az `auth.users(id)`-re mutat, NEM a
  // `public.profiles(id)`-re. Emiatt a PostgREST nem tud automatikus embed-et
  // csinálni a `profiles:user_id(...)` szintaxissal ("Could not find a
  // relationship" hiba). Megoldás: három lépésben kérünk — import_logs,
  // profiles, congregations — és JS-ben fűzzük össze.

  let query = supabase
    .from('import_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts?.limit || 50)

  if (opts?.module) {
    query = query.eq('module', opts.module)
  }

  const { data: logs, error } = await query
  if (error) return { error: `Lekérés sikertelen: ${error.message}` }

  const rows = (logs || []) as ImportLogEntry[]
  if (rows.length === 0) return { data: [] }

  // Gyűjtés: egyedi user_id-k és congregation_id-k
  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))]
  const congIds = [...new Set(rows.map(r => r.congregation_id).filter(Boolean))]

  // Párhuzamos lekérdezés a két lookup-ra
  const [profRes, congRes] = await Promise.all([
    userIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[], error: null }),
    congIds.length > 0
      ? supabase.from('congregations').select('id, name, nev_hu').in('id', congIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; nev_hu: string | null }[], error: null }),
  ])

  const profileMap = new Map<string, string | null>()
  ;((profRes.data || []) as { id: string; full_name: string | null }[]).forEach(p => {
    profileMap.set(p.id, p.full_name)
  })

  const congMap = new Map<string, string | null>()
  ;((congRes.data || []) as { id: string; name: string | null; nev_hu: string | null }[]).forEach(c => {
    congMap.set(c.id, c.nev_hu || c.name || null)
  })

  const enriched: ImportLogEnriched[] = rows.map(row => ({
    ...row,
    user_name: profileMap.get(row.user_id) || null,
    congregation_name: congMap.get(row.congregation_id) || null,
  }))

  return { data: enriched }
}
