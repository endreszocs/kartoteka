'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { MemberAvatar } from '@kartoteka/ui-app'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BriefcaseBusiness,
  Cake,
  CheckCircle2,
  Download,
  FilterX,
  Link2,
  MapPin,
  Search,
  SlidersHorizontal,
  Trash2,
  Unlink,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  getMemberFilterOptions,
  getMemberRegistrySnapshot,
  getMembersPage,
} from '@/app/(dashboard)/tagnyilvantartas/registry-list-actions'
import { EmptyFirstRecord } from '@/components/ui/empty-first-record'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RegistryCardsHost } from '@/components/modals/registry-cards-host'
import { getEnrichedMemberById } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { FamilyTreeDialog } from '@/components/modals/family-tree-dialog'
import { MemberFormDialog } from '@/components/modals/member-form-dialog'
import { MemberRemoveDialog } from '@/components/modals/member-remove-dialog'
import { MEMBER_STATUS_FILTERS, PAYMENT_STATUS_CONFIG } from '@/lib/constants/members'
import type { PaymentStatus } from '@/lib/constants/members'
import {
  REGISTRY_PAGE_SIZE,
  type MemberContactFilter,
  type MemberFamilyFilter,
  type MemberFilterOptions,
  type MemberGenderFilter,
  type MemberListItem,
  type MemberListPage,
  type MemberListQuery,
  type MemberSort,
  type MemberStatusFilter,
  type SortDirection,
} from '@/lib/members/registry-list-types'
import { ageFromDate, currentRegistryMonth, monthFromIsoDate } from '@/lib/utils/date'
import { formatNameWithPrefix, isActiveMember } from '@/lib/utils/member-helpers'
import { cn } from '@/lib/utils'

import { MemberStatusBadge } from './member-status-badge'
import { useCrossCongregationNotifications } from './use-cross-congregation-notifications'
import { useDebouncedValue } from './use-debounced-value'

interface PersonsTabProps {
  initialPage: MemberListPage
}

type PaymentFilter = 'all' | PaymentStatus
type BirthdayFilter = 'all' | 'this-month'

interface PersonFilters {
  status: MemberStatusFilter
  ageMin: string
  ageMax: string
  birthday: BirthdayFilter
  gender: MemberGenderFilter
  family: MemberFamilyFilter
  locality: string
  religion: string
  payment: PaymentFilter
  contact: MemberContactFilter
}

type ActiveFilterKey = keyof PersonFilters | 'age'

interface ActiveFilterChip {
  key: ActiveFilterKey
  label: string
}

const PAGE_SIZE = REGISTRY_PAGE_SIZE

const DEFAULT_FILTERS: PersonFilters = {
  status: 'aktív',
  ageMin: '',
  ageMax: '',
  birthday: 'all',
  gender: 'all',
  family: 'all',
  locality: '',
  religion: '',
  payment: 'all',
  contact: 'all',
}

const EMPTY_FILTERS: PersonFilters = {
  ...DEFAULT_FILTERS,
  status: 'mind',
}

const PAYMENT_OPTIONS: Array<{ value: PaymentStatus; label: string }> = (
  Object.entries(PAYMENT_STATUS_CONFIG) as Array<
    [PaymentStatus, (typeof PAYMENT_STATUS_CONFIG)[PaymentStatus]]
  >
).map(([value, config]) => ({ value, label: config.label }))

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('hu-HU')
    .trim()
}

function isBirthdayInMonth(member: MemberListItem, month: number): boolean {
  return !member.meghalt && monthFromIsoDate(member.sz_datum) === month
}

function formatAddress(member: MemberListItem): string {
  const locality = member.adrlocality?.name?.trim() ?? ''
  const street = member.adrstreet?.name?.trim() ?? ''
  const houseNumber = member.c_szam?.trim() ?? ''
  const streetLine = [street, houseNumber].filter(Boolean).join(' ')
  return [locality, streetLine].filter(Boolean).join(', ')
}

function createFilterChips(filters: PersonFilters): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []
  const status = MEMBER_STATUS_FILTERS.find((item) => item.value === filters.status)
  if (filters.status !== 'mind' && status) chips.push({ key: 'status', label: status.label })

  if (filters.ageMin || filters.ageMax) {
    const range = filters.ageMin && filters.ageMax
      ? `${filters.ageMin}–${filters.ageMax} év`
      : filters.ageMin
        ? `${filters.ageMin} évtől`
        : `${filters.ageMax} éves korig`
    chips.push({ key: 'age', label: range })
  }

  if (filters.birthday === 'this-month') {
    chips.push({ key: 'birthday', label: 'Születésnapos ebben a hónapban' })
  }

  const genderLabels: Record<Exclude<MemberGenderFilter, 'all'>, string> = {
    male: 'Férfiak',
    female: 'Nők',
    unknown: 'Nem nincs megadva',
  }
  if (filters.gender !== 'all') chips.push({ key: 'gender', label: genderLabels[filters.gender] })

  const familyLabels: Record<Exclude<MemberFamilyFilter, 'all'>, string> = {
    'with-family': 'Családhoz rendelve',
    'without-family': 'Család nélkül',
  }
  if (filters.family !== 'all') chips.push({ key: 'family', label: familyLabels[filters.family] })
  if (filters.locality) chips.push({ key: 'locality', label: `Település: ${filters.locality}` })
  if (filters.religion) chips.push({ key: 'religion', label: `Vallás: ${filters.religion}` })

  const payment = filters.payment
  if (payment !== 'all') {
    chips.push({ key: 'payment', label: `Pénzügy: ${PAYMENT_STATUS_CONFIG[payment].label}` })
  }

  const contactLabels: Record<Exclude<MemberContactFilter, 'all'>, string> = {
    phone: 'Van telefonszám',
    email: 'Van e-mail-cím',
    both: 'Telefon és e-mail',
    missing: 'Nincs elérhetőség',
  }
  if (filters.contact !== 'all') chips.push({ key: 'contact', label: contactLabels[filters.contact] })

  return chips
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'A személyek lekérése nem sikerült.'
}

function getAgeFilterError(filters: Pick<PersonFilters, 'ageMin' | 'ageMax'>): string | null {
  const minAge = filters.ageMin === '' ? null : Number(filters.ageMin)
  const maxAge = filters.ageMax === '' ? null : Number(filters.ageMax)

  if (
    (minAge !== null && (!Number.isInteger(minAge) || minAge < 0 || minAge > 120))
    || (maxAge !== null && (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 120))
  ) {
    return 'Az életkor 0 és 120 közötti egész szám lehet.'
  }

  if (minAge !== null && maxAge !== null && minAge > maxAge) {
    return 'A kezdő életkor nem lehet nagyobb a felső határnál.'
  }

  return null
}

const FALLBACK_GENDER_OPTIONS: MemberFilterOptions['genders'] = [
  { value: 'all', label: 'Minden nem' },
  { value: 'male', label: 'Férfi' },
  { value: 'female', label: 'Nő' },
  { value: 'unknown', label: 'Nincs megadva' },
]

const FALLBACK_FAMILY_OPTIONS: MemberFilterOptions['families'] = [
  { value: 'all', label: 'Minden családi kapcsolat' },
  { value: 'with-family', label: 'Családhoz rendelve' },
  { value: 'without-family', label: 'Család nélkül' },
]

const FALLBACK_CONTACT_OPTIONS: MemberFilterOptions['contacts'] = [
  { value: 'all', label: 'Minden elérhetőség' },
  { value: 'phone', label: 'Van telefonszám' },
  { value: 'email', label: 'Van e-mail' },
  { value: 'both', label: 'Telefon és e-mail is van' },
  { value: 'missing', label: 'Nincs elérhetőség' },
]

export function PersonsTab({ initialPage }: PersonsTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDebouncedValue(searchQuery.trim(), 280)
  const [filters, setFilters] = useState<PersonFilters>(DEFAULT_FILTERS)
  const [draftFilters, setDraftFilters] = useState<PersonFilters>(DEFAULT_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [registryMonth, setRegistryMonth] = useState(() => currentRegistryMonth())
  const snapshotMonthRef = useRef(registryMonth)
  const [sortCol, setSortCol] = useState<MemberSort>('id')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [members, setMembers] = useState<MemberListItem[]>(initialPage.members)
  const [pageState, setPageState] = useState<MemberListPage>(initialPage)
  const [registrySnapshot, setRegistrySnapshot] = useState(() => ({
    total: initialPage.totalCount,
    active: initialPage.summary.active,
    birthdays: initialPage.summary.birthdaysThisMonth,
    floating: initialPage.summary.withoutFamily,
  }))
  const [filterOptions, setFilterOptions] = useState<MemberFilterOptions | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)
  const loadMoreInFlightRef = useRef(false)

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsMember, setDetailsMember] = useState<MemberListItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<MemberListItem | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removingMember, setRemovingMember] = useState<{ id: number; name: string } | null>(null)

  const [treeOpen, setTreeOpen] = useState(false)
  const [treeMemberId, setTreeMemberId] = useState<number | null>(null)
  const [familyOpen, setFamilyOpen] = useState(false)
  const [familyDetailsId, setFamilyDetailsId] = useState<number | null>(null)

  const serverSearch = deferredSearchQuery.trim()
  const serverQuery = useMemo<MemberListQuery>(() => ({
    pageSize: PAGE_SIZE,
    search: serverSearch,
    status: filters.status,
    ageMin: filters.ageMin === '' ? null : Number(filters.ageMin),
    ageMax: filters.ageMax === '' ? null : Number(filters.ageMax),
    birthdayMonth: filters.birthday === 'this-month' ? registryMonth : null,
    gender: filters.gender,
    family: filters.family,
    locality: filters.locality || null,
    religion: filters.religion || null,
    payment: filters.payment,
    contact: filters.contact,
    sort: sortCol,
    direction: sortDir,
  }), [filters, registryMonth, serverSearch, sortCol, sortDir])
  const queryKey = JSON.stringify(serverQuery)
  const previousQueryKeyRef = useRef(queryKey)
  const isDefaultRegistryScope = serverSearch === ''
    && filters.status === DEFAULT_FILTERS.status
    && filters.ageMin === DEFAULT_FILTERS.ageMin
    && filters.ageMax === DEFAULT_FILTERS.ageMax
    && filters.birthday === DEFAULT_FILTERS.birthday
    && filters.gender === DEFAULT_FILTERS.gender
    && filters.family === DEFAULT_FILTERS.family
    && filters.locality === DEFAULT_FILTERS.locality
    && filters.religion === DEFAULT_FILTERS.religion
    && filters.payment === DEFAULT_FILTERS.payment
    && filters.contact === DEFAULT_FILTERS.contact

  const everPaidSet = useMemo(() => {
    const result = new Set<number>()
    for (const member of members) if (member.hasEverPaid) result.add(member.id)
    return result
  }, [members])

  const { notifications: crossNotifs } = useCrossCongregationNotifications()
  const crossMatchedIds = useMemo(() => {
    const result = new Set<number>()
    for (const notification of crossNotifs) {
      result.add(notification.triggering_szemely_id)
      result.add(notification.matched_szemely_id)
    }
    return result
  }, [crossNotifs])

  const stats = registrySnapshot
  const isSearchPending = searchQuery.trim() !== deferredSearchQuery
  const visibleMembers = members
  const hasMore = !isLoading && pageState.hasMore && Boolean(pageState.nextCursor)
  const activeFilterChips = createFilterChips(filters)
  const localityOptions = filterOptions?.localities ?? []
  const religionOptions = filterOptions?.religions ?? []
  const statusOptions = filterOptions?.statuses.length ? filterOptions.statuses : MEMBER_STATUS_FILTERS
  const genderOptions = filterOptions?.genders.length ? filterOptions.genders : FALLBACK_GENDER_OPTIONS
  const familyOptions = filterOptions?.families.length ? filterOptions.families : FALLBACK_FAMILY_OPTIONS
  const contactOptions = filterOptions?.contacts.length ? filterOptions.contacts : FALLBACK_CONTACT_OPTIONS
  const paymentOptions = filterOptions?.paymentStatuses.length ? filterOptions.paymentStatuses : PAYMENT_OPTIONS
  const draftFilterCount = createFilterChips(draftFilters).length
  const draftAgeError = getAgeFilterError(draftFilters)

  const fetchFirstPage = useCallback(async ({ preserveMembers = false } = {}) => {
    const requestId = ++requestIdRef.current
    loadMoreInFlightRef.current = false
    setIsLoadingMore(false)
    setIsLoading(true)
    setListError(null)
    if (!preserveMembers) setMembers([])

    try {
      const page = await getMembersPage({ ...serverQuery, cursor: null })
      if (requestIdRef.current !== requestId) return
      setMembers(page.members)
      setPageState(page)
      if (isDefaultRegistryScope) {
        setRegistrySnapshot({
          total: page.totalCount,
          active: page.summary.active,
          birthdays: page.summary.birthdaysThisMonth,
          floating: page.summary.withoutFamily,
        })
      }
    } catch (error) {
      if (requestIdRef.current !== requestId) return
      setListError(getErrorMessage(error))
      if (!preserveMembers) setMembers([])
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false)
    }
  }, [isDefaultRegistryScope, serverQuery])

  const refreshRegistrySnapshot = useCallback(async () => {
    try {
      setRegistrySnapshot(await getMemberRegistrySnapshot())
    } catch {
      // A lista továbbra is használható; a KPI a következő sikeres frissítésnél szinkronizálódik.
    }
  }, [])

  useEffect(() => {
    const syncRegistryMonth = () => {
      const nextMonth = currentRegistryMonth()
      setRegistryMonth((currentMonth) => currentMonth === nextMonth ? currentMonth : nextMonth)
    }
    const intervalId = window.setInterval(syncRegistryMonth, 60_000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncRegistryMonth()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (snapshotMonthRef.current === registryMonth) return
    snapshotMonthRef.current = registryMonth
    void refreshRegistrySnapshot()
  }, [refreshRegistrySnapshot, registryMonth])

  useEffect(() => {
    let cancelled = false
    getMemberFilterOptions()
      .then((options) => {
        if (!cancelled) setFilterOptions(options)
      })
      .catch(() => {
        // A beépített alapopciók mellett a lista továbbra is használható.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // A friss fetchFirstPage-et ref-en át hívjuk, hogy az effekt CSAK a queryKey
  // változására fusson. Enélkül a fetchFirstPage referencia-változása (pl. a
  // registry-scope váltás a form/eltávolítás bezárásakor) spurious cleanup-ot
  // indított: a folyamatban lévő újratöltést megszakította → a lista üresen
  // maradt / „töltés" ragadt (2026-07-14, „eltűnnek a személyek" bug).
  const fetchFirstPageRef = useRef(fetchFirstPage)
  fetchFirstPageRef.current = fetchFirstPage

  useEffect(() => {
    if (previousQueryKeyRef.current === queryKey) return
    previousQueryKeyRef.current = queryKey
    void fetchFirstPageRef.current()
    return () => {
      requestIdRef.current += 1
      loadMoreInFlightRef.current = false
    }
  }, [queryKey])

  const loadMore = useCallback(async () => {
    const cursor = pageState.nextCursor
    if (!cursor || !pageState.hasMore || isLoading || loadMoreInFlightRef.current) return

    const requestId = ++requestIdRef.current
    loadMoreInFlightRef.current = true
    setIsLoadingMore(true)
    setListError(null)

    try {
      const page = await getMembersPage({ ...serverQuery, cursor })
      if (requestIdRef.current !== requestId) return
      setMembers((current) => {
        const existingIds = new Set(current.map((member) => member.id))
        return [...current, ...page.members.filter((member) => !existingIds.has(member.id))]
      })
      setPageState(page)
    } catch (error) {
      if (requestIdRef.current === requestId) setListError(getErrorMessage(error))
    } finally {
      if (requestIdRef.current === requestId) {
        loadMoreInFlightRef.current = false
        setIsLoadingMore(false)
      }
    }
  }, [isLoading, pageState.hasMore, pageState.nextCursor, serverQuery])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore()
      },
      { rootMargin: '600px 0px', threshold: 0.01 },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  function invalidateActiveRequests() {
    requestIdRef.current += 1
    loadMoreInFlightRef.current = false
    previousQueryKeyRef.current = '__invalidated__'
    setIsLoadingMore(false)
  }

  function toggleSort(column: MemberSort) {
    invalidateActiveRequests()
    if (sortCol === column) {
      setSortDir((direction) => (direction === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortCol(column)
    setSortDir('asc')
  }

  function handleFilterOpenChange(open: boolean) {
    if (open) setDraftFilters(filters)
    setFilterOpen(open)
  }

  function applyFilters() {
    if (draftAgeError) {
      document.getElementById('filter-age-min')?.focus()
      return
    }
    invalidateActiveRequests()
    setFilters(draftFilters)
    setFilterOpen(false)
  }

  function clearFilterChip(key: ActiveFilterKey) {
    invalidateActiveRequests()
    setFilters((current) => {
      switch (key) {
        case 'status':
          return { ...current, status: 'mind' }
        case 'age':
        case 'ageMin':
        case 'ageMax':
          return { ...current, ageMin: '', ageMax: '' }
        case 'birthday':
          return { ...current, birthday: 'all' }
        case 'gender':
          return { ...current, gender: 'all' }
        case 'family':
          return { ...current, family: 'all' }
        case 'locality':
          return { ...current, locality: '' }
        case 'religion':
          return { ...current, religion: '' }
        case 'payment':
          return { ...current, payment: 'all' }
        case 'contact':
          return { ...current, contact: 'all' }
      }
    })
  }

  function clearAllFilters() {
    invalidateActiveRequests()
    setSearchQuery('')
    setFilters(EMPTY_FILTERS)
    setDraftFilters(EMPTY_FILTERS)
  }

  function openDetails(member: MemberListItem) {
    setDetailsMember(member)
    setDetailsOpen(true)
  }

  function openEdit(member: MemberListItem | null) {
    setEditingMember(member)
    setDetailsOpen(false)
    setFormOpen(true)
  }

  function openRemove(member: MemberListItem) {
    setRemovingMember({ id: member.id, name: formatNameWithPrefix(member) })
    setRemoveOpen(true)
  }

  function openFamilyFromList(familyId: number) {
    setFamilyDetailsId(familyId)
    setFamilyOpen(true)
  }

  // 2026-07-24 (PR-11): a családi kartonról tag-kattintás — a személyi karton
  // a BAL oszlopban nyílik meg, a családi karton NYITVA marad (kettős nézet).
  // Review-javítások: token-őr (gyors dupla-kattintás sorrendje + zárás utáni
  // „szellem-újranyílás" ellen), betöltés-visszajelzés és hangos hiba.
  const personLoadTokenRef = useRef(0)
  async function openPersonFromFamily(memberId: number) {
    const targetFamilyId = familyDetailsId
    if (targetFamilyId == null) return
    const token = ++personLoadTokenRef.current
    const loadingToastId = toast.loading('Személyi karton betöltése…')
    try {
      const enriched = await getEnrichedMemberById(memberId, targetFamilyId)
      if (token !== personLoadTokenRef.current) return
      if (!enriched) {
        toast.error('A személyi karton nem tölthető be. Próbáld újra.')
        return
      }
      setDetailsMember(enriched as MemberListItem)
      setDetailsOpen(true)
    } catch {
      if (token === personLoadTokenRef.current) {
        toast.error('A személyi karton nem tölthető be. Próbáld újra.')
      }
    } finally {
      toast.dismiss(loadingToastId)
    }
  }

  async function handleFormClose(open: boolean) {
    setFormOpen(open)
    if (open) return
    setEditingMember(null)
    await Promise.all([
      fetchFirstPage({ preserveMembers: true }),
      ...(isDefaultRegistryScope ? [] : [refreshRegistrySnapshot()]),
    ])
  }

  async function handleRemoveClose(open: boolean) {
    setRemoveOpen(open)
    if (open) return
    setRemovingMember(null)
    await Promise.all([
      fetchFirstPage({ preserveMembers: true }),
      ...(isDefaultRegistryScope ? [] : [refreshRegistrySnapshot()]),
    ])
  }

  async function handleExport() {
    setIsExporting(true)
    try {
      const xlsxPromise = import('xlsx')
      const exportMembers: MemberListItem[] = []
      const seenCursors = new Set<string>()
      let cursor: string | null = null

      do {
        const page = await getMembersPage({ ...serverQuery, cursor })
        exportMembers.push(...page.members)
        cursor = page.nextCursor
        if (cursor) {
          if (seenCursors.has(cursor)) throw new Error('Az export kurzora ismétlődött.')
          seenCursors.add(cursor)
        }
      } while (cursor)

      const XLSX = await xlsxPromise
      const rows = exportMembers.map((member) => ({
        Családnév: member.csaladnev || '',
        Keresztnév: member.k_nev || '',
        Nem: member.ferfi === null ? '' : member.ferfi ? 'Férfi' : 'Nő',
        Született: member.sz_datum || '',
        Életkor: ageFromDate(member.sz_datum) ?? '',
        Település: member.adrlocality?.name || '',
        Utca: member.adrstreet?.name || '',
        Házszám: member.c_szam || '',
        Telefon: member.telefon || '',
        'E-mail': member.email || '',
        Vallás: member.vallas || '',
        Státusz: member.member_status || (member.meghalt ? 'elhunyt' : 'aktív'),
        Foglalkozás: member.foglalkozas || '',
      }))
      const worksheet = XLSX.utils.json_to_sheet(rows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Tagok')
      XLSX.writeFile(workbook, `tagnyilvantartas-${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success(`${exportMembers.length} személy exportálva.`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <PopoverPrimitive.Root open={filterOpen} onOpenChange={handleFilterOpenChange} modal="trap-focus">
      <div className="space-y-4 sm:space-y-5">
      <section aria-label="Tagnyilvántartási összesítő" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
        <RegistryStatCard icon={<Users className="size-5" />} label="Összes személy" value={stats.total} tone="teal" />
        <RegistryStatCard
          icon={<CheckCircle2 className="size-5" />}
          label="Aktív tag"
          value={stats.active}
          hint={stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}%` : undefined}
          tone="emerald"
        />
        <RegistryStatCard icon={<Cake className="size-5" />} label="Születésnapos" value={stats.birthdays} tone="amber" />
        <RegistryStatCard icon={<Unlink className="size-5" />} label="Család nélkül" value={stats.floating} tone="rose" />
      </section>

      <Card className="gap-0 overflow-hidden border-primary/10 bg-gradient-to-br from-card via-card to-primary/[0.035] py-0 shadow-[0_18px_55px_-46px_rgba(6,78,71,0.52)]">
        <CardContent className="space-y-3 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1 xl:max-w-2xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Név, cím, telefon, e-mail, foglalkozás vagy személyi szám…"
                  aria-label="Keresés a személyek között"
                  className="h-12 rounded-2xl border-border/70 bg-background/85 pl-11 pr-10 text-sm shadow-sm focus-visible:ring-primary/25"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label="Keresés törlése"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <PopoverPrimitive.Trigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 justify-center gap-2 rounded-2xl border-primary/20 bg-background/80 px-4 text-foreground shadow-sm hover:bg-primary/5"
                  />
                }
              >
                <SlidersHorizontal className="size-4 text-primary" />
                Részletes szűrés
                {activeFilterChips.length > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    {activeFilterChips.length}
                  </span>
                )}
              </PopoverPrimitive.Trigger>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">
              <p className="mr-auto text-sm text-muted-foreground xl:mr-1" aria-live="polite">
                <span className="font-semibold tabular-nums text-foreground">{pageState.filteredCount}</span> találat
                <span className="hidden sm:inline"> · {pageState.totalCount} személyből</span>
                {isSearchPending && <span className="ml-2 text-primary">Keresés…</span>}
              </p>
              <Button
                variant="outline"
                className="h-11 gap-2 rounded-xl bg-background/70"
                onClick={handleExport}
                disabled={pageState.filteredCount === 0 || isExporting}
                title="A szűrt lista exportálása Excelbe"
              >
                <Download className="size-4" />
                <span className="hidden sm:inline">{isExporting ? 'Exportálás…' : 'Export'}</span>
              </Button>
              <Button className="h-11 flex-1 gap-2 rounded-xl px-4 shadow-sm sm:flex-none" onClick={() => openEdit(null)}>
                <UserPlus className="size-4" /> Új személy
              </Button>
            </div>
          </div>

          {activeFilterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
              <span className="text-xs font-medium text-muted-foreground">Aktív szűrők:</span>
              {activeFilterChips.map((chip) => (
                <FilterChip key={chip.key} label={chip.label} onRemove={() => clearFilterChip(chip.key)} />
              ))}
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex min-h-11 items-center gap-1 px-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
              >
                <FilterX className="size-3.5" /> Mind törlése
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {listError && (
        <Card className="flex-row items-center justify-between gap-4 border-destructive/20 bg-destructive/[0.035] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">A személylista frissítése nem sikerült</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{listError}</p>
          </div>
          <Button variant="outline" className="min-h-11 shrink-0 rounded-xl bg-background" onClick={() => void fetchFirstPage({ preserveMembers: members.length > 0 })}>
            Újrapróbálom
          </Button>
        </Card>
      )}

      {isLoading ? (
        <PersonListSkeleton />
      ) : listError && members.length === 0 ? null : members.length === 0 ? (
        pageState.totalCount === 0 ? (
          <EmptyFirstRecord
            accent="emerald"
            icon={UserPlus}
            title="Még nincs egyetlen gyülekezeti tag sem"
            description="Kezdd el a nyilvántartást az első személy alapadatainak rögzítésével. A családok, presbiterek és körzetek innen épülnek fel."
            ctaLabel="Az első személy rögzítése"
            onCta={() => openEdit(null)}
          />
        ) : (
          <Card className="items-center gap-2 px-6 py-14 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/8 text-primary">
              <Search className="size-6" />
            </span>
            <h3 className="mt-2 font-heading text-lg font-semibold text-foreground">Nincs megfelelő találat</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Módosítsd a keresőkifejezést, vagy törölj néhány aktív szűrőt.
            </p>
            <Button variant="outline" className="mt-3 min-h-11 rounded-xl" onClick={clearAllFilters}>
              <FilterX className="mr-2 size-4" /> Szűrők törlése
            </Button>
          </Card>
        )
      ) : (
        <Card className="gap-0 overflow-hidden border-primary/10 py-0 shadow-[0_22px_65px_-52px_rgba(6,78,71,0.5)]">
          <div className="space-y-2 bg-muted/20 p-2 md:hidden">
            {visibleMembers.map((member) => (
              <MobilePersonCard
                key={member.id}
                member={member}
                registryMonth={registryMonth}
                active={isActiveMember(member, everPaidSet, everPaidSet)}
                crossMatched={crossMatchedIds.has(member.id)}
                onOpen={() => openDetails(member)}
                onRemove={() => openRemove(member)}
                onOpenFamily={openFamilyFromList}
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[660px] text-sm">
              <thead className="border-b border-border/60 bg-muted/45">
                <tr>
                  <SortableHeader column="name" label="Személy" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="min-w-[260px]" />
                  <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:table-cell">Tagság</th>
                  <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:table-cell">Család</th>
                  <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:table-cell">Pénzügy</th>
                  <SortableHeader column="address" label="Lakcím" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="hidden min-w-[190px] xl:table-cell" />
                  <SortableHeader column="age" label="Kor" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="hidden 2xl:table-cell" />
                  <SortableHeader column="job" label="Foglalkozás" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="hidden 2xl:table-cell" />
                  <th className="w-14 px-3 py-3"><span className="sr-only">Műveletek</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/45">
                {visibleMembers.map((member) => {
                  const age = ageFromDate(member.sz_datum)
                  const name = formatNameWithPrefix(member)
                  const address = formatAddress(member)
                  const active = isActiveMember(member, everPaidSet, everPaidSet)
                  const birthday = isBirthdayInMonth(member, registryMonth)
                  const familyId = member.familyId

                  return (
                    <tr
                      key={member.id}
                      className={cn(
                        'group animate-in fade-in bg-card/45 transition-colors duration-200 hover:bg-primary/[0.045] motion-reduce:animate-none motion-reduce:transition-none',
                        detailsOpen && detailsMember?.id === member.id && 'bg-primary/[0.07]',
                      )}
                    >
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => openDetails(member)}
                          className="flex w-full items-center gap-3 rounded-xl text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2"
                          aria-label={`${name} személyi kartonjának megnyitása`}
                        >
                          <MemberAvatar name={name} kepUrl={member.kep ?? member.photo_url} meghalt={member.meghalt} size={44} className="motion-reduce:hover:scale-100" />
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
                              <span className="truncate">{name}</span>
                              {birthday && (
                                <Cake className="size-3.5 shrink-0 text-amber-500" aria-label="Születésnapos ebben a hónapban" />
                              )}
                              {crossMatchedIds.has(member.id) && (
                                <Link2 className="size-3.5 shrink-0 text-amber-600" aria-label="Más gyülekezetben is szerepel" />
                              )}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                              {age !== null && <span>{age} éves</span>}
                              {member.telefon && <span className="truncate">{member.telefon}</span>}
                              {address && <span className="truncate lg:hidden">{address}</span>}
                            </span>
                            <span className="mt-2 flex flex-wrap gap-1.5 md:hidden">
                              <MembershipBadge member={member} active={active} />
                              <FinancialBadge status={member.paymentStatus} />
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="hidden px-4 py-3.5 md:table-cell">
                        <MembershipBadge member={member} active={active} />
                      </td>
                      <td className="hidden px-4 py-3.5 md:table-cell">
                        {familyId !== null && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-11 whitespace-nowrap rounded-full bg-background px-3 text-xs text-primary"
                            onClick={() => openFamilyFromList(familyId)}
                            aria-label={`${name} családi kartonjának megnyitása, ${familyId}. család`}
                          >
                            <Users className="mr-1.5 size-3.5" />
                            <span className="lg:hidden">Család · #{familyId}</span>
                            <span className="hidden lg:inline">Családi karton · #{familyId}</span>
                          </Button>
                        )}
                      </td>
                      <td className="hidden px-4 py-3.5 md:table-cell">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <FinancialBadge status={member.paymentStatus} />
                          {member.pendingTransfer && (
                            <Badge
                              variant="outline"
                              className="rounded-full border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                              title={`Átjelentkezés folyamatban: ${member.pendingTransfer.target_congregation_name}`}
                            >
                              Átjelentkezik
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="hidden max-w-[260px] px-4 py-3.5 text-xs text-muted-foreground xl:table-cell">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3.5 shrink-0 text-primary/65" />
                          <span className="truncate">{address || 'Nincs rögzítve'}</span>
                        </span>
                      </td>
                      <td className="hidden px-4 py-3.5 text-sm tabular-nums text-muted-foreground 2xl:table-cell">
                        {age !== null ? `${age} év` : '—'}
                      </td>
                      <td className="hidden max-w-[220px] px-4 py-3.5 text-xs text-muted-foreground 2xl:table-cell">
                        <span className="flex items-center gap-1.5">
                          <BriefcaseBusiness className="size-3.5 shrink-0 text-primary/65" />
                          <span className="truncate">{member.foglalkozas || 'Nincs rögzítve'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-11 rounded-xl p-0 text-muted-foreground opacity-100 transition hover:bg-destructive/8 hover:text-destructive lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 motion-reduce:transition-none"
                          title="Személy kivezetése"
                          aria-label={`${name} kivezetése`}
                          onClick={() => openRemove(member)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <ListProgress
            ref={loadMoreRef}
            shown={visibleMembers.length}
            total={pageState.filteredCount}
            hasMore={hasMore}
            onLoadMore={loadMore}
            loading={isLoadingMore}
          />
        </Card>
      )}

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          align="end"
          sideOffset={10}
          collisionPadding={8}
          positionMethod="fixed"
          className="z-[70]"
        >
          <PopoverPrimitive.Popup
            id="persons-detailed-filter"
            className="flex max-h-[min(42rem,var(--available-height))] w-[min(35rem,calc(100vw-1rem))] origin-[var(--transform-origin)] flex-col overflow-hidden rounded-2xl border border-primary/15 bg-popover text-popover-foreground shadow-[0_28px_80px_-32px_rgba(4,74,68,0.52)] outline-none transition-[opacity,transform] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                applyFilters()
              }}
            >
              <div className="relative shrink-0 border-b border-primary/10 bg-gradient-to-br from-primary/[0.08] via-popover to-accent/[0.07] px-4 py-4 pr-16 sm:px-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <SlidersHorizontal className="size-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <PopoverPrimitive.Title className="font-heading text-lg font-semibold text-foreground">
                        Részletes szűrés
                      </PopoverPrimitive.Title>
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-primary" aria-live="polite">
                        {draftFilterCount}
                      </span>
                    </div>
                    <PopoverPrimitive.Description className="mt-1 text-xs leading-5 text-muted-foreground">
                      Tagsági, családi, demográfiai és elérhetőségi feltételek.
                    </PopoverPrimitive.Description>
                  </div>
                </div>
                <PopoverPrimitive.Close
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2.5 top-2.5 size-11 rounded-xl text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    />
                  }
                >
                  <X className="size-4.5" />
                  <span className="sr-only">Szűrőablak bezárása</span>
                </PopoverPrimitive.Close>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
                <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2">
                  <FilterField id="filter-status" label="Tagsági állapot">
                    <select
                      id="filter-status"
                      value={draftFilters.status}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value as MemberStatusFilter }))}
                      className={filterControlClassName}
                    >
                      {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </FilterField>

                  <FilterField id="filter-payment" label="Pénzügyi állapot">
                    <select
                      id="filter-payment"
                      value={draftFilters.payment}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, payment: event.target.value as PaymentFilter }))}
                      className={filterControlClassName}
                    >
                      <option value="all">Minden állapot</option>
                      {paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </FilterField>

                  <FilterField id="filter-birthday" label="Születésnap">
                    <select
                      id="filter-birthday"
                      value={draftFilters.birthday}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, birthday: event.target.value as BirthdayFilter }))}
                      className={filterControlClassName}
                    >
                      <option value="all">Minden személy</option>
                      <option value="this-month">Ebben a hónapban</option>
                    </select>
                  </FilterField>

                  <FilterField id="filter-family" label="Családi kapcsolat">
                    <select
                      id="filter-family"
                      value={draftFilters.family}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, family: event.target.value as MemberFamilyFilter }))}
                      className={filterControlClassName}
                    >
                      {familyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </FilterField>

                  <FilterField id="filter-age-min" label="Életkor ettől">
                    <Input
                      id="filter-age-min"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={120}
                      step={1}
                      value={draftFilters.ageMin}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, ageMin: event.target.value }))}
                      placeholder="pl. 18"
                      aria-invalid={Boolean(draftAgeError)}
                      aria-describedby={draftAgeError ? 'filter-age-error' : undefined}
                      className="h-11 rounded-xl bg-background/90"
                    />
                  </FilterField>

                  <FilterField id="filter-age-max" label="Életkor eddig">
                    <Input
                      id="filter-age-max"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={120}
                      step={1}
                      value={draftFilters.ageMax}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, ageMax: event.target.value }))}
                      placeholder="pl. 65"
                      aria-invalid={Boolean(draftAgeError)}
                      aria-describedby={draftAgeError ? 'filter-age-error' : undefined}
                      className="h-11 rounded-xl bg-background/90"
                    />
                  </FilterField>

                  <FilterField id="filter-gender" label="Nem">
                    <select
                      id="filter-gender"
                      value={draftFilters.gender}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, gender: event.target.value as MemberGenderFilter }))}
                      className={filterControlClassName}
                    >
                      {genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </FilterField>

                  <FilterField id="filter-religion" label="Vallás">
                    <select
                      id="filter-religion"
                      value={draftFilters.religion}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, religion: event.target.value }))}
                      className={filterControlClassName}
                    >
                      <option value="">Minden vallás</option>
                      {religionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}{option.count === undefined ? '' : ` (${option.count})`}
                        </option>
                      ))}
                    </select>
                  </FilterField>

                  <FilterField id="filter-locality" label="Település">
                    <select
                      id="filter-locality"
                      value={draftFilters.locality}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, locality: event.target.value }))}
                      className={filterControlClassName}
                    >
                      <option value="">Minden település</option>
                      {localityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}{option.count === undefined ? '' : ` (${option.count})`}
                        </option>
                      ))}
                    </select>
                  </FilterField>

                  <FilterField id="filter-contact" label="Elérhetőség">
                    <select
                      id="filter-contact"
                      value={draftFilters.contact}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, contact: event.target.value as MemberContactFilter }))}
                      className={filterControlClassName}
                    >
                      {contactOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </FilterField>
                </div>

                {draftAgeError && (
                  <p id="filter-age-error" className="mt-3 text-xs font-medium text-destructive" role="alert">
                    {draftAgeError}
                  </p>
                )}
              </div>

              <div className="grid shrink-0 grid-cols-1 gap-2 border-t border-primary/10 bg-popover/95 p-3 min-[420px]:grid-cols-2 sm:px-5">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-xl bg-background/80 px-4"
                  onClick={() => setDraftFilters(DEFAULT_FILTERS)}
                  title="Visszaállítás az alapértelmezett aktívtag-szűrésre"
                >
                  Alaphelyzet
                </Button>
                <Button type="submit" className="min-h-11 rounded-xl px-4 shadow-sm" disabled={Boolean(draftAgeError)}>
                  Szűrés alkalmazása
                </Button>
              </div>
            </form>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>

      {/* 2026-07-24 (PR-11, 7. észrevétel): a személyi ÉS a családi karton egyetlen
          jobbról beúszó Sheet-ben — átkattintásnál egymás MELLETT (személy balra,
          család jobbra), a korábbi bezár-újranyit „pattogás" helyett. */}
      <RegistryCardsHost
        personOpen={detailsOpen}
        member={detailsMember}
        personFamilyId={detailsMember?.familyId ?? null}
        familyOpen={familyOpen}
        familyId={familyDetailsId}
        personName={detailsMember ? formatNameWithPrefix(detailsMember) : null}
        onClosePerson={() => {
          if (treeOpen) return
          personLoadTokenRef.current++
          setDetailsOpen(false)
        }}
        onCloseFamily={() => {
          personLoadTokenRef.current++
          setFamilyOpen(false)
          setFamilyDetailsId(null)
        }}
        onCloseAll={() => {
          if (treeOpen) return
          personLoadTokenRef.current++
          setDetailsOpen(false)
          setFamilyOpen(false)
          setFamilyDetailsId(null)
        }}
        onOpenFamily={(id) => {
          setFamilyDetailsId(id)
          setFamilyOpen(true)
        }}
        onOpenMember={(id) => void openPersonFromFamily(id)}
        // 2026-07-24 (PR-4 F5.8): a kartonon mentett megjegyzés/hozzájárulás után a
        // lista frissül — eddig újranyitáskor a mentés ELŐTTI adat látszott.
        onDataChanged={() => void fetchFirstPage({ preserveMembers: true })}
        onEditMember={() => detailsMember && openEdit(detailsMember)}
        onShowFamilyTree={(id) => {
          setTreeMemberId(id)
          setTreeOpen(true)
        }}
      />
      <MemberFormDialog open={formOpen} onOpenChange={handleFormClose} editMember={editingMember} />
      <MemberRemoveDialog open={removeOpen} onOpenChange={handleRemoveClose} member={removingMember} />
      <FamilyTreeDialog
        open={treeOpen}
        onOpenChange={(open) => {
          setTreeOpen(open)
          if (!open) setTreeMemberId(null)
        }}
        memberId={treeMemberId}
      />
      </div>
    </PopoverPrimitive.Root>
  )
}

const filterControlClassName =
  'h-11 w-full rounded-xl border border-input bg-background/90 px-3 text-sm text-foreground shadow-xs outline-none transition focus:border-ring focus:ring-[3px] focus:ring-ring/20 motion-reduce:transition-none'

function RegistryStatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode
  label: string
  value: number
  hint?: string
  tone: 'teal' | 'emerald' | 'amber' | 'rose'
}) {
  const tones = {
    teal: 'bg-primary/10 text-primary ring-primary/10',
    emerald: 'bg-emerald-100 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/35 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 ring-amber-200/60 dark:bg-amber-950/35 dark:text-amber-300',
    rose: 'bg-rose-100 text-rose-700 ring-rose-200/60 dark:bg-rose-950/35 dark:text-rose-300',
  } as const

  return (
    <Card className="gap-0 overflow-hidden border-primary/8 bg-gradient-to-br from-card via-card to-primary/[0.025] py-0 transition duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
      <CardContent className="flex items-center gap-3 px-3.5 py-3.5 sm:px-5 sm:py-5">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl ring-1 sm:size-11', tones[tone])}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-[11px]">{label}</p>
          <p className="mt-0.5 font-heading text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
            {value}
            {hint && <span className="ml-1.5 text-xs font-medium text-muted-foreground sm:text-sm">{hint}</span>}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-11 max-w-full min-w-0 items-center gap-1 rounded-full border border-primary/15 bg-primary/[0.07] pl-3 pr-1 text-xs font-medium text-primary">
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex size-11 items-center justify-center rounded-full transition hover:bg-primary/10"
        aria-label={`${label} szűrő törlése`}
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

function MobilePersonCard({
  member,
  registryMonth,
  active,
  crossMatched,
  onOpen,
  onRemove,
  onOpenFamily,
}: {
  member: MemberListItem
  registryMonth: number
  active: boolean
  crossMatched: boolean
  onOpen: () => void
  onRemove: () => void
  onOpenFamily: (familyId: number) => void
}) {
  const name = formatNameWithPrefix(member)
  const age = ageFromDate(member.sz_datum)
  const address = formatAddress(member)
  const familyId = member.familyId

  return (
    <article className="relative animate-in fade-in slide-in-from-bottom-1 rounded-2xl border border-border/60 bg-card px-3 py-3 shadow-sm duration-200 motion-reduce:animate-none">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-11 w-[calc(100%-3rem)] items-start gap-3 rounded-xl text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2"
        aria-label={`${name} személyi kartonjának megnyitása`}
      >
        <MemberAvatar name={name} kepUrl={member.kep ?? member.photo_url} meghalt={member.meghalt} size={48} className="motion-reduce:hover:scale-100" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-heading text-base font-semibold text-foreground">
            <span className="truncate">{name}</span>
            {isBirthdayInMonth(member, registryMonth) && <Cake className="size-3.5 shrink-0 text-amber-500" aria-label="Születésnapos ebben a hónapban" />}
            {crossMatched && <Link2 className="size-3.5 shrink-0 text-amber-600" aria-label="Más gyülekezetben is szerepel" />}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {age !== null && <span>{age} éves</span>}
            {address && <span className="truncate">{address}</span>}
          </span>
          {(member.telefon || member.email) && (
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {[member.telefon, member.email].filter(Boolean).join(' · ')}
            </span>
          )}
          <span className="mt-2.5 flex flex-wrap gap-1.5">
            <MembershipBadge member={member} active={active} />
            <FinancialBadge status={member.paymentStatus} />
            {member.pendingTransfer && (
              <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                Átjelentkezik
              </Badge>
            )}
          </span>
        </span>
      </button>
      {familyId !== null && (
        <div className="mt-2 min-w-0 pl-[3.75rem]">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 w-full justify-start rounded-xl bg-background px-3 text-xs text-primary"
            onClick={() => onOpenFamily(familyId)}
            aria-label={`${name} családi kartonjának megnyitása, ${familyId}. család`}
          >
            <Users className="mr-1.5 size-3.5" />
            <span className="min-w-0 truncate">Családi karton · #{familyId}</span>
          </Button>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="absolute right-2 top-2 size-11 rounded-xl p-0 text-muted-foreground hover:bg-destructive/8 hover:text-destructive"
        onClick={onRemove}
        aria-label={`${name} kivezetése`}
        title="Személy kivezetése"
      >
        <Trash2 className="size-4" />
      </Button>
    </article>
  )
}

function MembershipBadge({ member, active }: { member: MemberListItem; active: boolean }) {
  const status = normalizeText(member.member_status)
  const religion = normalizeText(member.vallas)

  if (member.meghalt) return <Badge className="rounded-full border-0 bg-slate-100 text-slate-600">Elhunyt</Badge>
  if (member.elkoltozott || status === 'elkoltozott') return <Badge className="rounded-full border-0 bg-slate-100 text-slate-600">Elköltözött</Badge>
  if (status === 'kitert') return <Badge className="rounded-full border-0 bg-amber-100 text-amber-700">Kitért</Badge>
  if (active) return <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-700">Aktív</Badge>
  if (religion && religion !== 'reformatus') return <Badge className="rounded-full border-0 bg-violet-100 text-violet-700">Más vallású</Badge>
  return <Badge variant="outline" className="rounded-full border-border bg-muted/40 text-muted-foreground">Nem aktív</Badge>
}

function FinancialBadge({ status }: { status: PaymentStatus }) {
  if (status === 'elhunyt' || status === 'elkoltozott' || status === 'kitert') {
    return (
      <Badge variant="outline" className="rounded-full border-border bg-muted/35 text-muted-foreground" title={`Pénzügyi állapot: ${PAYMENT_STATUS_CONFIG[status].label}`}>
        Nem releváns
      </Badge>
    )
  }
  return <MemberStatusBadge status={status} />
}

function SortableHeader({
  column,
  label,
  sortCol,
  sortDir,
  onSort,
  className,
}: {
  column: MemberSort
  label: string
  sortCol: MemberSort
  sortDir: SortDirection
  onSort: (column: MemberSort) => void
  className?: string
}) {
  const active = sortCol === column
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <th className={cn('px-4 py-3 text-left', className)} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex min-h-11 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition hover:text-foreground"
      >
        {label}
        <Icon className={cn('size-3.5', active && 'text-primary')} />
      </button>
    </th>
  )
}

const ListProgress = function ListProgress({
  ref,
  shown,
  total,
  hasMore,
  onLoadMore,
  loading,
}: {
  ref: React.Ref<HTMLDivElement>
  shown: number
  total: number
  hasMore: boolean
  onLoadMore: () => void | Promise<void>
  loading: boolean
}) {
  const percent = total > 0 ? Math.round((shown / total) * 100) : 100
  return (
    <div ref={ref} className="border-t border-border/55 bg-muted/25 px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[180px] flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span><strong className="font-semibold text-foreground">{shown}</strong> / {total} személy látható</span>
            <span>{percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-primary/10">
            <div className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
          </div>
        </div>
        {hasMore ? (
          <Button variant="outline" size="sm" className="min-h-11 rounded-xl bg-background" onClick={onLoadMore} disabled={loading}>
            {loading ? 'Betöltés…' : `Következő ${Math.min(PAGE_SIZE, total - shown)} megjelenítése`}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
            <CheckCircle2 className="size-3.5" /> Minden találat betöltve
          </span>
        )}
      </div>
    </div>
  )
}

function PersonListSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0" role="status" aria-live="polite" aria-busy="true" aria-label="Személyek betöltése">
      <div className="space-y-2 p-3 md:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted/70 motion-reduce:animate-none" />
        ))}
      </div>
      <div className="hidden divide-y divide-border/45 md:block">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="h-[4.5rem] animate-pulse bg-muted/45 motion-reduce:animate-none" />
        ))}
      </div>
    </Card>
  )
}

function FilterField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  )
}
