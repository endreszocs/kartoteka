import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'

export interface AuditEventInput {
  action: string
  targetTable?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown> | null
  deviceId?: string | null
}

export async function logAuditEvent(
  input: AuditEventInput,
  client?: SupabaseClient,
): Promise<void> {
  try {
    const supabase = client ?? (await createClient())
    const { error } = await supabase.rpc('log_audit_event', {
      p_action: input.action,
      p_target_table: input.targetTable ?? null,
      p_target_id: input.targetId ?? null,
      p_metadata: input.metadata ?? null,
      p_device_id: input.deviceId ?? null,
    })
    if (error) {
      console.warn(`[AUDIT] log_audit_event sikertelen (${input.action}): ${error.message}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ismeretlen'
    console.warn(`[AUDIT] log_audit_event kivétel (${input.action}): ${message}`)
  }
}
