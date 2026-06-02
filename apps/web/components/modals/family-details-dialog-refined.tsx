'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Baby,
  BookOpen,
  Church,
  CreditCard,
  Crown,
  Cross,
  DoorOpen,
  Heart,
  Home,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  TreePine,
  Users,
  X,
} from 'lucide-react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { getFamilyDetails, getFamilyVisits, getEnrichedMemberById } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { getFamilyTreeData } from '@/lib/family-tree/get-family-tree'
import type { FamilyTreeData } from '@/lib/family-tree/types'
import { FamilyTreeView } from '@/components/family-tree/family-tree-view'
import { MemberDetailsDialogV2 } from '@/components/modals/member-details-dialog-v2'
import { getTransactionDocumentNumber } from '@/lib/constants/finance'
import { ageFromDate } from '@/lib/utils/date'
import type { EnrichedMember } from '@/lib/constants/members'

interface FamilyDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  familyId: number | null
}

type FamilyData = Awaited<ReturnType<typeof getFamilyDetails>>

/**
 * 2026-06-02 v3 — Családi karton dialog teljes újraalkotás.
 *
 * Egyetlen scrollolható oldal (nem tabok), tiszta papír-szerű design,
 * színes szekciókkal:
 *   - Fejléc:        gradient, családnév, cím, körzet, status-pill, hiányzók
 *   - Tagok:         családfő + házastárs + gyerekek listája
 *   - Anyakönyv:     esketés, keresztelők, konfirmációk, temetések
 *   - Befizetések:   tétel-lista + összegző sáv
 */
type TabKey = 'general' | 'registry' | 'tree' | 'visits' | 'payments'

type FamilyVisit = {
  id: string
  datum: string
  lelkesz: string
  alapige: string | null
  megjegyzes: string | null
}

export function FamilyDetailsDialogRefined({
  open,
  onOpenChange,
  familyId,
}: FamilyDetailsDialogProps) {
  const [data, setData] = useState<FamilyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('general')

  // 2026-06-02: Családfa és Családlátogatás lazy-load — csak az adott tab
  //    aktiválásakor töltjük le. A `*Loaded` flag biztosítja hogy nem
  //    fetchelünk újra ha már sikerült (az eredmény cache-elve marad
  //    amíg a dialog nyitva van).
  const [treeData, setTreeData] = useState<FamilyTreeData | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [visits, setVisits] = useState<FamilyVisit[] | null>(null)
  const [visitsLoading, setVisitsLoading] = useState(false)

  // 2026-06-02: Drill-down a személy-kartonra
  // A felhasználó kattintással megnyitja a kiválasztott szemely teljes
  // kartonját — a MemberDetailsDialogV2 ráül a family dialog tetejére.
  // X-en (vagy ESC-en) bezárul a member dialog és visszakerül a fókusz
  // a családi kartonra (a family dialog open marad).
  const [memberDialogMember, setMemberDialogMember] = useState<EnrichedMember | null>(null)
  const [memberDialogLoading, setMemberDialogLoading] = useState(false)

  async function openMemberCard(memberId: number) {
    if (!familyId) return
    setMemberDialogLoading(true)
    const enriched = await getEnrichedMemberById(memberId, familyId)
    setMemberDialogMember(enriched as EnrichedMember | null)
    setMemberDialogLoading(false)
  }

  useEffect(() => {
    if (!open || !familyId) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setData(null)
      setTreeData(null)
      setVisits(null)
      setLoading(true)
      setActiveTab('general')
      getFamilyDetails(familyId).then((value) => {
        if (cancelled) return
        setData(value)
        setLoading(false)
      })
    })
    return () => { cancelled = true }
  }, [open, familyId])

  // Lazy load: családfa
  useEffect(() => {
    if (activeTab !== 'tree' || !familyId || treeData !== null) return
    let cancelled = false
    setTreeLoading(true)
    getFamilyTreeData(familyId).then((d) => {
      if (cancelled) return
      setTreeData(d)
      setTreeLoading(false)
    })
    return () => { cancelled = true }
  }, [activeTab, familyId, treeData])

  // Lazy load: családlátogatás
  useEffect(() => {
    if (activeTab !== 'visits' || !familyId || visits !== null) return
    let cancelled = false
    setVisitsLoading(true)
    getFamilyVisits(familyId).then((v) => {
      if (cancelled) return
      setVisits(v as FamilyVisit[])
      setVisitsLoading(false)
    })
    return () => { cancelled = true }
  }, [activeTab, familyId, visits])

  const family = data?.family
  const children = data?.children || []
  const payments = data?.payments || []
  const keresztelesek = data?.keresztelesek || []
  const konfirmaciok = data?.konfirmaciok || []
  const hazassag = data?.hazassag
  const temetesek = data?.temetesek || []

  // Családnév — a férj/feleség családnevéből
  const familyName = family?.ferfi?.csaladnev || family?.no?.csaladnev || null
  const totalPayments = payments.reduce((sum, item) => sum + Number(item.osszeg || 0), 0)
  const yearNow = new Date().getFullYear()

  const isLiving = family
    ? (family.ferfi && !family.ferfi.meghalt) || (family.no && !family.no.meghalt)
    : false

  // Hiányzó adatok listája
  const missing: string[] = []
  if (family) {
    if (!family.ferfi && !family.no) missing.push('családfő/házastárs')
    if (!family.utca?.name) missing.push('utca')
    if (!family.c_szam) missing.push('házszám')
    if (!family.csoport?.nev) missing.push('körzet')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!w-[min(960px,calc(100vw-2rem))] !max-w-[min(960px,calc(100vw-2rem))] max-h-[92vh] overflow-hidden rounded-[1.5rem] border-0 bg-transparent p-0 shadow-none"
        showCloseButton={false}
      >
        <div className="relative overflow-hidden rounded-[1.5rem] bg-white shadow-2xl ring-1 ring-slate-200">
          {/* Bezáró gomb */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-30 inline-flex size-8 items-center justify-center rounded-full bg-white/95 text-slate-500 shadow-md transition hover:text-slate-700 hover:bg-white"
            aria-label="Bezárás"
          >
            <X className="size-4" />
          </button>

          <div className="max-h-[92vh] overflow-y-auto">
            {loading ? (
              <div className="px-8 py-16 text-center">
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                  <Users className="size-8 animate-pulse" />
                </div>
                <p className="font-heading text-lg text-slate-700">
                  Családi karton betöltése…
                </p>
              </div>
            ) : !family ? (
              <div className="px-8 py-16 text-center text-slate-500">
                <Users className="mx-auto mb-3 size-10 text-slate-300" />
                <p>Nem található család.</p>
              </div>
            ) : (
              <>
                {/* ───── FEJLÉC ───── */}
                <header className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-violet-50/70 via-white to-emerald-50/60 px-6 py-5 sm:px-8 sm:py-6">
                  {/* dekoratív háttér-blur */}
                  <div aria-hidden className="pointer-events-none absolute -top-12 -right-8 size-40 rounded-full bg-violet-200/30 blur-3xl" />
                  <div aria-hidden className="pointer-events-none absolute -bottom-12 -left-8 size-32 rounded-full bg-emerald-200/30 blur-3xl" />

                  <div className="relative flex items-start gap-4">
                    {/* Avatar/embléma — kezdőbetű(k) */}
                    <div
                      aria-hidden
                      className="hidden sm:flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-500 text-white shadow-lg ring-4 ring-white"
                    >
                      <span className="font-heading text-2xl font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                        {familyInitials(familyName) || '?'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <Sparkles className="size-3.5 text-violet-500" />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-700">
                          Családi karton
                        </p>
                      </div>

                      <DialogTitle className="font-heading text-3xl leading-tight text-slate-800 sm:text-4xl">
                        {familyName ? (
                          <>
                            {familyName}{' '}
                            <span className="font-normal text-slate-500">család</span>
                          </>
                        ) : (
                          <span className="italic text-slate-400">— névtelen család —</span>
                        )}
                      </DialogTitle>
                    </div>
                  </div>

                  {/* Cím + körzet sor */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Pill
                      icon={<MapPin className="size-3" />}
                      tone={family.utca?.name ? 'slate' : 'amber'}
                    >
                      {family.utca?.name ? (
                        <>{family.utca.name}{family.c_szam ? ` ${family.c_szam}` : ''}</>
                      ) : (
                        <em>cím hiányzik</em>
                      )}
                    </Pill>
                    {family.csoport?.nev ? (
                      <Pill icon={<Home className="size-3" />} tone="violet">
                        {family.csoport.nev}
                      </Pill>
                    ) : (
                      <Pill icon={<Home className="size-3" />} tone="amber">
                        <em>körzet nincs</em>
                      </Pill>
                    )}
                    <Pill
                      icon={isLiving ? <Heart className="size-3 fill-current" /> : <Cross className="size-3" />}
                      tone={isLiving ? 'emerald' : 'slate'}
                    >
                      {isLiving ? 'Élő család' : 'Elhunyt család'}
                    </Pill>
                  </div>

                  {/* Hiányzó adatok figyelmeztetés */}
                  {missing.length > 0 && (
                    <div className="mt-3 inline-flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-800">
                      <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                      <span>
                        <strong>Hiányzó adatok:</strong> {missing.join(', ')}
                      </span>
                    </div>
                  )}
                </header>

                {/* ───── TAB-BAR ───── */}
                <nav className="sticky top-0 z-10 flex gap-1 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-3 sm:px-6 overflow-x-auto">
                  <TabButton
                    active={activeTab === 'general'}
                    onClick={() => setActiveTab('general')}
                    icon={<Users className="size-4" />}
                    label="Általános"
                  />
                  <TabButton
                    active={activeTab === 'registry'}
                    onClick={() => setActiveTab('registry')}
                    icon={<BookOpen className="size-4" />}
                    label="Anyakönyv"
                    count={
                      (hazassag?.datum ? 1 : 0) +
                      keresztelesek.length +
                      konfirmaciok.length +
                      temetesek.length
                    }
                  />
                  <TabButton
                    active={activeTab === 'tree'}
                    onClick={() => setActiveTab('tree')}
                    icon={<TreePine className="size-4" />}
                    label="Családfa"
                  />
                  <TabButton
                    active={activeTab === 'visits'}
                    onClick={() => setActiveTab('visits')}
                    icon={<DoorOpen className="size-4" />}
                    label="Családlátogatás"
                    count={visits?.length}
                  />
                  <TabButton
                    active={activeTab === 'payments'}
                    onClick={() => setActiveTab('payments')}
                    icon={<CreditCard className="size-4" />}
                    label="Befizetések"
                    count={payments.length}
                  />
                </nav>

                {/* ───── TAB-CONTENT ───── */}
                <div className="space-y-5 px-4 py-5 sm:px-6 sm:py-6 bg-slate-50/30 animate-in fade-in duration-200">
                  {/* ÁLTALÁNOS — Tagok */}
                  {activeTab === 'general' && (
                  <Section
                    title="Családtagok"
                    icon={<Users className="size-4" />}
                    accent="violet"
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      {family.ferfi ? (
                        <MemberPanel role="head" member={family.ferfi} onClick={() => openMemberCard(family.ferfi!.id)} />
                      ) : family.no ? (
                        <MemberPanel role="head" member={family.no} onClick={() => openMemberCard(family.no!.id)} />
                      ) : null}

                      {family.ferfi && family.no && (
                        <MemberPanel role="spouse" member={family.no} onClick={() => openMemberCard(family.no!.id)} />
                      )}
                    </div>

                    {/* Gyermekek */}
                    {children.length > 0 && (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Baby className="size-4 text-pink-500" />
                          <h4 className="text-sm font-semibold text-slate-700">
                            Gyermekek ({children.length})
                          </h4>
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {children.map((c) => {
                            const age = c.sz_datum
                              ? yearNow - new Date(c.sz_datum).getFullYear()
                              : null
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => openMemberCard(c.id)}
                                className={`flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition hover:bg-pink-50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-300 ${
                                  c.meghalt ? 'text-slate-400 line-through' : 'text-slate-700'
                                }`}
                                title="Személyi karton megnyitása"
                              >
                                <span
                                  className={`inline-flex size-5 items-center justify-center rounded-full ${
                                    c.ferfi ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'
                                  }`}
                                >
                                  {c.ferfi ? '♂' : '♀'}
                                </span>
                                <span>
                                  {c.meghalt && '† '}
                                  {c.csaladnev} {c.k_nev}
                                  {age != null && (
                                    <span className="text-slate-400"> ({age} éves)</span>
                                  )}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {!family.ferfi && !family.no && (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500 italic">
                        Nincs felnőtt tag rögzítve ehhez a családhoz.
                      </div>
                    )}
                  </Section>
                  )}

                  {/* ANYAKÖNYV — külön tab */}
                  {activeTab === 'registry' && !(hazassag?.datum || keresztelesek.length > 0 || konfirmaciok.length > 0 || temetesek.length > 0) && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                      <BookOpen className="mx-auto mb-3 size-10 text-slate-300" />
                      Nincs anyakönyvi bejegyzés ehhez a családhoz.
                    </div>
                  )}
                  {activeTab === 'registry' && (hazassag?.datum || keresztelesek.length > 0 || konfirmaciok.length > 0 || temetesek.length > 0) && (
                    <Section
                      title="Anyakönyvi bejegyzések"
                      icon={<BookOpen className="size-4" />}
                      accent="amber"
                    >
                      {/* 2026-06-02: táblázatos forma — átláthatóbb mint a kártya-lista */}
                      <RegistryTable
                        rows={buildRegistryRows({
                          hazassag,
                          keresztelesek,
                          konfirmaciok,
                          temetesek,
                          members: [family.ferfi, family.no, ...children],
                        })}
                      />
                    </Section>
                  )}

                  {/* ───── CSALÁDFA ───── */}
                  {activeTab === 'tree' && (
                    <Section
                      title="Családfa"
                      icon={<TreePine className="size-4" />}
                      accent="emerald"
                    >
                      {treeLoading ? (
                        <div className="flex items-center justify-center py-12 text-sm text-slate-500">
                          <TreePine className="mr-2 size-5 animate-pulse text-emerald-500" />
                          Családfa betöltése…
                        </div>
                      ) : treeData ? (
                        <FamilyTreeView data={treeData} onMemberClick={openMemberCard} />
                      ) : null}
                    </Section>
                  )}

                  {/* ───── CSALÁDLÁTOGATÁS ───── */}
                  {activeTab === 'visits' && (
                    <Section
                      title={
                        visits && visits.length > 0
                          ? `Családlátogatások (${visits.length})`
                          : 'Családlátogatás'
                      }
                      icon={<DoorOpen className="size-4" />}
                      accent="rose"
                    >
                      {visitsLoading ? (
                        <div className="flex items-center justify-center py-12 text-sm text-slate-500">
                          <DoorOpen className="mr-2 size-5 animate-pulse text-rose-500" />
                          Látogatások betöltése…
                        </div>
                      ) : !visits || visits.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                          <DoorOpen className="mx-auto mb-3 size-10 text-slate-300" />
                          Nincs rögzített családlátogatás.
                          <p className="mt-2 text-xs text-slate-400">
                            Új látogatás rögzítéséhez használja a Tagnyilvántartás → Családlátogatás űrlapot.
                          </p>
                        </div>
                      ) : (
                        <VisitsList visits={visits} />
                      )}
                    </Section>
                  )}

                  {/* BEFIZETÉSEK — külön tab */}
                  {activeTab === 'payments' && (
                  <Section
                    title={`Befizetések (${payments.length} tétel · ${totalPayments.toFixed(0)} RON)`}
                    icon={<CreditCard className="size-4" />}
                    accent="emerald"
                  >
                    {payments.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500 italic">
                        Nincs rögzített befizetés ehhez a családhoz.
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="max-h-72 overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 sticky top-0">
                              <tr>
                                <th className="px-3 py-2">Dátum</th>
                                <th className="px-3 py-2">Cél</th>
                                <th className="px-3 py-2 text-right">Összeg</th>
                                <th className="px-3 py-2">Bizonylat</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {payments.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 text-slate-600">
                                    {formatShortDate(p.datum)}
                                  </td>
                                  <td className="px-3 py-2 text-slate-700">
                                    {p.befizetescel?.nev || '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-slate-800">
                                    {Number(p.osszeg || 0).toFixed(0)} RON
                                  </td>
                                  <td className="px-3 py-2 text-xs text-slate-500 font-mono">
                                    {getTransactionDocumentNumber(p) || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </Section>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>

      {/* 2026-06-02: Drill-down dialog — egy person-kartonra kattintáskor.
          A MemberDetailsDialogV2 a family dialog tetejére ráül (nested Radix
          Dialog). X-en bezárul a member dialog ÉS a family dialog marad nyitva
          a megfelelő tab-on. */}
      <MemberDetailsDialogV2
        open={!!memberDialogMember || memberDialogLoading}
        onOpenChange={(open) => {
          if (!open) {
            setMemberDialogMember(null)
            setMemberDialogLoading(false)
          }
        }}
        member={memberDialogMember}
        familyId={familyId}
        onEdit={() => { /* a karton-szerkesztést a tagnyilv. tabnál intézzük */ }}
      />
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Alkomponensek

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
}) {
  const baseClasses =
    'relative inline-flex items-center gap-2 px-3 sm:px-4 py-3 text-[13px] font-medium transition-all whitespace-nowrap '
  const activeClasses = active
    ? 'text-violet-700'
    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50/80'
  const badgeClasses = active
    ? 'bg-violet-100 text-violet-700'
    : 'bg-slate-100 text-slate-600'
  return (
    <button type="button" onClick={onClick} className={baseClasses + activeClasses}>
      {icon}
      <span>{label}</span>
      {count != null && count > 0 && (
        <span
          className={
            'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold ' +
            badgeClasses
          }
        >
          {count}
        </span>
      )}
      {active && (
        <span
          aria-hidden
          className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 shadow-[0_-1px_4px_rgba(139,92,246,0.4)]"
        />
      )}
    </button>
  )
}

function Pill({
  icon,
  tone,
  children,
}: {
  icon?: React.ReactNode
  tone: 'slate' | 'violet' | 'amber' | 'emerald' | 'rose'
  children: React.ReactNode
}) {
  const TONES: Record<typeof tone, string> = {
    slate: 'bg-white text-slate-700 border-slate-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${TONES[tone]}`}>
      {icon}
      {children}
    </span>
  )
}

function Section({
  title,
  icon,
  accent,
  children,
}: {
  title: string
  icon: React.ReactNode
  accent: 'violet' | 'amber' | 'emerald' | 'rose'
  children: React.ReactNode
}) {
  const ACCENT: Record<typeof accent, string> = {
    violet: 'border-violet-100 text-violet-700',
    amber: 'border-amber-100 text-amber-700',
    emerald: 'border-emerald-100 text-emerald-700',
    rose: 'border-rose-100 text-rose-700',
  }
  return (
    <section className={`rounded-2xl border ${ACCENT[accent].split(' ')[0]} bg-white p-4 sm:p-5 shadow-sm`}>
      <div className={`flex items-center gap-2 mb-3 ${ACCENT[accent].split(' ')[1]}`}>
        {icon}
        <h3 className="font-heading text-base font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  )
}

interface MemberShape {
  id: number
  csaladnev: string
  k_nev: string
  ferfi: boolean
  sz_datum: string | null
  meghalt: boolean
  vallas?: string | null
  foglalkozas?: string | null
  telefon?: string | null
  namepattern?: string | null
  allapot?: string | null
}

function MemberPanel({
  role,
  member,
  onClick,
}: {
  role: 'head' | 'spouse'
  member: MemberShape
  onClick?: () => void
}) {
  const isHead = role === 'head'
  const Icon = isHead ? Crown : Heart
  const iconTone = isHead ? 'text-amber-600 bg-amber-50' : 'text-rose-600 bg-rose-50'
  const labelText = isHead ? 'Családfő' : 'Házastárs'
  const labelTone = isHead ? 'text-amber-800 bg-amber-50' : 'text-rose-700 bg-rose-50'
  const age = ageFromDate(member.sz_datum)

  const Wrapper: 'button' | 'div' = onClick ? 'button' : 'div'
  const wrapperProps = onClick
    ? {
        type: 'button' as const,
        onClick,
        title: 'Személyi karton megnyitása',
        className:
          'group block w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-300 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-violet-300',
      }
    : { className: 'rounded-xl border border-slate-200 bg-white p-4' }

  return (
    <Wrapper {...(wrapperProps as Record<string, unknown>)}>
      <div className="flex items-start gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${iconTone}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${labelTone}`}>
            {labelText}
          </span>
          <h4
            className={`mt-1 text-base font-semibold leading-snug ${
              member.meghalt ? 'text-slate-400 line-through' : 'text-slate-800'
            }`}
          >
            {member.meghalt && '† '}
            {member.csaladnev} {member.k_nev}
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">
            {age != null ? `${age} éves` : 'kor ismeretlen'}
            {member.vallas && ` · ${member.vallas}`}
            {member.foglalkozas && ` · ${member.foglalkozas}`}
            {member.allapot && ` · ${member.allapot}`}
          </p>
          {member.telefon && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600">
              <Phone className="size-3" />
              {member.telefon}
            </p>
          )}
        </div>
      </div>
    </Wrapper>
  )
}

// 2026-06-02: anyakönyvi sor-építő — minden esetet egységesen kezel
interface RegistryRow {
  key: string
  type: 'esketes' | 'kereszteles' | 'konfirmacio' | 'temetes'
  date: string | null | undefined
  person: string | null
  location: string | null | undefined
  pastor: string | null | undefined
}

const REGISTRY_TYPE_META: Record<
  RegistryRow['type'],
  { label: string; icon: React.ReactNode; tone: string }
> = {
  esketes: {
    label: 'Esketés',
    icon: <Heart className="size-3.5 text-rose-500" />,
    tone: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  kereszteles: {
    label: 'Keresztelő',
    icon: <Church className="size-3.5 text-blue-500" />,
    tone: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  konfirmacio: {
    label: 'Konfirmáció',
    icon: <Sparkles className="size-3.5 text-emerald-500" />,
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  temetes: {
    label: 'Temetés',
    icon: <Cross className="size-3.5 text-slate-500" />,
    tone: 'bg-slate-100 text-slate-700 border-slate-300',
  },
}

interface MemberLike {
  id: number
  csaladnev: string
  k_nev: string
}

function buildRegistryRows(args: {
  hazassag: { datum?: string; adrlocality?: { name: string } | null; lelkeszneve?: string } | null | undefined
  keresztelesek: Array<{ id_szemely: number; datum: string; adrlocality?: { name: string } | null; lelkeszneve?: string }>
  konfirmaciok: Array<{ id_szemely: number; datum: string; adrlocality?: { name: string } | null; lelkeszneve?: string }>
  temetesek: Array<{ id_szemely: number; hdatum: string }>
  members: Array<MemberLike | null | undefined>
}): RegistryRow[] {
  const memberMap = new Map<number, string>()
  for (const m of args.members) {
    if (m) memberMap.set(m.id, `${m.csaladnev || ''} ${m.k_nev || ''}`.trim())
  }
  const rows: RegistryRow[] = []
  if (args.hazassag?.datum) {
    rows.push({
      key: 'esketes',
      type: 'esketes',
      date: args.hazassag.datum,
      person: null, // mindkét fél, a tagok-tabon látszik
      location: args.hazassag.adrlocality?.name ?? null,
      pastor: args.hazassag.lelkeszneve ?? null,
    })
  }
  args.keresztelesek.forEach((k, i) => rows.push({
    key: `b-${i}`,
    type: 'kereszteles',
    date: k.datum,
    person: memberMap.get(k.id_szemely) ?? null,
    location: k.adrlocality?.name ?? null,
    pastor: k.lelkeszneve ?? null,
  }))
  args.konfirmaciok.forEach((kon, i) => rows.push({
    key: `c-${i}`,
    type: 'konfirmacio',
    date: kon.datum,
    person: memberMap.get(kon.id_szemely) ?? null,
    location: kon.adrlocality?.name ?? null,
    pastor: kon.lelkeszneve ?? null,
  }))
  args.temetesek.forEach((t, i) => rows.push({
    key: `t-${i}`,
    type: 'temetes',
    date: t.hdatum,
    person: memberMap.get(t.id_szemely) ?? null,
    location: null,
    pastor: null,
  }))
  // Dátum szerint csökkenően rendezve (legújabb felül)
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return rows
}

function RegistryTable({ rows }: { rows: RegistryRow[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Desktop táblázat */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 w-32">Esemény</th>
              <th className="px-3 py-2 w-28">Dátum</th>
              <th className="px-3 py-2">Érintett személy</th>
              <th className="px-3 py-2">Helyszín</th>
              <th className="px-3 py-2">Lelkész</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const meta = REGISTRY_TYPE_META[row.type]
              return (
                <tr key={row.key} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                    {formatShortDate(row.date)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.person ?? <span className="text-slate-400 italic">—</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {row.location ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {row.pastor ?? <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobil: kompakt kártya-lista */}
      <div className="sm:hidden divide-y divide-slate-100">
        {rows.map((row) => {
          const meta = REGISTRY_TYPE_META[row.type]
          return (
            <div key={row.key} className="p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
                  {meta.icon}
                  {meta.label}
                </span>
                <span className="text-xs font-medium text-slate-700">
                  {formatShortDate(row.date)}
                </span>
              </div>
              {row.person && (
                <div className="text-sm text-slate-700">{row.person}</div>
              )}
              {(row.location || row.pastor) && (
                <div className="text-[11px] text-slate-500">
                  {row.location}
                  {row.location && row.pastor && ' · '}
                  {row.pastor && `Lelkész: ${row.pastor}`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// 2026-06-02: kezdőbetű-extraktor a fejléc-avatarhoz.
// Pl. "Bartók" → "B"; "Albu Beder" → "AB"; null → null.
function familyInitials(name: string | null): string | null {
  if (!name) return null
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (words.length === 0) return null
  return words.map((w) => w[0].toUpperCase()).join('')
}

function formatShortDate(value?: string | null) {
  if (!value) return 'Ismeretlen'
  const normalized = value.includes('T') ? value : `${value}T00:00:00`
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }).format(d)
}

// 2026-06-02: Családlátogatás-lista — kompakt időrendi nézet, papír-érzet
function VisitsList({ visits }: { visits: FamilyVisit[] }) {
  return (
    <ol className="relative ml-3 space-y-3 border-l-2 border-rose-200/60 pl-5">
      {visits.map((v) => (
        <li key={v.id} className="relative">
          {/* időpont-pötty */}
          <span
            aria-hidden
            className="absolute -left-[27px] top-2.5 flex size-4 items-center justify-center rounded-full border-2 border-rose-300 bg-white"
          >
            <span className="size-1.5 rounded-full bg-rose-400" />
          </span>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-slate-800">
                {formatShortDate(v.datum)}
              </span>
              {v.lelkesz && (
                <span className="text-xs text-slate-500">
                  <span className="text-slate-400">Lelkész: </span>
                  {v.lelkesz}
                </span>
              )}
            </div>
            {v.alapige && (
              <p className="mt-1.5 text-sm italic text-rose-700">
                <span className="text-rose-400">„</span>{v.alapige}<span className="text-rose-400">"</span>
              </p>
            )}
            {v.megjegyzes && (
              <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-slate-600">
                {v.megjegyzes}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

// 2026-06-02: a Mail import csak akkor kell, ha emailt mutatunk — most nem,
// de a tree-shake-hez ez nem gond.
void Mail
