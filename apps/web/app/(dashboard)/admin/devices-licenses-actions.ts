'use server'

/**
 * Admin → Devices + Licenses + Audit-log server actions (M0.5 + M4.2).
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { sendEmail } from '@/lib/email/send'
import { deviceRestoredEmail, deviceRevokedEmail } from '@/lib/email/templates/device-revoke'

async function requireAdmin() {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' as const }
  if (!access.admin && !access.master) {
    return { error: 'Csak rendszergazda férhet hozzá.' as const }
  }
  return { supabase: access.supabase, userId: access.user.id }
}

export async function listUserDevices(filter: { onlyActive?: boolean } = {}) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  let q = ctx.supabase
    .from('user_devices')
    .select('*, profiles!user_id(email, full_name)')
    .order('registered_at', { ascending: false })

  if (filter.onlyActive) q = q.eq('revoked', false)

  const { data, error } = await q
  if (error) return { error: error.message }

  const result = (data || []).map((row: Record<string, unknown>) => {
    const profile = row['profiles'] as { email?: string; full_name?: string } | null
    return {
      id: row['id'] as string,
      user_id: row['user_id'] as string,
      device_fingerprint: row['device_fingerprint'] as string,
      device_name: (row['device_name'] as string | null) ?? null,
      platform: row['platform'] as string,
      registered_at: row['registered_at'] as string,
      last_seen: (row['last_seen'] as string | null) ?? null,
      revoked: row['revoked'] as boolean,
      revoked_by: (row['revoked_by'] as string | null) ?? null,
      revoked_at: (row['revoked_at'] as string | null) ?? null,
      revoke_reason: (row['revoke_reason'] as string | null) ?? null,
      user_email: profile?.email ?? null,
      user_full_name: profile?.full_name ?? null,
    }
  })

  return { data: result }
}

export async function revokeDevice(input: { id: string; reason: string }) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  if (!input.reason || !input.reason.trim()) {
    return { error: 'Indoklás kötelező a revoke-hoz.' }
  }
  const reason = input.reason.trim()

  // 1. Sor lekérése a revoke előtt — kelleni fog az email-hez
  //    (user_id, device_name, platform + csatolt email/full_name)
  const { data: before, error: readErr } = await ctx.supabase
    .from('user_devices')
    .select('user_id, device_name, platform, revoked, profiles!user_id(email, full_name)')
    .eq('id', input.id)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!before) return { error: 'Az eszköz nem található.' }

  const row = before as unknown as {
    user_id: string
    device_name: string | null
    platform: string
    revoked: boolean
    profiles: { email?: string | null; full_name?: string | null } | null
  }

  if (row.revoked) {
    return { error: 'Az eszköz már vissza van vonva.' }
  }

  // 2. Revoke a DB-ben
  const revokedAtIso = new Date().toISOString()
  const { error: updErr } = await ctx.supabase
    .from('user_devices')
    .update({
      revoked: true,
      revoked_by: ctx.userId,
      revoked_at: revokedAtIso,
      revoke_reason: reason,
    })
    .eq('id', input.id)

  if (updErr) return { error: updErr.message }

  await ctx.supabase.rpc('log_audit_event', {
    p_action: 'device.revoke',
    p_target_table: 'user_devices',
    p_target_id: input.id,
    p_metadata: { reason },
  })

  // 3. Értesítő email a user-nek (nem-blokkoló: ha az email hibázik, a revoke
  //    attól még érvényben marad — az admin látja a hibát, de a revoke priority).
  if (row.profiles?.email) {
    const emailRes = await sendEmail(
      deviceRevokedEmail({
        email: row.profiles.email,
        fullName: row.profiles.full_name ?? null,
        deviceName: row.device_name,
        platform: row.platform,
        reason,
        revokedAtIso,
      }),
    )
    if (!emailRes.success) {
      console.error('[revoke-device] email hiba:', emailRes.error)
    }
  }

  revalidatePath('/admin')
  return {}
}

export async function restoreDevice(input: { id: string }) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  // 1. Sor lekérése (kell az email-hez)
  const { data: before, error: readErr } = await ctx.supabase
    .from('user_devices')
    .select('user_id, device_name, platform, revoked, profiles!user_id(email, full_name)')
    .eq('id', input.id)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!before) return { error: 'Az eszköz nem található.' }

  const row = before as unknown as {
    user_id: string
    device_name: string | null
    platform: string
    revoked: boolean
    profiles: { email?: string | null; full_name?: string | null } | null
  }

  if (!row.revoked) {
    return { error: 'Az eszköz nincs visszavont állapotban.' }
  }

  // 2. Restore (revoked = false, a metaadatokat töröljük)
  const restoredAtIso = new Date().toISOString()
  const { error: updErr } = await ctx.supabase
    .from('user_devices')
    .update({
      revoked: false,
      revoked_by: null,
      revoked_at: null,
      revoke_reason: null,
    })
    .eq('id', input.id)

  if (updErr) return { error: updErr.message }

  await ctx.supabase.rpc('log_audit_event', {
    p_action: 'device.restore',
    p_target_table: 'user_devices',
    p_target_id: input.id,
    p_metadata: { restored_at: restoredAtIso },
  })

  // 3. Email a user-nek
  if (row.profiles?.email) {
    const emailRes = await sendEmail(
      deviceRestoredEmail({
        email: row.profiles.email,
        fullName: row.profiles.full_name ?? null,
        deviceName: row.device_name,
        platform: row.platform,
        restoredAtIso,
      }),
    )
    if (!emailRes.success) {
      console.error('[restore-device] email hiba:', emailRes.error)
    }
  }

  revalidatePath('/admin')
  return {}
}

export async function listLicenses() {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const { data, error } = await ctx.supabase
    .from('licenses')
    .select('id, user_id, congregation_id, device_limit, valid_from, valid_until, revoked, created_at, updated_at, notes, profiles!user_id(email, full_name)')
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }

  const result = (data || []).map((row: Record<string, unknown>) => {
    const profile = row['profiles'] as { email?: string; full_name?: string } | null
    return {
      id: row['id'] as string,
      user_id: row['user_id'] as string,
      congregation_id: (row['congregation_id'] as string | null) ?? null,
      device_limit: row['device_limit'] as number,
      valid_from: row['valid_from'] as string,
      valid_until: row['valid_until'] as string,
      revoked: row['revoked'] as boolean,
      created_at: row['created_at'] as string,
      updated_at: row['updated_at'] as string,
      notes: (row['notes'] as string | null) ?? null,
      user_email: profile?.email ?? null,
      user_full_name: profile?.full_name ?? null,
    }
  })

  return { data: result }
}

export async function listAuditLog(filter: { action?: string; userId?: string; limit?: number } = {}) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  // A `audit_log_with_profiles` flat VIEW az audit_log + profiles JOIN-t adja,
  // megkerülve a PostgREST relationship inference problémát az audit_log.user_id
  // ON DELETE SET NULL miatt. RLS érvényben marad (security_invoker=true).
  // Migration: migration-docs/sql/2026-04-25-m0-5-audit-log-view.sql
  let q = ctx.supabase
    .from('audit_log_with_profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filter.limit || 100)

  if (filter.action) q = q.eq('action', filter.action)
  if (filter.userId) q = q.eq('user_id', filter.userId)

  const { data, error } = await q
  if (error) return { error: error.message }

  const result = (data || []).map((row: Record<string, unknown>) => ({
    id: row['id'] as string,
    user_id: (row['user_id'] as string | null) ?? null,
    device_id: (row['device_id'] as string | null) ?? null,
    action: row['action'] as string,
    target_table: (row['target_table'] as string | null) ?? null,
    target_id: (row['target_id'] as string | null) ?? null,
    metadata: row['metadata'],
    ip: (row['ip'] as string | null) ?? null,
    user_agent: (row['user_agent'] as string | null) ?? null,
    created_at: row['created_at'] as string,
    user_email: (row['user_email'] as string | null) ?? null,
  }))

  return { data: result }
}
