'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminAccess } from '@/lib/auth/admin-access'
import { logAuditEvent } from '@/lib/audit/log'
import { revalidatePath } from 'next/cache'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import {
  closeSupportTicketCompat,
  getAdminSupportTicketsCompat,
  getOpenSupportTicketCount,
  replySupportTicketCompat,
} from '@/lib/support/messages'

async function countActiveMembers(supabase: SupabaseClient, congregationIds?: string[]) {
  if (congregationIds && congregationIds.length === 0) return 0

  let query = supabase
    .from('szemely')
    .select('*', { count: 'exact', head: true })
    .eq('isvisible', true)
    .eq('meghalt', false)

  if (congregationIds) {
    query = query.in('congregation_id', congregationIds)
  }

  const { count, error } = await query
  if (error) throw new Error(error.message)

  return count || 0
}

// ─── Segéd: admin guard ───
//
// Sprint U.5 (D7 fix): a `requireMasterAdmin` régen csak a MASTER_ADMIN_EMAIL-t fogadta el,
// ami inkonzisztens volt az `admin/layout.tsx`-tel (ami admin + master + egyhazkeruleti_admin-t
// engedett). Most a `requireAdminAccess` helperhez delegál: alapértelmezetten admin/master/
// kerületi admin mind átmegy. Ahol kifejezetten csak master-t engedünk, ott a function-szignatúrát
// `requireMasterAdmin({ requireMaster: true })`-re bővítjük.
async function requireMasterAdmin(opts?: { requireMaster?: boolean }) {
  const access = await requireAdminAccess({
    requireMaster: opts?.requireMaster ?? false,
    allowDistrictAdmin: true,
  })
  return { supabase: access.supabase, user: access.user! }
}

async function findApprovalTarget(supabase: SupabaseClient, congregationId: string, adminUserId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, status')
    .eq('congregation_id', congregationId)
    .eq('status', 'active')
    .neq('id', adminUserId)

  if (error) {
    throw new Error(error.message)
  }

  const priority = ['lelkesz', 'esperes', 'egyhazmegyei_admin', 'admin']
  for (const role of priority) {
    const match = (data || []).find(profile => profile.role === role)
    if (match) return match
  }

  return data?.[0] || null
}

// â”€â”€â”€ ĂttekintĂ©s â”€â”€â”€

export async function getAdminOverview() {
  const { supabase } = await requireMasterAdmin()

  const [
    { count: congCount },
    { count: activeUserCount },
    memberCount,
    { count: pendingUserCount },
    pendingTicketCount,
    { data: dioceses },
  ] = await Promise.all([
    supabase.from('congregations').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    countActiveMembers(supabase),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    getOpenSupportTicketCount(supabase),
    supabase.from('dioceses').select('id, name'),
  ])

  // EgyhĂˇzmegyĂ©nkĂ©nti megoszlĂˇs
  const dioceseStats: { name: string; congregations: number; members: number }[] = []
  if (dioceses) {
    for (const d of dioceses) {
      const { data: diocesanCongs } = await supabase
        .from('congregations')
        .select('id')
        .eq('diocese_id', d.id)

      const congregationIds = (diocesanCongs || []).map(congregation => congregation.id)
      const dMem = await countActiveMembers(supabase, congregationIds)

      dioceseStats.push({
        name: d.name,
        congregations: congregationIds.length,
        members: dMem,
      })
    }
  }

  // Top 10 gyĂĽlekezet tagszĂˇm szerint
  const { data: allCongs } = await supabase
    .from('congregations')
    .select('id, nev_hu, name')

  const top10: { name: string; members: number }[] = []
  if (allCongs) {
    const counts = await Promise.all(
      allCongs.map(async (c) => {
        const count = await countActiveMembers(supabase, [c.id])
        return { name: c.nev_hu || c.name || 'Ismeretlen', members: count }
      })
    )
    counts.sort((a, b) => b.members - a.members)
    top10.push(...counts.slice(0, 10))
  }

  return {
    kpis: {
      congregations: congCount || 0,
      activeUsers: activeUserCount || 0,
      members: memberCount || 0,
      pendingUsers: pendingUserCount || 0,
      pendingTickets: pendingTicketCount || 0,
    },
    dioceseStats,
    top10,
  }
}

// â”€â”€â”€ GyĂĽlekezetek â”€â”€â”€

export async function getCongregations() {
  const { supabase } = await requireMasterAdmin()

  const { data, error } = await supabase
    .from('congregations')
    .select('id, nev_hu, name, diocese_id, dioceses(name)')
    .order('nev_hu')

  if (error) return { error: error.message }
  return { data: data || [] }
}

// 2026-05-04 — Gyülekezetek oldal újragondolva: egyházmegyénként csoportosítva,
// 1-től számozva, mindegyikhez a hozzárendelt user-ek (primary congregation_id +
// gyülekezeti scope-ú profile_roles) szerepkörrel.
export interface CongregationUserSummary {
  id: string
  full_name: string | null
  email: string | null
  /** A user `profiles.role` mezője — az "elsődleges" szerep. */
  primaryRole: string | null
  /** Összes scope=congregation profile_role ennél a gyülekezetnél. */
  profileRoles: Array<{ role: string; customLabel: string | null }>
  status: string | null
}

export interface CongregationByDioceseRow {
  id: string
  name: string
  diocese_id: string | null
  memberCount: number
  users: CongregationUserSummary[]
}

export interface DioceseGroup {
  id: string
  name: string
  district_id: string | null
  congregations: CongregationByDioceseRow[]
}

export async function getCongregationsByDiocese(): Promise<{
  data?: DioceseGroup[]
  error?: string
}> {
  const { supabase } = await requireMasterAdmin()

  // 1. Egyházmegyék
  const { data: dioceses, error: dErr } = await supabase
    .from('dioceses')
    .select('id, name, district_id')
    .order('name')

  if (dErr) return { error: `Egyházmegyék hibája: ${dErr.message}` }

  // 2. Gyülekezetek
  const { data: congs, error: cErr } = await supabase
    .from('congregations')
    .select('id, nev_hu, name, diocese_id')
    .order('nev_hu')

  if (cErr) return { error: `Gyülekezetek hibája: ${cErr.message}` }

  // 3. Profile_roles a congregation scope-ban (approved + active) — ELŐSZÖR,
  //    mert kell a profile_id lista a profiles lekérdezéshez
  const { data: roles, error: rErr } = await supabase
    .from('profile_roles')
    .select('profile_id, role, custom_label, scope_id')
    .eq('scope', 'congregation')
    .eq('approval_status', 'approved')
    .eq('active', true)

  if (rErr) return { error: `Szerepkörök hibája: ${rErr.message}` }

  // 4. Profiles — minden active+pending user, függetlenül attól, hogy van-e
  //    primary congregation_id. FIX 2026-05-04: a korábbi
  //    `not('congregation_id', 'is', null)` szűrő kizárta azokat, akiknek csak
  //    profile_role-jük van (primary mező nélkül) — emiatt nem jelentek meg
  //    a Gyülekezetek oldal user-listájában.
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status, congregation_id')
    .in('status', ['active', 'pending'])

  if (pErr) return { error: `Felhasználók hibája: ${pErr.message}` }

  // 5. Tagok száma gyülekezetenként (best-effort)
  const memberCountMap = new Map<string, number>()
  try {
    // Egyetlen lekérdezés count-tal: gyülekezetenként
    for (const c of congs || []) {
      const { count } = await supabase
        .from('szemely')
        .select('*', { count: 'exact', head: true })
        .eq('congregation_id', c.id as string)
        .eq('isvisible', true)
        .eq('meghalt', false)
      if (typeof count === 'number') memberCountMap.set(c.id as string, count)
    }
  } catch {
    // best-effort, ha bármelyik counting hibázik, 0-val esnek vissza
  }

  // 6. Csoportosítás
  const congByDiocese = new Map<string, CongregationByDioceseRow[]>()
  for (const c of congs || []) {
    const cid = c.id as string
    const did = (c.diocese_id as string | null) || ''

    // A user-eket szűrjük: minden user, aki a primary congregation-je VAGY van profile_role rá.
    // A Map dedupol az id alapján (egy user egyszer szerepel akkor is, ha mindkét feltétel igaz).
    const additionalUserIds = new Set(
      (roles || []).filter((r) => r.scope_id === cid).map((r) => r.profile_id as string),
    )
    const matchingUsers = (profiles || []).filter(
      (p) => p.congregation_id === cid || additionalUserIds.has(p.id as string),
    )

    const allUserMap = new Map<string, CongregationUserSummary>()
    for (const p of matchingUsers) {
      const userRoles = (roles || [])
        .filter((r) => r.profile_id === p.id && r.scope_id === cid)
        .map((r) => ({
          role: r.role as string,
          customLabel: (r.custom_label as string | null) ?? null,
        }))
      allUserMap.set(p.id as string, {
        id: p.id as string,
        full_name: (p.full_name as string | null) ?? null,
        email: (p.email as string | null) ?? null,
        primaryRole: (p.role as string | null) ?? null,
        profileRoles: userRoles,
        status: (p.status as string | null) ?? null,
      })
    }

    const row: CongregationByDioceseRow = {
      id: cid,
      name: (c.nev_hu as string | null) || (c.name as string | null) || '—',
      diocese_id: c.diocese_id as string | null,
      memberCount: memberCountMap.get(cid) || 0,
      users: Array.from(allUserMap.values()).sort((a, b) =>
        (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '', 'hu'),
      ),
    }

    const arr = congByDiocese.get(did) || []
    arr.push(row)
    congByDiocese.set(did, arr)
  }

  // 7. Visszaadjuk egyházmegyénként
  const result: DioceseGroup[] = (dioceses || []).map((d) => ({
    id: d.id as string,
    name: (d.name as string) || '—',
    district_id: (d.district_id as string | null) ?? null,
    congregations: congByDiocese.get(d.id as string) || [],
  }))

  // 8. "Árva" gyülekezetek (nincs egyházmegyéjük) — ha van ilyen, hozzáadjuk
  const orphanCongs = congByDiocese.get('') || []
  if (orphanCongs.length > 0) {
    result.push({
      id: '',
      name: 'Egyházmegye nélkül',
      district_id: null,
      congregations: orphanCongs,
    })
  }

  return { data: result }
}

export async function getCongregationDetails(congId: string) {
  const { supabase } = await requireMasterAdmin()
  const yearStart = `${new Date().getFullYear()}-01-01`

  const [
    { data: members },
    totalMemberCount,
    { data: users },
    { data: incomeAgg },
    { data: expenseAgg },
  ] = await Promise.all([
    supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, ferfi, sz_datum')
      .eq('congregation_id', congId)
      .eq('isvisible', true)
      .eq('meghalt', false)
      .order('csaladnev')
      .limit(100),
    countActiveMembers(supabase, [congId]),
    supabase
      .from('profiles')
      .select('id, full_name, email, role, status')
      .eq('congregation_id', congId),
    supabase
      .from('befizetes')
      .select('osszeg')
      .eq('congregation_id', congId)
      .or('deleted.eq.false,deleted.is.null')
      .gte('datum', yearStart),
    supabase
      .from('kiadas')
      .select('osszeg')
      .eq('congregation_id', congId)
      .or('deleted.eq.false,deleted.is.null')
      .gte('datum', yearStart),
  ])

  const totalIncome = (incomeAgg || []).reduce((s, r) => s + (r.osszeg || 0), 0)
  const totalExpense = (expenseAgg || []).reduce((s, r) => s + (r.osszeg || 0), 0)

  return {
    members: members || [],
    memberCount: totalMemberCount || 0,
    users: users || [],
    finance: { income: totalIncome, expense: totalExpense, balance: totalIncome - totalExpense },
  }
}

export async function enterCongregation(congId: string, reason?: string) {
  const { supabase, user } = await requireMasterAdmin()
  const godMode = await getGodModeStatus()
  const cleanedReason = reason?.trim() || 'Rendszergazdai hozzáférési ellenőrzés'

  const { data: existingApproved } = await supabase
    .from('admin_access_requests')
    .select('id, expires_at')
    .eq('admin_user_id', user.id)
    .eq('congregation_id', congId)
    .eq('status', 'approved')
    .gt('expires_at', new Date().toISOString())
    .order('approved_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingApproved) {
    revalidatePath('/', 'layout')
    return { success: true, mode: 'approved', message: 'Már van aktív hozzáférés ehhez a gyülekezethez.' }
  }

  const { data: existingPending } = await supabase
    .from('admin_access_requests')
    .select('id, created_at')
    .eq('admin_user_id', user.id)
    .eq('congregation_id', congId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingPending) {
    return { success: true, mode: 'pending', message: 'Már van függőben lévő hozzáférési kérelme ehhez a gyülekezethez.' }
  }

  const approvalTarget = await findApprovalTarget(supabase, congId, user.id)

  if (godMode.active || !approvalTarget) {
    await supabase
      .from('admin_access_requests')
      .update({ status: 'expired', expires_at: new Date().toISOString() })
      .eq('admin_user_id', user.id)
      .eq('status', 'approved')

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from('admin_access_requests').insert({
      admin_user_id: user.id,
      congregation_id: congId,
      pastor_user_id: approvalTarget?.id || null,
      reason: cleanedReason,
      status: 'approved',
      approved_at: new Date().toISOString(),
      expires_at: expiresAt,
    })

    if (error) return { error: error.message }

    revalidatePath('/', 'layout')
    return {
      success: true,
      mode: 'approved',
      message: godMode.active
        ? 'God Mode mellett ideiglenes, 2 órás hozzáférés jött létre.'
        : 'Ehhez a gyülekezethez nincs más aktív felelős felhasználó, ezért ideiglenes hozzáférés jött létre.',
    }
  }

  const { data: requestRow, error } = await supabase
    .from('admin_access_requests')
    .insert({
      admin_user_id: user.id,
      congregation_id: congId,
      pastor_user_id: approvalTarget.id,
      reason: cleanedReason,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await supabase.from('ertesitesek').insert({
    user_id: approvalTarget.id,
    congregation_id: congId,
    tipus: 'warning',
    cim: 'Rendszergazdai hozzáférés kérése',
    uzenet: `Egy rendszergazda hozzáférést kér a gyülekezet adataihoz. Indoklás: ${cleanedReason}`,
    olvasva: false,
    hivatkozas: requestRow?.id ? `admin_access:${requestRow.id}` : null,
  })

  revalidatePath('/', 'layout')
  return { success: true, mode: 'pending', message: 'A hozzáférési kérelem elküldve a gyülekezet felelős felhasználójának.' }
}

// â”€â”€â”€ FelhasznĂˇlĂłk â”€â”€â”€

export async function getPendingUsers() {
  const { supabase } = await requireMasterAdmin()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, status, created_at, congregation_name_input')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function getActiveUsers() {
  const { supabase } = await requireMasterAdmin()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status, congregation_id, congregations(nev_hu, name)')
    .eq('status', 'active')
    .order('full_name')

  if (error) return { error: error.message }
  return { data: data || [] }
}

// 2026-05-02 (v0.9.41) — Új action: minden user, status-tól függetlenül.
// Felhasználó panasza alapján — az új signUp-os user-ek 'pending'-ben
// vannak, és az "Aktív" lista nem mutatja őket. Ez az action vissza-
// adja az ÖSSZESET, és a UI szűr/csoportosít státusz szerint.
export async function getAllUsers() {
  const { supabase } = await requireMasterAdmin()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status, congregation_id, created_at, congregations(nev_hu, name)')
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }
  return { data: data || [] }
}

// 2026-05-02 (v0.9.45) — Új action: a teljes user-listához a teljes hierarchikus
// kontextust is JOIN-oljuk — gyülekezet + egyházmegye + egyházkerület. A profile_roles
// táblát is bevonjuk, mert egy user több hatókörhöz is tartozhat (multi-role).
//
// VISSZAADJA:
//   - Minden profile-sort (status-tól függetlenül)
//   - + minden hozzá tartozó profile_role
//   - JOIN-olt scope-nevek (kerület/megye/gyülekezet)
//
// A UI kibontja minden user-nél a kontextust.

export interface UserWithScope {
  id: string
  full_name: string | null
  email: string
  role: string | null
  status: string | null
  created_at: string | null
  // Profile-szintű elsődleges hozzárendelés
  primary_congregation_id: string | null
  primary_congregation_name: string | null
  primary_diocese_name: string | null
  primary_district_name: string | null
  // Profile_roles bővebben — minden aktív szerepkör + scope
  profile_roles: Array<{
    role: string
    scope: 'system' | 'district' | 'diocese' | 'congregation'
    scope_id: string | null
    scope_name: string | null
    approval_status: string
    custom_label: string | null
  }>
}

export async function getAllUsersWithScope(): Promise<{
  data?: UserWithScope[]
  error?: string
}> {
  const { supabase } = await requireMasterAdmin()

  // 1. Profiles + congregation + diocese + district (3-szintes join)
  type ProfileRow = {
    id: string
    full_name: string | null
    email: string
    role: string | null
    status: string | null
    congregation_id: string | null
    created_at: string | null
    congregations?: {
      nev_hu?: string | null
      name?: string | null
      diocese_id?: string | null
      dioceses?: {
        name?: string | null
        district_id?: string | null
        districts?: { name?: string | null } | null
      } | null
    } | null
  }
  const { data: profilesRaw, error: pErr } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, role, status, congregation_id, created_at, ' +
        'congregations:congregation_id(nev_hu, name, diocese_id, dioceses:diocese_id(name, district_id, districts:district_id(name)))',
    )
    .order('created_at', { ascending: false })

  if (pErr) return { error: pErr.message }
  const profiles: ProfileRow[] = (profilesRaw || []) as unknown as ProfileRow[]

  // 2. Profile_roles minden user-re — egyetlen lekérdezésben
  const userIds = profiles.map((p) => p.id)
  let allRoles: Array<{
    profile_id: string
    role: string
    scope: 'system' | 'district' | 'diocese' | 'congregation'
    scope_id: string | null
    approval_status: string
    custom_label: string | null
    active: boolean
  }> = []

  if (userIds.length > 0) {
    const { data: rolesData } = await supabase
      .from('profile_roles')
      .select('profile_id, role, scope, scope_id, approval_status, custom_label, active')
      .in('profile_id', userIds)
      .neq('approval_status', 'rejected')
      .neq('approval_status', 'revoked')

    allRoles = (rolesData || []) as typeof allRoles
  }

  // 3. Scope-name map: minden scope_id-hoz a név
  const congIds = new Set<string>()
  const dioIds = new Set<string>()
  const distIds = new Set<string>()
  for (const r of allRoles) {
    if (!r.scope_id) continue
    if (r.scope === 'congregation') congIds.add(r.scope_id)
    else if (r.scope === 'diocese') dioIds.add(r.scope_id)
    else if (r.scope === 'district') distIds.add(r.scope_id)
  }
  const [congs, dios, dists] = await Promise.all([
    congIds.size > 0
      ? supabase.from('congregations').select('id, nev_hu, name').in('id', Array.from(congIds))
      : Promise.resolve({ data: [] }),
    dioIds.size > 0
      ? supabase.from('dioceses').select('id, name').in('id', Array.from(dioIds))
      : Promise.resolve({ data: [] }),
    distIds.size > 0
      ? supabase.from('districts').select('id, name').in('id', Array.from(distIds))
      : Promise.resolve({ data: [] }),
  ])
  const scopeNameMap = new Map<string, string>()
  ;((congs.data || []) as Array<{ id: string; nev_hu?: string | null; name?: string | null }>).forEach((c) =>
    scopeNameMap.set(c.id, c.nev_hu || c.name || c.id.slice(0, 8)),
  )
  ;((dios.data || []) as Array<{ id: string; name: string }>).forEach((d) =>
    scopeNameMap.set(d.id, d.name),
  )
  ;((dists.data || []) as Array<{ id: string; name: string }>).forEach((d) =>
    scopeNameMap.set(d.id, d.name),
  )

  // 4. Csoportosítás profile_id szerint
  const rolesByUser = new Map<string, UserWithScope['profile_roles']>()
  for (const r of allRoles) {
    const arr = rolesByUser.get(r.profile_id) || []
    arr.push({
      role: r.role,
      scope: r.scope,
      scope_id: r.scope_id,
      scope_name: r.scope_id ? scopeNameMap.get(r.scope_id) || null : null,
      approval_status: r.approval_status,
      custom_label: r.custom_label,
    })
    rolesByUser.set(r.profile_id, arr)
  }

  // 5. Eredmény-objektumok
  const result: UserWithScope[] = profiles.map((p) => {
    const congRel = p.congregations || null
    return {
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: p.role,
      status: p.status,
      created_at: p.created_at,
      primary_congregation_id: p.congregation_id,
      primary_congregation_name: congRel?.nev_hu || congRel?.name || null,
      primary_diocese_name: congRel?.dioceses?.name ?? null,
      primary_district_name: congRel?.dioceses?.districts?.name ?? null,
      profile_roles: rolesByUser.get(p.id) || [],
    }
  })

  return { data: result }
}

// 2026-06-05 (F2b) — Felhasználó "végleges törlése" = GDPR-ANONIMIZÁLÁS.
//
// Endre döntése: a végleges törlés CSAK a SZEMÉLYES adatot + az autentikáló
// email-t törli — SEMMI MÁS nem törlődik (a gyülekezetet más veszi át, a
// pénzügyi/anyakönyvi adat megmarad, a lelkészi napló név-pillanatképe megmarad).
//
// Két lépés:
//   1) admin_erase_user() RPC — a profiles PII anonimizálása, szerepek visszavonása,
//      nyitott lelkészi tenure lezárása, megfelelőségi napló (erasure_requests).
//   2) auth.admin.deleteUser(id, SOFT) — a login megszűnik, az auth email törlődik.
//      SOFT (nem hard), mert a profiles_id_fkey NO ACTION — a profil-sornak meg
//      KELL maradnia (anonimizálva) a hivatkozási integritásért + audit-nyomért.
//
// FONTOS: a master admin önmagát NEM törölheti (védelem).
export async function deleteUser(userId: string): Promise<{ success?: boolean; error?: string }> {
  const { supabase, user } = await requireMasterAdmin()
  if (!userId) return { error: 'A felhasználó azonosítója kötelező.' }
  if (user?.id === userId) return { error: 'Nem törölheted a saját fiókodat.' }

  // 1) DB-oldali anonimizálás (a profil-sor megmarad, csak a PII tűnik el)
  const { data: eraseRes, error: eraseErr } = await supabase.rpc('admin_erase_user', {
    p_user_id: userId,
    p_reason: 'Admin törlés a felhasználó-kezelőből',
  })
  if (eraseErr) {
    return { error: `Az anonimizálás nem sikerült: ${eraseErr.message}` }
  }
  const erased = (eraseRes || {}) as { full_name?: string | null; email?: string | null; closed_tenures?: number }

  // 2) Auth-oldali SOFT-delete: a login megszűnik, az email törlődik az auth-ból.
  const { getSupabaseAdminClient } = await import('@/lib/supabase/admin-client')
  let adminClient
  try {
    adminClient = getSupabaseAdminClient()
  } catch (err) {
    return {
      error: `Service-role admin kliens nem elérhető: ${err instanceof Error ? err.message : 'ismeretlen'}. ` +
        'Ellenőrizd a SUPABASE_SERVICE_ROLE_KEY env-vart a Railway-en.',
    }
  }

  // shouldSoftDelete = true → az auth.users sor megmarad (anonimizálva), a
  // session-ök/identitások törlődnek, a belépés lehetetlenné válik.
  const { error: delErr } = await adminClient.auth.admin.deleteUser(userId, true)
  if (delErr) {
    return {
      error:
        `A belépés letiltása nem sikerült: ${delErr.message}. ` +
        'A személyes adatok már anonimizálva lettek; próbáld újra a belépés letiltását.',
    }
  }

  await logAuditEvent({
    action: 'user.erase',
    targetTable: 'profiles',
    targetId: userId,
    metadata: {
      email: erased.email ?? null,
      full_name: erased.full_name ?? null,
      closed_tenures: erased.closed_tenures ?? 0,
      mode: 'gdpr_anonymize',
    },
  })

  revalidatePath('/admin/felhasznalok')
  revalidatePath('/admin')
  return { success: true }
}

// 2026-05-02 (v0.9.42) — GYORS jóváhagyás gyülekezet nélkül.
// Sprint U.5 (2026-05-03) update: ertesitesek-mezőnév javítva (cim/uzenet/tipus),
// audit-log bevezetve. Korábban a type/title/body mezők miatt az értesítés
// silent fail-elt — a felhasználók sosem látták a "Hozzáférése aktiválva"
// üzenetet a dashboardon.
//
// Ez az action:
//   - Pending → active (egyetlen klikk)
//   - NEM kér gyülekezetet — a user később onboard-ol
//   - Megnyitja a wizard-utat (next login)
export async function quickApproveUser(userId: string) {
  const { supabase } = await requireMasterAdmin()

  // 2026-06-04 (P3): ha a usernek van regisztrációs access_request-je a listából
  // választott gyülekezettel, a Gyors jóváhagyás IS rendelje hozzá a gyülekezetet
  // (+ egyházmegyét) — különben gyülekezet nélkül a lelkész a belépés után a
  // CongregationOnlyNotice holtpontra jutna. A profiles.congregation_id elég a
  // dashboardhoz (az effectiveCongregationId arra esik vissza). Best-effort: ha
  // nincs access_request, marad a sima aktiválás.
  let congId: string | null = null
  let dioceseId: string | null = null
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle()
    const email = (prof as { email?: string | null } | null)?.email
    if (email) {
      const { data: ar } = await supabase
        .from('access_requests')
        .select('requested_congregation_id, requested_diocese_id')
        .ilike('email', email)
        .not('requested_congregation_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (ar) {
        const row = ar as {
          requested_congregation_id?: string | null
          requested_diocese_id?: string | null
        }
        congId = row.requested_congregation_id ?? null
        dioceseId = row.requested_diocese_id ?? null
      }
    }
  } catch {
    // best-effort — gyülekezet nélkül is aktiválható
  }

  // FIX 2026-05-04: SECURITY DEFINER RPC használata — megkerüli az RLS-t
  // ÉS a profiles GRANT-okat is. A jogosultság-check az SQL függvényben.
  const rpcArgs: Record<string, unknown> = { p_user_id: userId }
  if (congId) rpcArgs.p_congregation_id = congId
  if (dioceseId) rpcArgs.p_diocese_id = dioceseId
  const { data: rpcRes, error: rpcErr } = await supabase
    .rpc('admin_activate_user', rpcArgs)
    .single()

  if (rpcErr) return { error: `Profil frissítési hiba: ${rpcErr.message}` }

  const result = rpcRes as
    | { user_id: string; previous_status: string; new_status: string; was_updated: boolean }
    | null

  if (!result || !result.was_updated) {
    const currentStatus = result?.new_status ?? null
    if (currentStatus === 'active') {
      return {
        success: true,
        info: 'A fiók már aktív volt — valószínűleg a szerepkör-kiosztáskor automatikusan aktiválódott.',
      }
    }
    if (currentStatus === 'rejected') {
      return { error: 'A fiók korábban elutasítva. Először állítsd vissza pending-re a Részletes panelen.' }
    }
    return { error: `A fiók státusza már nem várakozó (jelenlegi: ${currentStatus || 'ismeretlen'}).` }
  }

  // Értesítés (best-effort, nem blokkol) — javított mezőnevek
  try {
    await supabase.from('ertesitesek').insert({
      user_id: userId,
      tipus: 'success',
      cim: 'Hozzáférése aktiválva',
      uzenet:
        'A rendszergazda elfogadta a hozzáférés-kérelmét. A bejelentkezés után az induló wizard segít beállítani a gyülekezetet és a többi adatot.',
      olvasva: false,
    })
  } catch {
    // ertesitesek tábla esetlegesen nem érhető el, de a fő művelet sikeres
  }

  await logAuditEvent({
    action: 'user.quick_approve',
    targetTable: 'profiles',
    targetId: userId,
    metadata: { previous_status: 'pending' },
  })

  revalidatePath('/admin/felhasznalok')
  revalidatePath('/admin')
  return { success: true }
}

// 2026-05-03 (Sprint U.5) — Pending user elutasítása indoklással.
// A user `status` 'rejected'-re vált, értesítést kap a kapott indoklással
// (pasztorális hangnem). A regisztráció törlésére külön deleteUser hívható.
export async function rejectPendingUser(userId: string, reason: string) {
  const { supabase } = await requireMasterAdmin()
  if (!userId) return { error: 'A felhasználó azonosítója kötelező.' }
  if (!reason || reason.trim().length < 5) {
    return { error: 'Az elutasítás indoklása legalább 5 karakter legyen.' }
  }

  const cleanedReason = reason.trim()

  // FIX 2026-05-04: SECURITY DEFINER RPC — megkerüli az RLS-t és a GRANT-okat.
  const { data: rpcRes, error: rpcErr } = await supabase
    .rpc('admin_reject_user', { p_user_id: userId, p_reason: cleanedReason })
    .single()

  if (rpcErr) return { error: `Profil frissítési hiba: ${rpcErr.message}` }
  const result = rpcRes as
    | { user_id: string; previous_status: string; new_status: string; was_updated: boolean }
    | null

  if (!result || !result.was_updated) {
    return { error: `A felhasználó már nem várakozó (jelenlegi: ${result?.new_status || 'ismeretlen'}).` }
  }

  try {
    await supabase.from('ertesitesek').insert({
      user_id: userId,
      tipus: 'warning',
      cim: 'Hozzáférés-kérelme nem került elfogadásra',
      uzenet: `A regisztrációs kérelmét sajnos nem tudtuk elfogadni. Indoklás: ${cleanedReason}`,
      olvasva: false,
    })
  } catch {
    // ertesitesek best-effort
  }

  await logAuditEvent({
    action: 'user.reject',
    targetTable: 'profiles',
    targetId: userId,
    metadata: { reason: cleanedReason, previous_status: 'pending' },
  })

  revalidatePath('/admin/felhasznalok')
  revalidatePath('/admin')
  return { success: true }
}

export async function getDioceses() {
  const { supabase } = await requireMasterAdmin()
  const { data } = await supabase.from('dioceses').select('id, name').order('name')
  return data || []
}

export async function approveUser(userId: string, dioceseId: string, congregationName: string) {
  const { supabase, user: adminUser } = await requireMasterAdmin()

  if (!dioceseId || !congregationName.trim()) {
    return { error: 'Egyházmegye és gyülekezet megadása kötelező.' }
  }

  // Gyülekezet keresés vagy létrehozás
  const normalizedName = congregationName.trim()
  const { data: existingCong } = await supabase
    .from('congregations')
    .select('id')
    .ilike('nev_hu', normalizedName)
    .maybeSingle()

  let congId: string
  let congregationWasCreated = false

  if (existingCong) {
    congId = existingCong.id
  } else {
    const { data: newCong, error: insertErr } = await supabase
      .from('congregations')
      .insert({ nev_hu: normalizedName, name: normalizedName, diocese_id: dioceseId })
      .select('id')
      .single()

    if (insertErr || !newCong) return { error: `Gyülekezet létrehozási hiba: ${insertErr?.message}` }
    congId = newCong.id
    congregationWasCreated = true
  }

  // Profil frissítés — SECURITY DEFINER RPC, megkerüli az RLS-t és a GRANT-okat.
  const { data: rpcRes, error: rpcErr } = await supabase
    .rpc('admin_activate_user', {
      p_user_id: userId,
      p_congregation_id: congId,
      p_diocese_id: dioceseId,
    })
    .single()

  if (rpcErr) return { error: `Profil frissítési hiba: ${rpcErr.message}` }
  const result = rpcRes as
    | { user_id: string; previous_status: string; new_status: string; was_updated: boolean }
    | null

  if (!result || !result.was_updated) {
    return { error: `A felhasználó már nem várakozó (jelenlegi: ${result?.new_status || 'ismeretlen'}).` }
  }

  // Lelkipásztor profile_role automatikus beillesztése (ha még nincs ilyen sora)
  // Ezzel a multi-role rendszer is "lát" a frissen jóváhagyott lelkészről.
  let createdProfileRoleId: string | null = null
  try {
    const { data: existingPastorRole } = await supabase
      .from('profile_roles')
      .select('id')
      .eq('profile_id', userId)
      .eq('scope', 'congregation')
      .eq('scope_id', congId)
      .eq('role', 'lelkesz')
      .maybeSingle()

    if (!existingPastorRole) {
      const { data: insertedRole } = await supabase
        .from('profile_roles')
        .insert({
          profile_id: userId,
          scope: 'congregation',
          scope_id: congId,
          role: 'lelkesz',
          approval_status: 'approved',
          granted_by: adminUser?.id ?? null,
          approved_by: adminUser?.id ?? null,
          approved_at: new Date().toISOString(),
          active: true,
        })
        .select('id')
        .single()
      createdProfileRoleId = insertedRole?.id ?? null
    }
  } catch {
    // best-effort — a fő aktiválás sikeres
  }

  // Értesítés (javított mezőnevek: cim/uzenet/tipus/olvasva)
  try {
    await supabase.from('ertesitesek').insert({
      user_id: userId,
      tipus: 'success',
      cim: 'Fiókja jóváhagyva',
      uzenet:
        'Fiókja jóváhagyásra került! Mostantól bejelentkezhet és használhatja a Kartotéka rendszert.',
      olvasva: false,
    })
  } catch {
    // ertesitesek best-effort
  }

  await logAuditEvent({
    action: 'user.approve',
    targetTable: 'profiles',
    targetId: userId,
    metadata: {
      congregation_id: congId,
      diocese_id: dioceseId,
      congregation_was_created: congregationWasCreated,
      auto_created_profile_role_id: createdProfileRoleId,
    },
  })

  revalidatePath('/admin')
  revalidatePath('/admin/felhasznalok')
  return { success: true }
}

/**
 * @deprecated Sprint U.5 (2026-05-03): a `profiles.role` legacy mezőt többé nem
 * írjuk közvetlenül a UI-ból. Helyette a `profile_roles` táblába írunk
 * (`createProfileRole` action), és a `syncProfileRoleToLegacy` szerver-helper
 * automatikusan szinkronizálja a `profiles.role` mezőt. Ez a function backwards-
 * compat-célból megmarad, de a UI nem hívja.
 */
export async function updateUserRole(userId: string, role: string) {
  const { supabase } = await requireMasterAdmin()

  // Sprint U.5: kibővített validRoles — az összes ismert role (a memory feedback szerint).
  const validRoles = [
    'lelkesz',
    'esperes',
    'egyhazmegyei_admin',
    'egyhazkeruleti_admin',
    'admin',
    'konyvelo',
    'egyhazmegyei_szamvevo',
  ]
  if (!validRoles.includes(role)) return { error: 'Érvénytelen szerepkör.' }

  console.warn(
    '[DEPRECATED] updateUserRole — használja a createProfileRole action-t a multi-role rendszerben.',
  )

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)
    .eq('status', 'active')

  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { success: true }
}

// â”€â”€â”€ TĂˇmogatĂˇs â”€â”€â”€

export async function getSupportTickets() {
  const { supabase } = await requireMasterAdmin()

  try {
    const { data } = await getAdminSupportTicketsCompat(supabase)
    return { data: data.filter(ticket => ticket.type === 'request') }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'A support jegyek lekerese sikertelen.' }
  }
}

export async function replySupportTicket(ticketId: string, replyContent: string) {
  const { supabase } = await requireMasterAdmin()
  let ticketUserId: string | null = null
  let ticketSubject = ''
  let replyError: string | null = null

  if (!replyContent.trim()) return { error: 'A vĂˇlasz szĂ¶vege kĂ¶telezĹ‘.' }

  // Eredeti jegy lekĂ©rdezĂ©s â€” lezĂˇrt jegyre nem lehet vĂˇlaszolni
  const ticket = await (async () => {
    try {
      const result = await replySupportTicketCompat(supabase, ticketId, replyContent.trim())
      ticketUserId = result.ticketUserId
      ticketSubject = result.ticketSubject
      return {
        user_id: result.ticketUserId,
        subject: result.ticketSubject,
        status: 'read',
      }
    } catch (error) {
      replyError = error instanceof Error ? error.message : 'A support valasz nem mentheto.'
      return null
    }
  })()

  if (replyError) return { error: replyError }
  if (!ticket) return { error: 'A jegy nem talĂˇlhatĂł.' }
  if (ticket.status === 'closed') return { error: 'LezĂˇrt jegyre nem lehet vĂˇlaszolni.' }

  // VĂˇlasz mentĂ©s

  // Jegy stĂˇtusz frissĂ­tĂ©s
  if (!ticketUserId) {
    revalidatePath('/admin')
    return { success: true }
  }

  // Értesítés (mezőnév-fix: cim/uzenet/tipus/olvasva)
  await supabase.from('ertesitesek').insert({
    user_id: ticketUserId,
    tipus: 'info',
    cim: 'Válasz a támogatási kérdésre',
    uzenet: `Válasz érkezett a "${ticketSubject}" témájú kérdésére.`,
    olvasva: false,
  })

  revalidatePath('/admin')
  return { success: true }
}

export async function closeSupportTicket(ticketId: string) {
  const { supabase } = await requireMasterAdmin()

  try {
    await closeSupportTicketCompat(supabase, ticketId)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'A support jegy nem zarhato le.' }
  }

  revalidatePath('/admin')
  return { success: true }
}

// â”€â”€â”€ AdatminĹ‘sĂ©g â”€â”€â”€

export async function runQualityCheck() {
  const { supabase } = await requireMasterAdmin()

  const { data: congs } = await supabase
    .from('congregations')
    .select('id, nev_hu, name')
    .order('nev_hu')

  if (!congs) return { data: [], totals: { missingCnp: 0, missingGender: 0, missingBirthdate: 0 } }

  const results: { congName: string; missingCnp: number; missingGender: number; missingBirthdate: number }[] = []
  let totalCnp = 0, totalGender = 0, totalBirth = 0

  for (const c of congs) {
    const { data: members } = await supabase
      .from('szemely')
      .select('cnp, ferfi, sz_datum')
      .eq('congregation_id', c.id)
      .eq('isvisible', true)
      .eq('meghalt', false)

    if (!members || members.length === 0) continue

    let cnp = 0, gender = 0, birth = 0
    for (const m of members) {
      if (!m.cnp) cnp++
      if (m.ferfi === null || m.ferfi === undefined) gender++
      if (!m.sz_datum) birth++
    }

    if (cnp > 0 || gender > 0 || birth > 0) {
      results.push({ congName: c.nev_hu || c.name || 'Ismeretlen', missingCnp: cnp, missingGender: gender, missingBirthdate: birth })
      totalCnp += cnp
      totalGender += gender
      totalBirth += birth
    }
  }

  return {
    data: results,
    totals: { missingCnp: totalCnp, missingGender: totalGender, missingBirthdate: totalBirth },
  }
}

