import type {
  FamilyGraphData,
  FamilyGraphEdge,
  FamilyGraphFamilyNode,
  FamilyGraphMembershipRole,
  FamilyGraphPersonNode,
} from '@/lib/members/family-graph-types'

export type FamilyGalaxyDensity = 'compact' | 'balanced' | 'airy'

export interface FamilyGalaxyLayoutOptions {
  density: FamilyGalaxyDensity
  width: number
  height: number
  variant?: number
}

export type FamilyGalaxyPositionMap = Record<string, { x: number; y: number }>

interface MembershipLink {
  familyId: string
  personId: string
  primary: boolean
  role: FamilyGraphMembershipRole | null
}

interface FamilySystem {
  family: FamilyGraphFamilyNode
  members: Array<{ person: FamilyGraphPersonNode; membership: MembershipLink }>
  importance: number
  footprint: number
}

const TWO_PI = Math.PI * 2
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const DENSITY_SCALE: Record<FamilyGalaxyDensity, number> = {
  compact: 0.84,
  balanced: 1,
  airy: 1.22,
}

const ARM_SPACING: Record<FamilyGalaxyDensity, number> = {
  compact: 78,
  balanced: 96,
  airy: 116,
}

const ROLE_PRIORITY: Partial<Record<FamilyGraphMembershipRole, number>> = {
  csaladfo: 0,
  hazastars: 1,
  gyermek: 3,
  unoka: 4,
  nagyszulo: 5,
  mostohaszulo: 6,
  gondviselo: 7,
  lakotars: 8,
  alberlet: 9,
  egyeb: 11,
}

function stableHash(value: string) {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function stableUnit(value: string) {
  return stableHash(value) / 4_294_967_295
}

function rolePriority(role: FamilyGraphMembershipRole | null) {
  if (!role) return 99
  return ROLE_PRIORITY[role] ?? 98
}

function viewportArmCount(width: number, familyCount: number) {
  const viewportMaximum = width < 640 ? 3 : width < 1_180 ? 4 : 5
  const dataMaximum = familyCount < 32 ? 3 : familyCount < 105 ? 4 : 5
  return Math.min(viewportMaximum, dataMaximum)
}

function galaxyDiscScale(width: number, height: number) {
  const aspectRatio = width / Math.max(height, 1)
  if (aspectRatio >= 1.7) return { x: 1, y: 0.62 }
  if (aspectRatio >= 1.1) return { x: 1, y: 0.76 }
  if (aspectRatio >= 0.82) return { x: 0.92, y: 0.9 }
  return { x: 0.76, y: 1 }
}

function familyAndPersonIds(edge: FamilyGraphEdge) {
  if (edge.kind !== 'membership') return null
  if (edge.source.startsWith('family:') && edge.target.startsWith('person:')) {
    return { familyId: edge.source, personId: edge.target }
  }
  if (edge.target.startsWith('family:') && edge.source.startsWith('person:')) {
    return { familyId: edge.target, personId: edge.source }
  }
  return null
}

function createMembershipIndexes(data: FamilyGraphData) {
  const linksByFamily = new Map<string, MembershipLink[]>()
  const linksByPerson = new Map<string, MembershipLink[]>()

  for (const edge of data.edges) {
    const ids = familyAndPersonIds(edge)
    if (!ids) continue
    const link: MembershipLink = {
      ...ids,
      primary: edge.primary === true,
      role: edge.role ?? null,
    }
    const familyLinks = linksByFamily.get(ids.familyId) ?? []
    familyLinks.push(link)
    linksByFamily.set(ids.familyId, familyLinks)
    const personLinks = linksByPerson.get(ids.personId) ?? []
    personLinks.push(link)
    linksByPerson.set(ids.personId, personLinks)
  }

  return { linksByFamily, linksByPerson }
}

function preferredMembership(
  person: FamilyGraphPersonNode,
  links: MembershipLink[],
  familyById: Map<string, FamilyGraphFamilyNode>,
) {
  return [...links].sort((left, right) => {
    if (left.primary !== right.primary) return left.primary ? -1 : 1
    const leftFamily = familyById.get(left.familyId)
    const rightFamily = familyById.get(right.familyId)
    const leftIndex = leftFamily ? person.familyIds.indexOf(leftFamily.familyId) : -1
    const rightIndex = rightFamily ? person.familyIds.indexOf(rightFamily.familyId) : -1
    const normalizedLeft = leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex
    const normalizedRight = rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex
    if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight
    if (rolePriority(left.role) !== rolePriority(right.role)) {
      return rolePriority(left.role) - rolePriority(right.role)
    }
    return left.familyId.localeCompare(right.familyId)
  })[0] ?? null
}

function orbitFootprint(memberCount: number, densityScale: number) {
  if (memberCount <= 0) return 42 * densityScale
  const ring = memberCount <= 7 ? 0 : memberCount <= 19 ? 1 : 2
  return (58 + ring * 30) * densityScale
}

function buildFamilySystems(data: FamilyGraphData, densityScale: number) {
  const families = data.nodes.filter(
    (node): node is FamilyGraphFamilyNode => node.kind === 'family',
  )
  const people = data.nodes.filter(
    (node): node is FamilyGraphPersonNode => node.kind === 'person',
  )
  const familyById = new Map<string, FamilyGraphFamilyNode>(
    families.map((family) => [family.id, family]),
  )
  const personById = new Map<string, FamilyGraphPersonNode>(
    people.map((person) => [person.id, person]),
  )
  const { linksByFamily, linksByPerson } = createMembershipIndexes(data)
  const relationshipDegree = new Map<string, number>()

  for (const edge of data.edges) {
    if (edge.kind === 'membership') continue
    relationshipDegree.set(edge.source, (relationshipDegree.get(edge.source) ?? 0) + 1)
    relationshipDegree.set(edge.target, (relationshipDegree.get(edge.target) ?? 0) + 1)
  }

  const preferredFamilyByPerson = new Map<string, string>()
  for (const person of people) {
    const membership = preferredMembership(person, linksByPerson.get(person.id) ?? [], familyById)
    if (membership) preferredFamilyByPerson.set(person.id, membership.familyId)
  }

  const systems: FamilySystem[] = families.map((family) => {
    const members = (linksByFamily.get(family.id) ?? [])
      .filter((link) => preferredFamilyByPerson.get(link.personId) === family.id)
      .flatMap((membership) => {
        const person = personById.get(membership.personId)
        return person ? [{ person, membership }] : []
      })
      .sort((left, right) => {
        const priority = rolePriority(left.membership.role) - rolePriority(right.membership.role)
        if (priority !== 0) return priority
        return left.person.label.localeCompare(right.person.label, 'hu-HU')
      })

    const relationshipWeight = members.reduce(
      (sum, member) => sum + Math.min(relationshipDegree.get(member.person.id) ?? 0, 8),
      0,
    )

    return {
      family,
      members,
      importance: members.length * 10 + relationshipWeight + (family.active ? 1 : 0),
      footprint: orbitFootprint(members.length, densityScale),
    }
  })

  systems.sort((left, right) => {
    if (left.importance !== right.importance) return right.importance - left.importance
    if (left.family.memberCount !== right.family.memberCount) {
      return right.family.memberCount - left.family.memberCount
    }
    return left.family.id.localeCompare(right.family.id)
  })

  const unassignedPeople = people.filter((person) => !preferredFamilyByPerson.has(person.id))
  return { systems, unassignedPeople }
}

function ringForMember(index: number) {
  let ring = 0
  let start = 0
  let capacity = 7

  while (index >= start + capacity) {
    start += capacity
    ring += 1
    capacity += 5
  }

  return { ring, start, capacity }
}

function placeMembers(
  positions: FamilyGalaxyPositionMap,
  system: FamilySystem,
  center: { x: number; y: number },
  densityScale: number,
  phase: number,
) {
  positions[system.family.id] = center

  for (let index = 0; index < system.members.length; index += 1) {
    const { person } = system.members[index]
    const { ring, start, capacity } = ringForMember(index)
    const remaining = system.members.length - start
    const nodesOnRing = Math.min(capacity, remaining)
    const indexOnRing = index - start
    const localPhase = stableUnit(`${system.family.id}:orbit`) * TWO_PI
    const angle = localPhase + phase * 0.48 + (indexOnRing / Math.max(nodesOnRing, 1)) * TWO_PI
    const radius = (50 + ring * 31) * densityScale

    positions[person.id] = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius * 0.82,
    }
  }
}

function overlapsPlacedSystem(
  center: { x: number; y: number },
  footprint: number,
  placed: Array<{ center: { x: number; y: number }; footprint: number }>,
) {
  return placed.some((other) => {
    const distance = Math.hypot(center.x - other.center.x, center.y - other.center.y)
    return distance < (footprint + other.footprint) * 0.58
  })
}

/**
 * Determinisztikus, O(V + E) adat-előkészítésű családi galaxis. A családok
 * spirálkarokon ülő naprendszerek, a személyek pedig a saját családjuk körül
 * keringenek. Nincs fizikai szimuláció, ezért nagy gráfon és érintőképernyőn is
 * stabil és olcsón animálható.
 */
export function createFamilyGalaxyPositions(
  data: FamilyGraphData,
  options: FamilyGalaxyLayoutOptions,
): FamilyGalaxyPositionMap {
  const densityScale = DENSITY_SCALE[options.density]
  const positions: FamilyGalaxyPositionMap = {}
  const { systems, unassignedPeople } = buildFamilySystems(data, densityScale)
  const disc = galaxyDiscScale(options.width, options.height)
  const phase = (options.variant ?? 0) * 0.36 - 0.12
  const armCount = viewportArmCount(options.width, systems.length)
  const armSpacing = ARM_SPACING[options.density]
  const coreSystemCount = Math.min(
    systems.length,
    Math.max(5, Math.round(systems.length * 0.07)),
  )
  const placedSystems: Array<{ center: { x: number; y: number }; footprint: number }> = []

  systems.forEach((system, index) => {
    if (index < coreSystemCount) {
      const coreRadius = index === 0 ? 0 : (20 + Math.sqrt(index) * 17) * densityScale
      const coreAngle = phase + index * GOLDEN_ANGLE
      const center = {
        x: Math.cos(coreAngle) * coreRadius,
        y: Math.sin(coreAngle) * coreRadius * 0.82,
      }
      placeMembers(positions, system, center, densityScale, phase)
      placedSystems.push({ center, footprint: system.footprint })
      return
    }

    const slot = index - coreSystemCount
    const arm = slot % armCount
    const step = Math.floor(slot / armCount)
    const jitter = (stableUnit(system.family.id) - 0.5) * 0.08
    const baseAngle = phase + (arm / armCount) * TWO_PI + step * 0.29 + jitter
    const radialStep = armSpacing * 0.19
    const baseRadius = 138 * densityScale + step * radialStep
    let center = { x: 0, y: 0 }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const radius = baseRadius + attempt * 17 * densityScale
      const angle = baseAngle + attempt * 0.018
      center = {
        x: Math.cos(angle) * radius * disc.x,
        y: Math.sin(angle) * radius * disc.y,
      }
      if (!overlapsPlacedSystem(center, system.footprint, placedSystems)) break
    }

    placeMembers(positions, system, center, densityScale, phase)
    placedSystems.push({ center, footprint: system.footprint })
  })

  const outerRadius = placedSystems.reduce(
    (maximum, placed) => Math.max(maximum, Math.hypot(placed.center.x, placed.center.y)),
    140,
  ) + 95 * densityScale

  unassignedPeople
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((person, index) => {
      const angle = phase + index * GOLDEN_ANGLE + stableUnit(person.id) * 0.08
      const radius = outerRadius + Math.sqrt(index + 1) * 24 * densityScale
      positions[person.id] = {
        x: Math.cos(angle) * radius * disc.x,
        y: Math.sin(angle) * radius * disc.y,
      }
    })

  return positions
}

export function selectFamilyGalaxyCoreId(data: FamilyGraphData) {
  const { systems } = buildFamilySystems(data, 1)
  return systems[0]?.family.id ?? null
}
