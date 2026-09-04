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

const UUID_MINTA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 2026-09-05 — NÉMA AUDIT-VESZTÉS JAVÍTÁSA.
 *
 * Az `audit_log.target_id` UUID (2026-04-23-m0-5-devices-licenses-audit.sql:127),
 * és a `log_audit_event` `p_target_id`-je is az. A tagnyilvántartás és az
 * anyakönyv viszont EGÉSZ SZÁMOS azonosítókkal dolgozik, és a hívások
 * `String(id)` alakban adták át őket — amire a Postgres 22P02-t
 * („invalid input syntax for type uuid") dob. A `logAuditEvent` a hibát
 * `console.warn`-nal lenyelte, tehát ezek az események SOHA nem kerültek be
 * a naplóba: member.remove, member.note_update, member.consent_update,
 * registry.note_update és — a GDPR-ígéretünk szempontjából a legfájóbb —
 * member.cnp_megtekintve.
 *
 * A javítás itt, EGY helyen történik: ami nem UUID, az a metaadatba megy
 * `target_ref` néven, a `target_id` pedig NULL marad. Így az esemény
 * ténylegesen létrejön, és az azonosító sem vész el.
 *
 * ⚠️ SZÁNDÉKOSAN NEM az oszlop típusát írjuk át: a `log_audit_event`-et
 *    DROP+CREATE-tel kellene cserélni, és a repóban VAN precedens arra, hogy
 *    egy ilyen csere némán elvitte a függvény keményítését
 *    (2026-08-15-HELYREALLITAS-audit-napszak-mfa.sql). A tábla-oldali
 *    bővítés külön, mérhető körben mehet.
 */
function targetSzetvalasztas(input: AuditEventInput): { targetId: string | null; metadata: Record<string, unknown> | null } {
  const nyers = input.targetId?.trim() || null
  if (!nyers || UUID_MINTA.test(nyers)) {
    return { targetId: nyers, metadata: input.metadata ?? null }
  }
  return {
    targetId: null,
    metadata: { ...(input.metadata ?? {}), target_ref: nyers },
  }
}

export async function logAuditEvent(
  input: AuditEventInput,
  client?: SupabaseClient,
): Promise<void> {
  try {
    const supabase = client ?? (await createClient())
    const { ip, userAgent } = await requestClientInfo()
    const { targetId, metadata } = targetSzetvalasztas(input)

    const { error } = await supabase.rpc('log_audit_event', {
      p_action: input.action,
      p_target_table: input.targetTable ?? null,
      p_target_id: targetId,
      p_metadata: metadata,
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
          p_target_id: targetId,
          p_metadata: metadata,
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
