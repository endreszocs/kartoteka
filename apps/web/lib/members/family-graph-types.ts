export const FAMILY_GRAPH_UNLOCK_THRESHOLD = 15

export const FAMILY_GRAPH_COUNT_EVENT = 'kartoteka:family-graph-count'

export type FamilyGraphGender = 'male' | 'female' | 'unknown'

export type FamilyGraphRelationshipType =
  | 'hazastars'
  | 'szulo_gyermek'
  | 'testver'
  | 'felteszver'
  | 'nagyszulo_unoka'
  | 'mostohaszulo_mostohagyermek'
  | 'gondviselo'
  | 'orokbe_fogado'
  | 'egyeb'

export type FamilyGraphEdgeKind =
  | 'membership'
  | 'spouse'
  | 'parent-child'
  | 'sibling'
  | 'grandparent'
  | 'step-parent'
  | 'guardian'
  | 'adoptive-parent'
  | 'relative'
  | 'other'

export type FamilyGraphMembershipRole =
  | 'csaladfo'
  | 'hazastars'
  | 'gyermek'
  | 'mostohaszulo'
  | 'gondviselo'
  | 'unoka'
  | 'nagyszulo'
  | 'lakotars'
  | 'alberlet'
  | 'egyeb'

export type FamilyGraphNodeId = `family:${string}` | `person:${number}`

export interface FamilyGraphUnlockState {
  familyCount: number
  threshold: number
  unlocked: boolean
}

export interface FamilyGraphFamilyNode {
  id: `family:${string}`
  kind: 'family'
  householdId: string
  familyId: number
  label: string
  memberCount: number
  active: boolean
}

export interface FamilyGraphPersonNode {
  id: `person:${number}`
  kind: 'person'
  personId: number
  label: string
  familyName: string
  givenName: string
  gender: FamilyGraphGender
  birthYear: number | null
  deceased: boolean
  familyIds: number[]
}

export type FamilyGraphNode = FamilyGraphFamilyNode | FamilyGraphPersonNode

export interface FamilyGraphEdge {
  id: string
  source: FamilyGraphNodeId
  target: FamilyGraphNodeId
  kind: FamilyGraphEdgeKind
  relationshipType?: FamilyGraphRelationshipType | null
  role?: FamilyGraphMembershipRole | null
  primary?: boolean
  label?: string | null
}

export interface FamilyGraphStats {
  familyCount: number
  personCount: number
  relationshipCount: number
}

export interface FamilyGraphData {
  nodes: FamilyGraphNode[]
  edges: FamilyGraphEdge[]
  stats: FamilyGraphStats
}

export interface FamilyGraphCountEventDetail {
  familyCount: number
}
