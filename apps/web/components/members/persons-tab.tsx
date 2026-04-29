'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MemberStatusBadge } from './member-status-badge'
import { MemberDetailsDialogV2 } from '@/components/modals/member-details-dialog-v2'
import { MemberFormDialog } from '@/components/modals/member-form-dialog'
import { MemberRemoveDialog } from '@/components/modals/member-remove-dialog'
import { FamilyDetailsDialogRefined } from '@/components/modals/family-details-dialog-refined'
import { FamilyTreeDialog } from '@/components/modals/family-tree-dialog'
import { formatNameWithPrefix, isActiveMember } from '@/lib/utils/member-helpers'
import { ageFromDate } from '@/lib/utils/date'
import { MEMBER_STATUS_FILTERS } from '@/lib/constants/members'
import type { EnrichedMember, MemberStatusFilter, SortColumn } from '@/lib/constants/members'
import { Search, UserPlus, Trash2, Cake, Link2 } from 'lucide-react'
import { useCrossCongregationNotifications } from './use-cross-congregation-notifications'

interface PersonsTabProps {
  members: EnrichedMember[]
  paidPersonIds: number[]
  personToFamilyMap: Record<number, number>
  isGodMode: boolean
  onMemberRemoved: (id: number) => void
  onMemberUpdated: (id: number, updates: Partial<EnrichedMember>) => void
  onRefresh: (members: EnrichedMember[]) => void
}

function getInitials(m: EnrichedMember): string {
  return `${(m.csaladnev || '?')[0]}${(m.k_nev || '?')[0]}`.toUpperCase()
}

function getAvatarColors(m: EnrichedMember): { bg: string; color: string } {
  if (m.ferfi) return { bg: '#dbeafe', color: '#1d4ed8' }
  return { bg: '#fce7f3', color: '#be185d' }
}

function isBirthdayThisMonth(m: EnrichedMember): boolean {
  if (!m.sz_datum) return false
  const now = new Date()
  const bd = new Date(m.sz_datum)
  return bd.getMonth() === now.getMonth()
}

export function PersonsTab({ members, paidPersonIds, personToFamilyMap, onRefresh }: PersonsTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>('aktív')
  const [sortCol, setSortCol] = useState<SortColumn>('id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsMember, setDetailsMember] = useState<EnrichedMember | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<EnrichedMember | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removingMember, setRemovingMember] = useState<{ id: number; name: string } | null>(null)

  const [treeOpen, setTreeOpen] = useState(false)
  const [treeMemberId, setTreeMemberId] = useState<number | null>(null)
  const [familyOpen, setFamilyOpen] = useState(false)
  const [familyDetailsId, setFamilyDetailsId] = useState<number | null>(null)
  const [returnToPersonAfterFamily, setReturnToPersonAfterFamily] = useState(false)

  const paidSet = useMemo(() => new Set(paidPersonIds), [paidPersonIds])

  // Cross-congregation match notifikációk — a name mellé 🔗 jelölést tesszünk
  const { notifications: crossNotifs } = useCrossCongregationNotifications()
  const crossMatchedIds = useMemo(() => {
    const set = new Set<number>()
    for (const n of crossNotifs) {
      set.add(n.triggering_szemely_id)
      set.add(n.matched_szemely_id)
    }
    return set
  }, [crossNotifs])

  const filtered = useMemo(() => {
    const query = searchQuery.toLowerCase()
    const result = members.filter(m => {
      if (query) {
        const nameMatch = `${m.csaladnev || ''} ${m.k_nev || ''}`.toLowerCase().includes(query)
        const addrMatch = `${m.adrlocality?.name || ''} ${m.adrstreet?.name || ''} ${m.c_szam || ''}`.toLowerCase().includes(query)
        if (!nameMatch && !addrMatch) return false
      }
      if (statusFilter === 'aktív') return isActiveMember(m, paidSet)
      if (statusFilter === 'meghalt') return m.meghalt
      if (statusFilter === 'elkoltozott') return m.elkoltozott
      if (statusFilter === 'kitert') return m.member_status === 'kitért'
      if (statusFilter === 'mas_vallasu') { const v = (m.vallas || '').trim().toLowerCase(); return v !== '' && v !== 'református' && !m.meghalt }
      if (statusFilter === 'lebego') return m.familyId === null && !m.meghalt && !m.elkoltozott
      return true
    })

    result.sort((a, b) => {
      let valA: string | number, valB: string | number
      switch (sortCol) {
        case 'name': valA = `${a.csaladnev || ''} ${a.k_nev || ''}`.toLowerCase(); valB = `${b.csaladnev || ''} ${b.k_nev || ''}`.toLowerCase(); break
        case 'age': case 'birth': valA = a.sz_datum || '9999'; valB = b.sz_datum || '9999'; break
        case 'address': valA = `${a.adrlocality?.name || ''}`.toLowerCase(); valB = `${b.adrlocality?.name || ''}`.toLowerCase(); break
        case 'job': valA = (a.foglalkozas || '').toLowerCase(); valB = (b.foglalkozas || '').toLowerCase(); break
        default: return sortDir === 'desc' ? b.id - a.id : a.id - b.id
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1
      if (valA > valB) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return result
  }, [members, searchQuery, statusFilter, sortCol, sortDir, paidSet])

  function toggleSort(col: SortColumn) { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc') } }
  function sortIcon(col: SortColumn) { if (sortCol !== col) return '↕'; return sortDir === 'asc' ? '↑' : '↓' }
  function openDetails(m: EnrichedMember) { setDetailsMember(m); setDetailsOpen(true) }
  function openEdit(m: EnrichedMember | null) { setEditingMember(m); setDetailsOpen(false); setFormOpen(true) }
  function openRemove(m: EnrichedMember) { setRemovingMember({ id: m.id, name: `${m.csaladnev || ''} ${m.k_nev || ''}`.trim() }); setRemoveOpen(true) }
  async function handleFormClose() { setFormOpen(false); setEditingMember(null); const { getMembers } = await import('@/app/(dashboard)/tagnyilvantartas/actions'); onRefresh((await getMembers()).members) }
  async function handleRemoveClose() { setRemoveOpen(false); setRemovingMember(null); const { getMembers } = await import('@/app/(dashboard)/tagnyilvantartas/actions'); onRefresh((await getMembers()).members) }

  return (
    <div className="space-y-4">
      {/* ═══ Toolbar ═══ */}
      <div className="card-raised flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex flex-1 items-center gap-3 flex-wrap">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Keresés neve, lakcíme alapján..." className="pl-10 bg-zinc-50 border-zinc-200 rounded-xl h-10" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as MemberStatusFilter)} className="rounded-xl border border-white/70 bg-white/80 px-4 py-2.5 text-sm shadow-sm">
            {MEMBER_STATUS_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <span className="text-sm text-zinc-400">{filtered.length} / {members.length} fő</span>
        </div>
        <Button className="h-10 shrink-0 gap-2 rounded-xl bg-emerald-600 px-5 text-white hover:bg-emerald-700" onClick={() => openEdit(null)}>
          <UserPlus className="w-4 h-4" /> Új tag
        </Button>
      </div>

      {/* ═══ Táblázat ═══ */}
      {filtered.length === 0 ? (
        <div className="card-raised p-12 text-center">
          <Search className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
          <p className="text-zinc-500 font-medium">Nincs a keresésnek megfelelő tag.</p>
          <p className="text-xs text-zinc-400 mt-1">Próbáljon más keresőszót vagy szűrőt.</p>
        </div>
      ) : (
        <div className="card-raised overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/60 bg-white/60">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-zinc-500 cursor-pointer select-none" onClick={() => toggleSort('name')}>Név {sortIcon('name')}</th>
                  <th className="p-3 text-left text-xs font-medium text-zinc-500 hidden md:table-cell cursor-pointer select-none" onClick={() => toggleSort('address')}>Lakcím {sortIcon('address')}</th>
                  <th className="p-3 text-left text-xs font-medium text-zinc-500 hidden md:table-cell cursor-pointer select-none" onClick={() => toggleSort('age')}>Kor {sortIcon('age')}</th>
                  <th className="p-3 text-left text-xs font-medium text-zinc-500">Státusz</th>
                  <th className="p-3 text-left text-xs font-medium text-zinc-500 hidden lg:table-cell cursor-pointer select-none" onClick={() => toggleSort('job')}>Foglalkozás {sortIcon('job')}</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/60">
                {filtered.map(m => {
                  const age = ageFromDate(m.sz_datum)
                  const name = formatNameWithPrefix(m)
                  const initials = getInitials(m)
                  const avatarC = getAvatarColors(m)
                  const bday = isBirthdayThisMonth(m)

                  return (
                    <tr key={m.id} className="group cursor-pointer transition-colors duration-150 hover:bg-secondary/55" onClick={() => openDetails(m)}>
                      {/* Név + Avatar */}
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: avatarC.bg, color: avatarC.color }}>
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-zinc-800 truncate flex items-center gap-1.5">
                              {name}
                              {bday && <span title="Születésnapos ebben a hónapban"><Cake className="w-3.5 h-3.5 text-amber-500 shrink-0" /></span>}
                              {crossMatchedIds.has(m.id) && (
                                <span title="Más gyülekezetben is szerepel — egyeztetés szükséges">
                                  <Link2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400 md:hidden">
                              {[
                                age !== null ? `${age} év` : null,
                                m.adrlocality?.name || null,
                              ].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Lakcím — helység, utca + házszám; ha bármelyik rész
                          hiányzik, NE legyen lógó vessző az elején/közepén */}
                      <td className="p-3 hidden md:table-cell text-zinc-500 text-xs">
                        {(() => {
                          const parts = [m.adrlocality?.name, m.adrstreet?.name].filter(Boolean) as string[]
                          const base = parts.join(', ')
                          return base + (m.c_szam ? `${base ? ' ' : ''}${m.c_szam}` : '')
                        })()}
                      </td>

                      {/* Kor */}
                      <td className="p-3 hidden md:table-cell text-zinc-500">
                        {age !== null ? `${age} év` : '—'}
                      </td>

                      {/* Státusz + (esetleges) átjelentkezési badge */}
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <MemberStatusBadge status={m.paymentStatus} />
                          {m.pendingTransfer && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                              title={`Átjelentkezés folyamatban: ${m.pendingTransfer.target_congregation_name} (várakozás a célgyülekezet válaszára)`}
                            >
                              🚪 Átjelentkezik
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Foglalkozás */}
                      <td className="p-3 hidden lg:table-cell text-zinc-400 text-xs">
                        {m.foglalkozas || '—'}
                      </td>

                      {/* Műveletek */}
                      <td className="p-3" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Tag kivezetése" onClick={() => openRemove(m)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal-ok */}
      <MemberDetailsDialogV2
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        member={detailsMember}
        familyId={detailsMember ? personToFamilyMap[detailsMember.id] ?? null : null}
        onEdit={() => detailsMember && openEdit(detailsMember)}
        onShowFamilyTree={(id) => {
          setTreeMemberId(id)
          setTreeOpen(true)
        }}
        onOpenFamily={(id) => {
          setFamilyDetailsId(id)
          setReturnToPersonAfterFamily(true)
          setFamilyOpen(true)
        }}
      />
      <MemberFormDialog open={formOpen} onOpenChange={handleFormClose} editMember={editingMember} />
      <MemberRemoveDialog open={removeOpen} onOpenChange={handleRemoveClose} member={removingMember} />
      <FamilyDetailsDialogRefined
        open={familyOpen}
        onOpenChange={(open) => {
          setFamilyOpen(open)
          if (!open) {
            setFamilyDetailsId(null)
            if (returnToPersonAfterFamily && detailsMember) {
              setDetailsOpen(true)
            }
            setReturnToPersonAfterFamily(false)
          }
        }}
        familyId={familyDetailsId}
      />
      <FamilyTreeDialog open={treeOpen} onOpenChange={(o) => { setTreeOpen(o); if (!o && detailsMember) setDetailsOpen(true) }} memberId={treeMemberId} />
    </div>
  )
}
