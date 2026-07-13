'use server'

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import {
  FAMILY_GRAPH_UNLOCK_THRESHOLD,
  type FamilyGraphData,
  type FamilyGraphEdge,
  type FamilyGraphEdgeKind,
  type FamilyGraphMembershipRole,
  type FamilyGraphNode,
  type FamilyGraphRelationshipType,
  type FamilyGraphUnlockState,
} from '@/lib/members/family-graph-types'

const DB_PAGE_SIZE = 500
const IN_FILTER_BATCH_SIZE = 100
const MAX_GRAPH_ROWS = 100_000

type QueryError = { message: string }
type QueryPage<T> = { data: T[] | null; error: QueryError | null }

type HouseholdRow = {
  id: string
  legacy_csalad_id: number
  megnevezes: string | null
  isaktiv: boolean
}

type PersonRelation = {
  id: number
  csaladnev: string | null
  k_nev: string | null
  ferfi: boolean | null
  sz_datum: string | null
  meghalt: boolean | null
}

type HouseholdTagRow = {
  id: string
  id_haztartas: string
  id_szemely: number
  szerep: FamilyGraphMembershipRole
  is_primary: boolean
}

type MinimalHouseholdTagRow = {
  id_haztartas: string
  id_szemely: number
}

type RelationshipRow = {
  id: string
  id_szemely_1: number
  id_szemely_2: number
  tipus: FamilyGraphRelationshipType
}

function chunksOf<T>(items: T[], size = IN_FILTER_BATCH_SIZE): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function collectPaged<T>(
  label: string,
  fetchPage: (from: number, to: number) => Promise<QueryPage<T>>,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; from < MAX_GRAPH_ROWS; from += DB_PAGE_SIZE) {
    const result = await fetchPage(from, from + DB_PAGE_SIZE - 1)
    if (result.error) throw new Error(`${label}: ${result.error.message}`)

    const page = result.data ?? []
    rows.push(...page)
    if (page.length < DB_PAGE_SIZE) return rows
  }

  throw new Error(`${label}: a biztonsági sorlimit (${MAX_GRAPH_ROWS}) elfogyott.`)
}

function appendWithinBudget<T>(target: T[], next: T[], label: string) {
  if (target.length + next.length > MAX_GRAPH_ROWS) {
    throw new Error(`${label}: a teljes gráf biztonsági sorlimitje (${MAX_GRAPH_ROWS}) elfogyott.`)
  }
  target.push(...next)
}

async function loadCurrentHouseholds(supabase: SupabaseClient, congregationId: string) {
  return collectPaged<HouseholdRow>('A családok lekérdezése sikertelen', async (from, to) => {
    const result = await supabase
      .from('haztartas')
      .select('id, legacy_csalad_id, megnevezes, isaktiv')
      .eq('congregation_id', congregationId)
      .is('ervenyes_ig', null)
      .not('legacy_csalad_id', 'is', null)
      .order('legacy_csalad_id', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)

    return {
      data: (result.data ?? []) as unknown as HouseholdRow[],
      error: result.error,
    }
  })
}

async function loadHouseholdIdsWithMembers(
  supabase: SupabaseClient,
  congregationId: string,
  householdIds: string[],
) {
  const rows: MinimalHouseholdTagRow[] = []

  for (const ids of chunksOf(householdIds)) {
    const next = await collectPaged<MinimalHouseholdTagRow>(
      'A családi tagságok lekérdezése sikertelen',
      async (from, to) => {
        const result = await supabase
          .from('haztartas_tag')
          .select('id_haztartas, id_szemely')
          .eq('congregation_id', congregationId)
          .in('id_haztartas', ids)
          .is('ervenyes_ig', null)
          .order('id', { ascending: true })
          .range(from, to)

        return {
          data: (result.data ?? []) as MinimalHouseholdTagRow[],
          error: result.error,
        }
      },
    )
    appendWithinBudget(rows, next, 'A családi tagságok lekérdezése sikertelen')
  }

  const tenantPersonIds = new Set<number>()
  const requestedPersonIds = Array.from(new Set(rows.map((row) => row.id_szemely)))
  for (const ids of chunksOf(requestedPersonIds)) {
    const result = await supabase
      .from('szemely')
      .select('id')
      .eq('congregation_id', congregationId)
      .in('id', ids)

    if (result.error) {
      throw new Error(`A családi tagság személyeinek ellenőrzése sikertelen: ${result.error.message}`)
    }
    for (const person of result.data ?? []) tenantPersonIds.add(Number(person.id))
  }

  return new Set(
    rows
      .filter((row) => tenantPersonIds.has(row.id_szemely))
      .map((row) => row.id_haztartas),
  )
}

async function loadEligibleHouseholds(supabase: SupabaseClient, congregationId: string) {
  const households = await loadCurrentHouseholds(supabase, congregationId)
  if (households.length === 0) return []

  const householdIdsWithMembers = await loadHouseholdIdsWithMembers(
    supabase,
    congregationId,
    households.map((household) => household.id),
  )

  return households.filter((household) => householdIdsWithMembers.has(household.id))
}

function toUnlockState(households: HouseholdRow[]): FamilyGraphUnlockState {
  const familyCount = new Set(
    households
      .filter((household) => household.isaktiv)
      .map((household) => household.legacy_csalad_id),
  ).size
  return {
    familyCount,
    threshold: FAMILY_GRAPH_UNLOCK_THRESHOLD,
    unlocked: familyCount >= FAMILY_GRAPH_UNLOCK_THRESHOLD,
  }
}

async function loadHouseholdTags(
  supabase: SupabaseClient,
  congregationId: string,
  householdIds: string[],
) {
  const rows: HouseholdTagRow[] = []

  for (const ids of chunksOf(householdIds)) {
    const next = await collectPaged<HouseholdTagRow>(
      'A családtagok lekérdezése sikertelen',
      async (from, to) => {
        const result = await supabase
          .from('haztartas_tag')
          .select('id, id_haztartas, id_szemely, szerep, is_primary')
          .eq('congregation_id', congregationId)
          .in('id_haztartas', ids)
          .is('ervenyes_ig', null)
          .order('id', { ascending: true })
          .range(from, to)

        return {
          data: (result.data ?? []) as unknown as HouseholdTagRow[],
          error: result.error,
        }
      },
    )
    appendWithinBudget(rows, next, 'A családtagok lekérdezése sikertelen')
  }

  return rows
}

async function loadPeople(
  supabase: SupabaseClient,
  congregationId: string,
  personIds: number[],
) {
  const people: PersonRelation[] = []

  for (const ids of chunksOf(personIds)) {
    const result = await supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, ferfi, sz_datum, meghalt')
      .eq('congregation_id', congregationId)
      .in('id', ids)
      .order('id', { ascending: true })

    if (result.error) throw new Error(`A személyek lekérdezése sikertelen: ${result.error.message}`)
    appendWithinBudget(
      people,
      (result.data ?? []) as unknown as PersonRelation[],
      'A személyek lekérdezése sikertelen',
    )
  }

  return people
}

async function loadRelationships(
  supabase: SupabaseClient,
  congregationId: string,
  personIds: number[],
) {
  const relationshipById = new Map<string, RelationshipRow>()
  const personIdSet = new Set(personIds)

  for (const ids of chunksOf(personIds)) {
    for (const endpoint of ['id_szemely_1', 'id_szemely_2'] as const) {
      const next = await collectPaged<RelationshipRow>(
        'A rokoni kapcsolatok lekérdezése sikertelen',
        async (from, to) => {
          const result = await supabase
            .from('szemely_kapcsolat')
            .select('id, id_szemely_1, id_szemely_2, tipus')
            .eq('congregation_id', congregationId)
            .in(endpoint, ids)
            .is('ervenyes_ig', null)
            .order('id', { ascending: true })
            .range(from, to)

          return {
            data: (result.data ?? []) as unknown as RelationshipRow[],
            error: result.error,
          }
        },
      )

      for (const relationship of next) {
        if (
          !personIdSet.has(relationship.id_szemely_1) ||
          !personIdSet.has(relationship.id_szemely_2)
        ) continue
        relationshipById.set(relationship.id, relationship)
        if (relationshipById.size > MAX_GRAPH_ROWS) {
          throw new Error(`A rokoni kapcsolatok teljes gráflimitje (${MAX_GRAPH_ROWS}) elfogyott.`)
        }
      }
    }
  }

  return Array.from(relationshipById.values())
}

function fullName(person: PersonRelation) {
  return `${person.csaladnev ?? ''} ${person.k_nev ?? ''}`.replace(/\s+/g, ' ').trim() || `Személy #${person.id}`
}

function birthYear(value: string | null) {
  if (!value) return null
  const year = Number(value.slice(0, 4))
  return Number.isInteger(year) && year > 0 ? year : null
}

const RELATIONSHIP_KIND = {
  hazastars: 'spouse',
  szulo_gyermek: 'parent-child',
  testver: 'sibling',
  felteszver: 'sibling',
  nagyszulo_unoka: 'grandparent',
  mostohaszulo_mostohagyermek: 'step-parent',
  gondviselo: 'guardian',
  orokbe_fogado: 'adoptive-parent',
  egyeb: 'other',
} satisfies Record<FamilyGraphRelationshipType, FamilyGraphEdgeKind>

function isSymmetricRelationship(type: FamilyGraphRelationshipType) {
  return type === 'hazastars' || type === 'testver' || type === 'felteszver'
}

function deduplicateHouseholds(households: HouseholdRow[], tags: HouseholdTagRow[]) {
  const memberCountByHousehold = new Map<string, number>()
  for (const tag of tags) {
    memberCountByHousehold.set(
      tag.id_haztartas,
      (memberCountByHousehold.get(tag.id_haztartas) ?? 0) + 1,
    )
  }

  const selectedByLegacyId = new Map<number, HouseholdRow>()
  for (const household of households) {
    const selected = selectedByLegacyId.get(household.legacy_csalad_id)
    if (!selected) {
      selectedByLegacyId.set(household.legacy_csalad_id, household)
      continue
    }

    const selectedMembers = memberCountByHousehold.get(selected.id) ?? 0
    const candidateMembers = memberCountByHousehold.get(household.id) ?? 0
    const candidateWins =
      (household.isaktiv && !selected.isaktiv) ||
      (household.isaktiv === selected.isaktiv && candidateMembers > selectedMembers) ||
      (
        household.isaktiv === selected.isaktiv &&
        candidateMembers === selectedMembers &&
        household.id.localeCompare(selected.id) < 0
      )

    if (candidateWins) selectedByLegacyId.set(household.legacy_csalad_id, household)
  }

  return Array.from(selectedByLegacyId.values())
}

function buildGraph(
  households: HouseholdRow[],
  tags: HouseholdTagRow[],
  people: PersonRelation[],
  relationships: RelationshipRow[],
): FamilyGraphData {
  const householdById = new Map(households.map((household) => [household.id, household]))
  const tagsByHousehold = new Map<string, HouseholdTagRow[]>()
  const allowedPersonById = new Map(people.map((person) => [person.id, person]))
  const personById = new Map<number, PersonRelation>()
  const familyIdsByPerson = new Map<number, Set<number>>()

  for (const tag of tags) {
    const household = householdById.get(tag.id_haztartas)
    const person = allowedPersonById.get(tag.id_szemely)
    if (!household || !person) continue

    const householdTags = tagsByHousehold.get(household.id) ?? []
    householdTags.push(tag)
    tagsByHousehold.set(household.id, householdTags)
    personById.set(person.id, person)

    const familyIds = familyIdsByPerson.get(person.id) ?? new Set<number>()
    familyIds.add(household.legacy_csalad_id)
    familyIdsByPerson.set(person.id, familyIds)
  }

  const familyNodes: FamilyGraphNode[] = households.map((household) => {
    const householdTags = tagsByHousehold.get(household.id) ?? []
    const uniqueMembers = new Set(householdTags.map((tag) => tag.id_szemely))
    const headTag = householdTags.find((tag) => tag.szerep === 'csaladfo')
      ?? householdTags.find((tag) => tag.is_primary)
      ?? householdTags[0]
    const head = headTag ? personById.get(headTag.id_szemely) ?? null : null
    const surname = head?.csaladnev?.trim()
    const label = household.megnevezes?.trim()
      || (surname ? `${surname} család` : `Család #${household.legacy_csalad_id}`)

    return {
      id: `family:${household.id}`,
      kind: 'family',
      householdId: household.id,
      familyId: household.legacy_csalad_id,
      label,
      memberCount: uniqueMembers.size,
      active: household.isaktiv,
    }
  })

  const personNodes: FamilyGraphNode[] = Array.from(personById.values()).map((person) => ({
    id: `person:${person.id}`,
    kind: 'person',
    personId: person.id,
    label: fullName(person),
    familyName: person.csaladnev?.trim() ?? '',
    givenName: person.k_nev?.trim() ?? '',
    gender: person.ferfi === true ? 'male' : person.ferfi === false ? 'female' : 'unknown',
    birthYear: birthYear(person.sz_datum),
    deceased: person.meghalt === true,
    familyIds: Array.from(familyIdsByPerson.get(person.id) ?? []).sort((left, right) => left - right),
  }))

  const edges: FamilyGraphEdge[] = []
  const edgeKeys = new Set<string>()

  for (const tag of tags) {
    if (!householdById.has(tag.id_haztartas) || !personById.has(tag.id_szemely)) continue
    const key = `membership:${tag.id_haztartas}:${tag.id_szemely}`
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    edges.push({
      id: key,
      source: `family:${tag.id_haztartas}`,
      target: `person:${tag.id_szemely}`,
      kind: 'membership',
      role: tag.szerep,
    })
  }

  let relationshipCount = 0
  for (const relationship of relationships) {
    const left = relationship.id_szemely_1
    const right = relationship.id_szemely_2
    if (!personById.has(left) || !personById.has(right) || left === right) continue

    const symmetric = isSymmetricRelationship(relationship.tipus)
    const sourceId = symmetric ? Math.min(left, right) : left
    const targetId = symmetric ? Math.max(left, right) : right
    const key = `relationship:${relationship.tipus}:${sourceId}:${targetId}`
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    edges.push({
      id: key,
      source: `person:${sourceId}`,
      target: `person:${targetId}`,
      kind: RELATIONSHIP_KIND[relationship.tipus],
      relationshipType: relationship.tipus,
    })
    relationshipCount += 1
  }

  return {
    nodes: [...familyNodes, ...personNodes],
    edges,
    stats: {
      familyCount: new Set(households.map((household) => household.legacy_csalad_id)).size,
      personCount: personNodes.length,
      relationshipCount,
    },
  }
}

/** A szerver dönti el, hogy a gyülekezet elérte-e a 15 rögzített családot. */
export async function getFamilyGraphUnlockState(): Promise<FamilyGraphUnlockState> {
  const { supabase, congregationId, user } = await getEffectiveCongregationContext()
  if (!user || !congregationId) {
    return {
      familyCount: 0,
      threshold: FAMILY_GRAPH_UNLOCK_THRESHOLD,
      unlocked: false,
    }
  }

  const households = await loadEligibleHouseholds(supabase, congregationId)
  return toUnlockState(households)
}

/**
 * A teljes, adatminimalizált gyülekezeti családi háló. A teljes gráf csak a
 * feloldási küszöb után olvasható, és minden lekérdezés explicit tenant-szűrt.
 */
export async function getFamilyGraphData(): Promise<FamilyGraphData> {
  const { supabase, congregationId, user } = await getEffectiveCongregationContext()
  if (!user || !congregationId) {
    throw new Error('Nincs aktív gyülekezeti hozzáférés.')
  }

  const households = await loadEligibleHouseholds(supabase, congregationId)
  const unlock = toUnlockState(households)
  if (!unlock.unlocked) {
    throw new Error(`A családi háló ${unlock.threshold} rögzített család után válik elérhetővé.`)
  }

  const rawTags = await loadHouseholdTags(
    supabase,
    congregationId,
    households.map((household) => household.id),
  )
  const graphHouseholds = deduplicateHouseholds(households, rawTags)
  const graphHouseholdIds = new Set(graphHouseholds.map((household) => household.id))
  const tags = rawTags.filter((tag) => graphHouseholdIds.has(tag.id_haztartas))
  const requestedPersonIds = Array.from(new Set(tags.map((tag) => tag.id_szemely)))
  const people = await loadPeople(supabase, congregationId, requestedPersonIds)
  const relationships = await loadRelationships(
    supabase,
    congregationId,
    people.map((person) => person.id),
  )

  return buildGraph(graphHouseholds, tags, people, relationships)
}
