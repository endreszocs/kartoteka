import type { SupabaseClient } from '@supabase/supabase-js'

import { getAdminSupportTicketsCompat } from '@/lib/support/messages'

type DioceseRow = {
  id: string
  name: string
  district_id: string | null
}

type CongregationRow = {
  id: string
  name: string | null
  nev_hu: string | null
  diocese_id: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  role: string
  status: string
  diocese_id: string | null
  congregation_id: string | null
  created_at: string
}

type MemberRow = {
  congregation_id: string | null
  cnp: string | null
  ferfi: boolean | null
  sz_datum: string | null
  isvisible: boolean | null
  meghalt: boolean | null
}

export interface ScopeKpis {
  dioceses: number
  congregations: number
  activeUsers: number
  pendingUsers: number
  members: number
  openTickets: number
}

export interface DioceseBreakdownRow {
  id: string
  name: string
  congregations: number
  activeUsers: number
  pendingUsers: number
  members: number
}

export interface CongregationBreakdownRow {
  id: string
  name: string
  dioceseName: string
  members: number
  activeUsers: number
  pendingUsers: number
}

export interface QualityTotals {
  missingCnp: number
  missingGender: number
  missingBirthdate: number
}

export interface QualityCongregationRow extends QualityTotals {
  congregationId: string
  congregationName: string
}

export interface RecentProfileRow {
  id: string
  fullName: string
  status: string
  role: string
  congregationName: string
  createdAt: string
}

export interface ScopeDashboardData {
  dioceseName: string | null
  districtName: string | null
  kpis: ScopeKpis
  dioceseBreakdown: DioceseBreakdownRow[]
  congregationBreakdown: CongregationBreakdownRow[]
  roleBreakdown: { role: string; count: number }[]
  qualityTotals: QualityTotals
  qualityByCongregation: QualityCongregationRow[]
  recentProfiles: RecentProfileRow[]
}

function displayCongregationName(congregation: CongregationRow) {
  return congregation.nev_hu || congregation.name || 'Ismeretlen gyülekezet'
}

function roleLabel(role: string) {
  switch (role) {
    case 'admin':
      return 'Admin'
    case 'egyhazkeruleti_admin':
      return 'Egyházkerületi admin'
    case 'egyhazmegyei_admin':
      return 'Egyházmegyei admin'
    case 'egyhazmegyei_szamvevo':
      return 'Egyházmegyei számvevő'
    case 'esperes':
      return 'Esperes'
    case 'konyvelo':
      return 'Könyvelő'
    case 'lelkesz':
      return 'Lelkipásztor'
    default:
      return 'Lelkipásztor'
  }
}

export async function getScopeDashboardData(
  supabase: SupabaseClient,
  options?: {
    dioceseId?: string | null
  }
): Promise<ScopeDashboardData> {
  const dioceseId = options?.dioceseId || null

  const diocesesQuery = supabase.from('dioceses').select('id, name, district_id').order('name')
  const congregationsQuery = dioceseId
    ? supabase.from('congregations').select('id, name, nev_hu, diocese_id').eq('diocese_id', dioceseId).order('nev_hu')
    : supabase.from('congregations').select('id, name, nev_hu, diocese_id').order('nev_hu')
  const profilesQuery = dioceseId
    ? supabase
        .from('profiles')
        .select('id, full_name, email, role, status, diocese_id, congregation_id, created_at')
        .eq('diocese_id', dioceseId)
        .order('created_at', { ascending: false })
    : supabase
        .from('profiles')
        .select('id, full_name, email, role, status, diocese_id, congregation_id, created_at')
        .order('created_at', { ascending: false })

  const [
    { data: diocesesData },
    { data: congregationsData },
    { data: profilesData },
  ] = await Promise.all([diocesesQuery, congregationsQuery, profilesQuery])

  const dioceses = ((diocesesData as DioceseRow[] | null) || []).filter((row) => !dioceseId || row.id === dioceseId)
  const congregations = (congregationsData as CongregationRow[] | null) || []
  const profiles = (profilesData as ProfileRow[] | null) || []
  const congregationIds = congregations.map((row) => row.id)

  const [
    { data: memberData },
    { data: districtData },
    supportState,
  ] = await Promise.all([
    congregationIds.length > 0
      ? supabase
          .from('szemely')
          .select('congregation_id, cnp, ferfi, sz_datum, isvisible, meghalt')
          .in('congregation_id', congregationIds)
      : Promise.resolve({ data: [] }),
    supabase.from('districts').select('id, name').order('name'),
    getAdminSupportTicketsCompat(supabase).catch(() => null),
  ])

  const districtMap = new Map(((districtData as { id: string; name: string }[] | null) || []).map((row) => [row.id, row.name] as const))
  const dioceseMap = new Map(dioceses.map((row) => [row.id, row] as const))
  const congregationMap = new Map(congregations.map((row) => [row.id, row] as const))
  const members = ((memberData as MemberRow[] | null) || []).filter((row) => row.isvisible !== false && row.meghalt !== true)

  const memberCountByCongregation = new Map<string, number>()
  const qualityByCongregation = new Map<string, QualityCongregationRow>()

  for (const member of members) {
    if (!member.congregation_id) continue
    memberCountByCongregation.set(member.congregation_id, (memberCountByCongregation.get(member.congregation_id) || 0) + 1)

    const congregation = congregationMap.get(member.congregation_id)
    if (!congregation) continue

    const existing = qualityByCongregation.get(member.congregation_id) || {
      congregationId: member.congregation_id,
      congregationName: displayCongregationName(congregation),
      missingCnp: 0,
      missingGender: 0,
      missingBirthdate: 0,
    }

    if (!member.cnp) existing.missingCnp += 1
    if (member.ferfi === null || member.ferfi === undefined) existing.missingGender += 1
    if (!member.sz_datum) existing.missingBirthdate += 1

    qualityByCongregation.set(member.congregation_id, existing)
  }

  const activeProfiles = profiles.filter((profile) => profile.status === 'active')
  const pendingProfiles = profiles.filter((profile) => profile.status === 'pending')
  const activeUsersByCongregation = new Map<string, number>()
  const pendingUsersByCongregation = new Map<string, number>()
  const roleBreakdownMap = new Map<string, number>()

  for (const profile of activeProfiles) {
    if (profile.congregation_id) {
      activeUsersByCongregation.set(profile.congregation_id, (activeUsersByCongregation.get(profile.congregation_id) || 0) + 1)
    }

    const label = roleLabel(profile.role)
    roleBreakdownMap.set(label, (roleBreakdownMap.get(label) || 0) + 1)
  }

  for (const profile of pendingProfiles) {
    if (profile.congregation_id) {
      pendingUsersByCongregation.set(profile.congregation_id, (pendingUsersByCongregation.get(profile.congregation_id) || 0) + 1)
    }
  }

  const congregationBreakdown = congregations
    .map((congregation) => {
      const dioceseName = congregation.diocese_id ? dioceseMap.get(congregation.diocese_id)?.name || 'Ismeretlen egyházmegye' : 'Nincs megadva'
      return {
        id: congregation.id,
        name: displayCongregationName(congregation),
        dioceseName,
        members: memberCountByCongregation.get(congregation.id) || 0,
        activeUsers: activeUsersByCongregation.get(congregation.id) || 0,
        pendingUsers: pendingUsersByCongregation.get(congregation.id) || 0,
      }
    })
    .sort((left, right) => right.members - left.members)

  const dioceseBreakdown = dioceses
    .map((diocese) => {
      const scopedCongregations = congregationBreakdown.filter((row) => row.dioceseName === diocese.name)
      return {
        id: diocese.id,
        name: diocese.name,
        congregations: scopedCongregations.length,
        activeUsers: scopedCongregations.reduce((sum, row) => sum + row.activeUsers, 0),
        pendingUsers: scopedCongregations.reduce((sum, row) => sum + row.pendingUsers, 0),
        members: scopedCongregations.reduce((sum, row) => sum + row.members, 0),
      }
    })
    .sort((left, right) => right.members - left.members)

  const scopedUserIds = new Set(profiles.map((profile) => profile.id))
  const openTickets = supportState
    ? supportState.data.filter((ticket) => ticket.type === 'request' && ticket.status !== 'closed' && ticket.user_id && scopedUserIds.has(ticket.user_id)).length
    : 0

  const qualityRows = Array.from(qualityByCongregation.values())
    .filter((row) => row.missingCnp > 0 || row.missingGender > 0 || row.missingBirthdate > 0)
    .sort((left, right) => (right.missingCnp + right.missingGender + right.missingBirthdate) - (left.missingCnp + left.missingGender + left.missingBirthdate))

  const qualityTotals = qualityRows.reduce<QualityTotals>((totals, row) => ({
    missingCnp: totals.missingCnp + row.missingCnp,
    missingGender: totals.missingGender + row.missingGender,
    missingBirthdate: totals.missingBirthdate + row.missingBirthdate,
  }), {
    missingCnp: 0,
    missingGender: 0,
    missingBirthdate: 0,
  })

  const recentProfiles = profiles
    .slice(0, 8)
    .map((profile) => ({
      id: profile.id,
      fullName: profile.full_name || profile.email || 'Ismeretlen felhasználó',
      status: profile.status,
      role: roleLabel(profile.role),
      congregationName: profile.congregation_id ? displayCongregationName(congregationMap.get(profile.congregation_id) || {
        id: profile.congregation_id,
        name: null,
        nev_hu: null,
        diocese_id: null,
      }) : 'Nincs hozzárendelve',
      createdAt: profile.created_at,
    }))

  const selectedDiocese = dioceseId ? dioceseMap.get(dioceseId) || null : null
  const districtName = selectedDiocese?.district_id ? districtMap.get(selectedDiocese.district_id) || null : districtMap.values().next().value || null

  return {
    dioceseName: selectedDiocese?.name || null,
    districtName,
    kpis: {
      dioceses: dioceseBreakdown.length,
      congregations: congregationBreakdown.length,
      activeUsers: activeProfiles.length,
      pendingUsers: pendingProfiles.length,
      members: members.length,
      openTickets,
    },
    dioceseBreakdown,
    congregationBreakdown,
    roleBreakdown: Array.from(roleBreakdownMap.entries())
      .map(([role, count]) => ({ role, count }))
      .sort((left, right) => right.count - left.count),
    qualityTotals,
    qualityByCongregation: qualityRows,
    recentProfiles,
  }
}
