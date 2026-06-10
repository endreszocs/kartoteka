'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyFirstRecord } from '@/components/ui/empty-first-record'
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
import { Search, UserPlus, Trash2, Cake, Link2, Users, CheckCircle2, Unlink, Sparkles, X, Download } from 'lucide-react'
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
  // 2026-06-10: életkor szerinti szűrés (pl. 0–14, 25–50)
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  // 2026-06-10 (Fázis 4, P1-2 első lépés): nagy listáknál csak az első 150
  // sor kerül a DOM-ba — gombbal bővíthető (virtualizáció-pótló megoldás).
  const [visibleCount, setVisibleCount] = useState(150)
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
  // 2026-04-30: "Bármikor fizetett" Set — az enrichedMember.hasEverPaid alapján.
  // Ezt használja az isActiveMember(m, paidSet, everPaidSet) az aktív szabálynak.
  const everPaidSet = useMemo(() => {
    const s = new Set<number>()
    for (const m of members) if (m.hasEverPaid) s.add(m.id)
    return s
  }, [members])

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

  // 2026-06-02: statisztika a persons-tab-hoz (mint a családoknál)
  const stats = useMemo(() => {
    const total = members.length
    const active = members.filter((m) => isActiveMember(m, paidSet, everPaidSet)).length
    const birthdays = members.filter((m) => isBirthdayThisMonth(m) && !m.meghalt).length
    const floating = members.filter(
      (m) => m.familyId === null && !m.meghalt && m.member_status !== 'elkoltozott' && !m.elkoltozott,
    ).length
    return { total, active, birthdays, floating }
  }, [members, paidSet, everPaidSet])

  const filtered = useMemo(() => {
    const query = searchQuery.toLowerCase()
    const result = members.filter(m => {
      if (query) {
        const nameMatch = `${m.csaladnev || ''} ${m.k_nev || ''}`.toLowerCase().includes(query)
        const addrMatch = `${m.adrlocality?.name || ''} ${m.adrstreet?.name || ''} ${m.c_szam || ''}`.toLowerCase().includes(query)
        if (!nameMatch && !addrMatch) return false
      }
      if (ageMin !== '' || ageMax !== '') {
        const age = ageFromDate(m.sz_datum)
        if (age === null) return false
        if (ageMin !== '' && age < Number(ageMin)) return false
        if (ageMax !== '' && age > Number(ageMax)) return false
      }
      if (statusFilter === 'aktív') return isActiveMember(m, paidSet, everPaidSet)
      if (statusFilter === 'meghalt') return m.meghalt
      if (statusFilter === 'elkoltozott') return m.member_status === 'elkoltozott' || m.elkoltozott
      if (statusFilter === 'kitert') return m.member_status === 'kitért'
      if (statusFilter === 'mas_vallasu') { const v = (m.vallas || '').trim().toLowerCase(); return v !== '' && v !== 'református' && !m.meghalt }
      if (statusFilter === 'lebego') return m.familyId === null && !m.meghalt && m.member_status !== 'elkoltozott' && !m.elkoltozott
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
  }, [members, searchQuery, statusFilter, ageMin, ageMax, sortCol, sortDir, paidSet, everPaidSet])

  function toggleSort(col: SortColumn) { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc') } }
  function sortIcon(col: SortColumn) { if (sortCol !== col) return '↕'; return sortDir === 'asc' ? '↑' : '↓' }
  function openDetails(m: EnrichedMember) { setDetailsMember(m); setDetailsOpen(true) }
  function openEdit(m: EnrichedMember | null) { setEditingMember(m); setDetailsOpen(false); setFormOpen(true) }
  function openRemove(m: EnrichedMember) { setRemovingMember({ id: m.id, name: `${m.csaladnev || ''} ${m.k_nev || ''}`.trim() }); setRemoveOpen(true) }
  async function handleFormClose() { setFormOpen(false); setEditingMember(null); const { getMembers } = await import('@/app/(dashboard)/tagnyilvantartas/actions'); onRefresh((await getMembers()).members) }
  async function handleRemoveClose() { setRemoveOpen(false); setRemovingMember(null); const { getMembers } = await import('@/app/(dashboard)/tagnyilvantartas/actions'); onRefresh((await getMembers()).members) }

  // 2026-06-10 (Fázis 4, P2-5): a szűrt lista exportja Excelbe
  async function handleExport() {
    const XLSX = await import('xlsx')
    const rows = filtered.map(m => ({
      'Családnév': m.csaladnev || '',
      'Keresztnév': m.k_nev || '',
      'Nem': m.ferfi ? 'Férfi' : 'Nő',
      'Született': m.sz_datum || '',
      'Életkor': ageFromDate(m.sz_datum) ?? '',
      'Település': m.adrlocality?.name || '',
      'Utca': m.adrstreet?.name || '',
      'Házszám': m.c_szam || '',
      'Telefon': m.telefon || '',
      'E-mail': m.email || '',
      'Vallás': m.vallas || '',
      'Státusz': m.member_status || (m.meghalt ? 'elhunyt' : 'aktív'),
      'Foglalkozás': m.foglalkozas || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Tagok')
    XLSX.writeFile(wb, `tagnyilvantartas-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-4">
      {/* ═══ Statisztika dashboard (2026-06-02) ═══ */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <PersonKpiCard
          tone="violet"
          icon={<Users className="size-5" />}
          label="Összes tag"
          value={stats.total}
        />
        <PersonKpiCard
          tone="emerald"
          icon={<CheckCircle2 className="size-5" />}
          label="Aktív"
          value={stats.active}
          hint={stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}%` : null}
        />
        <PersonKpiCard
          tone="amber"
          icon={<Cake className="size-5" />}
          label="Születésnaposok hónapja"
          value={stats.birthdays}
        />
        <PersonKpiCard
          tone="rose"
          icon={<Unlink className="size-5" />}
          label="Lebegő (család nélkül)"
          value={stats.floating}
        />
      </div>

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
          {/* 2026-06-10: életkor-szűrő (pl. 0–14 vagy 25–50 év között) */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-400">Kor:</span>
            <Input type="number" min={0} max={120} value={ageMin} onChange={e => setAgeMin(e.target.value)} placeholder="tól" className="h-10 w-16 rounded-xl bg-zinc-50 border-zinc-200 text-center" />
            <span className="text-zinc-300">–</span>
            <Input type="number" min={0} max={120} value={ageMax} onChange={e => setAgeMax(e.target.value)} placeholder="ig" className="h-10 w-16 rounded-xl bg-zinc-50 border-zinc-200 text-center" />
            {(ageMin !== '' || ageMax !== '') && (
              <button type="button" onClick={() => { setAgeMin(''); setAgeMax('') }} className="text-zinc-400 transition hover:text-zinc-600" aria-label="Korszűrő törlése">
                <X className="size-4" />
              </button>
            )}
          </div>
          <span className="text-sm text-zinc-400">{filtered.length} / {members.length} fő</span>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" className="h-10 gap-2 rounded-xl" onClick={handleExport} disabled={filtered.length === 0} title="A szűrt lista exportja Excelbe">
            <Download className="w-4 h-4" /> Export
          </Button>
          <Button className="h-10 gap-2 rounded-xl bg-emerald-600 px-5 text-white hover:bg-emerald-700" onClick={() => openEdit(null)}>
            <UserPlus className="w-4 h-4" /> Új tag
          </Button>
        </div>
      </div>

      {/* ═══ Táblázat ═══ */}
      {filtered.length === 0 ? (
        members.length === 0 ? (
          <EmptyFirstRecord
            accent="emerald"
            icon={UserPlus}
            title="Még nincs egyetlen gyülekezeti tag sem"
            description="Kezdd el a nyilvántartást — vedd fel az első tagot pár alapadattal (név, születés, lakcím). A családok, presbiterek és körzetek innen épülnek fel."
            ctaLabel="Rögzítsd az első tagot"
            onCta={() => openEdit(null)}
          />
        ) : (
          <div className="card-raised p-12 text-center">
            <Search className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
            <p className="text-zinc-500 font-medium">Nincs a keresésnek megfelelő tag.</p>
            <p className="text-xs text-zinc-400 mt-1">Próbáljon más keresőszót vagy szűrőt.</p>
          </div>
        )
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
                {filtered.slice(0, visibleCount).map(m => {
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
                              {/* 2026-04-30: vallás-figyelmeztetés — ha üres és nem fizetett valaha */}
                              {(() => {
                                const v = (m.vallas || '').trim()
                                if (v !== '') return null
                                if (m.hasEverPaid) return null // mert ő mégis aktív (Endre szabálya)
                                return (
                                  <span
                                    title="Vallás nincs rögzítve — ezért NEM számít aktív tagnak. Ha valaha fizetett egyházfenntartást, vagy reformátussá kell jelölni, akkor aktív lesz."
                                    className="inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700"
                                  >
                                    !
                                  </span>
                                )
                              })()}
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
                        {/* 2026-06-10 (Fázis 4, P2-8): mobilon nincs hover — ott mindig látszik */}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-300 hover:text-red-500 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity" title="Tag kivezetése" onClick={() => openRemove(m)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length > visibleCount && (
              <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
                <span className="text-xs text-zinc-400">{visibleCount} / {filtered.length} sor megjelenítve</span>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setVisibleCount(c => c + 150)}>
                  További 150 megjelenítése
                </Button>
              </div>
            )}
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

// 2026-06-02: KPI-kártya a statisztika dashboardhoz — mint a családoknál
function PersonKpiCard({
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
  hint?: string | null
}) {
  const TONES: Record<typeof tone, { bg: string; iconBg: string; iconText: string; valueText: string }> = {
    violet: { bg: 'from-violet-50 to-white', iconBg: 'bg-violet-100', iconText: 'text-violet-600', valueText: 'text-violet-900' },
    emerald: { bg: 'from-emerald-50 to-white', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', valueText: 'text-emerald-900' },
    amber: { bg: 'from-amber-50 to-white', iconBg: 'bg-amber-100', iconText: 'text-amber-600', valueText: 'text-amber-900' },
    rose: { bg: 'from-rose-50 to-white', iconBg: 'bg-rose-100', iconText: 'text-rose-600', valueText: 'text-rose-900' },
  }
  const t = TONES[tone]
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br ${t.bg} p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 sm:text-xs">
            {label}
          </p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${t.valueText} sm:text-3xl`}>
            {value}
            {hint && (
              <span className="ml-1 text-sm font-normal text-slate-500 sm:text-base">{hint}</span>
            )}
          </p>
        </div>
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${t.iconBg} ${t.iconText} shadow-sm`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

// Csendes referencia — esetleg később jelmagyarázathoz
void Sparkles
