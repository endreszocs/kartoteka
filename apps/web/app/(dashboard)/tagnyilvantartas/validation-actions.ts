'use server'

import { revalidatePath } from 'next/cache'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { logAuditEvent } from '@/lib/audit/log'
import type { MemberRow } from '@/lib/constants/members'
import {
  validateAll,
  validateMember,
  type ValidationError,
  type ValidationErrorType,
  type ValidationSeverity,
} from '@/lib/members/validation-engine'

// ── Típusok (a webes UI-nak) ────────────────────────────────────────────────

export interface MveRow {
  id: number
  member_id: number
  field_name: string
  error_type: ValidationErrorType
  error_message: string
  severity: ValidationSeverity
  status: 'open' | 'resolved' | 'ignored'
  duplicate_of_member_id: number | null
  detected_at: string
  resolved_at: string | null
  resolved_by: string | null
  ignored_at: string | null
  ignored_by: string | null
  ignored_reason: string | null
  // Bővített: a hivatkozott tag rövid neve
  member_name?: string
  duplicate_member_name?: string | null
}

export interface MveStats {
  total_open: number
  critical: number
  medium: number
  warning: number
  duplicates: number
  resolved_today: number
  last_run_at: string | null
}

// ── Tag-lekérdezés a validációhoz ───────────────────────────────────────────

const MEMBER_SELECT =
  'id, cnp, csaladnev, k_nev, szcs_nev, namepattern, ferfi, sz_datum, sz_helyid, foglalkozas, vallas, telefon, email, meghalt, member_status, isvisible, type, befizetoev, allapot, id_apja, id_anyja, apjaneve, anyjaneve, megjegyzes, c_helysegid, c_utcaid, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto, congregation_id, adrstreet:adrstreet!c_utcaid(name), adrlocality:adrlocality!c_helysegid(name)'

async function fetchMembers(): Promise<MemberRow[]> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return []
  const { data } = await supabase
    .from('szemely')
    .select(MEMBER_SELECT)
    .eq('congregation_id', congregationId)
    .eq('isvisible', true)
  return ((data || []) as unknown as MemberRow[]).map((m) => ({
    ...m,
    elkoltozott: false, // a szemely tábla NEM tárol elkoltozott-ot, MemberRow viszont igen
  }))
}

// ── runValidation: teljes újrafutás + DB szinkron ──────────────────────────

export async function runValidation(): Promise<{
  ok: boolean
  total_errors: number
  inserted: number
  updated: number
  resolved: number
  error?: string
}> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) {
    return { ok: false, total_errors: 0, inserted: 0, updated: 0, resolved: 0, error: 'Nincs aktív gyülekezet.' }
  }

  const members = await fetchMembers()
  const newErrors = validateAll(members)

  // Meglévő nyitott hibák a gyülekezetben
  const { data: existing } = await supabase
    .from('member_validation_errors')
    .select('id, member_id, field_name, error_type, status, duplicate_of_member_id')
    .eq('congregation_id', congregationId)
    .neq('status', 'ignored')

  type ExistingRow = {
    id: number
    member_id: number
    field_name: string
    error_type: string
    status: 'open' | 'resolved'
    duplicate_of_member_id: number | null
  }
  const existingRows = (existing || []) as ExistingRow[]

  // Kulcs egyezésvizsgálathoz
  const keyFor = (e: { member_id: number; field_name: string; error_type: string; duplicate_of_member_id?: number | null }) =>
    `${e.member_id}|${e.field_name}|${e.error_type}|${e.duplicate_of_member_id ?? ''}`

  const existingByKey = new Map<string, ExistingRow>()
  for (const e of existingRows) {
    existingByKey.set(keyFor({ ...e, duplicate_of_member_id: e.duplicate_of_member_id ?? null }), e)
  }

  const newByKey = new Map<string, ValidationError>()
  for (const e of newErrors) {
    newByKey.set(keyFor({ ...e, duplicate_of_member_id: e.duplicate_of_member_id ?? null }), e)
  }

  // 1. INSERT: amelyik új és nincs meg
  const toInsert: Array<Record<string, unknown>> = []
  for (const [key, err] of newByKey) {
    if (!existingByKey.has(key)) {
      toInsert.push({
        member_id: err.member_id,
        congregation_id: congregationId,
        field_name: err.field_name,
        error_type: err.error_type,
        error_message: err.error_message,
        severity: err.severity,
        duplicate_of_member_id: err.duplicate_of_member_id ?? null,
        status: 'open',
      })
    }
  }
  let inserted = 0
  if (toInsert.length > 0) {
    const { error } = await supabase.from('member_validation_errors').insert(toInsert)
    if (error) {
      return { ok: false, total_errors: newErrors.length, inserted: 0, updated: 0, resolved: 0, error: `INSERT hiba: ${error.message}` }
    }
    inserted = toInsert.length
  }

  // 2. RESOLVED: amelyik nem újratalálható, és NEM ignored, NEM resolved → resolved
  const toResolveIds: number[] = []
  for (const [key, row] of existingByKey) {
    if (!newByKey.has(key) && row.status === 'open') {
      toResolveIds.push(row.id)
    }
  }
  let resolved = 0
  if (toResolveIds.length > 0) {
    const { error } = await supabase
      .from('member_validation_errors')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .in('id', toResolveIds)
    if (error) {
      return { ok: false, total_errors: newErrors.length, inserted, updated: 0, resolved: 0, error: `RESOLVED update hiba: ${error.message}` }
    }
    resolved = toResolveIds.length
  }

  // 3. UPDATED: meglévő open hiba — error_message frissítés (esetleg új duplikációs cél)
  const toUpdateRows: Array<{ id: number; error_message: string }> = []
  for (const [key, err] of newByKey) {
    const existing = existingByKey.get(key)
    if (existing && existing.status === 'open') {
      // Ha az error_message változott, frissítjük
      // (nem olvassuk be a régit, csak felülírjuk — egyszerűbb és olcsóbb)
      toUpdateRows.push({ id: existing.id, error_message: err.error_message })
    }
  }
  let updated = 0
  if (toUpdateRows.length > 0) {
    // Kötegelt UPDATE — egy körben. Supabase nem támogat batch update-et,
    // de a Promise.all párhuzamosít.
    const results = await Promise.all(
      toUpdateRows.map((r) =>
        supabase
          .from('member_validation_errors')
          .update({ error_message: r.error_message })
          .eq('id', r.id),
      ),
    )
    updated = results.filter((r) => !r.error).length
  }

  revalidatePath('/tagnyilvantartas')
  await logAuditEvent({ action: 'validation.run', targetTable: 'member_validation_errors', metadata: { total_errors: newErrors.length, inserted, updated, resolved } })
  return { ok: true, total_errors: newErrors.length, inserted, updated, resolved }
}

// ── recheckMember: egyetlen tag újraértékelése ─────────────────────────────

export async function recheckMember(memberId: number): Promise<{ ok: boolean; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { ok: false, error: 'Nincs aktív gyülekezet.' }

  // Tag lekérése
  const { data: m } = await supabase
    .from('szemely')
    .select(MEMBER_SELECT)
    .eq('id', memberId)
    .eq('congregation_id', congregationId)
    .maybeSingle()

  if (!m) return { ok: false, error: 'A tag nem található vagy nincs hozzáférés.' }

  const memberRow = { ...(m as unknown as MemberRow), elkoltozott: false }
  const newErrors = memberRow.meghalt ? [] : validateMember(memberRow)

  // Nyitott hibái a tagnak
  const { data: existing } = await supabase
    .from('member_validation_errors')
    .select('id, field_name, error_type, status, duplicate_of_member_id')
    .eq('member_id', memberId)
    .neq('status', 'ignored')

  type ExistingRow = {
    id: number
    field_name: string
    error_type: string
    status: 'open' | 'resolved'
    duplicate_of_member_id: number | null
  }
  const existingRows = (existing || []) as ExistingRow[]
  const keyFor = (e: { field_name: string; error_type: string; duplicate_of_member_id?: number | null }) =>
    `${e.field_name}|${e.error_type}|${e.duplicate_of_member_id ?? ''}`

  const existingByKey = new Map(existingRows.map((r) => [keyFor({ ...r, duplicate_of_member_id: r.duplicate_of_member_id ?? null }), r]))
  const newByKey = new Map(newErrors.map((e) => [keyFor({ ...e, duplicate_of_member_id: e.duplicate_of_member_id ?? null }), e]))

  // INSERT
  const toInsert = [...newByKey.entries()]
    .filter(([k]) => !existingByKey.has(k))
    .map(([, err]) => ({
      member_id: err.member_id,
      congregation_id: congregationId,
      field_name: err.field_name,
      error_type: err.error_type,
      error_message: err.error_message,
      severity: err.severity,
      duplicate_of_member_id: err.duplicate_of_member_id ?? null,
      status: 'open',
    }))
  if (toInsert.length > 0) {
    await supabase.from('member_validation_errors').insert(toInsert)
  }

  // RESOLVED
  const toResolveIds = [...existingByKey.entries()]
    .filter(([k, r]) => !newByKey.has(k) && r.status === 'open')
    .map(([, r]) => r.id)
  if (toResolveIds.length > 0) {
    await supabase
      .from('member_validation_errors')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .in('id', toResolveIds)
  }

  revalidatePath('/tagnyilvantartas')
  return { ok: true }
}

// ── getValidationErrors: szűrt lekérdezés ───────────────────────────────────

export interface MveFilters {
  status?: 'open' | 'resolved' | 'ignored' | 'all'
  severity?: ValidationSeverity | 'all'
  errorType?: ValidationErrorType | 'all'
  search?: string
  limit?: number
  offset?: number
}

export async function getValidationErrors(filters: MveFilters = {}): Promise<{
  rows: MveRow[]
  total: number
}> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { rows: [], total: 0 }

  let q = supabase
    .from('member_validation_errors')
    .select(
      'id, member_id, field_name, error_type, error_message, severity, status, duplicate_of_member_id, detected_at, resolved_at, resolved_by, ignored_at, ignored_by, ignored_reason, member:szemely!member_id(csaladnev, k_nev), duplicate:szemely!duplicate_of_member_id(csaladnev, k_nev)',
      { count: 'exact' },
    )
    .eq('congregation_id', congregationId)
    .order('severity', { ascending: false })
    .order('detected_at', { ascending: false })

  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
  else if (!filters.status) q = q.eq('status', 'open') // default: csak nyitottak

  if (filters.severity && filters.severity !== 'all') q = q.eq('severity', filters.severity)
  if (filters.errorType && filters.errorType !== 'all') q = q.eq('error_type', filters.errorType)

  if (filters.search && filters.search.trim().length >= 2) {
    // Csak az error_message + field_name-en keresünk (a tag-név join miatt
    // bonyolultabb lenne)
    q = q.or(`error_message.ilike.%${filters.search.trim()}%,field_name.ilike.%${filters.search.trim()}%`)
  }

  if (typeof filters.limit === 'number') q = q.limit(filters.limit)
  if (typeof filters.offset === 'number' && filters.offset > 0) {
    q = q.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
  }

  const { data, count } = await q

  type RawRow = {
    id: number
    member_id: number
    field_name: string
    error_type: ValidationErrorType
    error_message: string
    severity: ValidationSeverity
    status: 'open' | 'resolved' | 'ignored'
    duplicate_of_member_id: number | null
    detected_at: string
    resolved_at: string | null
    resolved_by: string | null
    ignored_at: string | null
    ignored_by: string | null
    ignored_reason: string | null
    member: { csaladnev: string | null; k_nev: string | null } | null
    duplicate: { csaladnev: string | null; k_nev: string | null } | null
  }
  const rows: MveRow[] = ((data || []) as unknown as RawRow[]).map((r) => ({
    ...r,
    member_name: r.member ? `${r.member.csaladnev || ''} ${r.member.k_nev || ''}`.trim() : `#${r.member_id}`,
    duplicate_member_name: r.duplicate
      ? `${r.duplicate.csaladnev || ''} ${r.duplicate.k_nev || ''}`.trim()
      : null,
  }))

  return { rows, total: count || rows.length }
}

// ── getValidationStats: KPI kártyákhoz ──────────────────────────────────────

export async function getValidationStats(): Promise<MveStats> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  const empty: MveStats = { total_open: 0, critical: 0, medium: 0, warning: 0, duplicates: 0, resolved_today: 0, last_run_at: null }
  if (!congregationId) return empty

  // Egyetlen lekérdezés — minden hiba fő mezővel
  const { data } = await supabase
    .from('member_validation_errors')
    .select('id, severity, status, error_type, resolved_at, detected_at')
    .eq('congregation_id', congregationId)

  const rows = (data || []) as Array<{
    id: number
    severity: ValidationSeverity
    status: 'open' | 'resolved' | 'ignored'
    error_type: ValidationErrorType
    resolved_at: string | null
    detected_at: string
  }>

  const todayIso = new Date().toISOString().slice(0, 10)
  let lastRunAt: string | null = null
  for (const r of rows) {
    if (r.status === 'open') {
      empty.total_open++
      if (r.severity === 'critical') empty.critical++
      else if (r.severity === 'medium') empty.medium++
      else if (r.severity === 'warning') empty.warning++
      if (r.error_type === 'duplicate') empty.duplicates++
    }
    if (r.status === 'resolved' && r.resolved_at?.slice(0, 10) === todayIso) {
      empty.resolved_today++
    }
    if (!lastRunAt || r.detected_at > lastRunAt) lastRunAt = r.detected_at
  }
  empty.last_run_at = lastRunAt
  return empty
}

// ── resolveError: manuálisan resolved-re állít ─────────────────────────────

export async function resolveError(errorId: number): Promise<{ ok: boolean; error?: string }> {
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  if (!congregationId || !userId) return { ok: false, error: 'Nincs bejelentkezett felhasználó.' }

  const { error } = await supabase
    .from('member_validation_errors')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq('id', errorId)
    .eq('congregation_id', congregationId)
  if (error) return { ok: false, error: error.message }

  await logAuditEvent({ action: 'validation.resolve', targetTable: 'member_validation_errors', targetId: String(errorId) }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { ok: true }
}

// ── ignoreError: figyelmen kívül hagyás indoklással ─────────────────────────

export async function ignoreError(errorId: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  if (!congregationId || !userId) return { ok: false, error: 'Nincs bejelentkezett felhasználó.' }
  if (!reason.trim()) return { ok: false, error: 'Az indoklás kötelező.' }

  const { error } = await supabase
    .from('member_validation_errors')
    .update({
      status: 'ignored',
      ignored_at: new Date().toISOString(),
      ignored_by: userId,
      ignored_reason: reason.trim(),
    })
    .eq('id', errorId)
    .eq('congregation_id', congregationId)
  if (error) return { ok: false, error: error.message }

  await logAuditEvent({ action: 'validation.ignore', targetTable: 'member_validation_errors', targetId: String(errorId), metadata: { reason: reason.trim() } }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { ok: true }
}

// ── reopenError: vissza open-re (admin) ─────────────────────────────────────

export async function reopenError(errorId: number): Promise<{ ok: boolean; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { ok: false, error: 'Nincs aktív gyülekezet.' }

  const { error } = await supabase
    .from('member_validation_errors')
    .update({
      status: 'open',
      resolved_at: null,
      resolved_by: null,
      ignored_at: null,
      ignored_by: null,
      ignored_reason: null,
    })
    .eq('id', errorId)
    .eq('congregation_id', congregationId)
  if (error) return { ok: false, error: error.message }

  await logAuditEvent({ action: 'validation.reopen', targetTable: 'member_validation_errors', targetId: String(errorId) }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { ok: true }
}
