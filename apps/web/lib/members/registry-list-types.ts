import { z } from 'zod'

import type { EnrichedMember, PaymentStatus } from '@/lib/constants/members'

export const REGISTRY_PAGE_SIZE = 50

export const MEMBER_STATUS_FILTERS = [
  'aktív',
  'meghalt',
  'elkoltozott',
  'kitert',
  'mas_vallasu',
  'lebego',
  'mind',
] as const

export const HOUSEHOLD_ROLES = [
  'csaladfo',
  'hazastars',
  'gyermek',
  'mostohaszulo',
  'gondviselo',
  'unoka',
  'nagyszulo',
  'lakotars',
  'alberlet',
  'egyeb',
] as const

export const MEMBER_SORTS = [
  'id',
  'name',
  'age',
  'birth',
  'address',
  'job',
] as const

export const FAMILY_SORTS = [
  'head',
  'spouse',
  'address',
  'district',
  'status',
] as const

export type MemberStatusFilter = (typeof MEMBER_STATUS_FILTERS)[number]
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number]
export type MemberSort = (typeof MEMBER_SORTS)[number]
export type FamilySort = (typeof FAMILY_SORTS)[number]
export type MemberGenderFilter = 'all' | 'male' | 'female' | 'unknown'
export type MemberFamilyFilter = 'all' | 'with-family' | 'without-family'
export type MemberContactFilter = 'all' | 'phone' | 'email' | 'both' | 'missing'
export type SortDirection = 'asc' | 'desc'
export type FamilyStatusFilter = 'all' | 'active' | 'deceased' | 'inactive'
export type FamilyDistrictFilter = 'all' | 'none' | 'specific'
export type FamilyHouseholdFilter = 'all' | 'couple' | 'single'
export type FamilyChildrenFilter = 'all' | 'with' | 'without'

const paymentStatuses = [
  'elhunyt',
  'elkoltozott',
  'kitert',
  'felmentett',
  'rendezve',
  'hatralekos',
] as const satisfies readonly PaymentStatus[]

const cursorSchema = z.string().trim().min(1).max(512).nullable().optional()

export const memberListQuerySchema = z
  .object({
    cursor: cursorSchema,
    pageSize: z.literal(REGISTRY_PAGE_SIZE).default(REGISTRY_PAGE_SIZE),
    search: z.string().trim().max(160).default(''),
    status: z.enum(MEMBER_STATUS_FILTERS).default('mind'),
    ageMin: z.number().int().min(0).max(130).nullable().default(null),
    ageMax: z.number().int().min(0).max(130).nullable().default(null),
    gender: z.enum(['all', 'male', 'female', 'unknown']).default('all'),
    family: z.enum(['all', 'with-family', 'without-family']).default('all'),
    locality: z.string().trim().max(120).nullable().default(null),
    religion: z.string().trim().max(120).nullable().default(null),
    payment: z.union([z.literal('all'), z.enum(paymentStatuses)]).default('all'),
    contact: z.enum(['all', 'phone', 'email', 'both', 'missing']).default('all'),
    sort: z.enum(MEMBER_SORTS).default('name'),
    direction: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict()
  .refine(
    ({ ageMin, ageMax }) => ageMin == null || ageMax == null || ageMin <= ageMax,
    { message: 'A minimális életkor nem lehet nagyobb a maximálisnál.', path: ['ageMin'] },
  )

export const familyListQuerySchema = z
  .object({
    cursor: cursorSchema,
    pageSize: z.literal(REGISTRY_PAGE_SIZE).default(REGISTRY_PAGE_SIZE),
    query: z.string().trim().max(160).default(''),
    status: z.enum(['all', 'active', 'deceased', 'inactive']).default('all'),
    district: z.enum(['all', 'none', 'specific']).default('all'),
    districtIds: z.array(z.number().int().positive()).max(100).default([]),
    household: z.enum(['all', 'couple', 'single']).default('all'),
    children: z.enum(['all', 'with', 'without']).default('all'),
    missingAddress: z.boolean().default(false),
    missingDistrict: z.boolean().default(false),
    memberCountMin: z.number().int().min(0).max(100).nullable().default(null),
    memberCountMax: z.number().int().min(0).max(100).nullable().default(null),
    sortKey: z.enum(FAMILY_SORTS).default('head'),
    sortDir: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict()
  .refine(
    ({ memberCountMin, memberCountMax }) =>
      memberCountMin == null || memberCountMax == null || memberCountMin <= memberCountMax,
    { message: 'A minimális családlétszám nem lehet nagyobb a maximálisnál.', path: ['memberCountMin'] },
  )
  .refine(
    ({ district, districtIds, missingDistrict }) =>
      (district !== 'specific' || districtIds.length > 0) &&
      !(district === 'specific' && missingDistrict),
    { message: 'Konkrét körzethez legalább egy körzetazonosító kell, és nem kombinálható a hiányzó körzettel.', path: ['districtIds'] },
  )

/** A kliensnek átadható, minden mezőjében opcionális lekérdezés. */
export type MemberListQuery = z.input<typeof memberListQuerySchema>
export type FamilyListQuery = z.input<typeof familyListQuerySchema>

/** Szerveroldalon validált és alapértékekkel feltöltött alak. */
export type ParsedMemberListQuery = z.output<typeof memberListQuerySchema>
export type ParsedFamilyListQuery = z.output<typeof familyListQuerySchema>

export interface MemberListKpiSummary {
  /** A KPI-k a pillanatnyi szűrt eredményhalmazra vonatkoznak. */
  scope: 'filtered'
  members: number
  active: number
  deceased: number
  moved: number
  withoutFamily: number
  paidUp: number
  inArrears: number
  men: number
  women: number
  birthdaysThisMonth: number
}

export type MemberListItem = EnrichedMember & {
  /** Kompatibilis avatarmező; URL, soha nem a szemely.kep base64 tartalma. */
  kep: string | null
}

export interface MemberListPage {
  members: MemberListItem[]
  totalCount: number
  filteredCount: number
  pageSize: number
  hasMore: boolean
  nextCursor: string | null
  /** Diagnosztikához és egyszerű offsetes integrációhoz; a kurzor az elsődleges. */
  nextOffset: number | null
  summary: MemberListKpiSummary
}

export interface FamilyListPerson {
  id: number
  csaladnev: string | null
  k_nev: string | null
  ferfi: boolean
  sz_datum: string | null
  allapot: string | null
  meghalt: boolean
  namepattern: string | null
  vallas: string | null
  kep?: string | null
}

export interface FamilyListChild {
  id: number
  csaladnev: string | null
  k_nev: string | null
  sz_datum: string | null
  meghalt: boolean | null
  kep?: string | null
}

export interface FamilyListItem {
  /** A legacy csalad.id, amelyet a meglévő családi actionök használnak. */
  id: number
  householdId: string
  displayName: string
  c_utcaid: number | null
  c_szam: string | null
  isaktiv: boolean
  id_csoport: number | null
  district: { id: number; name: string } | null
  ferfi: FamilyListPerson | null
  no: FamilyListPerson | null
  utca: { name: string } | null
  gyerekek: FamilyListChild[]
  memberCount: number
}

export interface FamilyListKpiSummary {
  scope: 'filtered'
  families: number
  active: number
  deceased: number
  inactive: number
  people: number
  children: number
  withoutHead: number
  withoutAddress: number
  withoutDistrict: number
}

export interface FamilyListPage {
  families: FamilyListItem[]
  totalCount: number
  filteredCount: number
  pageSize: number
  hasMore: boolean
  nextCursor: string | null
  nextOffset: number | null
  summary: FamilyListKpiSummary
}

export interface RegistryFilterOption<T extends string | number = string> {
  value: T
  label: string
  count?: number
}

export interface MemberFilterOptions {
  localities: Array<RegistryFilterOption<string>>
  religions: Array<RegistryFilterOption<string>>
  statuses: Array<RegistryFilterOption<MemberStatusFilter>>
  genders: Array<RegistryFilterOption<MemberGenderFilter>>
  families: Array<RegistryFilterOption<MemberFamilyFilter>>
  contacts: Array<RegistryFilterOption<MemberContactFilter>>
  paymentStatuses: Array<RegistryFilterOption<PaymentStatus>>
  sorts: Array<RegistryFilterOption<MemberSort>>
  directions: Array<RegistryFilterOption<SortDirection>>
}
