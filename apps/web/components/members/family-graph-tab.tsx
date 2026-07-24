'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Focus,
  Hand,
  Heart,
  House,
  Layers3,
  LoaderCircle,
  ListTree,
  Maximize2,
  Network,
  Orbit,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

import { getFamilyGraphData } from '@/app/(dashboard)/tagnyilvantartas/family-graph-actions'
import { FamilyDetailsDialogRefined } from '@/components/modals/family-details-dialog-refined'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { FamilyGalaxyDensity } from '@/lib/members/family-galaxy-layout'
import {
  FamilyGalaxyCanvas,
  type FamilyGalaxyHandle,
} from '@/components/members/family-galaxy-canvas'
import { cn } from '@/lib/utils'
import type {
  FamilyGraphData,
  FamilyGraphEdge,
  FamilyGraphEdgeKind,
  FamilyGraphNode,
} from '@/lib/members/family-graph-types'

type GraphMode = 'global' | 'local'
type GraphDepth = 1 | 2
type GraphDensity = FamilyGalaxyDensity
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: FamilyGraphData }
  | { status: 'error'; message: string }

interface GraphFilters {
  families: boolean
  people: boolean
  deceased: boolean
  membershipEdges: boolean
  relationshipEdges: boolean
}

const DEFAULT_FILTERS: GraphFilters = {
  families: true,
  people: true,
  deceased: true,
  membershipEdges: true,
  relationshipEdges: true,
}

const DENSITY_META: Record<GraphDensity, { label: string }> = {
  compact: { label: 'Sűrű' },
  balanced: { label: 'Kiegyensúlyozott' },
  airy: { label: 'Levegős' },
}

const EDGE_LABELS: Record<FamilyGraphEdgeKind, string> = {
  membership: 'Családtag',
  spouse: 'Házastárs',
  'parent-child': 'Szülő és gyermek',
  sibling: 'Testvér',
  grandparent: 'Nagyszülő és unoka',
  'step-parent': 'Mostohaszülő',
  guardian: 'Gondviselő',
  'adoptive-parent': 'Örökbefogadó',
  relative: 'Rokoni kapcsolat',
  other: 'Egyéb kapcsolat',
}

const ROLE_LABELS: Record<string, string> = {
  csaladfo: 'Családfő',
  hazastars: 'Házastárs',
  gyermek: 'Gyermek',
  unoka: 'Unoka',
  szulo: 'Szülő',
  nagyszulo: 'Nagyszülő',
  mostohaszulo: 'Mostohaszülő',
  gondviselo: 'Gondviselő',
  lakotars: 'Lakótárs',
  alberlet: 'Albérlő',
  rokon: 'Rokon',
  egyeb: 'Egyéb',
}


function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('hu-HU')
    .trim()
}


function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function hasCoarsePointer() {
  return window.matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0
}


function displayError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'A családi háló most nem tölthető be. Kérlek, próbáld újra.'
}

export function FamilyGraphTab() {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [retryToken, setRetryToken] = useState(0)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [mode, setMode] = useState<GraphMode>('global')
  const [depth, setDepth] = useState<GraphDepth>(1)
  const [density, setDensity] = useState<GraphDensity>('balanced')
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [nodeListOpen, setNodeListOpen] = useState(false)
  const [coarsePointer, setCoarsePointer] = useState(false)
  const [touchExploreMode, setTouchExploreMode] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [familyDialogId, setFamilyDialogId] = useState<number | null>(null)
  const [familyDialogOpen, setFamilyDialogOpen] = useState(false)
  const galaxyRef = useRef<FamilyGalaxyHandle | null>(null)
  const [hoverTip, setHoverTip] = useState<{ node: FamilyGraphNode; x: number; y: number } | null>(null)
  // 2026-07-24 (PR-5, D5 döntés): teljes képernyős (immerzív) mód — a háló a
  // sidebar MELLETTI teljes területet tölti ki (fejléc/hero/vers fölé kerül),
  // a sidebar navigációnak látható marad. Kilépés: X gomb vagy Esc.
  const [immersive, setImmersive] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(0)

  useEffect(() => {
    if (!immersive) return
    const sidebar = Array.from(document.querySelectorAll('aside')).find(
      (el) => window.getComputedStyle(el).display !== 'none',
    )
    const update = () => {
      setSidebarWidth(
        sidebar && window.getComputedStyle(sidebar).display !== 'none'
          ? sidebar.getBoundingClientRect().width
          : 0,
      )
    }
    update()
    const resizeObserver = sidebar ? new ResizeObserver(update) : null
    if (sidebar && resizeObserver) resizeObserver.observe(sidebar)
    window.addEventListener('resize', update)
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImmersive(false)
    }
    window.addEventListener('keydown', exitOnEscape)
    // A háttér-oldal ne görgethessen az overlay alatt.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('keydown', exitOnEscape)
      document.body.style.overflow = previousOverflow
    }
  }, [immersive])

  useEffect(() => {
    const pointerQuery = window.matchMedia('(any-pointer: coarse)')
    const syncPointerMode = () => {
      const touchCapable = hasCoarsePointer()
      setCoarsePointer(touchCapable)
      if (!touchCapable) setTouchExploreMode(false)
    }

    syncPointerMode()
    pointerQuery.addEventListener('change', syncPointerMode)
    return () => pointerQuery.removeEventListener('change', syncPointerMode)
  }, [])

  useEffect(() => {
    if (!touchExploreMode) return
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTouchExploreMode(false)
    }
    window.addEventListener('keydown', exitOnEscape)
    return () => window.removeEventListener('keydown', exitOnEscape)
  }, [touchExploreMode])

  useEffect(() => {
    let cancelled = false

    getFamilyGraphData()
      .then((data) => {
        if (!cancelled) setLoadState({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadState({ status: 'error', message: displayError(error) })
      })

    return () => {
      cancelled = true
    }
  }, [retryToken])

  const data = loadState.status === 'ready' ? loadState.data : null

  // A galaxist a FamilyGalaxyCanvas (three.js) renderel; itt már csak a lokális
  // nézet kiemelendő csomópont-halmazát számoljuk. A szűrők/denzitás/mozgás
  // propként mennek le, a fókusz/nagyítás a galaxyRef imperatív API-ján át.
  const highlightIds = useMemo(() => {
    // Bármely csomópont kiválasztásakor kiemeljük a közvetlen környezetét, a
    // többi elhalványul — így tisztán látszanak a kapcsolati összefüggések.
    // Globális nézetben 1 lépés, „Környezet" nézetben a beállított mélység.
    if (!selectedNodeId || !data) return null
    const spread = mode === 'local' ? depth : 1
    const adjacency = new Map<string, string[]>()
    const link = (a: string, b: string) => {
      const list = adjacency.get(a)
      if (list) list.push(b)
      else adjacency.set(a, [b])
    }
    for (const edge of data.edges) {
      link(edge.source, edge.target)
      link(edge.target, edge.source)
    }
    const set = new Set<string>([selectedNodeId])
    let frontier = [selectedNodeId]
    for (let step = 0; step < spread; step += 1) {
      const next: string[] = []
      for (const id of frontier) {
        for (const neighbor of adjacency.get(id) ?? []) {
          if (!set.has(neighbor)) {
            set.add(neighbor)
            next.push(neighbor)
          }
        }
      }
      frontier = next
    }
    return set
  }, [mode, selectedNodeId, depth, data])

  const searchResults = useMemo(() => {
    if (!data) return []
    const query = normalizeSearch(search)
    if (!query) return []

    return data.nodes
      .filter((node) => {
        if (node.kind === 'family' && !filters.families) return false
        if (node.kind === 'person' && (!filters.people || (!filters.deceased && node.deceased))) return false
        return normalizeSearch(node.label).includes(query)
      })
      .slice(0, 8)
  }, [data, filters.deceased, filters.families, filters.people, search])

  const selectedNode = useMemo(
    () => data?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [data, selectedNodeId],
  )

  const selectedConnections = useMemo(() => {
    if (!data || !selectedNodeId) return []
    const nodeById = new Map(data.nodes.map((node) => [node.id, node]))

    return data.edges.flatMap((edge) => {
      if (edge.source !== selectedNodeId && edge.target !== selectedNodeId) return []
      const otherId = edge.source === selectedNodeId ? edge.target : edge.source
      const other = nodeById.get(otherId)
      return other ? [{ edge, node: other }] : []
    })
  }, [data, selectedNodeId])

  function handleRetry() {
    setLoadState({ status: 'loading' })
    setRetryToken((value) => value + 1)
  }

  function focusNode(nodeId: string) {
    setSelectedNodeId(nodeId)
    setSearchOpen(false)
    if (coarsePointer) setTouchExploreMode(true)
    galaxyRef.current?.focus(nodeId)
  }

  function changeDensity(nextDensity: GraphDensity) {
    setDensity(nextDensity)
  }

  function fitGraph() {
    galaxyRef.current?.fit()
  }

  function zoomBy(factor: number) {
    galaxyRef.current?.zoomBy(factor)
  }

  function openFamilyCard(familyId: number) {
    setFamilyDialogId(familyId)
    setFamilyDialogOpen(true)
  }

  if (loadState.status === 'loading') return <FamilyGraphLoading />
  if (loadState.status === 'error') {
    return <FamilyGraphError message={loadState.message} onRetry={handleRetry} />
  }

  if (loadState.data.nodes.length === 0) {
    return <FamilyGraphEmpty />
  }

  const activeFilterCount = Object.values(filters).filter((value) => !value).length

  return (
    <>
      <section
        className={cn(
          'relative isolate overflow-hidden bg-[#071b1c] text-white',
          immersive
            ? // 2026-07-24 (PR-5, D5): immerzív mód — fixen a sidebar melletti
              // teljes terület, a fejléc/hero/vers FÖLÖTT (lefedi őket).
              'fixed inset-y-0 right-0 z-[45] flex flex-col rounded-none border-0'
            : 'rounded-[1.75rem] border border-[#b4ddd5]/15 shadow-[0_28px_80px_-42px_rgba(4,38,37,0.72)] sm:rounded-[2rem]',
        )}
        style={immersive ? { left: sidebarWidth } : undefined}
      >
        <GraphBackdrop />

        <header className="relative z-20 border-b border-white/[0.08] px-4 py-4 sm:px-5 sm:py-5 lg:px-6 [@media(max-height:600px)]:py-3">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between [@media(max-height:600px)]:flex-row [@media(max-height:600px)]:items-start [@media(max-height:600px)]:justify-between [@media(max-height:600px)]:gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/15 bg-amber-200/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
                  <Sparkles className="size-3" />
                  Családi univerzum
                </span>
                <span className="hidden text-xs text-teal-50/45 sm:inline [@media(max-height:600px)]:hidden">Húzd, nagyítsd és érintsd meg a pontokat</span>
              </div>
              <h2 className="mt-2 font-heading text-xl font-semibold tracking-[-0.02em] text-white sm:text-2xl">
                A gyülekezet kapcsolati hálója
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-teal-50/55 sm:text-sm [@media(max-height:600px)]:hidden">
                A családok arany csomópontként, a személyek pedig a köréjük rendeződő kapcsolatokban jelennek meg.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0">
              <GraphStat value={loadState.data.stats.familyCount} label="család" icon={<House className="size-3.5" />} />
              <GraphStat value={loadState.data.stats.personCount} label="személy" icon={<Users className="size-3.5" />} />
              <GraphStat value={loadState.data.stats.relationshipCount} label="rokoni kapocs" icon={<Network className="size-3.5" />} />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2.5 lg:flex-row lg:items-center [@media(max-height:600px)]:mt-3 [@media(max-height:600px)]:flex-row [@media(max-height:600px)]:items-center">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-teal-100/45" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setSearchOpen(true)
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSearchOpen(false)
                  if (event.key === 'Enter' && searchResults[0]) focusNode(searchResults[0].id)
                }}
                placeholder="Személy vagy család keresése…"
                aria-label="Keresés a családi hálóban"
                className="h-11 border-white/10 bg-white/[0.06] pl-10 pr-10 text-white shadow-none placeholder:text-teal-50/35 focus-visible:border-teal-200/40 focus-visible:bg-white/[0.08] focus-visible:ring-teal-300/10"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-0 top-0 inline-flex size-11 items-center justify-center text-teal-100/45 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-200 motion-reduce:transition-none"
                  aria-label="Keresés törlése"
                >
                  <X className="size-4" />
                </button>
              )}
              {searchOpen && search && (
                <SearchResults
                  query={search}
                  results={searchResults}
                  onSelect={focusNode}
                />
              )}
            </div>

            <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:pb-0">
              <div className="flex shrink-0 rounded-xl border border-white/10 bg-white/[0.045] p-1" aria-label="Gráfnézet">
                <ModeButton active={mode === 'global'} onClick={() => setMode('global')} icon={<Orbit className="size-3.5" />}>
                  Teljes háló
                </ModeButton>
                <ModeButton
                  active={mode === 'local'}
                  disabled={!selectedNode}
                  onClick={() => setMode('local')}
                  icon={<Focus className="size-3.5" />}
                >
                  Környezet
                </ModeButton>
              </div>

              {mode === 'local' && selectedNode && (
                <div className="flex shrink-0 rounded-xl border border-white/10 bg-white/[0.045] p-1" aria-label="Kapcsolati mélység">
                  <ModeButton compact active={depth === 1} onClick={() => setDepth(1)}>1 lépés</ModeButton>
                  <ModeButton compact active={depth === 2} onClick={() => setDepth(2)}>2 lépés</ModeButton>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={() => setNodeListOpen(true)}
                aria-label="Csomópontlista"
                className="min-h-11 shrink-0 border-white/10 bg-white/[0.045] text-teal-50 hover:bg-white/10 hover:text-white max-sm:size-11 max-sm:px-0 [@media(max-height:600px)]:size-11 [@media(max-height:600px)]:px-0"
              >
                <ListTree className="size-4" />
                <span className="hidden sm:inline [@media(max-height:600px)]:hidden">Csomópontlista</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setFilterOpen(true)}
                aria-label="Szűrők"
                className="min-h-11 shrink-0 border-white/10 bg-white/[0.045] text-teal-50 hover:bg-white/10 hover:text-white max-sm:size-11 max-sm:px-0 [@media(max-height:600px)]:size-11 [@media(max-height:600px)]:px-0"
              >
                <SlidersHorizontal className="size-4" />
                <span className="hidden sm:inline [@media(max-height:600px)]:hidden">Szűrők</span>
                {activeFilterCount > 0 && (
                  <Badge className="min-w-5 border-0 bg-amber-200 px-1.5 text-[#173331]">{activeFilterCount}</Badge>
                )}
              </Button>

              {/* 2026-07-24 (PR-5, D5): teljes képernyő be/ki — Esc is kilép */}
              <Button
                type="button"
                variant="outline"
                onClick={() => setImmersive((value) => !value)}
                aria-label={immersive ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
                className={cn(
                  'min-h-11 shrink-0 border-white/10 bg-white/[0.045] text-teal-50 hover:bg-white/10 hover:text-white max-sm:size-11 max-sm:px-0 [@media(max-height:600px)]:size-11 [@media(max-height:600px)]:px-0',
                  immersive && 'border-amber-200/30 bg-amber-200/10 text-amber-100',
                )}
              >
                {immersive ? <X className="size-4" /> : <Maximize2 className="size-4" />}
                <span className="hidden sm:inline [@media(max-height:600px)]:hidden">
                  {immersive ? 'Kilépés' : 'Teljes képernyő'}
                </span>
              </Button>
            </div>
          </div>
        </header>

        <div className={cn('relative z-10', immersive && 'min-h-0 flex-1')}>
          <p id="family-graph-description" className="sr-only">
            A kapcsolati háló vizuális vászna. A teljes, billentyűzettel bejárható tartalom a
            Csomópontlista gombbal nyitható meg.
          </p>
          <p className="sr-only" aria-live="polite">
            {selectedNode ? `${selectedNode.label} kiválasztva. ${selectedConnections.length} közvetlen kapcsolat.` : ''}
          </p>
          <div
            className={cn(
              'relative min-h-0 w-full overflow-hidden',
              immersive
                ? 'h-full'
                : 'h-[clamp(22rem,62dvh,34rem)] sm:h-[clamp(30rem,68dvh,44rem)] lg:h-[calc(100dvh-16rem)] lg:min-h-[35rem] lg:max-h-[48rem] [@media(max-height:600px)]:h-[20rem] [@media(max-height:600px)]:min-h-0',
              coarsePointer && !touchExploreMode ? 'touch-pan-y' : 'touch-none',
            )}
            role="img"
            aria-describedby="family-graph-description"
            aria-label={`${loadState.data.stats.familyCount} család és ${loadState.data.stats.personCount} személy kapcsolati hálója.`}
          >
            <FamilyGalaxyCanvas
              ref={galaxyRef}
              data={loadState.data}
              density={density}
              filters={filters}
              highlightIds={highlightIds}
              interactive={!coarsePointer || touchExploreMode}
              reducedMotion={reducedMotion()}
              onSelectNode={(id) => {
                setSelectedNodeId(id)
                if (!id) setMode('global')
              }}
              onHoverNode={(node, x, y) => setHoverTip(node ? { node, x, y } : null)}
            />
            {hoverTip && (
              <div
                className="pointer-events-none absolute z-30 max-w-[16rem] -translate-x-1/2 -translate-y-[calc(100%+12px)] truncate rounded-xl border border-teal-200/20 bg-[#08181c]/85 px-2.5 py-1.5 text-xs text-teal-50 shadow-xl backdrop-blur"
                style={{ left: hoverTip.x, top: hoverTip.y }}
              >
                <span className="font-semibold">{hoverTip.node.label}</span>
                <span className="ml-1 text-teal-50/55">
                  {hoverTip.node.kind === 'family'
                    ? `· ${hoverTip.node.memberCount} tag`
                    : hoverTip.node.deceased
                      ? '· ✝ elhunyt'
                      : hoverTip.node.birthYear
                        ? `· ${hoverTip.node.birthYear}`
                        : ''}
                </span>
              </div>
            )}
          </div>

          {coarsePointer && !touchExploreMode && (
            <div className="absolute inset-0 z-40 flex touch-pan-y items-center justify-center bg-[#071b1c]/32 px-5 backdrop-blur-[1px]">
              <div className="max-w-xs rounded-[1.5rem] border border-white/12 bg-[#0b2929]/94 p-5 text-center shadow-[0_24px_60px_-24px_rgba(0,0,0,.9)] backdrop-blur-xl">
                <span className="mx-auto inline-flex size-11 items-center justify-center rounded-2xl bg-teal-200/10 text-teal-100">
                  <Hand className="size-5" />
                </span>
                <p className="mt-3 font-heading text-base font-semibold text-white">A lap most szabadon görgethető</p>
                <p className="mt-1 text-xs leading-5 text-teal-50/55">
                  Kapcsold be a háló kezelését a pontok mozgatásához és a csippentéses nagyításhoz.
                </p>
                <Button
                  type="button"
                  onClick={() => setTouchExploreMode(true)}
                  className="mt-4 min-h-11 w-full rounded-xl bg-teal-100 text-[#123330] hover:bg-white"
                >
                  <Hand className="size-4" />
                  Háló kezelése
                </Button>
                <p className="mt-3 flex items-center justify-center gap-1 text-[10px] text-teal-50/40">
                  <ChevronDown className="size-3" /> Húzd felfelé a lap további görgetéséhez
                </p>
              </div>
            </div>
          )}

          {coarsePointer && touchExploreMode && (
            <button
              type="button"
              onClick={() => setTouchExploreMode(false)}
              className="absolute left-1/2 top-3 z-40 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/12 bg-[#0b2929]/94 px-4 text-xs font-semibold text-teal-50 shadow-lg backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
            >
              <ChevronDown className="size-4 text-amber-200" />
              Kilépés és oldal görgetése
            </button>
          )}

          <GraphControls
            onZoomIn={() => zoomBy(1.22)}
            onZoomOut={() => zoomBy(0.82)}
            onFit={fitGraph}
            onLayout={() => galaxyRef.current?.reset()}
          />

          <GraphLegend />

          {mode === 'local' && selectedNode && (
            <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[calc(100%-6rem)] sm:left-4 sm:top-4">
              <div className="flex items-center gap-2 rounded-full border border-teal-200/15 bg-[#092525]/88 px-3 py-2 text-xs text-teal-50/75 shadow-lg backdrop-blur-md">
                <Focus className="size-3.5 shrink-0 text-amber-200" />
                <span className="truncate"><strong className="text-white">{selectedNode.label}</strong> · {depth} lépés</span>
              </div>
            </div>
          )}

          {selectedNode && (
            <GraphDetailPanel
              node={selectedNode}
              connections={selectedConnections}
              localMode={mode === 'local'}
              onClose={() => {
                setSelectedNodeId(null)
                setMode('global')
              }}
              onShowLocal={() => setMode('local')}
              onSelectConnection={focusNode}
              onOpenFamily={openFamilyCard}
            />
          )}

          <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-[#092525]/75 px-3 py-1.5 text-[10px] text-teal-50/45 backdrop-blur sm:flex">
            <Hand className="size-3" /> Húzás a mozgatáshoz · görgő vagy csippentés a nagyításhoz
          </div>
        </div>
      </section>

      <GraphFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        filters={filters}
        onFiltersChange={setFilters}
        density={density}
        onDensityChange={changeDensity}
      />

      <GraphNodeListSheet
        open={nodeListOpen}
        onOpenChange={setNodeListOpen}
        data={loadState.data}
        selectedNodeId={selectedNodeId}
        onSelect={focusNode}
      />

      <FamilyDetailsDialogRefined
        open={familyDialogOpen}
        onOpenChange={(open) => {
          setFamilyDialogOpen(open)
          if (!open) setFamilyDialogId(null)
        }}
        familyId={familyDialogId}
      />
    </>
  )
}

function GraphBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 50% 58%, rgba(50,171,153,.13), transparent 42%), radial-gradient(circle at 14% 7%, rgba(55,174,157,.14), transparent 30%), radial-gradient(circle at 91% 15%, rgba(224,169,69,.1), transparent 24%), linear-gradient(145deg, #0a2929 0%, #071b1c 55%, #061517 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-35"
        style={{
          backgroundImage:
            'radial-gradient(circle at 17px 19px, rgba(229,249,244,.7) 0 1px, transparent 1.4px), radial-gradient(circle at 61px 43px, rgba(243,202,115,.55) 0 1px, transparent 1.6px), radial-gradient(circle at 83px 71px, rgba(125,215,201,.55) 0 1px, transparent 1.5px)',
          backgroundSize: '97px 83px, 131px 109px, 173px 149px',
          maskImage: 'radial-gradient(ellipse at 50% 56%, black 5%, rgba(0,0,0,.76) 55%, transparent 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[12%] top-[42%] -z-10 h-[33%] rounded-[50%] border border-teal-100/[0.035] shadow-[0_0_80px_rgba(76,190,171,.055),inset_0_0_70px_rgba(225,178,78,.035)] motion-safe:animate-[spin_52s_linear_infinite] motion-reduce:animate-none"
      />
    </>
  )
}

function GraphStat({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.045] px-2.5 py-2.5 text-center sm:min-w-[6.25rem] sm:px-3 sm:text-left [@media(max-height:600px)]:py-2">
      <div className="flex items-center justify-center gap-1.5 text-teal-100/50 sm:justify-start">
        {icon}
        <span className="text-[10px] font-semibold uppercase leading-tight tracking-[0.1em]">{label}</span>
      </div>
      <p className="mt-1 font-heading text-lg font-semibold tabular-nums text-white">{value.toLocaleString('hu-HU')}</p>
    </div>
  )
}

function SearchResults({
  query,
  results,
  onSelect,
}: {
  query: string
  results: FamilyGraphNode[]
  onSelect: (nodeId: string) => void
}) {
  return (
    <div className="absolute inset-x-0 top-[calc(100%+.5rem)] z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#0b2929]/95 p-1.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,.9)] backdrop-blur-xl">
      {results.length > 0 ? (
        <div className="max-h-72 overflow-y-auto overscroll-contain">
          {results.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node.id)}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-200/50 motion-reduce:transition-none"
            >
              <span className={cn(
                'inline-flex size-8 shrink-0 items-center justify-center rounded-xl border',
                node.kind === 'family'
                  ? 'border-amber-200/20 bg-amber-200/10 text-amber-200'
                  : node.gender === 'female'
                    ? 'border-rose-200/15 bg-rose-200/10 text-rose-200'
                    : 'border-teal-200/15 bg-teal-200/10 text-teal-200',
              )}>
                {node.kind === 'family' ? <House className="size-3.5" /> : <UserRound className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{node.label}</span>
                <span className="block text-[11px] text-teal-50/45">
                  {node.kind === 'family'
                    ? `${node.memberCount} családtag`
                    : [node.birthYear ? `sz. ${node.birthYear}` : null, node.deceased ? 'elhunyt' : null].filter(Boolean).join(' · ') || 'Személy'}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-teal-100/35" />
            </button>
          ))}
        </div>
      ) : (
        <div className="px-4 py-5 text-center">
          <Search className="mx-auto size-5 text-teal-100/30" />
          <p className="mt-2 text-sm font-medium text-white">Nincs találat</p>
          <p className="mt-0.5 text-xs text-teal-50/45">„{query}” nem szerepel a látható hálóban.</p>
        </div>
      )}
    </div>
  )
}

function ModeButton({
  active,
  disabled,
  compact = false,
  icon,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  compact?: boolean
  icon?: React.ReactNode
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none',
        compact && 'px-2.5',
        active ? 'bg-teal-100 text-[#123330] shadow-sm' : 'text-teal-50/55 hover:bg-white/[0.06] hover:text-white',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function GraphControls({
  onZoomIn,
  onZoomOut,
  onFit,
  onLayout,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onLayout: () => void
}) {
  const controls = [
    { label: 'Nagyítás', icon: <ZoomIn className="size-4" />, action: onZoomIn },
    { label: 'Kicsinyítés', icon: <ZoomOut className="size-4" />, action: onZoomOut },
    { label: 'Háló középre igazítása', icon: <Maximize2 className="size-4" />, action: onFit },
    { label: 'Galaxis újrarendezése', icon: <RotateCcw className="size-4" />, action: onLayout },
  ]

  return (
    <div className="absolute bottom-3 left-3 z-20 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#092525]/88 p-1 shadow-lg backdrop-blur-md sm:bottom-4 sm:left-4">
      {controls.map((control) => (
        <button
          key={control.label}
          type="button"
          onClick={control.action}
          className="inline-flex size-11 items-center justify-center rounded-xl text-teal-50/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-200 motion-reduce:transition-none"
          aria-label={control.label}
          title={control.label}
        >
          {control.icon}
        </button>
      ))}
    </div>
  )
}

function GraphLegend() {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 hidden rounded-2xl border border-white/[0.08] bg-[#092525]/72 px-3 py-2.5 text-[10px] text-teal-50/55 backdrop-blur lg:block">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <LegendItem color="bg-amber-300" label="Család" square />
        <LegendItem color="bg-teal-300" label="Férfi" />
        <LegendItem color="bg-rose-300" label="Nő" />
        <LegendItem color="bg-slate-300" label="Ismeretlen" />
        <span className="h-px w-5 bg-rose-300/80" />
        <span>házastárs</span>
        <span className="h-px w-5 border-t border-dashed border-amber-300/80" />
        <span>rokoni kapocs</span>
      </div>
    </div>
  )
}

function LegendItem({ color, label, square = false }: { color: string; label: string; square?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2.5', square ? 'rounded-[3px]' : 'rounded-full', color)} />
      {label}
    </span>
  )
}

function GraphDetailPanel({
  node,
  connections,
  localMode,
  onClose,
  onShowLocal,
  onSelectConnection,
  onOpenFamily,
}: {
  node: FamilyGraphNode
  connections: Array<{ edge: FamilyGraphEdge; node: FamilyGraphNode }>
  localMode: boolean
  onClose: () => void
  onShowLocal: () => void
  onSelectConnection: (nodeId: string) => void
  onOpenFamily: (familyId: number) => void
}) {
  const familyId = node.kind === 'family' ? node.familyId : node.familyIds[0] ?? null

  return (
    <aside
      aria-label={`${node.label} részletei`}
      className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-50 max-h-[min(58dvh,28rem)] overflow-y-auto overscroll-contain rounded-[1.35rem] border border-white/10 bg-[#0b2929]/94 p-4 shadow-[0_28px_70px_-24px_rgba(0,0,0,.9)] backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-300 lg:absolute lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-4 lg:z-30 lg:max-h-none lg:w-[19.5rem] lg:rounded-[1.5rem] lg:p-5 lg:motion-safe:slide-in-from-right-4"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-xl text-teal-50/45 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-200 motion-reduce:transition-none"
        aria-label="Részletek bezárása"
      >
        <X className="size-4" />
      </button>

      <div className="pr-9">
        <span className={cn(
          'inline-flex size-11 items-center justify-center rounded-2xl border',
          node.kind === 'family'
            ? 'border-amber-200/20 bg-amber-200/10 text-amber-200'
            : node.gender === 'female'
              ? 'border-rose-200/20 bg-rose-200/10 text-rose-200'
              : 'border-teal-200/20 bg-teal-200/10 text-teal-200',
        )}>
          {node.kind === 'family' ? <House className="size-5" /> : <UserRound className="size-5" />}
        </span>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-100/40">
          {node.kind === 'family' ? 'Családi csomópont' : 'Személy'}
        </p>
        <h3 className={cn(
          'mt-1 font-heading text-xl font-semibold leading-tight text-white',
          node.kind === 'person' && node.deceased && 'text-teal-50/65',
        )}>
          {node.kind === 'person' && node.deceased && '† '}{node.label}
        </h3>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {node.kind === 'family' ? (
          <>
            <DetailFact icon={<Users className="size-3.5" />} label="Családtag" value={String(node.memberCount)} />
            <DetailFact icon={<CircleDot className="size-3.5" />} label="Állapot" value={node.active ? 'Aktív' : 'Inaktív'} />
          </>
        ) : (
          <>
            <DetailFact
              icon={<CalendarDays className="size-3.5" />}
              label="Születési év"
              value={node.birthYear ? String(node.birthYear) : 'Ismeretlen'}
            />
            <DetailFact
              icon={<House className="size-3.5" />}
              label="Család"
              value={node.familyIds.length > 0 ? `${node.familyIds.length} kapcsolódás` : 'Nincs'}
            />
          </>
        )}
      </div>

      <div className="mt-4 border-t border-white/[0.08] pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-100/40">Közvetlen kapcsolatok</p>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] tabular-nums text-teal-50/55">{connections.length}</span>
        </div>
        {connections.length > 0 ? (
          <div className="mt-2 space-y-1">
            {connections.slice(0, 6).map(({ edge, node: connectedNode }) => (
              <button
                key={edge.id}
                type="button"
                onClick={() => onSelectConnection(connectedNode.id)}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-200 motion-reduce:transition-none"
              >
                <span className={cn(
                  'size-2.5 shrink-0 rounded-full',
                  connectedNode.kind === 'family'
                    ? 'rounded-[3px] bg-amber-300'
                    : connectedNode.kind === 'person' && connectedNode.gender === 'female'
                      ? 'bg-rose-300'
                      : 'bg-teal-300',
                )} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-teal-50/85">{connectedNode.label}</span>
                  <span className="block truncate text-[10px] text-teal-50/35">
                    {edge.kind === 'membership' && edge.role
                      ? ROLE_LABELS[edge.role] ?? edge.role
                      : EDGE_LABELS[edge.kind]}
                  </span>
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-teal-100/30" />
              </button>
            ))}
            {connections.length > 6 && (
              <p className="px-2.5 pt-1 text-[10px] text-teal-50/35">+ {connections.length - 6} további kapcsolat a hálón</p>
            )}
          </div>
        ) : (
          <p className="mt-2 rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs leading-5 text-teal-50/40">
            Ehhez a ponthoz még nincs közvetlen kapcsolat rögzítve.
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-2">
        {!localMode && (
          <Button
            type="button"
            onClick={onShowLocal}
            className="min-h-11 rounded-xl bg-teal-100 text-[#123330] hover:bg-white"
          >
            <Focus className="size-4" />
            Csak a környezete
          </Button>
        )}
        {familyId !== null && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenFamily(familyId)}
            className="min-h-11 rounded-xl border-white/10 bg-white/[0.05] text-teal-50 hover:bg-white/10 hover:text-white"
          >
            <House className="size-4" />
            Családi karton megnyitása
          </Button>
        )}
      </div>
    </aside>
  )
}

function DetailFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.04] p-2.5">
      <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.11em] text-teal-100/35">
        {icon}{label}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-teal-50/85">{value}</p>
    </div>
  )
}

function GraphFilterSheet({
  open,
  onOpenChange,
  filters,
  onFiltersChange,
  density,
  onDensityChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: GraphFilters
  onFiltersChange: (filters: GraphFilters) => void
  density: GraphDensity
  onDensityChange: (density: GraphDensity) => void
}) {
  function toggleFilter(filter: keyof GraphFilters) {
    onFiltersChange({ ...filters, [filter]: !filters[filter] })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(94vw,27rem)] gap-0 border-primary/10 bg-card p-0 sm:max-w-[27rem] [&_[data-slot=sheet-close]]:size-11">
        <SheetHeader className="shrink-0 border-b border-border/60 bg-gradient-to-br from-primary/10 via-card to-amber-50/45 px-5 py-5 dark:to-card">
          <div className="inline-flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <SlidersHorizontal className="size-4" />
          </div>
          <SheetTitle className="mt-2 font-heading text-xl">Háló szűrése</SheetTitle>
          <SheetDescription>
            Válaszd ki, mely személyek, családok és kapcsolatok rajzolódjanak ki.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          <FilterSection title="Csomópontok" icon={<CircleDot className="size-4" />}>
            <FilterToggle
              checked={filters.families}
              onClick={() => toggleFilter('families')}
              icon={<House className="size-4 text-amber-600" />}
              title="Családok"
              description="Az arany családi középpontok megjelenítése"
            />
            <FilterToggle
              checked={filters.people}
              onClick={() => toggleFilter('people')}
              icon={<UserRound className="size-4 text-primary" />}
              title="Személyek"
              description="A családtagok megjelenítése"
            />
            <FilterToggle
              checked={filters.deceased}
              onClick={() => toggleFilter('deceased')}
              icon={<Heart className="size-4 text-slate-500" />}
              title="Elhunyt személyek"
              description="Finomított, halvány jelöléssel láthatók"
            />
          </FilterSection>

          <FilterSection title="Kapcsolati vonalak" icon={<Network className="size-4" />}>
            <FilterToggle
              checked={filters.membershipEdges}
              onClick={() => toggleFilter('membershipEdges')}
              icon={<Layers3 className="size-4 text-teal-600" />}
              title="Családi tagság"
              description="A személyek és családok közötti vonalak"
            />
            <FilterToggle
              checked={filters.relationshipEdges}
              onClick={() => toggleFilter('relationshipEdges')}
              icon={<Network className="size-4 text-violet-600" />}
              title="Rokoni kapcsolatok"
              description="Házastársi, szülői, testvéri és egyéb kapcsok"
            />
          </FilterSection>

          <FilterSection title="Elrendezés sűrűsége" icon={<Orbit className="size-4" />}>
            <div className="grid gap-2">
              {(Object.keys(DENSITY_META) as GraphDensity[]).map((value) => {
                const selected = density === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onDensityChange(value)}
                    aria-pressed={selected}
                    className={cn(
                      'flex min-h-12 items-center justify-between rounded-xl border px-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                      selected
                        ? 'border-primary/25 bg-primary/8 text-primary'
                        : 'border-border/70 bg-card text-foreground hover:border-primary/15 hover:bg-primary/[0.03]',
                    )}
                  >
                    <span className="text-sm font-semibold">{DENSITY_META[value].label}</span>
                    <span className={cn(
                      'inline-flex size-6 items-center justify-center rounded-full border',
                      selected ? 'border-primary/20 bg-primary text-primary-foreground' : 'border-border text-transparent',
                    )}>
                      <Check className="size-3.5" />
                    </span>
                  </button>
                )
              })}
            </div>
          </FilterSection>
        </div>

        <SheetFooter className="shrink-0 border-t border-border/60 bg-muted/35 px-5 py-4 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 sm:mr-auto"
            onClick={() => {
              onFiltersChange(DEFAULT_FILTERS)
              onDensityChange('balanced')
            }}
          >
            <RotateCcw className="size-4" />
            Alaphelyzet
          </Button>
          <Button type="button" className="min-h-11" onClick={() => onOpenChange(false)}>
            Kész
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function GraphNodeListSheet({
  open,
  onOpenChange,
  data,
  selectedNodeId,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: FamilyGraphData
  selectedNodeId: string | null
  onSelect: (nodeId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(100)

  const filteredNodes = useMemo(() => {
    const normalizedQuery = normalizeSearch(query)
    return data.nodes
      .filter((node) => !normalizedQuery || normalizeSearch(node.label).includes(normalizedQuery))
      .slice()
      .sort((left, right) => left.label.localeCompare(right.label, 'hu-HU', { sensitivity: 'base' }))
  }, [data.nodes, query])

  const visibleNodes = filteredNodes.slice(0, visibleCount)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(94vw,30rem)] gap-0 border-primary/10 bg-card p-0 sm:max-w-[30rem] [&_[data-slot=sheet-close]]:size-11">
        <SheetHeader className="shrink-0 border-b border-border/60 bg-gradient-to-br from-primary/10 via-card to-amber-50/45 px-5 py-5 dark:to-card">
          <div className="inline-flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ListTree className="size-4" />
          </div>
          <SheetTitle className="mt-2 font-heading text-xl">Családok és személyek listája</SheetTitle>
          <SheetDescription>
            A vizuális háló teljes, billentyűzettel és képernyőolvasóval bejárható alternatívája.
          </SheetDescription>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setVisibleCount(100)
              }}
              placeholder="Név vagy család keresése…"
              aria-label="Keresés az akadálymentes csomópontlistában"
              className="h-11 bg-background pl-10"
            />
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
          <p className="px-2 pb-2 text-xs text-muted-foreground" aria-live="polite">
            {filteredNodes.length.toLocaleString('hu-HU')} találat, ebből {visibleNodes.length.toLocaleString('hu-HU')} látható
          </p>

          {visibleNodes.length > 0 ? (
            <ul className="space-y-1" aria-label="Családi háló csomópontjai">
              {visibleNodes.map((node) => {
                const selected = node.id === selectedNodeId
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(node.id)
                        onOpenChange(false)
                      }}
                      aria-current={selected ? 'true' : undefined}
                      className={cn(
                        'flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                        selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/70',
                      )}
                    >
                      <span className={cn(
                        'inline-flex size-9 shrink-0 items-center justify-center rounded-xl border',
                        node.kind === 'family'
                          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                          : node.gender === 'female'
                            ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'border-primary/15 bg-primary/8 text-primary',
                      )}>
                        {node.kind === 'family' ? <House className="size-4" /> : <UserRound className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">
                          {node.kind === 'person' && node.deceased && '† '}{node.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                          {node.kind === 'family'
                            ? `Család · ${node.memberCount} családtag`
                            : [
                                'Személy',
                                node.birthYear ? `született ${node.birthYear}` : null,
                                node.familyIds.length > 0 ? `${node.familyIds.length} családi kapcsolat` : null,
                                node.deceased ? 'elhunyt' : null,
                              ].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
              <Search className="mx-auto size-6 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-semibold text-foreground">Nincs találat</p>
              <p className="mt-1 text-xs text-muted-foreground">Próbálj rövidebb vagy más keresőkifejezést.</p>
            </div>
          )}

          {visibleNodes.length < filteredNodes.length && (
            <Button
              type="button"
              variant="outline"
              className="mt-3 min-h-11 w-full"
              onClick={() => setVisibleCount((count) => count + 100)}
            >
              További {Math.min(100, filteredNodes.length - visibleNodes.length)} elem megjelenítése
            </Button>
          )}
        </div>

        <SheetFooter className="shrink-0 border-t border-border/60 bg-muted/35 px-5 py-4 sm:flex-row">
          <p className="mr-auto self-center text-xs text-muted-foreground">
            Enterrel kiválasztható, Tab billentyűvel bejárható.
          </p>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            Bezárás
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function FilterSection({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function FilterToggle({
  checked,
  onClick,
  icon,
  title,
  description,
}: {
  checked: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        checked
          ? 'border-primary/20 bg-primary/[0.055]'
          : 'border-border/70 bg-muted/25 opacity-65 hover:opacity-100',
      )}
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-card shadow-sm ring-1 ring-border/60">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{description}</span>
      </span>
      <span className={cn(
        'inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors motion-reduce:transition-none',
        checked ? 'justify-end bg-primary' : 'justify-start bg-muted-foreground/25',
      )}>
        <span className="size-5 rounded-full bg-white shadow-sm" />
      </span>
    </button>
  )
}

function FamilyGraphLoading() {
  return (
    <section
      className="relative isolate min-h-[35rem] overflow-hidden rounded-[1.75rem] border border-[#b4ddd5]/15 bg-[#071b1c] px-5 py-6 text-white sm:rounded-[2rem] sm:px-7 sm:py-7"
      aria-busy="true"
      aria-live="polite"
    >
      <GraphBackdrop />
      <div className="relative z-10 flex items-center gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-2xl border border-teal-200/10 bg-teal-200/[0.07] text-teal-200">
          <LoaderCircle className="size-5 motion-safe:animate-spin" />
        </span>
        <div>
          <p className="font-heading text-lg font-semibold">Kirajzoljuk a kapcsolatokat…</p>
          <p className="mt-0.5 text-xs text-teal-50/45">A családok és személyek biztonságos betöltése folyamatban van.</p>
        </div>
      </div>

      {/* 2026-07-24 (PR-5 F8.4): Kartotéka-logós betöltő — a desktop-splash
          halo-mintája a galaxis csillagtere fölött (motion-reduce: statikus). */}
      <div className="relative z-10 mt-10 flex min-h-[25rem] items-center justify-center">
        <div className="relative flex flex-col items-center">
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(148,222,209,0.22),rgba(251,213,130,0.10)_45%,transparent_70%)] blur-2xl motion-safe:animate-pulse sm:size-80"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/KARTOTEKA_V3.png"
            alt=""
            aria-hidden
            className="relative size-28 select-none object-contain drop-shadow-[0_18px_40px_rgba(148,222,209,0.35)] motion-safe:animate-[pulse_2.4s_ease-in-out_infinite] sm:size-36"
            draggable={false}
          />
          <div className="relative mt-6 h-1 w-44 overflow-hidden rounded-full bg-white/10 sm:w-56">
            <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-teal-300/70 to-amber-200/80 motion-safe:animate-[kt-loading-sweep_1.6s_ease-in-out_infinite] motion-reduce:w-full" />
          </div>
          <style>{`@keyframes kt-loading-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
        </div>
      </div>
    </section>
  )
}

function FamilyGraphError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="relative isolate flex min-h-[31rem] items-center justify-center overflow-hidden rounded-[1.75rem] border border-rose-200/15 bg-[#071b1c] px-5 py-10 text-center text-white sm:rounded-[2rem]">
      <GraphBackdrop />
      <div className="relative z-10 max-w-md">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl border border-rose-200/15 bg-rose-200/10 text-rose-200">
          <AlertTriangle className="size-6" />
        </span>
        <h2 className="mt-4 font-heading text-xl font-semibold">A családi háló nem töltődött be</h2>
        <p className="mt-2 text-sm leading-6 text-teal-50/55">{message}</p>
        <Button
          type="button"
          onClick={onRetry}
          className="mt-5 min-h-11 rounded-xl bg-teal-100 text-[#123330] hover:bg-white"
        >
          <RotateCcw className="size-4" />
          Újrapróbálom
        </Button>
      </div>
    </section>
  )
}

function FamilyGraphEmpty() {
  return (
    <section className="relative isolate flex min-h-[31rem] items-center justify-center overflow-hidden rounded-[1.75rem] border border-[#b4ddd5]/15 bg-[#071b1c] px-5 py-10 text-center text-white sm:rounded-[2rem]">
      <GraphBackdrop />
      <div className="relative z-10 max-w-md">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl border border-amber-200/15 bg-amber-200/10 text-amber-200">
          <Network className="size-6" />
        </span>
        <h2 className="mt-4 font-heading text-xl font-semibold">Még nincs kirajzolható kapcsolat</h2>
        <p className="mt-2 text-sm leading-6 text-teal-50/55">
          A családok már feloldották ezt a nézetet, de a személyek között még nincs elegendő kapcsolati adat.
        </p>
      </div>
    </section>
  )
}
