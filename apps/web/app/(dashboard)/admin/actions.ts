'use server'

import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isMasterAdmin } from '@/lib/auth/roles'
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

// â”€â”€â”€ SegĂ©d: Master Admin ellenĹ‘rzĂ©s â”€â”€â”€

async function requireMasterAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isMasterAdmin(user.email)) throw new Error('Nincs jogosultsĂˇga.')
  return { supabase, user }
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

// 2026-05-02 (v0.9.45) — Felhasználó törlése a rendszerből.
//
// A `auth.admin.deleteUser` (service-role) törli az auth.users sort. Az ON CASCADE
// FK-k (profiles, profile_roles, ertesitesek, stb.) automatikusan törlődnek.
//
// FONTOS: a master admin önmagát NEM törölheti (védelem).
export async function deleteUser(userId: string): Promise<{ success?: boolean; error?: string }> {
  const { supabase, user } = await requireMasterAdmin()
  if (!userId) return { error: 'A felhasználó azonosítója kötelező.' }
  if (user?.id === userId) return { error: 'Nem törölheted a saját fiókodat.' }

  // Audit-log mentés (best-effort)
  try {
    await supabase.from('ertesitesek').insert({
      user_id: user?.id || null,
      type: 'system',
      title: 'Felhasználó törölve',
      body: `Az admin törölte a ${userId.slice(0, 8)} azonosítójú felhasználót a rendszerből.`,
    })
  } catch {
    // tovább megyünk — a törlés a fontosabb
  }

  // Service-role admin client a törléshez
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

  const { error: delErr } = await adminClient.auth.admin.deleteUser(userId)
  if (delErr) return { error: `A törlés nem sikerült: ${delErr.message}` }

  // A profiles sort a CASCADE már törölte, de biztonság kedvéért is:
  await supabase.from('profiles').delete().eq('id', userId)

  revalidatePath('/admin/felhasznalok')
  revalidatePath('/admin')
  return { success: true }
}

// 2026-05-02 (v0.9.42) — GYORS jóváhagyás gyülekezet nélkül.
// A meglévő `approveUser` egyházmegyét + gyülekezet-nevet KÖTELEZ — ami egy
// új lelkész esetén indokolt. DE Google-loginnal érkezett vagy más fiókoknak
// nem akarunk azonnal gyülekezetet rendelni (a wizard-on majd kiválaszt).
//
// Ez az action:
//   - Pending → active (egyetlen klikk)
//   - NEM kér gyülekezetet — a user később onboard-ol
//   - Megnyitja a wizard-utat (next login)
export async function quickApproveUser(userId: string) {
  const { supabase } = await requireMasterAdmin()

  const { error: updateErr, count } = await supabase
    .from('profiles')
    .update({ status: 'active' })
    .eq('id', userId)
    .eq('status', 'pending')

  if (updateErr) return { error: `Profil frissítési hiba: ${updateErr.message}` }
  if (count === 0) return { error: 'A felhasználó már nem pending státuszú.' }

  // Értesítés (best-effort, nem blokkol)
  try {
    await supabase.from('ertesitesek').insert({
      user_id: userId,
      type: 'system',
      title: 'Hozzáférése aktiválva',
      body: 'Az admin elfogadta a hozzáférés-kérelmét. A bejelentkezés után az induló wizard segít beállítani a gyülekezetet és a többi adatot.',
    })
  } catch {
    // ertesitesek tábla esetlegesen nem érhető el, de a fő művelet sikeres
  }

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
  const { supabase } = await requireMasterAdmin()

  if (!dioceseId || !congregationName.trim()) {
    return { error: 'EgyhĂˇzmegye Ă©s gyĂĽlekezet megadĂˇsa kĂ¶telezĹ‘.' }
  }

  // GyĂĽlekezet keresĂ©s vagy lĂ©trehozĂˇs
  const normalizedName = congregationName.trim()
  const { data: existingCong } = await supabase
    .from('congregations')
    .select('id')
    .ilike('nev_hu', normalizedName)
    .maybeSingle()

  let congId: string

  if (existingCong) {
    congId = existingCong.id
  } else {
    const { data: newCong, error: insertErr } = await supabase
      .from('congregations')
      .insert({ nev_hu: normalizedName, name: normalizedName, diocese_id: dioceseId })
      .select('id')
      .single()

    if (insertErr || !newCong) return { error: `GyĂĽlekezet lĂ©trehozĂˇsi hiba: ${insertErr?.message}` }
    congId = newCong.id
  }

  // Profil frissĂ­tĂ©s â€” csak pending stĂˇtuszĂş felhasznĂˇlĂł aktivĂˇlhatĂł
  const { error: updateErr, count } = await supabase
    .from('profiles')
    .update({
      status: 'active',
      congregation_id: congId,
      diocese_id: dioceseId,
    })
    .eq('id', userId)
    .eq('status', 'pending')

  if (updateErr) return { error: `Profil frissĂ­tĂ©si hiba: ${updateErr.message}` }
  if (count === 0) return { error: 'A felhasznĂˇlĂł mĂˇr nem pending stĂˇtuszĂş.' }

  // Ă‰rtesĂ­tĂ©s
  await supabase.from('ertesitesek').insert({
    user_id: userId,
    type: 'system',
    title: 'FiĂłk jĂłvĂˇhagyva',
    message: 'FiĂłkja jĂłvĂˇhagyĂˇsra kerĂĽlt! MostantĂłl bejelentkezhet Ă©s hasznĂˇlhatja a KartotĂ©ka rendszert.',
    is_read: false,
  })

  revalidatePath('/admin')
  return { success: true }
}

export async function updateUserRole(userId: string, role: string) {
  const { supabase } = await requireMasterAdmin()

  const validRoles = ['lelkesz', 'esperes', 'egyhazmegyei_admin', 'admin']
  if (!validRoles.includes(role)) return { error: 'Ă‰rvĂ©nytelen szerepkĂ¶r.' }

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

  // Ă‰rtesĂ­tĂ©s
  await supabase.from('ertesitesek').insert({
    user_id: ticketUserId,
    type: 'support_reply',
    title: 'VĂˇlasz a tĂˇmogatĂˇsi kĂ©rdĂ©sre',
    message: `VĂˇlasz Ă©rkezett a "${ticketSubject}" tĂ©mĂˇjĂş kĂ©rdĂ©sĂ©re.`,
    is_read: false,
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

