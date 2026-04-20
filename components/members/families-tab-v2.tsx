'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Edit2, Home, MapPin, Search, Sparkles, Trash2, Users2, X } from 'lucide-react'
import { toast } from 'sonner'

import { deleteFamily, getFamilies, type FamilyRow } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { FamilyFormDialog } from '@/components/modals/family-form-dialog'
import { FamilyDetailsDialogRefined } from '@/components/modals/family-details-dialog-refined'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNameWithPrefix } from '@/lib/utils/member-helpers'

export function FamiliesTab() {
  const [families, setFamilies] = useState<FamilyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsId, setDetailsId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editFamily, setEditFamily] = useState<FamilyRow | null>(null)
  // 2026-04-19: alapértelmezetten a statisztikai kártyák rejtve,
  // csak a lista látszik. A „Kartonok/statisztikák" gomb mutatja meg.
  const [showCards, setShowCards] = useState(false)

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
      }
    })
    return () => {
      cancelled = true
    }
  }, [loadFamilies])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return families
    const query = searchQuery.toLowerCase()
    return families.filter((family) => {
      const husband = family.ferfi ? `${family.ferfi.csaladnev} ${family.ferfi.k_nev}`.toLowerCase() : ''
      const wife = family.no ? `${family.no.csaladnev} ${family.no.k_nev}`.toLowerCase() : ''
      const address = `${family.utca?.name || ''} ${family.c_szam || ''}`.toLowerCase()
      return husband.includes(query) || wife.includes(query) || address.includes(query)
    })
  }, [families, searchQuery])

  const totalFamilies = filtered.length
  const activeFamilies = filtered.filter((family) => family.isaktiv).length
  const mixedConfessionFamilies = filtered.filter((family) =>
    family.ferfi &&
    family.no &&
    (family.ferfi.vallas || 'Református').trim().toLowerCase() !== (family.no.vallas || 'Református').trim().toLowerCase()
  ).length
  const sameConfessionFamilies = filtered.filter((family) =>
    family.ferfi &&
    family.no &&
    (family.ferfi.vallas || 'Református').trim().toLowerCase() === (family.no.vallas || 'Református').trim().toLowerCase()
  ).length
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
      {/* Statisztikai kártyák — alapértelmezetten rejtve, a "Kartonok" gomb mutatja meg. */}
      {showCards && (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="card-raised p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600/70">Családi kartonok</p>
                  <h3 className="mt-1 font-heading text-2xl text-slate-800">Otthonosabb, átláthatóbb családnézet</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    A családok most már egy gazdagabb áttekintő táblában jelennek meg, ahol gyorsabban látszik az állapot, a háztartás szerkezete és a lakcím is.
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCards(false)}
                  className="rounded-full text-slate-500 hover:text-slate-700"
                  title="Elrejtés"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <MiniStat label="Összes család" value={<>{totalFamilies}<MiniNote>Aktív: {activeFamilies}</MiniNote></>} icon={<Home className="size-4" />} />
              <MiniStat label="Vegyes és egyező" value={<StatSplit left={`Vegyes: ${mixedConfessionFamilies}`} right={`Egyező: ${sameConfessionFamilies}`} />} icon={<Sparkles className="size-4" />} />
              <MiniStat label="Özvegy • egyedülálló • elvált" value={<><StatSplit left={`Özvegy: ${singledStatusCounts.widowed}`} right={`Egyedülálló: ${singledStatusCounts.single}`} /><MiniNote>Elvált: {singledStatusCounts.divorced}</MiniNote></>} icon={<Users2 className="size-4" />} />
            </div>
          </div>

          <div className="rounded-[1.2rem] border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-800 shadow-sm">
            <strong>Aktív család</strong> jelzés: a családi kapcsolat jelenleg élő, nem felbontott háztartásként szerepel a nyilvántartásban.
          </div>
        </>
      )}

      <div className="card-raised p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Keresés név vagy cím alapján..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
              {filtered.length} találat
            </span>
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
      ) : (
        <div className="card-raised overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b border-white/60 bg-gradient-to-r from-violet-50 via-white to-teal-50">
                <tr>
                  <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Családfő</th>
                  <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Társ</th>
                  <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Háztartás képe</th>
                  <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Lakcím</th>
                  <th className="p-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Állapot</th>
                  <th className="p-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Művelet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/60">
                {filtered.map((family) => {
                  const householdLabel = family.ferfi && family.no ? 'Házaspár alapú család' : 'Egytagú vagy részben rögzített háztartás'
                  return (
                    <tr
                      key={family.id}
                      className="cursor-pointer bg-white/86 transition hover:bg-violet-50/55"
                      onClick={() => openDetails(family.id)}
                    >
                      <td className="p-3">
                        <PersonCell
                          name={family.ferfi ? formatNameWithPrefix(family.ferfi, family.no?.meghalt) : 'Nincs megadva'}
                          meta={family.ferfi?.allapot || 'családfő'}
                          tone="blue"
                        />
                      </td>
                      <td className="p-3">
                        <PersonCell
                          name={family.no ? formatNameWithPrefix(family.no, family.ferfi?.meghalt) : 'Nincs megadva'}
                          meta={family.no?.allapot || 'családtag'}
                          tone="pink"
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

function MiniStat({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="rounded-[1.4rem] bg-white/85 px-4 py-4 shadow-[0_18px_36px_-32px_rgba(15,23,42,0.22)]">
      <div className="flex items-center gap-2 text-violet-600">{icon}</div>
      <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <div className="mt-2 text-2xl font-semibold text-slate-800">{value}</div>
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
}: {
  name: string
  meta: string
  tone: 'blue' | 'pink'
}) {
  const toneClassName =
    tone === 'blue' ? 'bg-sky-100 text-sky-700' : 'bg-pink-100 text-pink-700'

  return (
    <div className="space-y-2">
      <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClassName}`}>
        {tone === 'blue' ? 'Fő ág' : 'Társ'}
      </div>
      <div>
        <p className="font-semibold text-slate-800">{name}</p>
        <p className="text-xs text-slate-500">{meta}</p>
      </div>
    </div>
  )
}

