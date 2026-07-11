'use server'

/**
 * Admin → Devices + Licenses + Audit-log server actions (M0.5 + M4.2).
 *
 * 2026-07-11 (admin-redesign 2. kör): teljes licenc-CRUD (kibocsátás,
 * hosszabbítás, szerkesztés, visszavonás/visszaállítás) + user-kereső a
 * kibocsátáshoz + a napló dátum-tartomány szűrője. Minden licenc-művelet
 * a log_audit_event RPC-vel auditált (a device-műveletek mintájára).
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

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

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

// ─────────────────────────────────────────────────────────────────────────
// Licenc-CRUD (2026-07-11, admin-redesign 2. kör)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Aktív felhasználók keresője a licenc-kibocsátó dialógushoz
 * (email vagy név szerint, max 20 találat).
 */
export async function listActiveUsersForLicense(query?: string) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  let q = ctx.supabase
    .from('profiles')
    .select('id, email, full_name, congregation_id, congregations(nev_hu, name)')
    .eq('status', 'active')
    .order('full_name', { ascending: true })
    .limit(20)

  // A PostgREST .or() szintaxisát a vessző/zárójel törné — kiszűrjük.
  const needle = (query ?? '').replace(/[,()*]/g, ' ').trim()
  if (needle) {
    q = q.or(`email.ilike.%${needle}%,full_name.ilike.%${needle}%`)
  }

  const { data, error } = await q
  if (error) return { error: error.message }

  const result = (data || []).map((row: Record<string, unknown>) => {
    const cong = row['congregations'] as { nev_hu?: string | null; name?: string | null } | null
    return {
      id: row['id'] as string,
      email: (row['email'] as string | null) ?? null,
      full_name: (row['full_name'] as string | null) ?? null,
      congregation_id: (row['congregation_id'] as string | null) ?? null,
      congregation_name: cong?.nev_hu || cong?.name || null,
    }
  })

  return { data: result }
}

/**
 * Új licenc kibocsátása. Alapértékek: device_limit 2, valid_from ma,
 * valid_until +1 év. Az `issued_jwt` NOT NULL constraint-je miatt (a
 * 2026-07-11-licenses-admin-crud.sql lefuttatásáig) üres placeholder-rel
 * próbálkozunk újra — a JWT-aláírást az M5 desktop-aktiválás tölti majd ki.
 */
export async function createLicense(input: {
  userId: string
  congregationId?: string | null
  deviceLimit?: number
  validFrom?: string
  validUntil?: string
  notes?: string
}) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  if (!input.userId) return { error: 'Válassz felhasználót a licenchez.' }

  const deviceLimit = input.deviceLimit ?? 2
  if (!Number.isInteger(deviceLimit) || deviceLimit < 1 || deviceLimit > 10) {
    return { error: 'Az eszköz-limit 1 és 10 közötti egész szám lehet.' }
  }

  const today = new Date()
  const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const nextYear = new Date(today)
  nextYear.setFullYear(nextYear.getFullYear() + 1)
  const defaultUntil = `${nextYear.getFullYear()}-${String(nextYear.getMonth() + 1).padStart(2, '0')}-${String(nextYear.getDate()).padStart(2, '0')}`

  const validFrom = input.validFrom || defaultFrom
  const validUntil = input.validUntil || defaultUntil
  if (!DATE_ONLY_RE.test(validFrom) || !DATE_ONLY_RE.test(validUntil)) {
    return { error: 'Érvénytelen dátumformátum (ÉÉÉÉ-HH-NN szükséges).' }
  }
  if (validUntil <= validFrom) {
    return { error: 'A lejárat dátumának a kezdet utáninak kell lennie.' }
  }

  const payload: Record<string, unknown> = {
    user_id: input.userId,
    congregation_id: input.congregationId || null,
    device_limit: deviceLimit,
    valid_from: validFrom,
    valid_until: validUntil,
    notes: input.notes?.trim() || null,
  }

  let { data, error } = await ctx.supabase
    .from('licenses')
    .insert(payload)
    .select('id')
    .single()

  if (error && error.code === '23502' && error.message.includes('issued_jwt')) {
    // A séma még az eredeti (issued_jwt NOT NULL) — üres placeholder-rel
    // megismételjük. Futtatandó: migration-docs/sql/2026-07-11-licenses-admin-crud.sql
    ;({ data, error } = await ctx.supabase
      .from('licenses')
      .insert({ ...payload, issued_jwt: '' })
      .select('id')
      .single())
  }

  if (error) return { error: error.message }
  if (!data) return { error: 'A licenc létrehozása nem adott vissza azonosítót.' }

  await ctx.supabase.rpc('log_audit_event', {
    p_action: 'license.issue',
    p_target_table: 'licenses',
    p_target_id: data.id as string,
    p_metadata: {
      user_id: input.userId,
      device_limit: deviceLimit,
      valid_from: validFrom,
      valid_until: validUntil,
    },
  })

  revalidatePath('/admin/eszkozok')
  return { data: { id: data.id as string } }
}

/** Licenc hosszabbítása (valid_until módosítása). */
export async function extendLicense(input: { id: string; validUntil: string }) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  if (!DATE_ONLY_RE.test(input.validUntil)) {
    return { error: 'Érvénytelen dátumformátum (ÉÉÉÉ-HH-NN szükséges).' }
  }

  const { data: before, error: readErr } = await ctx.supabase
    .from('licenses')
    .select('id, valid_from, valid_until, revoked')
    .eq('id', input.id)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!before) return { error: 'A licenc nem található.' }
  if (before.revoked) return { error: 'Visszavont licenc nem hosszabbítható — előbb állítsd vissza.' }
  if (input.validUntil <= (before.valid_from as string)) {
    return { error: 'A lejárat dátumának a kezdet utáninak kell lennie.' }
  }

  const { error: updErr } = await ctx.supabase
    .from('licenses')
    .update({ valid_until: input.validUntil })
    .eq('id', input.id)

  if (updErr) return { error: updErr.message }

  await ctx.supabase.rpc('log_audit_event', {
    p_action: 'license.extend',
    p_target_table: 'licenses',
    p_target_id: input.id,
    p_metadata: { from: before.valid_until, to: input.validUntil },
  })

  revalidatePath('/admin/eszkozok')
  return {}
}

/** Licenc szerkesztése (eszköz-limit + megjegyzés). */
export async function updateLicense(input: { id: string; deviceLimit: number; notes?: string }) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  if (!Number.isInteger(input.deviceLimit) || input.deviceLimit < 1 || input.deviceLimit > 10) {
    return { error: 'Az eszköz-limit 1 és 10 közötti egész szám lehet.' }
  }

  const { data: before, error: readErr } = await ctx.supabase
    .from('licenses')
    .select('id, device_limit, notes')
    .eq('id', input.id)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!before) return { error: 'A licenc nem található.' }

  const notes = input.notes?.trim() || null
  const { error: updErr } = await ctx.supabase
    .from('licenses')
    .update({ device_limit: input.deviceLimit, notes })
    .eq('id', input.id)

  if (updErr) return { error: updErr.message }

  await ctx.supabase.rpc('log_audit_event', {
    p_action: 'license.update',
    p_target_table: 'licenses',
    p_target_id: input.id,
    p_metadata: {
      device_limit: { from: before.device_limit, to: input.deviceLimit },
      notes_changed: (before.notes ?? null) !== notes,
    },
  })

  revalidatePath('/admin/eszkozok')
  return {}
}

/**
 * Licenc visszavonása. A ki/mikor/miért az audit-logba kerül — a `licenses`
 * soron csak a `revoked` flag változik (a desktop offline-ellenőrzése ezt nézi).
 */
export async function revokeLicense(input: { id: string; reason?: string }) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const { data: before, error: readErr } = await ctx.supabase
    .from('licenses')
    .select('id, revoked, user_id')
    .eq('id', input.id)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!before) return { error: 'A licenc nem található.' }
  if (before.revoked) return { error: 'A licenc már vissza van vonva.' }

  const { error: updErr } = await ctx.supabase
    .from('licenses')
    .update({ revoked: true })
    .eq('id', input.id)

  if (updErr) return { error: updErr.message }

  await ctx.supabase.rpc('log_audit_event', {
    p_action: 'license.revoke',
    p_target_table: 'licenses',
    p_target_id: input.id,
    p_metadata: { reason: input.reason?.trim() || null, user_id: before.user_id },
  })

  revalidatePath('/admin/eszkozok')
  return {}
}

/** Visszavont licenc visszaállítása. */
export async function restoreLicense(input: { id: string }) {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const { data: before, error: readErr } = await ctx.supabase
    .from('licenses')
    .select('id, revoked, user_id')
    .eq('id', input.id)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!before) return { error: 'A licenc nem található.' }
  if (!before.revoked) return { error: 'A licenc nincs visszavont állapotban.' }

  const { error: updErr } = await ctx.supabase
    .from('licenses')
    .update({ revoked: false })
    .eq('id', input.id)

  if (updErr) return { error: updErr.message }

  await ctx.supabase.rpc('log_audit_event', {
    p_action: 'license.restore',
    p_target_table: 'licenses',
    p_target_id: input.id,
    p_metadata: { user_id: before.user_id },
  })

  revalidatePath('/admin/eszkozok')
  return {}
}

// ─────────────────────────────────────────────────────────────────────────
// Audit-log
// ─────────────────────────────────────────────────────────────────────────

export async function listAuditLog(
  filter: {
    action?: string
    userId?: string
    limit?: number
    /** ISO datetime (inkluzív alsó határ) — a kliens a lokális nap kezdetét küldi */
    dateFrom?: string
    /** ISO datetime (inkluzív felső határ) — a kliens a lokális nap végét küldi */
    dateTo?: string
  } = {},
) {
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
  if (filter.dateFrom) q = q.gte('created_at', filter.dateFrom)
  if (filter.dateTo) q = q.lte('created_at', filter.dateTo)

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
