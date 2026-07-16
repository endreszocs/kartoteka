'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Camera,
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
  Pencil,
  Phone,
  Plus,
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
import { AvatarEditorDialog } from '@/components/modals/avatar-editor-dialog'
import { MemberAvatar } from '@kartoteka/ui-app'
import { FamilyFormDialog } from '@/components/modals/family-form-dialog'
import { FamilyVisitFormDialog } from '@/components/modals/family-visit-form-dialog'
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
  // 2026-06-11: fénykép/közösségi-link szerkesztő + a lap újratöltése mentés után
  const [avatarEditPerson, setAvatarEditPerson] = useState<{ id: number; name: string; kepUrl?: string | null; socialUrl?: string | null } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // 2026-06-02: család szerkesztés + új családlátogatás
  const [editFamilyOpen, setEditFamilyOpen] = useState(false)
  const [visitFormOpen, setVisitFormOpen] = useState(false)

  async function openMemberCard(memberId: number) {
    if (!familyId) return
    setMemberDialogLoading(true)
    const enriched = await getEnrichedMemberById(memberId, familyId)
    setMemberDialogMember(enriched as EnrichedMember | null)
    setMemberDialogLoading(false)
  }

  // Visits frissítése mentés után
  async function refreshVisits() {
    if (!familyId) return
    const { getFamilyVisits } = await import('@/app/(dashboard)/tagnyilvantartas/family-actions')
    const v = await getFamilyVisits(familyId)
    setVisits(v as FamilyVisit[])
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
  }, [open, familyId, reloadKey])

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
        className="!w-[min(1120px,calc(100vw-1rem))] !max-w-[min(1120px,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-hidden rounded-[1.75rem] border-0 bg-transparent p-0 shadow-none sm:!w-[min(1120px,calc(100vw-2rem))] sm:!max-w-[min(1120px,calc(100vw-2rem))]"
        showCloseButton={false}
      >
        <div className="relative overflow-hidden rounded-[1.75rem] bg-card shadow-[0_32px_90px_-34px_rgba(11,55,50,0.58)] ring-1 ring-border">
          {/* A bezárás gomb mindig látható; a többi művelet az egységes alsó sávban van. */}
          <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-md backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              aria-label="Bezárás"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="px-8 py-16 text-center">
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
                  <Users className="size-8 animate-pulse motion-reduce:animate-none" />
                </div>
                <p className="font-heading text-lg text-foreground">
                  Családi karton betöltése…
                </p>
              </div>
            ) : !family ? (
              <div className="px-8 py-16 text-center text-muted-foreground">
                <Users className="mx-auto mb-3 size-10 opacity-35" />
                <p>Nem található család.</p>
              </div>
            ) : (
              <>
                {/* ───── FEJLÉC ───── */}
                <header className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-card to-amber-50/45 px-5 pb-5 pt-16 sm:px-8 sm:pb-7 sm:pt-7 dark:to-card">
                  {/* dekoratív háttér-blur */}
                  <div aria-hidden className="pointer-events-none absolute -right-8 -top-12 size-44 rounded-full bg-primary/15 blur-3xl" />
                  <div aria-hidden className="pointer-events-none absolute -bottom-12 -left-8 size-36 rounded-full bg-amber-200/35 blur-3xl dark:bg-amber-700/10" />
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-teal-500 to-amber-400" />

                  <div className="relative flex items-start gap-4">
                    {/* Avatar/embléma — kezdőbetű(k) */}
                    <div
                      aria-hidden
                      className="hidden size-[72px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-teal-600 to-amber-500 text-primary-foreground shadow-lg ring-4 ring-card sm:flex"
                    >
                      <span className="font-heading text-2xl font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                        {familyInitials(familyName) || '?'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <Sparkles className="size-3.5 text-amber-600 dark:text-amber-400" />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/75">
                          Családi karton · #{family.id}
                        </p>
                      </div>

                      <DialogTitle className="font-heading text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
                        {familyName ? (
                          <>
                            {familyName}{' '}
                            <span className="font-normal text-muted-foreground">család</span>
                          </>
                        ) : (
                          <span className="italic text-muted-foreground">— névtelen család —</span>
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
                      <Pill icon={<Home className="size-3" />} tone="primary">
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
                    <div className="mt-4 inline-flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-800 shadow-sm dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                      <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                      <span>
                        <strong>Hiányzó adatok:</strong> {missing.join(', ')}
                      </span>
                    </div>
                  )}
                </header>

                {/* ───── TAB-BAR ───── */}
                <nav aria-label="Családi karton nézetei" className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-y border-border/60 bg-muted/30 px-2 backdrop-blur-md sm:px-6">
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
                <div className="min-h-[360px] space-y-5 bg-background/70 px-4 py-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-reduce:animate-none sm:px-6 sm:py-6">
                  {/* ÁLTALÁNOS — Tagok */}
                  {activeTab === 'general' && (
                  <Section
                    title="Családtagok"
                    icon={<Users className="size-4" />}
                    accent="primary"
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      {family.ferfi ? (
                        <MemberPanel
                          role="head"
                          member={family.ferfi}
                          onClick={() => openMemberCard(family.ferfi!.id)}
                          onEditAvatar={() => setAvatarEditPerson({ id: family.ferfi!.id, name: `${family.ferfi!.csaladnev} ${family.ferfi!.k_nev}`.trim(), kepUrl: family.ferfi!.kep, socialUrl: family.ferfi!.social_profil_url })}
                        />
                      ) : family.no ? (
                        <MemberPanel
                          role="head"
                          member={family.no}
                          onClick={() => openMemberCard(family.no!.id)}
                          onEditAvatar={() => setAvatarEditPerson({ id: family.no!.id, name: `${family.no!.csaladnev} ${family.no!.k_nev}`.trim(), kepUrl: family.no!.kep, socialUrl: family.no!.social_profil_url })}
                        />
                      ) : null}

                      {family.ferfi && family.no && (
                        <MemberPanel
                          role="spouse"
                          member={family.no}
                          onClick={() => openMemberCard(family.no!.id)}
                          onEditAvatar={() => setAvatarEditPerson({ id: family.no!.id, name: `${family.no!.csaladnev} ${family.no!.k_nev}`.trim(), kepUrl: family.no!.kep, socialUrl: family.no!.social_profil_url })}
                        />
                      )}
                    </div>

                    {/* Gyermekek */}
                    {children.length > 0 && (
                      <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            <Baby className="size-4" />
                          </span>
                          <h4 className="text-sm font-semibold text-foreground">
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
                                className={`flex min-h-11 items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 text-left text-sm motion-safe:transition motion-safe:hover:-translate-y-px hover:border-primary/10 hover:bg-primary/5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                                  c.meghalt ? 'text-muted-foreground line-through' : 'text-foreground'
                                }`}
                                title="Személyi karton megnyitása"
                              >
                                <MemberAvatar
                                  name={`${c.csaladnev} ${c.k_nev}`.trim()}
                                  kepUrl={(c as MemberShape).kep}
                                  meghalt={c.meghalt}
                                  size={22}
                                />
                                <span>
                                  {c.meghalt && '† '}
                                  {c.csaladnev} {c.k_nev}
                                  {age != null && (
                                    <span className="text-muted-foreground"> ({age} éves)</span>
                                  )}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {!family.ferfi && !family.no && (
                      <div className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-4 text-sm italic text-muted-foreground">
                        Nincs felnőtt tag rögzítve ehhez a családhoz.
                      </div>
                    )}
                  </Section>
                  )}

                  {/* ANYAKÖNYV — külön tab */}
                  {activeTab === 'registry' && !(hazassag?.datum || keresztelesek.length > 0 || konfirmaciok.length > 0 || temetesek.length > 0) && (
                    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                      <BookOpen className="mx-auto mb-3 size-10 opacity-35" />
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
                        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                          <TreePine className="mr-2 size-5 animate-pulse text-emerald-500 motion-reduce:animate-none" />
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
                      accent="primary"
                      action={
                        <button
                          type="button"
                          onClick={() => setVisitFormOpen(true)}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                        >
                          <Plus className="size-3.5" />
                          Új látogatás
                        </button>
                      }
                    >
                      {visitsLoading ? (
                        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                          <DoorOpen className="mr-2 size-5 animate-pulse text-primary motion-reduce:animate-none" />
                          Látogatások betöltése…
                        </div>
                      ) : !visits || visits.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                          <DoorOpen className="mx-auto mb-3 size-10 opacity-35" />
                          Nincs rögzített családlátogatás.
                          <p className="mt-2 text-xs text-muted-foreground">
                            Az „Új látogatás” gombbal rögzíthet egy új családlátogatást — amely a Munkanaplóban is megjelenik.
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
                      <div className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-4 text-sm italic text-muted-foreground">
                        Nincs rögzített befizetés ehhez a családhoz.
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                        <div className="max-h-72 overflow-auto overscroll-contain">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-muted/80 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                              <tr>
                                <th className="px-3 py-2">Dátum</th>
                                <th className="px-3 py-2">Cél</th>
                                <th className="px-3 py-2 text-right">Összeg</th>
                                <th className="hidden px-3 py-2 sm:table-cell">Bizonylat</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/70">
                              {payments.map((p) => (
                                <tr key={p.id} className="transition-colors hover:bg-primary/5 motion-reduce:transition-none">
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {formatShortDate(p.datum)}
                                  </td>
                                  <td className="px-3 py-2 text-foreground">
                                    {p.befizetescel?.nev || '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                                    {Number(p.osszeg || 0).toFixed(0)} RON
                                  </td>
                                  <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground sm:table-cell">
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

                <footer className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-border/70 bg-card/95 px-4 py-3 shadow-[0_-14px_30px_-26px_rgba(15,67,61,0.7)] backdrop-blur-md sm:px-6">
                  <p className="hidden text-xs text-muted-foreground sm:block">
                    {children.length + Number(Boolean(family.ferfi)) + Number(Boolean(family.no))} családtag · {payments.length} befizetés
                  </p>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditFamilyOpen(true)}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary/20 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      <Pencil className="size-3.5" />
                      Család szerkesztése
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      Bezárás
                    </button>
                  </div>
                </footer>
              </>
            )}
          </div>
        </div>
      </DialogContent>

      {/* 2026-06-02: Drill-down dialog — egy person-kartonra kattintáskor. */}
      {/* 2026-06-11: fénykép + közösségi link szerkesztő */}
      <AvatarEditorDialog
        open={!!avatarEditPerson}
        onOpenChange={(o) => { if (!o) setAvatarEditPerson(null) }}
        person={avatarEditPerson}
        onSaved={() => setReloadKey((k) => k + 1)}
      />

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
      />

      {/* 2026-06-02: Családi karton szerkesztése (cím, körzet, tagok) */}
      <FamilyFormDialog
        open={editFamilyOpen}
        onOpenChange={(open) => {
          setEditFamilyOpen(open)
          if (!open && familyId) {
            // Reload az adatokat — a felhasználó esetleg módosította
            getFamilyDetails(familyId).then(setData)
          }
        }}
        editFamily={
          family
            ? {
                id: family.id,
                c_utcaid: family.c_utcaid ?? null,
                c_szam: family.c_szam ?? null,
                isaktiv: family.isaktiv ?? true,
                id_csoport: family.id_csoport ?? null,
                ferfi: family.ferfi
                  ? {
                      id: family.ferfi.id,
                      csaladnev: family.ferfi.csaladnev ?? '',
                      k_nev: family.ferfi.k_nev ?? '',
                      ferfi: true,
                      sz_datum: family.ferfi.sz_datum ?? null,
                      allapot: family.ferfi.allapot ?? null,
                      meghalt: !!family.ferfi.meghalt,
                      namepattern: family.ferfi.namepattern ?? null,
                      vallas: family.ferfi.vallas ?? null,
                    }
                  : null,
                no: family.no
                  ? {
                      id: family.no.id,
                      csaladnev: family.no.csaladnev ?? '',
                      k_nev: family.no.k_nev ?? '',
                      ferfi: false,
                      sz_datum: family.no.sz_datum ?? null,
                      allapot: family.no.allapot ?? null,
                      meghalt: !!family.no.meghalt,
                      namepattern: family.no.namepattern ?? null,
                      vallas: family.no.vallas ?? null,
                    }
                  : null,
                utca: family.utca?.name ? { name: family.utca.name } : null,
                gyerekek: children.map((child) => ({
                  id: child.id,
                  csaladnev: child.csaladnev,
                  k_nev: child.k_nev,
                  sz_datum: child.sz_datum,
                  meghalt: child.meghalt,
                  kep: child.kep ?? null,
                })),
              }
            : null
        }
      />

      {/* 2026-06-02: Új családlátogatás rögzítése — közös form a munkanaplóval */}
      <FamilyVisitFormDialog
        open={visitFormOpen}
        onOpenChange={setVisitFormOpen}
        familyId={familyId}
        familyLabel={familyName}
        onSaved={refreshVisits}
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
  icon: ReactNode
  label: string
  count?: number
}) {
  const baseClasses =
    'relative my-1.5 inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-semibold transition-all motion-reduce:transition-none sm:px-4 '
  const activeClasses = active
    ? 'bg-background text-primary shadow-sm ring-1 ring-border/60'
    : 'text-muted-foreground hover:bg-background/55 hover:text-foreground'
  const badgeClasses = active
    ? 'bg-primary/10 text-primary'
    : 'bg-muted text-muted-foreground'
  return (
    <button type="button" onClick={onClick} className={baseClasses + activeClasses} aria-current={active ? 'page' : undefined}>
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
      {active && <span aria-hidden className="absolute inset-x-4 -bottom-1.5 h-0.5 rounded-full bg-amber-400" />}
    </button>
  )
}

function Pill({
  icon,
  tone,
  children,
}: {
  icon?: ReactNode
  tone: 'slate' | 'primary' | 'amber' | 'emerald' | 'rose'
  children: ReactNode
}) {
  const TONES: Record<typeof tone, string> = {
    slate: 'border-border bg-card text-foreground',
    primary: 'border-primary/15 bg-primary/8 text-primary',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300',
    rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
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
  action,
}: {
  title: string
  icon: ReactNode
  accent: 'primary' | 'amber' | 'emerald' | 'rose'
  children: ReactNode
  /** Opcionális akció-gomb a header jobb oldalán */
  action?: ReactNode
}) {
  const ACCENT: Record<typeof accent, { icon: string; text: string }> = {
    primary: { icon: 'bg-primary/10 text-primary', text: 'text-primary' },
    amber: { icon: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300', text: 'text-amber-700 dark:text-amber-300' },
    emerald: { icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300', text: 'text-emerald-700 dark:text-emerald-300' },
    rose: { icon: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300', text: 'text-rose-700 dark:text-rose-300' },
  }
  const tone = ACCENT[accent]

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className={`flex items-center gap-2.5 ${tone.text}`}>
          <span className={`inline-flex size-8 items-center justify-center rounded-xl ${tone.icon}`}>{icon}</span>
          <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
        </div>
        {action}
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
  kep?: string | null
  social_profil_url?: string | null
}

function MemberPanel({
  role,
  member,
  onClick,
  onEditAvatar,
}: {
  role: 'head' | 'spouse'
  member: MemberShape
  onClick?: () => void
  /** 2026-06-11: fénykép/közösségi link szerkesztő megnyitása. */
  onEditAvatar?: () => void
}) {
  const isHead = role === 'head'
  const Icon = isHead ? Crown : Heart
  const labelText = isHead ? 'Családfő' : 'Házastárs'
  const labelTone = isHead
    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
    : 'border-primary/15 bg-primary/8 text-primary'
  const age = ageFromDate(member.sz_datum)

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 text-left shadow-sm transition-all hover:border-primary/20 hover:shadow-md motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none">
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          title="Személyi karton megnyitása"
          aria-label={`${member.csaladnev} ${member.k_nev} személyi kartonjának megnyitása`}
        />
      )}
      <div className="pointer-events-none relative z-10 flex items-start gap-3">
        <div className="relative shrink-0">
          <MemberAvatar
            name={`${member.csaladnev} ${member.k_nev}`.trim()}
            kepUrl={member.kep}
            meghalt={member.meghalt}
            size={48}
            ring={isHead}
          />
          {onEditAvatar && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEditAvatar()
              }}
              className="pointer-events-auto absolute -bottom-3 -right-3 z-20 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition hover:scale-105 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              title="Fénykép társítása"
              aria-label="Fénykép társítása"
            >
              <span className="inline-flex size-6 items-center justify-center rounded-full border border-border bg-card shadow-sm">
                <Camera className="size-3" />
              </span>
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${labelTone}`}>
            <Icon className="size-2.5" />
            {labelText}
          </span>
          <h4
            className={`mt-1 text-base font-semibold leading-snug ${
              member.meghalt ? 'text-muted-foreground line-through' : 'text-foreground'
            }`}
          >
            {member.meghalt && '† '}
            {member.csaladnev} {member.k_nev}
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {age != null ? `${age} éves` : 'kor ismeretlen'}
            {member.vallas && ` · ${member.vallas}`}
            {member.foglalkozas && ` · ${member.foglalkozas}`}
            {member.allapot && ` · ${member.allapot}`}
          </p>
          {member.telefon && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary">
              <Phone className="size-3" />
              {member.telefon}
            </p>
          )}
        </div>
      </div>
    </div>
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
  { label: string; icon: ReactNode; tone: string }
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
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Desktop táblázat */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/70 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-32">Esemény</th>
              <th className="px-3 py-2 w-28">Dátum</th>
              <th className="px-3 py-2">Érintett személy</th>
              <th className="px-3 py-2">Helyszín</th>
              <th className="px-3 py-2">Lelkész</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((row) => {
              const meta = REGISTRY_TYPE_META[row.type]
              return (
                <tr key={row.key} className="transition-colors hover:bg-primary/5 motion-reduce:transition-none">
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                    {formatShortDate(row.date)}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {row.person ?? <span className="italic text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.location ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.pastor ?? <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobil: kompakt kártya-lista */}
      <div className="divide-y divide-border/70 sm:hidden">
        {rows.map((row) => {
          const meta = REGISTRY_TYPE_META[row.type]
          return (
            <div key={row.key} className="space-y-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
                  {meta.icon}
                  {meta.label}
                </span>
                <span className="text-xs font-medium text-foreground">
                  {formatShortDate(row.date)}
                </span>
              </div>
              {row.person && (
                <div className="text-sm text-foreground">{row.person}</div>
              )}
              {(row.location || row.pastor) && (
                <div className="text-[11px] text-muted-foreground">
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
    <ol className="relative ml-3 space-y-3 border-l-2 border-primary/20 pl-5">
      {visits.map((v) => (
        <li key={v.id} className="relative">
          {/* időpont-pötty */}
          <span
            aria-hidden
            className="absolute -left-[27px] top-2.5 flex size-4 items-center justify-center rounded-full border-2 border-primary/30 bg-card"
          >
            <span className="size-1.5 rounded-full bg-amber-400" />
          </span>
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md motion-reduce:transition-none">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">
                {formatShortDate(v.datum)}
              </span>
              {v.lelkesz && (
                <span className="text-xs text-muted-foreground">
                  <span className="text-muted-foreground/70">Lelkész: </span>
                  {v.lelkesz}
                </span>
              )}
            </div>
            {v.alapige && (
              <p className="mt-1.5 rounded-lg bg-primary/5 px-2.5 py-2 text-sm italic text-primary">
                <span className="text-amber-500">„</span>{v.alapige}<span className="text-amber-500">”</span>
              </p>
            )}
            {v.megjegyzes && (
              <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
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
