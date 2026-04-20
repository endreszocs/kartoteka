import { createClient } from '@/lib/supabase/server'

export interface DistrictRow {
  id: number
  nev: string
  isaktiv: boolean
}

export type DistrictUsageState = {
  currentIds: Set<number>
  foreignIds: Set<number>
  anyIds: Set<number>
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function getDistrictUsageState(
  supabase: ServerSupabaseClient,
  congregationId: string | null,
): Promise<DistrictUsageState> {
  const state: DistrictUsageState = {
    currentIds: new Set<number>(),
    foreignIds: new Set<number>(),
    anyIds: new Set<number>(),
  }

  if (!congregationId) return state

  const [familyRes, presbyterRes] = await Promise.all([
    supabase
      .from('csalad')
      .select('id_csoport, congregation_id')
      .not('id_csoport', 'is', null),
    supabase
      .from('presbiter')
      .select('id_csoport, szemely:szemely!inner(congregation_id)')
      .not('id_csoport', 'is', null),
  ])

  ;((familyRes.data || []) as { id_csoport: number | null; congregation_id: string | null }[]).forEach(row => {
    if (!row.id_csoport) return
    state.anyIds.add(row.id_csoport)
    if (row.congregation_id === congregationId) {
      state.currentIds.add(row.id_csoport)
    } else {
      state.foreignIds.add(row.id_csoport)
    }
  })

  ;((presbyterRes.data || []) as {
    id_csoport: number | null
    szemely: { congregation_id: string | null } | { congregation_id: string | null }[] | null
  }[]).forEach(row => {
    if (!row.id_csoport) return
    const szemely = Array.isArray(row.szemely) ? row.szemely[0] || null : row.szemely
    state.anyIds.add(row.id_csoport)
    if (szemely?.congregation_id === congregationId) {
      state.currentIds.add(row.id_csoport)
    } else {
      state.foreignIds.add(row.id_csoport)
    }
  })

  return state
}

export async function getVisibleDistrictState(
  supabase: ServerSupabaseClient,
  congregationId: string | null,
) {
  const { data } = await supabase
    .from('csoport')
    .select('id, nev, isaktiv')
    .eq('iskorzet', true)
    .order('nev')

  const usage = await getDistrictUsageState(supabase, congregationId)
  const districts = ((data || []) as DistrictRow[]).filter(district =>
    !usage.anyIds.has(district.id) || usage.currentIds.has(district.id)
  )

  return {
    districts,
    visibleIds: new Set(districts.map(district => district.id)),
    usage,
  }
}

export async function getVisibleDistrictNameMap(
  supabase: ServerSupabaseClient,
  congregationId: string | null,
) {
  const { districts, visibleIds, usage } = await getVisibleDistrictState(supabase, congregationId)
  return {
    visibleIds,
    usage,
    districtNameMap: new Map(districts.map(district => [district.id, district.nev] as const)),
  }
}

export function getVisibleDistrictName(
  districtId: number | null | undefined,
  districtNameMap: Map<number, string>,
) {
  if (!districtId) return ''
  return districtNameMap.get(districtId) || ''
}

export function sanitizeDistrictReference<T extends { id_csoport: number | null; csoport?: { nev: string } | null }>(
  row: T,
  visibleIds: Set<number>,
): T {
  if (!row.id_csoport || visibleIds.has(row.id_csoport)) {
    return row
  }

  return {
    ...row,
    id_csoport: null,
    csoport: null,
  }
}
