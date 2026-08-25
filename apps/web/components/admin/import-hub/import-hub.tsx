'use client'

/**
 * Admin Import-hub (2026-07-11).
 *
 * A rendszergazda EGY helyről importálhat BÁRMELYIK gyülekezethez: tagokat,
 * anyakönyvet, pénzügyet, munkanaplót, iktatót stb. Folyamat:
 *   1. Cél-gyülekezet kiválasztása (kereshető, név + egyházmegye).
 *   2. Modul-kártya választása.
 *   3. A modul importfelülete a lapon belül nyílik meg, a cél-gyülekezethez kötve.
 *
 * A cél-gyülekezetet a szerver-oldali import-actionök `targetCongregationId`-ként
 * kapják, és ott fut a jogosultság + egyházkerületi hatókör ellenőrzése.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderArchive,
  NotebookPen,
  Package2,
  Search,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { getCongregations } from '@/app/(dashboard)/admin/actions'
import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'
import { HubMembersImport } from '@/components/admin/import-hub/hub-members-import'
import { ModuleAdminImportTabV2 } from '@/components/shared/module-admin-import-tab-v2'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ImportModule, ImportProfile } from '@/lib/import/import-profiles'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface HubCongregation {
  id: string
  name: string
  dioceseName: string | null
}

interface ModuleMeta {
  key: ImportModule
  label: string
  description: string
  icon: LucideIcon
  /** 'wizard' = vezetett tagnyilvántartás; 'multisheet' = közös multi-sheet; 'soon' = nincs profil. */
  kind: 'wizard' | 'multisheet' | 'soon'
}

const MODULE_META: ModuleMeta[] = [
  {
    key: 'members',
    label: 'Tagnyilvántartás',
    description: 'Személyek és családok vezetett importja (oszlop-párosítással, helység-egyeztetéssel).',
    icon: Users,
    kind: 'wizard',
  },
  {
    key: 'registry',
    label: 'Anyakönyv',
    description: 'Keresztelő, konfirmáció, esketés, temetés és be-/kiköltözés Excel-importja.',
    icon: BookOpen,
    kind: 'multisheet',
  },
  {
    key: 'finance',
    label: 'Pénzügy',
    description: 'Bevételek, kiadások és kassza-tételek kötegelt beolvasása.',
    icon: Wallet,
    kind: 'multisheet',
  },
  {
    key: 'worklog',
    label: 'Munkanapló',
    description: 'Igehirdetések, katekézis és látogatások naplóbejegyzései.',
    icon: NotebookPen,
    kind: 'multisheet',
  },
  {
    key: 'filing',
    label: 'Iktató',
    description: 'Iktatókönyvi bejegyzések (érkeztetés, tárgy, ügyintéző) importja.',
    icon: FolderArchive,
    kind: 'multisheet',
  },
  {
    key: 'inventory',
    label: 'Leltár',
    description: 'Eszköz- és leltárnyilvántartás importja (egyszerű lista). A hivatalos Leltar 3_43 munkafüzetet a Leltár modul rendszergazdai importáló füle fogadja.',
    icon: Package2,
    // 2026-08-26 (Leltar 3_43 kör): 'soon' → valódi multi-sheet út.
    kind: 'multisheet',
  },
]

const MODULE_TITLE: Record<ImportModule, string> = {
  members: 'Tagnyilvántartás-import',
  registry: 'Anyakönyvi import',
  finance: 'Pénzügyi import',
  worklog: 'Munkanapló-import',
  filing: 'Iktató-import',
  inventory: 'Leltár-import',
}

interface ImportHubProps {
  /** Modulonkénti multi-sheet import-profilok (a szerver-oldali page.tsx tölti be). */
  importProfilesByModule: Partial<Record<ImportModule, ImportProfile[]>>
}

// ─────────────────────────────────────────────────────────────────
// Komponens
// ─────────────────────────────────────────────────────────────────

export function ImportHub({ importProfilesByModule }: ImportHubProps) {
  const [congregations, setCongregations] = useState<HubCongregation[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<HubCongregation | null>(null)
  const [picking, setPicking] = useState(true)
  const [query, setQuery] = useState('')
  const [activeModule, setActiveModule] = useState<ImportModule | null>(null)

  // Gyülekezetek betöltése (admin + kerületi hatókör a szerver-actionben)
  useEffect(() => {
    let cancelled = false
    getCongregations()
      .then((result) => {
        if (cancelled) return
        if ('error' in result && result.error) {
          setLoadError(result.error)
          setCongregations([])
          return
        }
        type Row = {
          id: string
          nev_hu?: string | null
          name?: string | null
          dioceses?: { name?: string | null } | { name?: string | null }[] | null
        }
        const raw = 'data' in result && Array.isArray(result.data) ? result.data : []
        const rows = raw as unknown as Row[]
        const mapped: HubCongregation[] = rows.map((c) => {
          const dioceseRel = c.dioceses
          const dioceseName = Array.isArray(dioceseRel)
            ? dioceseRel[0]?.name ?? null
            : dioceseRel?.name ?? null
          return {
            id: c.id,
            name: c.nev_hu || c.name || 'Névtelen gyülekezet',
            dioceseName,
          }
        })
        setCongregations(mapped)
      })
      .catch(() => {
        if (cancelled) return
        setLoadError('A gyülekezetek betöltése sikertelen.')
        setCongregations([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    if (!congregations) return []
    const q = query.trim().toLowerCase()
    if (!q) return congregations
    return congregations.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.dioceseName || '').toLowerCase().includes(q),
    )
  }, [congregations, query])

  function handleSelect(c: HubCongregation) {
    setSelected(c)
    setPicking(false)
    setActiveModule(null)
    if (loadError) setLoadError(null)
  }

  return (
    <div className="space-y-4">
      {/* ── 1. Cél-gyülekezet választó ─────────────────────────── */}
      <section className="card-raised p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Building2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg text-foreground">Cél gyülekezet</h2>
            <p className="text-xs text-muted-foreground">
              Válaszd ki, melyik gyülekezethez importálsz. A kereső a névre és az egyházmegyére is szűr.
            </p>
          </div>
        </div>

        {/* Kiválasztott állapot */}
        {selected && !picking ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{selected.name}</p>
              {selected.dioceseName && (
                <p className="truncate text-xs text-muted-foreground">{selected.dioceseName}</p>
              )}
            </div>
            <Button variant="outline" onClick={() => setPicking(true)} className="gap-1.5">
              <ChevronLeft className="size-4" />
              Módosítás
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Gyülekezet vagy egyházmegye keresése…"
                className="h-11 pl-9"
                aria-label="Gyülekezet keresése"
              />
            </div>

            {congregations === null ? (
              <AdminSkeleton rows={4} />
            ) : loadError ? (
              <AdminEmptyState
                icon={Building2}
                title="Nem sikerült betölteni a gyülekezeteket"
                hint={loadError}
              />
            ) : filtered.length === 0 ? (
              <AdminEmptyState
                icon={Search}
                title="Nincs találat"
                hint="Próbálj más keresőszót, vagy töröld a szűrést."
              />
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto rounded-2xl border border-border p-1">
                {filtered.map((c) => {
                  const isActive = selected?.id === c.id
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(c)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-muted/60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{c.name}</span>
                          {c.dioceseName && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {c.dioceseName}
                            </span>
                          )}
                        </span>
                        {isActive ? (
                          <Check className="size-4 shrink-0 text-primary" />
                        ) : (
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ── 2. Modul-kártyák ───────────────────────────────────── */}
      {selected && !picking && (
        <section className="space-y-3">
          <h2 className="font-heading text-lg text-foreground">Mit importálsz?</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MODULE_META.map((m) => {
              const count = importProfilesByModule[m.key]?.length ?? 0
              const soon = m.kind === 'soon' || (m.kind === 'multisheet' && count === 0)
              const isActive = activeModule === m.key
              return (
                <ModuleCard
                  key={m.key}
                  meta={m}
                  profileCount={count}
                  soon={soon}
                  active={isActive}
                  onClick={() => {
                    if (soon) return
                    setActiveModule(isActive ? null : m.key)
                  }}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* ── 3. Modul importfelülete ────────────────────────────── */}
      {selected && !picking && activeModule && (
        <section className="space-y-3">
          {activeModule === 'members' ? (
            <HubMembersImport congregationId={selected.id} congregationName={selected.name} />
          ) : (
            <ModuleAdminImportTabV2
              moduleKey={activeModule}
              moduleLabel={MODULE_META.find((m) => m.key === activeModule)?.label || activeModule}
              title={MODULE_TITLE[activeModule]}
              description=""
              congregationName={selected.name}
              isGodMode
              isDelegatedImport={false}
              profiles={[]}
              importProfiles={importProfilesByModule[activeModule] ?? []}
              importModule={activeModule}
              targetCongregationId={selected.id}
              targetCongregationName={selected.name}
            />
          )}
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ModuleCard
// ─────────────────────────────────────────────────────────────────

function ModuleCard({
  meta,
  profileCount,
  soon,
  active,
  onClick,
}: {
  meta: ModuleMeta
  profileCount: number
  soon: boolean
  active: boolean
  onClick: () => void
}) {
  const Icon = meta.icon
  const badge =
    meta.kind === 'wizard'
      ? 'Vezetett import'
      : soon
        ? 'Hamarosan'
        : `${profileCount} profil`

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={soon}
      aria-pressed={active}
      className={`flex h-full flex-col rounded-2xl border p-4 text-left transition ${
        soon
          ? 'cursor-not-allowed border-border bg-muted/30 opacity-70'
          : active
            ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
            : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
            active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-base text-foreground">{meta.label}</p>
          <span className="text-xs font-medium text-muted-foreground">{badge}</span>
        </div>
        {!soon && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{meta.description}</p>
    </button>
  )
}
