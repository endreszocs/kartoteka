'use server'

/**
 * Admin → Access Requests server actions (M0.1 — Tauri-migráció).
 *
 * A 'use server' fájlból CSAK async függvényeket szabad exportálni (Next.js 16 szabály).
 * A types + label const-ok a `access-requests-shared.ts` fájlban élnek, innen
 * importálva, de NEM re-exportálva.
 *
 * Jogosultság: csak `profiles.role = 'admin'`. RLS szinten is védett.
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { sendEmail } from '@/lib/email/send'
import { approvedEmail, rejectedEmail } from '@/lib/email/templates/access-request'

import type {
  AccessRequest,
  AccessRequestStats,
  AccessRequestStatus,
  ApproveInput,
  ListFilter,
  RejectInput,
} from './access-requests-shared'
import { ROLE_LABELS } from './access-requests-shared'

// ─────────────────────────────────────────────────────────────────────────
// Jogosultság-ellenőrzés
// ─────────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' as const }
  if (!access.admin && !access.master) {
    return { error: 'Csak rendszergazda férhet hozzá.' as const }
  }
  return { supabase: access.supabase, userId: access.user.id }
}

// ─────────────────────────────────────────────────────────────────────────
// 1) Listázás szűrővel
// ─────────────────────────────────────────────────────────────────────────

export async function listAccessRequests(
  filter: ListFilter = {},
): Promise<{ data?: AccessRequest[]; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  let query = ctx.supabase
    .from('access_requests')
    .select(
      '*, district:districts!requested_district_id(name), diocese:dioceses!requested_diocese_id(name), congregation:congregations!requested_congregation_id(name, nev_hu)',
    )
    .order('created_at', { ascending: false })

  if (filter.status && filter.status !== 'all') {
    query = query.eq('status', filter.status)
  }

  if (filter.search && filter.search.trim()) {
    const s = `%${filter.search.trim().toLowerCase()}%`
    query = query.or(`email.ilike.${s},full_name.ilike.${s}`)
  }

  const { data, error } = await query
  if (error) return { error: error.message }

  return { data: (data || []) as AccessRequest[] }
}

// ─────────────────────────────────────────────────────────────────────────
// 2) Egyedi kérelem lekérése
// ─────────────────────────────────────────────────────────────────────────

export async function getAccessRequest(
  id: string,
): Promise<{ data?: AccessRequest; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const { data, error } = await ctx.supabase
    .from('access_requests')
    .select(
      '*, district:districts!requested_district_id(name), diocese:dioceses!requested_diocese_id(name), congregation:congregations!requested_congregation_id(name, nev_hu)',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'A kérelem nem található.' }

  return { data: data as AccessRequest }
}

// ─────────────────────────────────────────────────────────────────────────
// 2/b) Feltöltött igazolás aláírt URL-je (privát bucket, csak admin)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Rövid életű (5 perc) signed URL-t ad az `access-request-docs` privát bucketben
 * tárolt igazoláshoz. A service_role kulccsal (getSupabaseAdminClient) generálja,
 * de a hívás CSAK admin-nak engedélyezett (requireAdmin).
 */
export async function getAccessRequestDocumentUrl(
  path: string,
): Promise<{ url?: string; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }
  if (!path || !path.trim()) return { error: 'Nincs csatolt dokumentum.' }

  try {
    const admin = getSupabaseAdminClient()
    const { data, error } = await admin.storage
      .from('access-request-docs')
      .createSignedUrl(path, 300)
    if (error || !data?.signedUrl) {
      return { error: error?.message || 'A dokumentum hivatkozása nem hozható létre.' }
    }
    return { url: data.signedUrl }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Ismeretlen hiba.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3) Jóváhagyás
// ─────────────────────────────────────────────────────────────────────────

/**
 * Jóváhagyja a kérelmet — status=`approved`.
 *
 * Teljes flow (M0.3):
 *  1. Validation: csak pending → approved
 *  2. `access_requests.status = 'approved'`
 *  3. Supabase Auth: `inviteUserByEmail` → user létrejön pending-activate állapotban
 *  4. `profiles` sor: status='approved', role=requested_role, email, full_name
 *  5. `access_requests.resulting_user_id` frissítve
 *  6. Approved-email küldés (invite URL-lel)
 *
 * Ha a user EMAIL-je már létezik auth.users-ben, visszaadjuk a hiba-üzenetet — az
 * admin kézi intervencióval döntheti el.
 */
export async function approveAccessRequest(
  input: ApproveInput,
): Promise<{ error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const { data: current, error: readErr } = await ctx.supabase
    .from('access_requests')
    .select('status, email, full_name, requested_role, requested_district_id, requested_diocese_id, requested_congregation_id')
    .eq('id', input.id)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!current) return { error: 'A kérelem nem található.' }
  if (current.status !== 'pending') {
    return { error: `Csak pending állapotú kérelem fogadható el (most: ${current.status}).` }
  }

  const req = current as {
    status: string
    email: string
    full_name: string
    requested_role: keyof typeof ROLE_LABELS
    requested_district_id: string | null
    requested_diocese_id: string | null
    requested_congregation_id: string | null
  }

  // ── 1. Status frissítés ─────────────────────────────────────
  const { error: updateErr } = await ctx.supabase
    .from('access_requests')
    .update({
      status: 'approved',
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
      admin_notes: input.admin_notes ?? null,
    })
    .eq('id', input.id)

  if (updateErr) return { error: updateErr.message }

  // ── 2. Supabase Auth user létrehozás (service_role) ──────────
  // A `getSupabaseAdminClient()` throw-ol, ha nincs SUPABASE_SERVICE_ROLE_KEY.
  // Graceful fail: a status már approved — admin kézzel pótolhatja az invite-et.
  //
  // Production fallback: ha NEXT_PUBLIC_APP_URL env nincs beállítva,
  // a saját kartoteka.app domainre mutatunk (NEM localhost-ra), hogy
  // a Supabase invite-linkek helyesen jöjjenek létre.
  // FONTOS: a Railway env-ben és a Supabase dashboard → Authentication →
  // URL Configuration → Site URL is `https://kartoteka.app` legyen.
  const PRODUCTION_FALLBACK = 'https://kartoteka.app'
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === 'production' ? PRODUCTION_FALLBACK : 'http://localhost:3000')
  let resultingUserId: string | null = null
  let inviteUrl: string | null = null
  let inviteWarning: string | null = null

  try {
    const adminClient = getSupabaseAdminClient()

    // Check 1: már létezik-e user ugyanezzel az emaillel?
    // (pl. ha a kérelmező már admin, és saját kérelmét hagyja jóvá)
    const { data: existingUserList } = await adminClient.auth.admin.listUsers()
    const existingUser = existingUserList?.users.find(
      (u) => u.email?.toLowerCase() === req.email.toLowerCase(),
    )

    if (existingUser) {
      // User már létezik — csak a profiles + access_requests frissítés
      // 2026-05-02 (v0.9.37): status 'approved' → 'active'. Az auth-flow
      // (callback, login, setup, oauth-complete, pending) MIND `status==='active'`-ot
      // követel. Az 'approved' egy korábbi flow-ból maradt szemantika ami sehol nem
      // konvertálódik tovább 'active'-re. → Az admin elfogadás után azonnal aktív.
      resultingUserId = existingUser.id
      await ctx.supabase
        .from('profiles')
        .update({
          status: 'active',
          district_id: req.requested_district_id,
          diocese_id: req.requested_diocese_id,
          congregation_id: req.requested_congregation_id,
        })
        .eq('id', resultingUserId)
      await ctx.supabase
        .from('access_requests')
        .update({ resulting_user_id: resultingUserId })
        .eq('id', input.id)
      inviteUrl = `${appUrl}/login`
      inviteWarning = 'A user már létezett (pl. saját admin fiók vagy korábbi Google-bejelentkezés) — csak a státuszt frissítettük active-re.'
    } else {
      // Új user — inviteUserByEmail
      const { data: inviteData, error: inviteErr } =
        await adminClient.auth.admin.inviteUserByEmail(req.email, {
          redirectTo: `${appUrl}/oauth-complete`,
          data: {
            full_name: req.full_name,
            requested_role: req.requested_role,
            access_request_id: input.id,
          },
        })

      if (inviteErr) {
        console.error('[approve-access-request] inviteUserByEmail hiba:', inviteErr.message)
        inviteWarning = `Supabase invite-email hiba: ${inviteErr.message}. A státusz approved, de a user-létrehozás nem történt meg. Kézi intervenció szükséges.`
      } else if (inviteData?.user) {
        resultingUserId = inviteData.user.id
        inviteUrl = `${appUrl}/login?invited=1`

        // 2026-05-02 (v0.9.37): status 'active' (lásd fent a magyarázatot)
        await ctx.supabase
          .from('profiles')
          .update({
            status: 'active',
            role: req.requested_role,
            full_name: req.full_name,
            district_id: req.requested_district_id,
            diocese_id: req.requested_diocese_id,
            congregation_id: req.requested_congregation_id,
          })
          .eq('id', resultingUserId)
        await ctx.supabase
          .from('access_requests')
          .update({ resulting_user_id: resultingUserId })
          .eq('id', input.id)
      }
    }
  } catch (err: unknown) {
    // getSupabaseAdminClient() throw (pl. SUPABASE_SERVICE_ROLE_KEY nincs beállítva)
    // vagy bármi más váratlan hiba. A status már approved — loggoljuk, értesítjük az admint.
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    console.error('[approve-access-request] admin-client hiba:', msg)
    inviteWarning =
      'A kérelem elfogadva, de a Supabase admin-kliens nem elérhető: ' +
      msg +
      '. A user-létrehozás kimarad — admin kézzel küldje el az invite-et.'
  }

  if (inviteWarning) {
    console.warn('[approve-access-request]', inviteWarning)
  }

  // ── 4/b. Gyülekezeti profile_role automatikus beillesztése ───
  // A frissen jóváhagyott lelkész (vagy gyülekezeti könyvelő) a választott
  // gyülekezethez kötött profile_role-t kap, hogy a multi-role rendszer + a
  // profilváltó is lássa, és a belépés utáni dashboard a gyülekezetet nyissa.
  // Más szintű szerepköröket (esperes, egyházmegyei/kerületi admin) az admin a
  // Felhasználók fülön rendel a megfelelő scope-pal.
  const CONGREGATION_SCOPED_ROLES: readonly string[] = ['lelkesz', 'konyvelo']
  if (
    resultingUserId &&
    req.requested_congregation_id &&
    CONGREGATION_SCOPED_ROLES.includes(req.requested_role)
  ) {
    try {
      const { data: existingRole } = await ctx.supabase
        .from('profile_roles')
        .select('id')
        .eq('profile_id', resultingUserId)
        .eq('scope', 'congregation')
        .eq('scope_id', req.requested_congregation_id)
        .eq('role', req.requested_role)
        .maybeSingle()

      if (!existingRole) {
        await ctx.supabase.from('profile_roles').insert({
          profile_id: resultingUserId,
          scope: 'congregation',
          scope_id: req.requested_congregation_id,
          role: req.requested_role,
          approval_status: 'approved',
          granted_by: ctx.userId,
          approved_by: ctx.userId,
          approved_at: new Date().toISOString(),
          active: true,
        })
      }
    } catch (e) {
      console.error('[approve-access-request] profile_roles insert hiba:', e)
      // best-effort — a fő aktiválás sikeres
    }
  }

  // ── 5. Saját magyar nyelvű email-értesítés ──────────────────
  const emailRes = await sendEmail(
    approvedEmail({
      email: req.email,
      fullName: req.full_name,
      requestedRole: ROLE_LABELS[req.requested_role],
      inviteUrl: inviteUrl || `${appUrl}/login`,
    }),
  )
  if (!emailRes.success) {
    console.error('[approve-access-request] email hiba:', emailRes.error)
  }

  revalidatePath('/admin')
  return {}
}

// ─────────────────────────────────────────────────────────────────────────
// 4) Elutasítás
// ─────────────────────────────────────────────────────────────────────────

export async function rejectAccessRequest(
  input: RejectInput,
): Promise<{ error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  if (!input.rejection_reason || !input.rejection_reason.trim()) {
    return { error: 'Elutasításhoz kötelező indoklás megadása.' }
  }

  const { data: current, error: readErr } = await ctx.supabase
    .from('access_requests')
    .select('status, email, full_name')
    .eq('id', input.id)
    .maybeSingle()

  if (readErr) return { error: readErr.message }
  if (!current) return { error: 'A kérelem nem található.' }
  if (current.status !== 'pending') {
    return { error: `Csak pending állapotú kérelem utasítható el (most: ${current.status}).` }
  }

  const reason = input.rejection_reason.trim()
  const { error } = await ctx.supabase
    .from('access_requests')
    .update({
      status: 'rejected',
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
      admin_notes: input.admin_notes ?? null,
    })
    .eq('id', input.id)

  if (error) return { error: error.message }

  // M0.2: értesítő email a kérelmezőnek
  const emailRow = current as { email: string; full_name: string }
  const emailRes = await sendEmail(
    rejectedEmail({
      email: emailRow.email,
      fullName: emailRow.full_name,
      rejectionReason: reason,
    }),
  )
  if (!emailRes.success) {
    console.error('[reject-access-request] email hiba:', emailRes.error)
    // Nem bukunk el — a státusz már rögzített. Admin kézzel értesítheti.
  }

  revalidatePath('/admin')
  return {}
}

// ─────────────────────────────────────────────────────────────────────────
// 5) Újra-pending (ritka, admin visszavonás)
// ─────────────────────────────────────────────────────────────────────────

export async function revertToPending(id: string): Promise<{ error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const { error } = await ctx.supabase
    .from('access_requests')
    .update({
      status: 'pending' as AccessRequestStatus,
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin')
  return {}
}

// ─────────────────────────────────────────────────────────────────────────
// 6) Statisztikák (KPI-kártyához)
// ─────────────────────────────────────────────────────────────────────────

export async function getAccessRequestStats(): Promise<{
  data?: AccessRequestStats
  error?: string
}> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const { data, error } = await ctx.supabase
    .from('access_requests')
    .select('status, created_at')

  if (error) return { error: error.message }

  const rows = (data || []) as Array<{ status: string; created_at: string }>
  const now = Date.now()
  const d24h = now - 24 * 60 * 60 * 1000
  const d7d = now - 7 * 24 * 60 * 60 * 1000

  const stats: AccessRequestStats = {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    last24h: rows.filter((r) => new Date(r.created_at).getTime() > d24h).length,
    last7d: rows.filter((r) => new Date(r.created_at).getTime() > d7d).length,
  }

  return { data: stats }
}
