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

