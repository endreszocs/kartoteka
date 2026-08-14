import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'

import { createClient } from '@/lib/supabase/server'

export interface AuditEventInput {
  action: string
  targetTable?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown> | null
  deviceId?: string | null
}

/**
 * 2026-08-15 (8. pont D): az audit_log `ip` és `user_agent` oszlopa a
 * kezdetektől létezett, de SOHA nem töltöttük — egy gyanús belépésnél nem
 * lehetett megmondani, honnan jött. Mostantól a kérés fejléceiből
 * automatikusan kitöltjük (Railway/Cloudflare mögött az x-forwarded-for
 * első tagja a kliens címe).
 *
 * A headers() csak kérés-kontextusban él — cron/worker hívásnál kivételt
 * dob, ilyenkor üresen hagyjuk (az audit maga nem bukhat el ezen).
 */
async function requestClientInfo(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers()
    const forwarded = h.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : h.get('x-real-ip')
    const userAgent = h.get('user-agent')
    return { ip: ip || null, userAgent: userAgent ? userAgent.slice(0, 400) : null }
  } catch {
    return { ip: null, userAgent: null }
  }
}

export async function logAuditEvent(
  input: AuditEventInput,
  client?: SupabaseClient,
): Promise<void> {
  try {
    const supabase = client ?? (await createClient())
    const { ip, userAgent } = await requestClientInfo()

    const { error } = await supabase.rpc('log_audit_event', {
      p_action: input.action,
      p_target_table: input.targetTable ?? null,
      p_target_id: input.targetId ?? null,
      p_metadata: input.metadata ?? null,
      p_device_id: input.deviceId ?? null,
      p_ip: ip,
      p_user_agent: userAgent,
    })

    if (error) {
      // Átmeneti kompatibilitás: amíg a 2026-08-15-audit-ip-useragent.sql
      // nem futott le élesben, a 7 paraméteres hívásra a PostgREST
      // "function not found"-ot ad (PGRST202) — ilyenkor a régi, 5
      // paraméteres formával próbálkozunk, hogy az audit EGY napra se
      // essen ki.
      if (error.code === 'PGRST202') {
        const legacy = await supabase.rpc('log_audit_event', {
          p_action: input.action,
          p_target_table: input.targetTable ?? null,
          p_target_id: input.targetId ?? null,
          p_metadata: input.metadata ?? null,
          p_device_id: input.deviceId ?? null,
        })
        if (legacy.error) {
          console.warn(
            `[AUDIT] log_audit_event sikertelen (${input.action}): ${legacy.error.message}`,
          )
        }
        return
      }
      console.warn(`[AUDIT] log_audit_event sikertelen (${input.action}): ${error.message}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ismeretlen'
    console.warn(`[AUDIT] log_audit_event kivétel (${input.action}): ${message}`)
  }
}
