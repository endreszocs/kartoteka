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
import { approvedEmail } from '@/lib/email/templates/access-request'
import { logAuditEvent } from '@/lib/audit/log'

import type {
  AccessRequestStats,
  ApproveInput,
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

// 2026-08-11 (K5 P2 #6) — TÖRÖLVE innen NÉGY hívó nélküli `use server` export:
// `listAccessRequests`, `getAccessRequest`, `rejectAccessRequest`,
// `revertToPending`. Egyetlen felületük a `components/admin/access-requests-tab.tsx`
// + a két hozzá tartozó dialógus volt, amiket egyetlen útvonal sem mountolt
// (a kezelés a /admin/felhasznalok → unified-users-tab.tsx-re költözött). Egy
// `use server` export akkor is ÉLŐ POST-végpont, ha nincs gombja a felületen,
// ezért a törlésük a támadási felületet is csökkenti.
//
// FIGYELEM, NYITOTT KÉRDÉS a törlés kapcsán: az ÉLŐ elutasítás
// (`admin/actions.ts` → `rejectPendingUser` → `admin_reject_user` RPC) a
// `profiles` sort állítja át, az `access_requests` sorhoz NEM nyúl. A jóváhagyás
// viszont igen (`approveAccessRequest`, lentebb, az aktiválási varázslóból).
// Vagyis egy elutasított kérelem `access_requests.status` mezője „pending"
// marad. Ezt a törlés nem okozta és nem is javítja — külön döntés kell róla.

// ─────────────────────────────────────────────────────────────────────────
// 1) Feltöltött igazolás aláírt URL-je (privát bucket, csak admin)
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
): Promise<{ error?: string; info?: string }> {
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

  // Létező user MEGBÍZHATÓ keresése a profiles-ból email alapján.
  // A `handle_new_user` trigger minden auth.users-t tükröz a profiles-ba, ezért
  // az emailről közvetlenül megtaláljuk a user id-t.
  //
  // FIX 2026-06-06: a korábbi `adminClient.auth.admin.listUsers()` CSAK az első
  // oldalt (alapból 50 user) adta vissza — nagyobb rendszerben a már létező,
  // JELSZÓVAL regisztrált felhasználót "újként" kezelte, megpróbálta meghívni,
  // az "already registered" hibára futott, és a profil 'pending' MARADT → a
  // jóváhagyott lelkész „jóváhagyásra vár" üzenetet kapott és nem tudott belépni.
  const { data: profCandidates } = await ctx.supabase
    .from('profiles')
    .select('id, email')
    .ilike('email', req.email)
  const existingProfile = (
    (profCandidates as Array<{ id: string; email: string | null }> | null) || []
  ).find((p) => (p.email || '').toLowerCase() === req.email.toLowerCase())

  if (existingProfile) {
    // ── A) User MÁR létezik (jelszavas regisztráció / korábbi Google / admin) ──
    resultingUserId = existingProfile.id

    // Aktiválás a SECURITY DEFINER RPC-vel: megkerüli az RLS-t + a profiles
    // GRANT-okat, ÉS hibát is ad vissza (szemben a korábbi NÉMA update-tel, ami
    // RLS/grant hiba esetén csendben nem csinált semmit → a fiók pending maradt).
    const { error: actErr } = await ctx.supabase.rpc('admin_activate_user', {
      p_user_id: resultingUserId,
      p_congregation_id: req.requested_congregation_id ?? null,
      p_diocese_id: req.requested_diocese_id ?? null,
      p_district_id: req.requested_district_id ?? null,
    })
    if (actErr) {
      return { error: `A fiók aktiválása nem sikerült: ${actErr.message}` }
    }

    await ctx.supabase
      .from('access_requests')
      .update({ resulting_user_id: resultingUserId })
      .eq('id', input.id)
    inviteUrl = `${appUrl}/login`

    // Email automatikus megerősítése — hogy a jelszóval regisztrált lelkész
    // AZONNAL be tudjon lépni (ha korábban nem kattintott a megerősítő linkre).
    // Az admin jóváhagyása egyben a cím megerősítése is. (service_role kell hozzá)
    try {
      const adminClient = getSupabaseAdminClient()
      await adminClient.auth.admin.updateUserById(resultingUserId, { email_confirm: true })
    } catch (e) {
      inviteWarning =
        'A fiók aktiválva, de az email automatikus megerősítése kimaradt. Ha a ' +
        'felhasználó nem tud belépni, kérje meg, hogy erősítse meg az email-címét ' +
        'a regisztrációs linkkel.'
      console.warn('[approve-access-request] email_confirm:', e instanceof Error ? e.message : e)
    }
  } else {
    // ── B) ÚJ user — meghívás (service_role kell) ──
    try {
      const adminClient = getSupabaseAdminClient()
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

        // Aktiválás + scope a SECURITY DEFINER RPC-vel (RLS/grant-biztos, hibát ad).
        const { error: actErr } = await ctx.supabase.rpc('admin_activate_user', {
          p_user_id: resultingUserId,
          p_congregation_id: req.requested_congregation_id ?? null,
          p_diocese_id: req.requested_diocese_id ?? null,
          p_district_id: req.requested_district_id ?? null,
        })
        if (actErr) {
          inviteWarning = `A meghívott felhasználó létrejött, de az aktiválás hibázott: ${actErr.message}`
        }
        // Név + elsődleges szerep (best-effort)
        await ctx.supabase
          .from('profiles')
          .update({ role: req.requested_role, full_name: req.full_name })
          .eq('id', resultingUserId)
        await ctx.supabase
          .from('access_requests')
          .update({ resulting_user_id: resultingUserId })
          .eq('id', input.id)
      }
    } catch (err: unknown) {
      // getSupabaseAdminClient() throw (pl. SUPABASE_SERVICE_ROLE_KEY nincs beállítva)
      const msg = err instanceof Error ? err.message : 'ismeretlen'
      console.error('[approve-access-request] admin-client hiba:', msg)
      inviteWarning =
        'A kérelem elfogadva, de a Supabase admin-kliens nem elérhető: ' +
        msg +
        '. A user-létrehozás kimarad — admin kézzel küldje el az invite-et.'
    }
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

  // Audit: ki, mikor hagyta jóvá, milyen szerepre + gyülekezetre.
  await logAuditEvent(
    {
      action: 'access_request.approve',
      targetTable: 'access_requests',
      targetId: input.id,
      metadata: {
        email: req.email,
        role: req.requested_role,
        congregation_id: req.requested_congregation_id,
        resulting_user_id: resultingUserId,
      },
    },
    ctx.supabase,
  )

  // Lelkészi szolgálati napló: új lelkész jóváhagyásakor nyitunk egy tenure-t
  // (mikortól szolgál ebben a gyülekezetben). Idempotens az RPC oldalán.
  if (req.requested_role === 'lelkesz' && req.requested_congregation_id && resultingUserId) {
    const { error: tenureErr } = await ctx.supabase.rpc('record_pastor_tenure_start', {
      p_congregation_id: req.requested_congregation_id,
      p_user_id: resultingUserId,
      p_role: 'lelkesz',
    })
    if (tenureErr) {
      console.warn('[approve-access-request] tenure-start hiba:', tenureErr.message)
    }
  }

  revalidatePath('/admin')
  // FIX 2026-07-11 (admin-redesign): az invite-hiba eddig CSAK console.warn-ba
  // ment, a return üres siker volt — az admin sosem tudta meg, hogy a user nem
  // jött létre / nem kapott meghívót. Az `info` mezőt a kliens toastban mutatja.
  return inviteWarning ? { info: inviteWarning } : {}
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
