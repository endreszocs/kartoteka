'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, BarChart3, ChevronsUpDown, Edit2, Grid3x3, Home, List, MapPin, Search, Sparkles, Trash2, Users2, X } from 'lucide-react'
import { toast } from 'sonner'

import { deleteFamily, getFamilies, type FamilyRow } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { getDistricts, type DistrictRow } from '@/app/(dashboard)/tagnyilvantartas/presbyter-actions'
import { FamilyFormDialog } from '@/components/modals/family-form-dialog'
import { FamilyDetailsDialogRefined } from '@/components/modals/family-details-dialog-refined'
import {
  FamilyCardPreview,
  familyRowToCardData,
  districtsToMap,
} from '@/components/modals/family-card-preview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNameWithPrefix } from '@/lib/utils/member-helpers'

type SortKey = 'head' | 'spouse' | 'address' | 'district' | 'status'
type SortDir = 'asc' | 'desc'
// 2026-06-02: a `deceased` szűrő azokat a családokat mutatja, ahol minden
// rögzített felnőtt fél elhunyt (üres család = nincs senki). Az `inactive`
// külön kategória a manuálisan lezárt háztartásokra (isaktiv=false).
type StatusFilter = 'all' | 'active' | 'deceased' | 'inactive'

export function FamiliesTab() {
  const [families, setFamilies] = useState<FamilyRow[]>([])
  const [districts, setDistricts] = useState<DistrictRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsId, setDetailsId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editFamily, setEditFamily] = useState<FamilyRow | null>(null)
  // 2026-04-19: alapértelmezetten a statisztikai kártyák rejtve,
  // csak a lista látszik. A „Kartonok/statisztikák" gomb mutatja meg.
  const [showCards, setShowCards] = useState(false)

  // 2026-05-02 (Sprint U.3 / 4. pont): sortolás + körzet/státusz szűrés
  const [sortKey, setSortKey] = useState<SortKey>('head')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [districtFilter, setDistrictFilter] = useState<number | 'all' | 'none'>('all')
  // 2026-06-02: alapértelmezetten csak az ÉLŐ családok látszanak — a
  // tagnyilvántartás napi munkájához ez a releváns nézet. Az elhunyt /
  // inaktív családok továbbra is elérhetők a chip-ekkel.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  // 2026-06-02: lista vs. kártya nézet — sticky lokál-tárolva.
  // Default: kártya (átláthatóbb, vizuálisabb).
  const [viewMode, setViewMode] = useState<'list' | 'cards'>(() => {
    if (typeof window === 'undefined') return 'cards'
    try {
      const saved = localStorage.getItem('kartoteka.families.viewMode')
      return saved === 'list' ? 'list' : 'cards'
    } catch { return 'cards' }
  })
  function changeViewMode(v: 'list' | 'cards') {
    setViewMode(v)
    try { localStorage.setItem('kartoteka.families.viewMode', v) } catch {}
  }
  const districtMap = useMemo(() => districtsToMap(districts), [districts])

  const loadFamilies = useCallback(async () => {
    const data = await getFamilies()
    setFamilies(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void loadFamilies()
        // Körzetek a szűrőhöz — csak egyszer
        getDistricts().then((d) => {
          if (!cancelled) setDistricts(d)
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [loadFamilies])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // ── Szűrés (search + körzet + státusz) ──
  const searchFiltered = useMemo(() => {
    let arr = families
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      arr = arr.filter((family) => {
        const husband = family.ferfi ? `${family.ferfi.csaladnev} ${family.ferfi.k_nev}`.toLowerCase() : ''
        const wife = family.no ? `${family.no.csaladnev} ${family.no.k_nev}`.toLowerCase() : ''
        const address = `${family.utca?.name || ''} ${family.c_szam || ''}`.toLowerCase()
        return husband.includes(query) || wife.includes(query) || address.includes(query)
      })
    }
    if (districtFilter === 'none') {
      arr = arr.filter((f) => !f.id_csoport)
    } else if (districtFilter !== 'all') {
      arr = arr.filter((f) => f.id_csoport === districtFilter)
    }
    // 2026-06-02: szűrés státusz szerint.
    // - active:   legalább egy rögzített felnőtt él (nem meghalt)
    // - deceased: minden rögzített felnőtt elhunyt
    // - inactive: a háztartás kézzel lezárva (isaktiv=false)
    if (statusFilter === 'active') {
      arr = arr.filter((f) => {
        if (!f.isaktiv) return false
        const adults = [f.ferfi, f.no].filter(Boolean) as NonNullable<FamilyRow['ferfi']>[]
        if (adults.length === 0) return false
        return adults.some((a) => !a.meghalt)
      })
    } else if (statusFilter === 'deceased') {
      arr = arr.filter((f) => {
        const adults = [f.ferfi, f.no].filter(Boolean) as NonNullable<FamilyRow['ferfi']>[]
        if (adults.length === 0) return false // üres család nem "elhunyt"
        return adults.every((a) => a.meghalt)
      })
    } else if (statusFilter === 'inactive') {
      arr = arr.filter((f) => !f.isaktiv)
    }
    return arr
  }, [families, searchQuery, districtFilter, statusFilter])

  // ── Sortolás ──
  const districtNameById = useMemo(() => {
    const m = new Map<number, string>()
    for (const d of districts) m.set(d.id, d.nev)
    return m
  }, [districts])

  const filtered = useMemo(() => {
    const arr = [...searchFiltered]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const get = (f: FamilyRow): string => {
        switch (sortKey) {
          case 'head': {
            const head = f.ferfi || f.no
            return head ? `${head.csaladnev || ''} ${head.k_nev || ''}` : ''
          }
          case 'spouse': {
            const spouse = f.ferfi && f.no ? f.no : null
            return spouse ? `${spouse.csaladnev || ''} ${spouse.k_nev || ''}` : ''
          }
          case 'address':
            return `${f.utca?.name || ''} ${f.c_szam || ''}`.trim()
          case 'district':
            return f.id_csoport ? districtNameById.get(f.id_csoport) || '' : ''
          case 'status':
            return f.isaktiv ? '1' : '0'
          default:
            return ''
        }
      }
      const va = get(a).toLowerCase()
      const vb = get(b).toLowerCase()
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
    return arr
  }, [searchFiltered, sortKey, sortDir, districtNameById])

  // 2026-06-02: új statisztika-számolók a teljes `families`-en (nem a filtered-en),
  // hogy az áttekintés ne ugráljon a szűrőkkel. A „Hiányzó cím" + „Hiányzó körzet"
  // KPI-k azonnal mutatják mennyit kell pótolni.
  const totalFamilies = families.length
  const livingFamilies = families.filter((f) => {
    if (!f.isaktiv) return false
    const adults = [f.ferfi, f.no].filter(Boolean) as NonNullable<FamilyRow['ferfi']>[]
    if (adults.length === 0) return false
    return adults.some((a) => !a.meghalt)
  }).length
  const deceasedFamilies = families.filter((f) => {
    const adults = [f.ferfi, f.no].filter(Boolean) as NonNullable<FamilyRow['ferfi']>[]
    return adults.length > 0 && adults.every((a) => a.meghalt)
  }).length
  const addressMissing = families.filter((f) => !f.utca?.name || !f.c_szam).length
  const districtMissing = families.filter((f) => f.id_csoport == null).length
  // Megjegyzés: a régi „aktív / mixedConfession / singledStatus" stat-okat
  // kivettük — a fizetési-státusz-alapú új KPI-kre fogunk áttérni Fázis 3-ban.
  const singledStatusCounts = filtered.reduce((acc, family) => {
    const adults = [family.ferfi, family.no].filter(Boolean)
    adults.forEach((adult) => {
      if (adult?.allapot === 'özvegy') acc.widowed += 1
      if (adult?.allapot === 'elvált') acc.divorced += 1
    })

    if (
      adults.length === 1 &&
      adults[0]?.allapot !== 'özvegy' &&
      adults[0]?.allapot !== 'elvált'
    ) {
      acc.single += 1
    }

    return acc
  }, { widowed: 0, single: 0, divorced: 0 })

  async function handleDelete(id: number, event: React.MouseEvent) {
    event.stopPropagation()
    if (!confirm('Biztosan törlöd vagy felbontod ezt a családot?')) return

    const result = await deleteFamily(id)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success('A családi kapcsolat törölve lett.')
    setLoading(true)
    await loadFamilies()
  }

  function openDetails(id: number) {
    setDetailsId(id)
    setDetailsOpen(true)
  }

  function handleFormClose() {
    setFormOpen(false)
    setEditFamily(null)
    setLoading(true)
    void loadFamilies()
  }

  return (
    <div className="space-y-4">
      {/* 2026-06-02 — Új áttekintő-blokk: 4 KPI-kártya egy szép gradient-soron */}
      {showCards && (
        <div className="rounded-[1.4rem] border border-violet-100 bg-gradient-to-br from-violet-50/80 via-white to-emerald-50/60 p-4 sm:p-5 shadow-sm relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCards(false)}
            className="absolute top-3 right-3 rounded-full text-slate-400 hover:text-slate-700"
            title="Elrejtés"
          >
            <X className="size-4" />
          </Button>
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600/70">
              Áttekintés
            </p>
            <h3 className="mt-1 font-heading text-2xl text-slate-800">
              Családi adatok pillanatképe
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Az összes regisztrált család a gyülekezetben — élő, elhunyt és hiányzó-adat csoportokra bontva.
            </p>
          </div>

          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <KpiCard
              tone="violet"
              icon={<Home className="size-4" />}
              label="Összes család"
              value={totalFamilies}
              hint={`${livingFamilies} élő · ${deceasedFamilies} elhunyt`}
            />
            <KpiCard
              tone="emerald"
              icon={<Sparkles className="size-4" />}
              label="Élő családok"
              value={livingFamilies}
              hint="Legalább egy felnőtt tag él"
            />
            <KpiCard
              tone="amber"
              icon={<MapPin className="size-4" />}
              label="Cím hiányzik"
              value={addressMissing}
              hint="Pótlandó utca vagy házszám"
            />
            <KpiCard
              tone="rose"
              icon={<Users2 className="size-4" />}
              label="Körzet nélkül"
              value={districtMissing}
              hint="Még nincs hozzárendelve körzet"
            />
          </div>
        </div>
      )}

      <div className="card-raised p-3 sm:p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Keresés név vagy cím alapján..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9 bg-white shadow-sm border-slate-300"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
              {filtered.length} találat
            </span>
            {/* 2026-06-02: lista / kártya nézet-váltó */}
            <div className="inline-flex rounded-full bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => changeViewMode('list')}
                title="Lista nézet"
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
                  viewMode === 'list' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <List className="size-3.5" />
                Lista
              </button>
              <button
                type="button"
                onClick={() => changeViewMode('cards')}
                title="Kártya nézet"
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
                  viewMode === 'cards' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Grid3x3 className="size-3.5" />
                Kártyák
              </button>
            </div>
            {!showCards && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCards(true)}
                className="rounded-full gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
              >
                <BarChart3 className="size-3.5" />
                Kartonok / Statisztikák
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setFormOpen(true)}
              className="rounded-full bg-violet-600 hover:bg-violet-700 gap-1"
            >
              + Új család
            </Button>
          </div>
        </div>

        {/* Szűrők: státusz + körzet (chip-ek) */}
        <div className="flex flex-wrap items-center gap-2 border-t border-violet-100/70 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Státusz:</span>
          {(['all', 'active', 'deceased', 'inactive'] as const).map((s) => {
            const labels: Record<typeof s, string> = {
              all: 'Mind',
              active: 'Élő',
              deceased: 'Elhunyt',
              inactive: 'Inaktív',
            }
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  statusFilter === s ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                }`}
                title={
                  s === 'active' ? 'Legalább egy felnőtt tag még él' :
                  s === 'deceased' ? 'Minden rögzített felnőtt elhunyt' :
                  s === 'inactive' ? 'A háztartás kézzel lezárva' : ''
                }
              >
                {labels[s]}
              </button>
            )
          })}

          {districts.length > 0 && (
            <>
              <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Körzet:</span>
              <button
                type="button"
                onClick={() => setDistrictFilter('all')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  districtFilter === 'all' ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                }`}
              >
                Mind
              </button>
              <button
                type="button"
                onClick={() => setDistrictFilter('none')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  districtFilter === 'none' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title="Olyan családok, amelyek nincsenek körzethez rendelve"
              >
                Körzet nélkül
              </button>
              {districts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDistrictFilter(d.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    districtFilter === d.id ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                  }`}
                >
                  {d.nev}
                </button>
              ))}
            </>
          )}

          {(statusFilter !== 'active' || districtFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('active')
                setDistrictFilter('all')
                setSearchQuery('')
              }}
              className="ml-auto rounded-full px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
            >
              <X className="size-3" /> Szűrők törlése
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card-raised px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-[1.4rem] bg-violet-50 text-violet-700">
            <Users2 className="size-8 animate-pulse" />
          </div>
          <p className="text-base font-semibold text-slate-700">Családi kartoték betöltése folyamatban</p>
          <p className="mt-2 text-sm text-slate-400">Összerendezzük a háztartásokat, a szerepeket és az állapotjelzéseket.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-raised p-8 text-center text-slate-500">Nincs a keresésnek megfelelő család.</div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((family) => (
            <FamilyCardPreview
              key={family.id}
              data={familyRowToCardData(family, { districtMap })}
              compact
              onClick={() => openDetails(family.id)}
            />
          ))}
        </div>
      ) : (
        <div className="card-raised overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="border-b border-white/60 bg-gradient-to-r from-violet-50 via-white to-teal-50">
                <tr>
                  <SortableHeader label="Családfő" sortKey="head" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHeader label="Társ" sortKey="spouse" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Háztartás képe</th>
                  <SortableHeader label="Lakcím" sortKey="address" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHeader label="Körzet" sortKey="district" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHeader label="Állapot" sortKey="status" current={sortKey} dir={sortDir} onClick={toggleSort} align="center" />
                  <th className="p-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Művelet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/60">
                {filtered.map((family) => {
                  const householdLabel = family.ferfi && family.no ? 'Házaspár alapú család' : 'Egytagú vagy részben rögzített háztartás'

                  // CSALÁDFŐ logika: a férj VAGY nő (az aki van). Ha mindkettő van,
                  // a férj a családfő, a nő a társ. Ha csak nő van (özvegy / egyedülálló
                  // anya), a nő a családfő, és a "Társ" oszlopban "Nincs megadva" jelzés.
                  const head = family.ferfi || family.no
                  const spouse = family.ferfi && family.no ? family.no : null
                  const headIsFerfi = !!family.ferfi
                  const spouseDeceased = head
                    ? (head.id === family.ferfi?.id ? family.no?.meghalt : family.ferfi?.meghalt)
                    : false

                  return (
                    <tr
                      key={family.id}
                      className="cursor-pointer bg-white/86 transition hover:bg-violet-50/55"
                      onClick={() => openDetails(family.id)}
                    >
                      <td className="p-3">
                        <PersonCell
                          name={head ? formatNameWithPrefix(head, spouseDeceased) : 'Nincs megadva'}
                          meta={head?.allapot || 'családfő'}
                          tone={headIsFerfi ? 'blue' : 'pink'}
                          role="head"
                        />
                      </td>
                      <td className="p-3">
                        <PersonCell
                          name={spouse ? formatNameWithPrefix(spouse, head?.meghalt) : 'Nincs megadva'}
                          meta={spouse?.allapot || 'családtag'}
                          tone={headIsFerfi ? 'pink' : 'blue'}
                          role="spouse"
                        />
                      </td>
                      <td className="p-3">
                        <div className="rounded-[1.1rem] bg-slate-50/85 px-3 py-2">
                          <p className="text-sm font-semibold text-slate-700">{householdLabel}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {family.id_csoport ? 'Körzethez kapcsolt család' : 'Szabad családi karton'}
                          </p>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
                          <MapPin className="size-3.5 text-violet-500" />
                          {family.utca?.name || 'Nincs utca'} {family.c_szam || ''}
                        </div>
                      </td>
                      <td className="p-3">
                        {family.id_csoport ? (
                          <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                            {districtNameById.get(family.id_csoport) || `#${family.id_csoport}`}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            family.isaktiv ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {family.isaktiv ? 'Aktív' : 'Inaktív'}
                        </span>
                      </td>
                      <td className="p-3" onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-full px-3 text-slate-500 hover:text-violet-700"
                            onClick={() => {
                              setEditFamily(family)
                              setFormOpen(true)
                            }}
                          >
                            <Edit2 className="mr-1 size-3.5" />
                            Szerk.
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-full px-3 text-slate-500 hover:text-red-600"
                            onClick={(event) => handleDelete(family.id, event)}
                          >
                            <Trash2 className="mr-1 size-3.5" />
                            Törlés
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <FamilyDetailsDialogRefined open={detailsOpen} onOpenChange={setDetailsOpen} familyId={detailsId} />
      <FamilyFormDialog open={formOpen} onOpenChange={handleFormClose} editFamily={editFamily} />
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
  return (
    <th
      className={`p-3 text-${align} text-xs font-semibold uppercase tracking-[0.18em] text-slate-500`}
    >
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1.5 transition hover:text-violet-700 ${
          active ? 'text-violet-700' : ''
        }`}
        title={`Rendezés: ${label} (${active ? (dir === 'asc' ? 'növekvő' : 'csökkenő') : 'kattints'})`}
      >
        {label}
        <Icon className="size-3" strokeWidth={2.2} />
      </button>
    </th>
  )
}

function MiniStat({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="rounded-[1.4rem] bg-white/85 px-4 py-4 shadow-[0_18px_36px_-32px_rgba(15,23,42,0.22)]">
      <div className="flex items-center gap-2 text-violet-600">{icon}</div>
      <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <div className="mt-2 text-2xl font-semibold text-slate-800">{value}</div>
    </div>
  )
}

// 2026-06-02: új KPI-kártya az áttekintő-blokkhoz — színes accent + hint sor.
function KpiCard({
  tone,
  icon,
  label,
  value,
  hint,
}: {
  tone: 'violet' | 'emerald' | 'amber' | 'rose'
  icon: React.ReactNode
  label: string
  value: number
  hint: string
}) {
  const TONES: Record<typeof tone, { ring: string; accent: string; valueClr: string }> = {
    violet: { ring: 'border-violet-200', accent: 'bg-violet-100 text-violet-700', valueClr: 'text-violet-900' },
    emerald: { ring: 'border-emerald-200', accent: 'bg-emerald-100 text-emerald-700', valueClr: 'text-emerald-900' },
    amber: { ring: 'border-amber-200', accent: 'bg-amber-100 text-amber-700', valueClr: 'text-amber-900' },
    rose: { ring: 'border-rose-200', accent: 'bg-rose-100 text-rose-700', valueClr: 'text-rose-900' },
  }
  const t = TONES[tone]
  return (
    <div className={`rounded-2xl bg-white border ${t.ring} p-4 shadow-sm flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-slate-500">
          {label}
        </span>
        <span className={`inline-flex items-center justify-center size-7 rounded-full ${t.accent}`}>
          {icon}
        </span>
      </div>
      <div className={`text-3xl font-bold leading-tight ${t.valueClr}`}>{value}</div>
      <div className="text-[11px] text-slate-500 leading-relaxed">{hint}</div>
    </div>
  )
}

function StatSplit({ left, right }: { left: string; right: string }) {
  return (
    <div className="grid gap-1 text-sm text-slate-700">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  )
}

function MiniNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs font-medium text-slate-500">{children}</p>
}

function PersonCell({
  name,
  meta,
  tone,
  role,
}: {
  name: string
  meta: string
  tone: 'blue' | 'pink'
  role: 'head' | 'spouse'
}) {
  const toneClassName =
    tone === 'blue' ? 'bg-sky-100 text-sky-700' : 'bg-pink-100 text-pink-700'

  return (
    <div className="space-y-2">
      <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClassName}`}>
        {role === 'head' ? 'Fő ág' : 'Társ'}
      </div>
      <div>
        <p className="font-semibold text-slate-800">{name}</p>
        <p className="text-xs text-slate-500">{meta}</p>
      </div>
    </div>
  )
}

