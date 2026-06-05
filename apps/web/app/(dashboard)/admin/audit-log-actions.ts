'use server'

/**
 * 2026-06-05 (F4b-2) — Sor-szintű tevékenység-napló lekérdezése az auditor-UI-hoz.
 * A `get_record_audit()` RPC RLS-aware: admin mindent lát; a gyülekezet lelkésze
 * a sajátját; az egyházmegyei számvevő a saját egyházmegyéje gyülekezeteit.
 * (DB-réteg: 2026-06-05n-row-audit.sql — audit.record_version + trigger.)
 */

import { createClient } from '@/lib/supabase/server'

export interface RecordAuditRow {
  id: number
  ts: string
  table_name: string
  op: string // INSERT | UPDATE | DELETE
  record_id: string | null
  actor_id: string | null
  actor_name: string | null
  congregation_id: string | null
  old_record: Record<string, unknown> | null
  new_record: Record<string, unknown> | null
}

export async function getRecordAudit(filters: {
  table?: string | null
  from?: string | null
  to?: string | null
  limit?: number
}): Promise<{ rows: RecordAuditRow[]; error?: string; schemaReady: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_record_audit', {
    p_congregation_id: null,
    p_actor_id: null,
    p_table: filters.table?.trim() || null,
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_limit: filters.limit ?? 100,
  })

  if (error) {
    const missing = /function .* does not exist|schema cache|does not exist/i.test(error.message)
    return {
      rows: [],
      error: missing ? undefined : error.message,
      schemaReady: !missing,
    }
  }

  return { rows: (data || []) as RecordAuditRow[], schemaReady: true }
}
