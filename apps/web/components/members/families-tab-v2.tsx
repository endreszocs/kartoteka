'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Baby,
  ChevronsUpDown,
  Download,
  Edit2,
  Grid3x3,
  Home,
  List,
  MapPin,
  Printer,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  Users2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  deleteFamily,
  type FamilyRow,
} from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { getFamiliesPage } from '@/app/(dashboard)/tagnyilvantartas/registry-list-actions'
import {
  getDistricts,
  type DistrictRow,
} from '@/app/(dashboard)/tagnyilvantartas/presbyter-actions'
import { FamilyCardPrintDialog } from '@/components/members/family-card-print-dialog'
import { FamilyDetailsDialogRefined } from '@/components/modals/family-details-dialog-refined'
import { FamilyFormDialog } from '@/components/modals/family-form-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ageFromDate } from '@/lib/utils/date'
import type {
  FamilyListItem,
  FamilyListKpiSummary,
  FamilyListQuery,
} from '@/lib/members/registry-list-types'
import { FAMILY_GRAPH_COUNT_EVENT } from '@/lib/members/family-graph-types'
import { formatNameWithPrefix } from '@/lib/utils/member-helpers'
import { FamilyCardModern, type FamilyCardModernData } from '@kartoteka/ui-app'
import { useDebouncedValue } from './use-debounced-value'

const PAGE_SIZE = 50

type SortKey = 'head' | 'spouse' | 'address' | 'district' | 'status'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'active' | 'deceased' | 'inactive'
type DistrictFilter = number | 'all' | 'none'
type HouseholdFilter = 'all' | 'couple' | 'single'
type ChildrenFilter = 'all' | 'with' | 'without'

interface FamilyFilters {
  status: StatusFilter
  district: DistrictFilter
  household: HouseholdFilter
  children: ChildrenFilter
  missingAddress: boolean
  missingDistrict: boolean
}

const EMPTY_FILTERS: FamilyFilters = {
  status: 'all',
  district: 'all',
  household: 'all',
  children: 'all',
  missingAddress: false,
  missingDistrict: false,
}

const INITIAL_FILTERS: FamilyFilters = {
  ...EMPTY_FILTERS,
  status: 'active',
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string; hint: string }> = [
  { value: 'all', label: 'Minden család', hint: 'Állapottól függetlenül' },
  { value: 'active', label: 'Élő családok', hint: 'Legalább egy felnőtt tag él' },
  { value: 'deceased', label: 'Elhunyt családok', hint: 'Minden rögzített felnőtt elhunyt' },
  { value: 'inactive', label: 'Lezárt háztartások', hint: 'Kézzel inaktívra állítva' },
]

const HOUSEHOLD_OPTIONS: Array<{ value: HouseholdFilter; label: string; hint: string }> = [
  { value: 'all', label: 'Bármilyen', hint: 'Minden háztartástípus' },
  { value: 'couple', label: 'Házaspár', hint: 'Két felnőtt taggal' },
  { value: 'single', label: 'Egy felnőtt', hint: 'Özvegy vagy egyszemélyes karton' },
]

const CHILDREN_OPTIONS: Array<{ value: ChildrenFilter; label: string; hint: string }> = [
  { value: 'all', label: 'Mindegy', hint: 'Gyermekszámtól függetlenül' },
  { value: 'with', label: 'Gyermekes', hint: 'Legalább egy gyermekkel' },
  { value: 'without', label: 'Gyermektelen', hint: 'Nincs gyermek rögzítve' },
]

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'Minden állapot',
  active: 'Élő családok',
  deceased: 'Elhunyt családok',
  inactive: 'Lezárt háztartások',
}

const HOUSEHOLD_LABELS: Record<HouseholdFilter, string> = {
  all: 'Minden háztartás',
  couple: 'Házaspárok',
  single: 'Egy felnőttes háztartások',
}

const CHILDREN_LABELS: Record<ChildrenFilter, string> = {
  all: 'Gyermekszámtól független',
  with: 'Gyermekes családok',
  without: 'Gyermektelen családok',
}

type FamilyAdult = NonNullable<FamilyRow['ferfi']>

function familyAdults(family: FamilyRow): FamilyAdult[] {
  return [family.ferfi, family.no].filter((adult): adult is FamilyAdult => adult !== null)
}

function isDeceasedFamily(family: FamilyRow) {
  const adults = familyAdults(family)
  return adults.length > 0 && adults.every((adult) => adult.meghalt)
}

function isAddressMissing(family: FamilyRow) {
  return !family.utca?.name || !family.c_szam
}

function countActiveFilters(filters: FamilyFilters) {
  return [
    filters.status !== 'all',
    filters.district !== 'all',
    filters.household !== 'all',
    filters.children !== 'all',
    filters.missingAddress,
    filters.missingDistrict,
  ].filter(Boolean).length
}

const EMPTY_SUMMARY: FamilyListKpiSummary = {
  scope: 'filtered',
  families: 0,
  active: 0,
  deceased: 0,
  inactive: 0,
  people: 0,
  children: 0,
  withoutHead: 0,
  withoutAddress: 0,
  withoutDistrict: 0,
}

function familyListItemToRow(item: FamilyListItem): FamilyRow {
  const adult = (person: FamilyListItem['ferfi']): FamilyRow['ferfi'] => person
    ? {
        ...person,
        csaladnev: person.csaladnev ?? '',
        k_nev: person.k_nev ?? '',
      }
    : null

  return {
    id: item.id,
    c_utcaid: item.c_utcaid,
    c_szam: item.c_szam,
    isaktiv: item.isaktiv,
    id_csoport: item.id_csoport,
    ferfi: adult(item.ferfi),
    no: adult(item.no),
    utca: item.utca,
    gyerekek: item.gyerekek,
  }
}

function familyRowToModernCard(
  row: FamilyRow,
  districtMap: Map<number, string>,
): FamilyCardModernData {
  const members: FamilyCardModernData['members'] = []

  if (row.ferfi) {
    members.push({
      id: row.ferfi.id,
      name: `${row.ferfi.csaladnev} ${row.ferfi.k_nev}`.trim(),
      role: 'csaladfo',
      age: ageFromDate(row.ferfi.sz_datum),
      meghalt: row.ferfi.meghalt,
      kepUrl: row.ferfi.kep ?? null,
    })
  }

  if (row.no) {
    members.push({
      id: row.no.id,
      name: `${row.no.csaladnev} ${row.no.k_nev}`.trim(),
      role: 'hazastars',
      age: ageFromDate(row.no.sz_datum),
      meghalt: row.no.meghalt,
      kepUrl: row.no.kep ?? null,
    })
  }

  for (const child of row.gyerekek ?? []) {
    members.push({
      id: child.id,
      name: `${child.csaladnev ?? ''} ${child.k_nev ?? ''}`.trim() || 'Gyermek',
      role: 'gyerek',
      age: ageFromDate(child.sz_datum),
      meghalt: !!child.meghalt,
      kepUrl: child.kep ?? null,
    })
  }

  return {
    familyId: row.id,
    familyName: row.ferfi?.csaladnev || row.no?.csaladnev || null,
    members,
    street: row.utca?.name ?? null,
    houseNumber: row.c_szam,
    districtName: row.id_csoport != null ? districtMap.get(row.id_csoport) ?? null : null,
    isActive: row.isaktiv,
    paymentStatus: 'unknown',
  }
}

export function FamiliesTab() {
  const [families, setFamilies] = useState<FamilyRow[]>([])
  const [districts, setDistricts] = useState<DistrictRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDebouncedValue(searchQuery.trim(), 280)

  const [filters, setFilters] = useState<FamilyFilters>({ ...INITIAL_FILTERS })
  const [draftFilters, setDraftFilters] = useState<FamilyFilters>({ ...INITIAL_FILTERS })
  const [filterOpen, setFilterOpen] = useState(false)

  const [sortKey, setSortKey] = useState<SortKey>('head')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)
  const loadMoreInFlightRef = useRef(false)
  const lastReportedFamilyCountRef = useRef<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [filteredCount, setFilteredCount] = useState(0)
  const [summary, setSummary] = useState<FamilyListKpiSummary>(EMPTY_SUMMARY)

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsId, setDetailsId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editFamily, setEditFamily] = useState<FamilyRow | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [printFamilyId, setPrintFamilyId] = useState<number | null>(null)

  const [viewMode, setViewMode] = useState<'list' | 'cards'>(() => {
    if (typeof window === 'undefined') return 'cards'
    try {
      return localStorage.getItem('kartoteka.families.viewMode') === 'list' ? 'list' : 'cards'
    } catch {
      return 'cards'
    }
  })

  const serverQuery = useMemo<FamilyListQuery>(() => ({
    pageSize: PAGE_SIZE,
    query: deferredSearchQuery.trim(),
    status: filters.status,
    district: filters.district === 'all'
      ? 'all'
      : filters.district === 'none'
        ? 'none'
        : 'specific',
    districtIds: typeof filters.district === 'number' ? [filters.district] : [],
    household: filters.household,
    children: filters.children,
    missingAddress: filters.missingAddress,
    missingDistrict: filters.missingDistrict,
    memberCountMin: null,
    memberCountMax: null,
    sortKey,
    sortDir,
  }), [deferredSearchQuery, filters, sortDir, sortKey])

  const loadFirstPage = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    loadMoreInFlightRef.current = false
    setLoading(true)
    setFamilies([])
    setNextCursor(null)
    setHasMore(false)
    setTotalCount(0)
    setFilteredCount(0)
    setSummary(EMPTY_SUMMARY)

    try {
      const page = await getFamiliesPage({ ...serverQuery, cursor: null })
      if (requestId !== requestIdRef.current) return
      setFamilies(page.families.map(familyListItemToRow))
      setNextCursor(page.nextCursor)
      setHasMore(page.hasMore)
      setTotalCount(page.totalCount)
      setFilteredCount(page.filteredCount)
      setSummary(page.summary)
      if (lastReportedFamilyCountRef.current !== page.totalCount) {
        lastReportedFamilyCountRef.current = page.totalCount
        window.dispatchEvent(new CustomEvent(FAMILY_GRAPH_COUNT_EVENT, {
          detail: { familyCount: page.totalCount },
        }))
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      console.error('[FamiliesTab] A családok betöltése sikertelen:', error)
      toast.error('A családok betöltése nem sikerült.')
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [serverQuery])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  useEffect(() => {
    let cancelled = false
    void getDistricts().then((data) => {
      if (!cancelled) setDistricts(data)
    })
    return () => { cancelled = true }
  }, [])

  const districtNameById = useMemo(() => {
    return new Map(districts.map((district) => [district.id, district.nev]))
  }, [districts])

  const stats = {
    total: summary.families,
    living: summary.active,
    deceased: summary.deceased,
    addressMissing: summary.withoutAddress,
    districtMissing: summary.withoutDistrict,
  }

  const visibleFamilies = families

  const loadMore = useCallback(() => {
    if (!hasMore || !nextCursor || loadMoreInFlightRef.current) return
    loadMoreInFlightRef.current = true
    setLoadingMore(true)
    const requestId = requestIdRef.current

    void getFamiliesPage({ ...serverQuery, cursor: nextCursor })
      .then((page) => {
        if (requestId !== requestIdRef.current) return
        setFamilies((current) => {
          const seen = new Set(current.map((family) => family.id))
          const nextRows = page.families
            .filter((family) => !seen.has(family.id))
            .map(familyListItemToRow)
          return [...current, ...nextRows]
        })
        setNextCursor(page.nextCursor)
        setHasMore(page.hasMore)
        setFilteredCount(page.filteredCount)
        setTotalCount(page.totalCount)
        setSummary(page.summary)
      })
      .catch((error) => {
        if (requestId !== requestIdRef.current) return
        console.error('[FamiliesTab] A következő családoldal betöltése sikertelen:', error)
        toast.error('A további családok betöltése nem sikerült.')
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoadingMore(false)
        loadMoreInFlightRef.current = false
      })
  }, [hasMore, nextCursor, serverQuery])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasMore || loadingMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '480px 0px', threshold: 0.01 },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, loadMore, loadingMore])

  const activeFilterCount = countActiveFilters(filters)
  const isSearchPending = searchQuery.trim() !== deferredSearchQuery
  const hasAnyConstraint = activeFilterCount > 0 || searchQuery.trim().length > 0

  function changeViewMode(nextView: 'list' | 'cards') {
    setViewMode(nextView)
    try {
      localStorage.setItem('kartoteka.families.viewMode', nextView)
    } catch {
      // A nézetváltás localStorage nélkül is működik.
    }
  }

  function patchFilters(patch: Partial<FamilyFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  function clearAllFilters() {
    setSearchQuery('')
    setFilters({ ...EMPTY_FILTERS })
    setDraftFilters({ ...EMPTY_FILTERS })
  }

  function handleFilterOpenChange(open: boolean) {
    if (open) setDraftFilters({ ...filters })
    setFilterOpen(open)
  }

  function applyDraftFilters() {
    setFilters({ ...draftFilters })
    setFilterOpen(false)
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((direction) => (direction === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function handleSortSelect(value: string) {
    const [key, direction] = value.split(':') as [SortKey, SortDir]
    setSortKey(key)
    setSortDir(direction)
  }

  async function handleDelete(id: number) {
    if (!confirm('Biztosan törlöd vagy felbontod ezt a családot?')) return

    const result = await deleteFamily(id)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success('A családi kapcsolat törölve lett.')
    await loadFirstPage()
  }

  async function handleExport() {
    const toastId = toast.loading('A teljes szűrt családlista előkészítése…')
    try {
      const allFamilies: FamilyListItem[] = []
      const seenCursors = new Set<string>()
      let cursor: string | null = null

      do {
        const page = await getFamiliesPage({ ...serverQuery, cursor })
        allFamilies.push(...page.families)
        if (!page.hasMore || !page.nextCursor || seenCursors.has(page.nextCursor)) break
        seenCursors.add(page.nextCursor)
        cursor = page.nextCursor
      } while (cursor)

      const XLSX = await import('xlsx')
      const rows = allFamilies.map((family) => ({
        'Családfő': family.ferfi ? `${family.ferfi.csaladnev ?? ''} ${family.ferfi.k_nev ?? ''}`.trim() : '',
        'Házastárs': family.no ? `${family.no.csaladnev ?? ''} ${family.no.k_nev ?? ''}`.trim() : '',
        'Gyermekek száma': family.gyerekek.length,
        Utca: family.utca?.name || '',
        'Házszám': family.c_szam || '',
        'Körzet': family.district?.name || '',
        'Állapot': family.isaktiv ? 'Aktív' : 'Inaktív',
      }))
      const worksheet = XLSX.utils.json_to_sheet(rows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Családok')
      XLSX.writeFile(workbook, `csaladok-${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success(`${rows.length} család exportálva.`, { id: toastId })
    } catch (error) {
      console.error('[FamiliesTab] A családexport sikertelen:', error)
      toast.error('A családlista exportálása nem sikerült.', { id: toastId })
    }
  }

  function openDetails(id: number) {
    setDetailsId(id)
    setDetailsOpen(true)
  }

  function openEditor(family: FamilyRow | null) {
    setEditFamily(family)
    setFormOpen(true)
  }

  function handleFormOpenChange(open: boolean) {
    setFormOpen(open)
    if (!open) {
      setEditFamily(null)
      void loadFirstPage().finally(() => {
        window.dispatchEvent(new CustomEvent(FAMILY_GRAPH_COUNT_EVENT, {
          detail: { familyCount: lastReportedFamilyCountRef.current ?? 0 },
        }))
      })
    }
  }

  function openPrint(id: number) {
    setPrintFamilyId(id)
    setPrintOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <RegistryStatCard
          tone="primary"
          icon={<Home className="size-5" />}
          label="Szűrt családok"
          value={stats.total}
          hint={`${totalCount} család a teljes nyilvántartásban`}
        />
        <RegistryStatCard
          tone="emerald"
          icon={<Sparkles className="size-5" />}
          label="Élő családok"
          value={stats.living}
          hint="Legalább egy felnőtt tag él"
        />
        <RegistryStatCard
          tone="amber"
          icon={<MapPin className="size-5" />}
          label="Hiányos lakcím"
          value={stats.addressMissing}
          hint="Utca vagy házszám pótlandó"
        />
        <RegistryStatCard
          tone="rose"
          icon={<Users2 className="size-5" />}
          label="Körzet nélkül"
          value={stats.districtMissing}
          hint="Körzeti hozzárendelésre vár"
        />
      </div>

      <RegistryToolbar>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1 xl:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
              }}
              placeholder="Név, gyermek, cím vagy körzet keresése…"
              className="h-11 rounded-xl border-input bg-card pl-10 pr-12 shadow-sm"
              aria-label="Családok keresése"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                }}
                className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                aria-label="Keresés törlése"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={`${sortKey}:${sortDir}`}
              onChange={(event) => handleSortSelect(event.target.value)}
              className="h-11 rounded-xl border border-input bg-card px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              aria-label="Családok rendezése"
            >
              <option value="head:asc">Név: A–Z</option>
              <option value="head:desc">Név: Z–A</option>
              <option value="spouse:asc">Társ neve</option>
              <option value="address:asc">Lakcím</option>
              <option value="district:asc">Körzet</option>
              <option value="status:desc">Állapot</option>
            </select>

            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-xl border-input bg-card"
              onClick={() => handleFilterOpenChange(true)}
            >
              <SlidersHorizontal className="size-4" />
              Szűrők
              {activeFilterCount > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            <div className="inline-flex h-[52px] items-center rounded-xl border border-border bg-muted/50 p-1" aria-label="Nézetváltás">
              <button
                type="button"
                onClick={() => changeViewMode('cards')}
                aria-pressed={viewMode === 'cards'}
                className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all duration-200 ${
                  viewMode === 'cards'
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Grid3x3 className="size-3.5" />
                <span className="hidden sm:inline">Kártyák</span>
              </button>
              <button
                type="button"
                onClick={() => changeViewMode('list')}
                aria-pressed={viewMode === 'list'}
                className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all duration-200 ${
                  viewMode === 'list'
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="size-3.5" />
                <span className="hidden sm:inline">Lista</span>
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-xl border-input bg-card"
              onClick={handleExport}
              disabled={filteredCount === 0}
              title="A szűrt családlista exportálása"
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>

            <Button
              type="button"
              className="h-11 gap-2 rounded-xl bg-primary px-4 text-primary-foreground shadow-sm hover:bg-primary/90"
              onClick={() => openEditor(null)}
            >
              <Users2 className="size-4" />
              Új család
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            <span className="font-semibold tabular-nums text-foreground">{filteredCount}</span>
            {' '}találat az összes {totalCount} családból
            {isSearchPending && <span className="ml-2 text-primary">Keresés…</span>}
          </p>
          {hasAnyConstraint && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
              Minden feltétel törlése
            </button>
          )}
        </div>

        {hasAnyConstraint && (
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Aktív szűrők">
            {searchQuery.trim() && (
              <RegistryFilterChip
                label={`Keresés: „${searchQuery.trim()}”`}
                onRemove={() => {
                  setSearchQuery('')
                }}
              />
            )}
            {filters.status !== 'all' && (
              <RegistryFilterChip label={STATUS_LABELS[filters.status]} onRemove={() => patchFilters({ status: 'all' })} />
            )}
            {filters.district !== 'all' && (
              <RegistryFilterChip
                label={filters.district === 'none' ? 'Körzet nélkül' : districtNameById.get(filters.district) || 'Kiválasztott körzet'}
                onRemove={() => patchFilters({ district: 'all' })}
              />
            )}
            {filters.household !== 'all' && (
              <RegistryFilterChip label={HOUSEHOLD_LABELS[filters.household]} onRemove={() => patchFilters({ household: 'all' })} />
            )}
            {filters.children !== 'all' && (
              <RegistryFilterChip label={CHILDREN_LABELS[filters.children]} onRemove={() => patchFilters({ children: 'all' })} />
            )}
            {filters.missingAddress && (
              <RegistryFilterChip label="Hiányos lakcím" onRemove={() => patchFilters({ missingAddress: false })} />
            )}
            {filters.missingDistrict && (
              <RegistryFilterChip label="Hiányzó körzet" onRemove={() => patchFilters({ missingDistrict: false })} />
            )}
          </div>
        )}
      </RegistryToolbar>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users2 className="size-7 animate-pulse motion-reduce:animate-none" />
          </div>
          <p className="font-heading text-lg font-semibold text-foreground">Családi kartoték betöltése</p>
          <p className="mt-1 text-sm text-muted-foreground">Rendezzük a háztartásokat és családi kapcsolatokat.</p>
        </div>
      ) : filteredCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Search className="size-6" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground">Nincs megfelelő család</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Próbálj más keresőszót, vagy törölj néhány aktív szűrőt.
          </p>
          {hasAnyConstraint && (
            <Button variant="outline" className="mt-4 min-h-11 rounded-xl" onClick={clearAllFilters}>
              Szűrők törlése
            </Button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleFamilies.map((family, index) => (
              <article
                key={family.id}
                className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(index % PAGE_SIZE, 8) * 18}ms` }}
              >
                <FamilyCardModern
                  data={familyRowToModernCard(family, districtNameById)}
                  onClick={() => openDetails(family.id)}
                  onPrint={() => openPrint(family.id)}
                />
                <FamilyActions
                  onPrint={() => openPrint(family.id)}
                  onEdit={() => openEditor(family)}
                  onDelete={() => void handleDelete(family.id)}
                />
              </article>
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card [&>div]:border-t-0">
            <RegistryListProgress
              ref={loadMoreRef}
              shown={visibleFamilies.length}
              total={filteredCount}
              noun="család"
              onLoadMore={loadMore}
              loading={loadingMore}
            />
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="divide-y divide-border/70 xl:hidden">
            {visibleFamilies.map((family, index) => (
              <article
                key={family.id}
                className="bg-card motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(index % PAGE_SIZE, 8) * 14}ms` }}
              >
                <FamilyCompactListItem
                  family={family}
                  districtName={family.id_csoport != null ? districtNameById.get(family.id_csoport) ?? null : null}
                  onOpen={() => openDetails(family.id)}
                />
                <div className="border-t border-border/50 bg-muted/15 px-2 py-1">
                  <FamilyActions
                    inline
                    onPrint={() => openPrint(family.id)}
                    onEdit={() => openEditor(family)}
                    onDelete={() => void handleDelete(family.id)}
                  />
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="border-b border-border bg-muted/45">
                <tr>
                  <SortableHeader label="Családfő" sortKey="head" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHeader label="Társ" sortKey="spouse" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Háztartás</th>
                  <SortableHeader label="Lakcím" sortKey="address" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHeader label="Körzet" sortKey="district" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHeader label="Állapot" sortKey="status" current={sortKey} dir={sortDir} onClick={toggleSort} align="center" />
                  <th className="p-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Műveletek</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {visibleFamilies.map((family, index) => {
                  const head = family.ferfi || family.no
                  const spouse = family.ferfi && family.no ? family.no : null
                  const spouseDeceased = head
                    ? head.id === family.ferfi?.id
                      ? family.no?.meghalt
                      : family.ferfi?.meghalt
                    : false
                  const childCount = family.gyerekek?.length ?? 0

                  return (
                    <tr
                      key={family.id}
                      className="bg-card transition-colors duration-200 hover:bg-primary/5 motion-reduce:transition-none motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
                      style={{ animationDelay: `${Math.min(index % PAGE_SIZE, 8) * 14}ms` }}
                    >
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => openDetails(family.id)}
                          className="flex min-h-11 w-full items-center rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`${head ? `${head.csaladnev} ${head.k_nev}` : 'Névtelen'} családi karton megnyitása`}
                        >
                          <PersonCell
                            name={head ? formatNameWithPrefix(head, spouseDeceased) : 'Nincs megadva'}
                            meta={head?.allapot || 'családfő'}
                            role="head"
                          />
                        </button>
                      </td>
                      <td className="p-3">
                        <PersonCell
                          name={spouse ? formatNameWithPrefix(spouse, head?.meghalt) : 'Nincs megadva'}
                          meta={spouse?.allapot || 'családtag'}
                          role="spouse"
                        />
                      </td>
                      <td className="p-3">
                        <div className="rounded-xl bg-muted/55 px-3 py-2 ring-1 ring-border/60">
                          <p className="font-medium text-foreground">
                            {family.ferfi && family.no ? 'Házaspár' : 'Egy felnőtt'}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {childCount > 0 ? `${childCount} gyermek` : 'Nincs gyermek rögzítve'}
                          </p>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-2 text-xs font-medium ${isAddressMissing(family) ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
                          <MapPin className="size-3.5 shrink-0" />
                          {family.utca?.name
                            ? `${family.utca.name}${family.c_szam ? ` ${family.c_szam}` : ''}`
                            : 'Cím hiányzik'}
                        </span>
                      </td>
                      <td className="p-3">
                        {family.id_csoport != null ? (
                          <span className="inline-flex rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary">
                            {districtNameById.get(family.id_csoport) || `#${family.id_csoport}`}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                            <AlertCircle className="size-3.5" /> Körzet hiányzik
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <FamilyStatus family={family} />
                      </td>
                      <td className="p-3">
                        <FamilyActions
                          inline
                          onPrint={() => openPrint(family.id)}
                          onEdit={() => openEditor(family)}
                          onDelete={() => void handleDelete(family.id)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <RegistryListProgress
            ref={loadMoreRef}
            shown={visibleFamilies.length}
            total={filteredCount}
            noun="család"
            onLoadMore={loadMore}
            loading={loadingMore}
          />
        </div>
      )}

      <Dialog open={filterOpen} onOpenChange={handleFilterOpenChange}>
        <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[1.5rem] p-0 sm:!max-w-2xl [&_[data-slot=dialog-close]]:z-30 [&_[data-slot=dialog-close]]:size-11">
          <DialogHeader className="border-b border-border/70 bg-gradient-to-br from-primary/10 via-card to-amber-50/40 px-5 py-5 pr-14 dark:to-card sm:px-6">
            <DialogTitle className="font-heading text-xl text-foreground">Részletes családszűrés</DialogTitle>
            <DialogDescription>
              Állítsd össze a munkához szükséges nézetet. A változások csak az Alkalmazás gombbal lépnek életbe.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            <FilterGroup label="Család állapota" icon={<Sparkles className="size-4" />}>
              <div className="grid gap-2 sm:grid-cols-2">
                {STATUS_OPTIONS.map((option) => (
                  <FilterChoice
                    key={option.value}
                    active={draftFilters.status === option.value}
                    label={option.label}
                    hint={option.hint}
                    onClick={() => setDraftFilters((current) => ({ ...current, status: option.value }))}
                  />
                ))}
              </div>
            </FilterGroup>

            <FilterGroup label="Körzet" icon={<MapPin className="size-4" />}>
              <select
                value={String(draftFilters.district)}
                onChange={(event) => {
                  const value = event.target.value
                  const district: DistrictFilter = value === 'all' || value === 'none' ? value : Number(value)
                  setDraftFilters((current) => ({ ...current, district }))
                }}
                className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="all">Minden körzet</option>
                <option value="none">Körzet nélküli családok</option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>{district.nev}</option>
                ))}
              </select>
            </FilterGroup>

            <div className="grid gap-5 md:grid-cols-2">
              <FilterGroup label="Háztartástípus" icon={<User className="size-4" />}>
                <div className="space-y-2">
                  {HOUSEHOLD_OPTIONS.map((option) => (
                    <FilterChoice
                      key={option.value}
                      active={draftFilters.household === option.value}
                      label={option.label}
                      hint={option.hint}
                      onClick={() => setDraftFilters((current) => ({ ...current, household: option.value }))}
                    />
                  ))}
                </div>
              </FilterGroup>

              <FilterGroup label="Gyermekek" icon={<Baby className="size-4" />}>
                <div className="space-y-2">
                  {CHILDREN_OPTIONS.map((option) => (
                    <FilterChoice
                      key={option.value}
                      active={draftFilters.children === option.value}
                      label={option.label}
                      hint={option.hint}
                      onClick={() => setDraftFilters((current) => ({ ...current, children: option.value }))}
                    />
                  ))}
                </div>
              </FilterGroup>
            </div>

            <FilterGroup label="Adatpótlásra vár" icon={<AlertCircle className="size-4" />}>
              <div className="grid gap-2 sm:grid-cols-2">
                <FilterChoice
                  active={draftFilters.missingAddress}
                  label="Hiányos lakcím"
                  hint="Utca vagy házszám nincs rögzítve"
                  onClick={() => setDraftFilters((current) => ({ ...current, missingAddress: !current.missingAddress }))}
                />
                <FilterChoice
                  active={draftFilters.missingDistrict}
                  label="Hiányzó körzet"
                  hint="A család még nincs körzethez rendelve"
                  onClick={() => setDraftFilters((current) => ({ ...current, missingDistrict: !current.missingDistrict }))}
                />
              </div>
            </FilterGroup>
          </div>

          <DialogFooter className="mx-0 mb-0 border-t border-border/70 bg-card/95 px-4 py-3 backdrop-blur sm:items-center sm:justify-between sm:px-6">
            <Button
              type="button"
              variant="ghost"
              className="mr-auto h-11 rounded-xl text-muted-foreground"
              onClick={() => setDraftFilters({ ...EMPTY_FILTERS })}
            >
              Alaphelyzet
            </Button>
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setFilterOpen(false)}>
              Mégse
            </Button>
            <Button type="button" className="h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90" onClick={applyDraftFilters}>
              Szűrők alkalmazása
              {countActiveFilters(draftFilters) > 0 && ` (${countActiveFilters(draftFilters)})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FamilyDetailsDialogRefined open={detailsOpen} onOpenChange={setDetailsOpen} familyId={detailsId} />
      <FamilyFormDialog open={formOpen} onOpenChange={handleFormOpenChange} editFamily={editFamily} />
      <FamilyCardPrintDialog open={printOpen} onOpenChange={setPrintOpen} familyId={printFamilyId} />
    </div>
  )
}

function SortableHeader({
  label,
  sortKey,
  current,
  dir,
  onClick,
  align = 'left',
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: SortDir
  onClick: (key: SortKey) => void
  align?: 'left' | 'center' | 'right'
}) {
  const active = current === sortKey
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  const alignment = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'

  return (
    <th className={`p-3 ${alignment} text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex min-h-11 items-center gap-1.5 transition-colors duration-200 hover:text-primary ${active ? 'text-primary' : ''}`}
        title={`Rendezés: ${label}`}
      >
        {label}
        <Icon className="size-3" strokeWidth={2.2} />
      </button>
    </th>
  )
}

function PersonCell({
  name,
  meta,
  role,
}: {
  name: string
  meta: string
  role: 'head' | 'spouse'
}) {
  return (
    <div className="space-y-1.5">
      <span className="inline-flex rounded-full border border-primary/15 bg-primary/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
        {role === 'head' ? 'Családfő' : 'Társ'}
      </span>
      <div>
        <p className="font-semibold text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
    </div>
  )
}

function FamilyCompactListItem({
  family,
  districtName,
  onOpen,
}: {
  family: FamilyRow
  districtName: string | null
  onOpen: () => void
}) {
  const head = family.ferfi || family.no
  const spouse = family.ferfi && family.no ? family.no : null
  const childCount = family.gyerekek?.length ?? 0
  const adultCount = Number(Boolean(family.ferfi)) + Number(Boolean(family.no))

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block min-h-11 w-full p-4 text-left transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/70">Családi karton</span>
          <h3 className="mt-1 truncate font-heading text-base font-semibold text-foreground sm:text-lg">
            {head ? `${head.csaladnev} ${head.k_nev}` : 'Nincs megadott családfő'}
          </h3>
          {spouse && <p className="mt-0.5 truncate text-sm text-muted-foreground">Társ: {spouse.csaladnev} {spouse.k_nev}</p>}
        </div>
        <FamilyStatus family={family} />
      </div>

      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span className={`inline-flex min-w-0 items-center gap-1.5 ${isAddressMissing(family) ? 'font-medium text-amber-700 dark:text-amber-300' : ''}`}>
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">
            {family.utca?.name ? `${family.utca.name}${family.c_szam ? ` ${family.c_szam}` : ''}` : 'Cím hiányzik'}
          </span>
        </span>
        <span className={`inline-flex min-w-0 items-center gap-1.5 ${districtName ? '' : 'font-medium text-amber-700 dark:text-amber-300'}`}>
          <Home className="size-3.5 shrink-0" />
          <span className="truncate">{districtName || 'Körzet hiányzik'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users2 className="size-3.5 shrink-0" />
          {adultCount} felnőtt · {childCount} gyermek
        </span>
      </div>
    </button>
  )
}

function FamilyStatus({ family }: { family: FamilyRow }) {
  if (!family.isaktiv) {
    return (
      <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        Lezárt
      </span>
    )
  }

  if (isDeceasedFamily(family)) {
    return (
      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        Elhunyt
      </span>
    )
  }

  return (
    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
      Aktív
    </span>
  )
}

function FamilyActions({
  onPrint,
  onEdit,
  onDelete,
  inline = false,
}: {
  onPrint: () => void
  onEdit: () => void
  onDelete: () => void
  inline?: boolean
}) {
  return (
    <div className={`flex items-center gap-1 ${inline ? 'justify-end' : 'mt-2 justify-end px-1'}`}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 rounded-xl px-3 text-muted-foreground hover:bg-primary/8 hover:text-primary"
        onClick={onPrint}
        title="Családi karton nyomtatása"
      >
        <Printer className="size-3.5" />
        <span className={inline ? 'hidden xl:inline' : 'hidden sm:inline'}>Karton</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 rounded-xl px-3 text-muted-foreground hover:bg-primary/8 hover:text-primary"
        onClick={onEdit}
        title="Család szerkesztése"
      >
        <Edit2 className="size-3.5" />
        <span className={inline ? 'hidden xl:inline' : 'hidden sm:inline'}>Szerkesztés</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 rounded-xl px-3 text-muted-foreground hover:bg-destructive/8 hover:text-destructive"
        onClick={onDelete}
        title="Családi kapcsolat törlése"
      >
        <Trash2 className="size-3.5" />
        <span className={inline ? 'hidden xl:inline' : 'hidden sm:inline'}>Törlés</span>
      </Button>
    </div>
  )
}

function FilterGroup({
  label,
  icon,
  children,
}: {
  label: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <fieldset className="rounded-2xl border border-border bg-card p-4">
      <legend className="px-1">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="text-primary">{icon}</span>
          {label}
        </span>
      </legend>
      <div className="mt-1">{children}</div>
    </fieldset>
  )
}

function FilterChoice({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-200 motion-reduce:transition-none ${
        active
          ? 'border-primary/30 bg-primary/8 text-primary shadow-sm ring-1 ring-primary/10'
          : 'border-border bg-card text-foreground hover:border-primary/20 hover:bg-primary/5'
      }`}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className={`mt-0.5 block text-xs ${active ? 'text-primary/75' : 'text-muted-foreground'}`}>{hint}</span>
    </button>
  )
}

type RegistryTone = 'primary' | 'emerald' | 'amber' | 'rose'

const STAT_TONES: Record<RegistryTone, { frame: string; icon: string; wash: string }> = {
  primary: {
    frame: 'border-primary/15',
    icon: 'bg-primary/10 text-primary ring-primary/15',
    wash: 'from-primary/8 via-transparent to-amber-100/45 dark:to-amber-950/10',
  },
  emerald: {
    frame: 'border-emerald-200/70 dark:border-emerald-900/60',
    icon: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900',
    wash: 'from-emerald-50/80 via-transparent to-transparent dark:from-emerald-950/20',
  },
  amber: {
    frame: 'border-amber-200/80 dark:border-amber-900/60',
    icon: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900',
    wash: 'from-amber-50/90 via-transparent to-transparent dark:from-amber-950/20',
  },
  rose: {
    frame: 'border-rose-200/70 dark:border-rose-900/60',
    icon: 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900',
    wash: 'from-rose-50/70 via-transparent to-transparent dark:from-rose-950/20',
  },
}

function RegistryStatCard({
  tone,
  icon,
  label,
  value,
  hint,
}: {
  tone: RegistryTone
  icon: ReactNode
  label: string
  value: number
  hint: string
}) {
  const style = STAT_TONES[tone]

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm ${style.frame}`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${style.wash}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
          <p className="mt-2 font-heading text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={hint}>{hint}</p>
        </div>
        <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ${style.icon}`}>
          {icon}
        </span>
      </div>
    </div>
  )
}

function RegistryToolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border/80 bg-card/95 p-3 shadow-sm backdrop-blur sm:p-4 ${className}`}>
      {children}
    </section>
  )
}

function RegistryFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/15 bg-primary/8 pl-3 pr-0.5 text-xs font-semibold text-primary">
      <span className="max-w-64 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex size-11 items-center justify-center rounded-full text-primary/65 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        aria-label={`${label} szűrő törlése`}
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

interface RegistryListProgressProps extends HTMLAttributes<HTMLDivElement> {
  shown: number
  total: number
  noun: string
  onLoadMore: () => void
  loading?: boolean
}

const RegistryListProgress = forwardRef<HTMLDivElement, RegistryListProgressProps>(
  function RegistryListProgress({ shown, total, noun, onLoadMore, loading = false, className = '', ...props }, ref) {
    const hasMore = shown < total
    const ratio = total > 0 ? Math.min(100, Math.round((shown / total) * 100)) : 100

    return (
      <div
        ref={ref}
        className={`flex flex-col items-center gap-3 border-t border-border/70 bg-muted/20 px-4 py-4 text-center ${className}`}
        {...props}
      >
        <div className="w-full max-w-sm">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span><strong className="font-semibold tabular-nums text-foreground">{shown}</strong> / {total} {noun}</span>
            <span className="tabular-nums">{ratio}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border/70" aria-hidden="true">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-teal-500 to-amber-400 transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${ratio}%` }}
            />
          </div>
        </div>
        {hasMore ? (
          <Button type="button" variant="ghost" size="sm" className="h-11 rounded-full px-4 text-xs text-primary" onClick={onLoadMore} disabled={loading}>
            {loading ? 'További családok betöltése…' : `További ${Math.min(PAGE_SIZE, total - shown)} megjelenítése`}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Minden találat megjelenik.</p>
        )}
      </div>
    )
  },
)
