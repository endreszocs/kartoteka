'use client'

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CreditCard,
  GitBranch,
  IdCard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Printer,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react'
import { MemberAvatar } from '@kartoteka/ui-app'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { getMemberDetails, updateMemberNote, updateRegistryEventNote, updateMemberConsents } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { getMemberFamilySummary } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { getTransactionDocumentNumber } from '@/lib/constants/finance'
import { ageFromDate } from '@/lib/utils/date'
import { cn } from '@/lib/utils'
import type { EnrichedMember } from '@/lib/constants/members'
import { toast } from 'sonner'
import { MemberCertificateDialog } from '@/components/members/member-certificate-dialog'
import { MemberStatusBadge } from '@/components/members/member-status-badge'

interface MemberDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: EnrichedMember | null
  familyId: number | null
  onEdit?: () => void
  onShowFamilyTree?: (memberId: number) => void
  onOpenFamily?: (familyId: number) => void
  /** 2026-07-24 (PR-4 F5.8): a kartonon mentett megjegyzés/hozzájárulás után hívódik —
   *  a lista így frissülhet, különben újranyitáskor a mentés ELŐTTI adat látszik. */
  onDataChanged?: () => void
}

type Tab = 'personal' | 'registry' | 'payments' | 'privacy' | 'arrears'
type MemberDetailsData = Awaited<ReturnType<typeof getMemberDetails>>
type FamilySummaryData = Awaited<ReturnType<typeof getMemberFamilySummary>>

interface ConsentSnapshot {
  gdprConsentAt: string | null
  photoConsent: boolean
  mailingConsent: boolean
}

const BASE_TABS: Array<{ value: Exclude<Tab, 'arrears'>; label: string; icon: typeof User }> = [
  { value: 'personal', label: 'Összefoglaló', icon: User },
  { value: 'registry', label: 'Anyakönyv', icon: BookOpen },
  { value: 'payments', label: 'Befizetések', icon: CreditCard },
  { value: 'privacy', label: 'Adatvédelem', icon: ShieldCheck },
]

function formatDisplayDate(value?: string | null) {
  if (!value) return 'Nincs rögzítve'

  const normalized = value.includes('T') ? value : `${value}T00:00:00`
  const parsed = new Date(normalized)

  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsed)
}

function getBaseName(member: EnrichedMember) {
  const baseName = [member.csaladnev, member.k_nev].filter(Boolean).join(' ').trim()
  return baseName || '-'
}

function getMemberPrefix(member: Pick<EnrichedMember, 'allapot' | 'namepattern'>) {
  const prefixes: string[] = []

  if (member.allapot === 'elvált') prefixes.push('elv.')
  if (member.allapot === 'özvegy') prefixes.push('özv.')
  if (member.namepattern) prefixes.push(member.namepattern)

  return prefixes.length > 0 ? prefixes.join(' ') : null
}

function joinAddress(member: EnrichedMember) {
  const parts = [
    member.adrlocality?.name,
    member.adrstreet?.name,
    member.c_szam,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : 'Nincs rögzítve'
}

function getMembershipPresentation(member: EnrichedMember) {
  const status = (member.member_status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const religion = (member.vallas || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (member.meghalt || member.paymentStatus === 'elhunyt') {
    return { label: 'Elhunyt', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' }
  }
  if (member.elkoltozott || status === 'elkoltozott' || member.paymentStatus === 'elkoltozott') {
    return { label: 'Elköltözött', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' }
  }
  if (status === 'kitert' || member.paymentStatus === 'kitert') {
    return { label: 'Kitért', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' }
  }
  if (status === 'torolt') {
    return { label: 'Törölt', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' }
  }
  if (religion === 'reformatus' || member.hasEverPaid) {
    return { label: 'Aktív tag', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' }
  }
  if (religion) {
    return { label: 'Más vallású', className: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' }
  }
  return { label: 'Nem aktív', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' }
}

function buildDirectionsUrl(member: EnrichedMember) {
  const destination = joinAddress(member)
  if (!destination || destination === 'Nincs rögzítve') return null
  // 2026-07-17 (PR-1): ország-kontexus a query-ben — település nélküli/azonos nevű
  // utcáknál a Google különben a világ bármely pontjára irányíthat.
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${destination}, România`)}`
}

function getRelationName(
  relation?: { name?: string | null } | Array<{ name?: string | null }> | null
) {
  if (!relation) return null
  if (Array.isArray(relation)) return relation[0]?.name ?? null
  return relation.name ?? null
}

function getFamilyPersonName(person: { csaladnev: string | null; k_nev: string | null }) {
  return [person.csaladnev, person.k_nev].filter(Boolean).join(' ').trim() || 'Név nélküli személy'
}

export function MemberDetailsDialogV2({
  open,
  onOpenChange,
  member,
  familyId,
  onEdit,
  onShowFamilyTree,
  onOpenFamily,
  onDataChanged,
}: MemberDetailsDialogProps) {
  const [details, setDetails] = useState<MemberDetailsData | null>(null)
  const [familySummary, setFamilySummary] = useState<FamilySummaryData>(null)
  const [consentSnapshot, setConsentSnapshot] = useState<ConsentSnapshot>({
    gdprConsentAt: null,
    photoConsent: false,
    mailingConsent: false,
  })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [tab, setTab] = useState<Tab>('personal')
  // 2026-06-10 (Fázis 5, P3-3): tagsági igazolás nyomtatása
  const [certOpen, setCertOpen] = useState(false)

  useEffect(() => {
    if (!open || !member) return

    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      setDetails(null)
      setFamilySummary(null)
      setLoading(true)
      setLoadError(false)
      setTab('personal')

      const familySummaryRequest = familyId
        ? getMemberFamilySummary(familyId).catch(() => null)
        : Promise.resolve(null)

      Promise.all([getMemberDetails(member.id, familyId), familySummaryRequest])
        .then(([data, nextFamilySummary]) => {
          if (cancelled) return
          setDetails(data)
          setFamilySummary(nextFamilySummary)
          setLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          setLoadError(true)
          setLoading(false)
        })
    })

    return () => {
      cancelled = true
    }
  }, [open, member, familyId, reloadToken])

  useEffect(() => {
    if (!member) return

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setConsentSnapshot({
        gdprConsentAt: member.gdpr_consent_at,
        photoConsent: Boolean(member.photo_consent),
        mailingConsent: Boolean(member.mailing_consent),
      })
    })

    return () => {
      cancelled = true
    }
  }, [member])

  const paymentTotal = useMemo(() => {
    // 2026-07-24 (PR-4 F5.4): a stornózott tétel NEM számít az összegbe (F1-4 elv).
    return (details?.befizetesek || []).reduce(
      (sum, item) => sum + (item.stornozott ? 0 : Number(item.osszeg || 0)),
      0,
    )
  }, [details])

  if (!member) return null

  // 2026-07-24 (PR-4 F5.2): a Hátralék fül a TÉNYLEGES hátralék-bontásból dönt,
  // nem a bemenő member.paymentStatus-ból — így (a) a családi kartonról nyitott
  // karton (hard-kódolt 'rendezve') és (b) az idénre rendezett, de RÉGI években
  // tartozó tag többéves tartozása is látható. Amíg a részletek töltődnek, a
  // lista-státusz a fallback.
  const hasArrears = details
    ? (details.arrearsBreakdown || []).length > 0
    : member.paymentStatus === 'hatralekos'
  const tabs: Array<{ value: Tab; label: string; icon: typeof User | typeof AlertTriangle }> = hasArrears
    ? [...BASE_TABS, { value: 'arrears', label: 'Hátralék', icon: AlertTriangle }]
    : BASE_TABS

  const prefix = getMemberPrefix(member)
  const baseName = getBaseName(member)
  const age = ageFromDate(member.sz_datum)
  const membership = getMembershipPresentation(member)
  const arrearsTotal = (details?.arrearsBreakdown || []).reduce((sum, row) => sum + row.debt, 0)
  const directionsUrl = buildDirectionsUrl(member)
  const currentIsFamilyAdult = familySummary?.adults.some((person) => person.id === member.id) ?? false

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: Tab) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()

    const currentIndex = tabs.findIndex((item) => item.value === currentTab)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % tabs.length
          : (currentIndex - 1 + tabs.length) % tabs.length
    const nextTab = tabs[nextIndex]?.value
    if (!nextTab) return

    setTab(nextTab)
    requestAnimationFrame(() => document.getElementById(`member-tab-${nextTab}`)?.focus())
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="h-dvh gap-0 overflow-hidden border-primary/15 bg-card p-0 shadow-[-32px_0_90px_-48px_rgba(8,58,54,0.55)] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-[side=right]:w-full data-[side=right]:max-w-none data-[side=right]:data-ending-style:translate-x-full data-[side=right]:data-starting-style:translate-x-full data-[side=right]:sm:w-[min(92vw,56rem)] data-[side=right]:sm:max-w-[56rem] data-[side=right]:xl:w-[min(48vw,56rem)] data-[side=right]:xl:max-w-[56rem] motion-reduce:transition-none"
      >
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
          <header className="relative shrink-0 border-b border-primary/10 bg-gradient-to-br from-primary/10 via-card to-accent/10 px-4 pb-4 [padding-top:max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pb-5 [@media(max-height:600px)]:pb-2 [@media(max-height:600px)]:[padding-top:max(0.5rem,env(safe-area-inset-top))]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70">
                  Tagnyilvántartás
                </p>
                <SheetTitle className="mt-0.5 font-heading text-2xl font-medium tracking-tight text-foreground">
                  Személyi karton
                </SheetTitle>
                <SheetDescription className="sr-only">
                  {baseName} személyes, családi, anyakönyvi és pénzügyi adatainak áttekintése.
                </SheetDescription>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {onEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 rounded-xl bg-background/80 px-3"
                    onClick={onEdit}
                  >
                    <Pencil className="size-3.5" />
                    <span className="hidden min-[420px]:inline">Szerkesztés</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-11 rounded-xl p-0 text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  onClick={() => onOpenChange(false)}
                  aria-label="Személyi karton bezárása"
                >
                  <X className="size-5" />
                </Button>
              </div>
            </div>

            <div className="mt-4 flex min-w-0 items-start gap-3.5 sm:gap-4 [@media(max-height:600px)]:mt-2">
              <div className="shrink-0 [@media(max-height:600px)]:hidden">
                <MemberAvatar
                  name={baseName}
                  kepUrl={member.photo_url}
                  meghalt={member.meghalt}
                  size={68}
                  ring
                  className="motion-reduce:hover:scale-100"
                />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 className="font-heading text-[1.7rem] font-semibold leading-none text-foreground sm:text-[2rem] [@media(max-height:600px)]:text-xl">
                  {prefix && <span className="mr-2 text-primary">{prefix}</span>}
                  <span className="break-words">{baseName}</span>
                </h2>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                  {age !== null && <span>{age} éves</span>}
                  {age !== null && member.adrlocality?.name && <span aria-hidden="true">•</span>}
                  {member.adrlocality?.name && <span>{member.adrlocality.name}</span>}
                  {!member.adrlocality?.name && member.birthLocality?.name && <span>{member.birthLocality.name}</span>}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Badge className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold ${membership.className}`}>
                    {membership.label}
                  </Badge>
                  <MemberStatusBadge status={member.paymentStatus} />
                  {member.cnp && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                      <IdCard className="size-3" /> {member.cnp}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 [@media(max-height:600px)]:mt-1 [@media(max-height:600px)]:gap-1.5">
              <MemberQuickAction icon={<Phone className="size-4" />} label="Telefon" href={member.telefon ? `tel:${member.telefon}` : null} />
              <MemberQuickAction icon={<Mail className="size-4" />} label="E-mail" href={member.email ? `mailto:${member.email}` : null} />
              <MemberQuickAction icon={<MapPin className="size-4" />} label="Útvonal" href={directionsUrl} external />
            </div>
          </header>

          <nav
            className={`sticky top-0 z-10 flex shrink-0 overflow-x-auto border-b border-border/60 bg-card/95 px-3 backdrop-blur-sm ${hasArrears ? 'sm:px-6 md:grid md:grid-cols-5 md:overflow-visible' : 'sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-6'}`}
            aria-label="Személyi karton részei"
            aria-orientation="horizontal"
            role="tablist"
          >
              {tabs.map(({ value, label, icon: Icon }) => {
                const active = tab === value
                const isArrears = value === 'arrears'
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTab(value)}
                    onKeyDown={(event) => handleTabKeyDown(event, value)}
                    disabled={loading}
                    id={`member-tab-${value}`}
                    role="tab"
                    aria-selected={active}
                    aria-controls={`member-panel-${value}`}
                    tabIndex={active ? 0 : -1}
                    className={`relative inline-flex min-h-12 min-w-max items-center justify-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-[12px] font-semibold transition disabled:cursor-wait disabled:opacity-60 ${hasArrears ? 'md:w-full md:min-w-0 md:px-2 md:text-[13px]' : 'sm:w-full sm:min-w-0 sm:px-2 sm:text-[13px]'} motion-reduce:transition-none [@media(max-height:600px)]:min-h-11 ${
                      active
                        ? isArrears
                          ? 'border-rose-500 text-rose-700 dark:text-rose-300'
                          : 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:border-primary/25 hover:text-foreground'
                    }`}
                  >
                    <Icon className="size-4" />
                    <span>{label}</span>
                  </button>
                )
              })}
          </nav>

          <div
            id={`member-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`member-tab-${tab}`}
            aria-busy={loading}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background/55 px-3.5 py-4 sm:px-6 sm:py-5 [@media(max-height:600px)]:py-2.5"
          >
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2" role="status" aria-live="polite" aria-label="Személyi karton betöltése">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted/70 ring-1 ring-border/50 motion-reduce:animate-none" />
                ))}
              </div>
            ) : loadError ? (
              <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/70 px-6 text-center dark:border-rose-900/60 dark:bg-rose-950/20">
                <AlertTriangle className="size-8 text-rose-600" />
                <h3 className="mt-3 font-heading text-lg font-semibold text-foreground">A karton részletei nem tölthetők be</h3>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">Az alapadatok láthatók, de az anyakönyvi és pénzügyi adatok lekérése most nem sikerült.</p>
                <Button variant="outline" className="mt-4 min-h-11 rounded-xl bg-background" onClick={() => setReloadToken((current) => current + 1)}>
                  Újrapróbálom
                </Button>
              </div>
            ) : (
              <>
                {tab === 'personal' && (
                  <div className="space-y-3.5">
                    <SummaryPanel eyebrow="Kapcsolattartás" title="Elérhetőségek" icon={<Phone className="size-4" />}>
                      <div className="divide-y divide-border/45">
                        <SummaryContactRow
                          icon={<Phone className="size-4" />}
                          label="Mobil"
                          value={member.telefon || 'Nincs rögzítve'}
                          href={member.telefon ? `tel:${member.telefon}` : null}
                        />
                        <SummaryContactRow
                          icon={<Mail className="size-4" />}
                          label="E-mail"
                          value={member.email || 'Nincs rögzítve'}
                          href={member.email ? `mailto:${member.email}` : null}
                        />
                        <SummaryContactRow
                          icon={<MapPin className="size-4" />}
                          label="Lakcím"
                          value={joinAddress(member)}
                          href={directionsUrl}
                          external
                        />
                      </div>
                    </SummaryPanel>

                    <SummaryPanel eyebrow="Kapcsolatok" title="Családi háttér" icon={<Users className="size-4" />}>
                      {familySummary ? (
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/45 pb-3">
                            <div className="min-w-0">
                              <p className="truncate font-heading text-base font-semibold text-foreground">{familySummary.displayName}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{familySummary.memberCount} fő · közös háztartás</p>
                            </div>
                            {familyId && onOpenFamily && (
                              <Button
                                type="button"
                                variant="ghost"
                                className="size-11 shrink-0 rounded-xl p-0 text-primary"
                                onClick={() => {
                                  onOpenChange(false)
                                  setTimeout(() => onOpenFamily(familyId), 150)
                                }}
                                aria-label={`${familySummary.displayName} családi kartonjának megnyitása`}
                              >
                                <ChevronRight className="size-5" />
                              </Button>
                            )}
                          </div>

                          <div className="mt-1 divide-y divide-border/45">
                            {/* 2026-07-24 (PR-4 F5.5): a címkék a TÉNYLEGES haztartas_tag-
                                szerepből jönnek (nem heurisztikából), és egy gyermek
                                kartonján a testvérei „Testvér" címkét kapnak. */}
                            {familySummary.adults.map((person) => (
                              <FamilySummaryRow
                                key={`adult-${person.id}`}
                                name={getFamilyPersonName(person)}
                                relation={
                                  person.id === member.id
                                    ? 'Ő maga'
                                    : person.role === 'csaladfo'
                                      ? (currentIsFamilyAdult ? 'Házastárs (családfő)' : 'Családfő')
                                      : person.role === 'hazastars'
                                        ? (currentIsFamilyAdult ? 'Házastárs' : 'Szülő')
                                        : 'Szülő / családfő'
                                }
                                birthDate={person.sz_datum}
                              />
                            ))}
                            {familySummary.children.map((person) => (
                              <FamilySummaryRow
                                key={`child-${person.id}`}
                                name={getFamilyPersonName(person)}
                                relation={
                                  person.id === member.id
                                    ? 'Ő maga'
                                    : !currentIsFamilyAdult
                                      ? 'Testvér'
                                      : person.role === 'unoka'
                                        ? 'Unoka'
                                        : 'Gyermek'
                                }
                                birthDate={person.sz_datum}
                              />
                            ))}
                            {familySummary.childrenCount > familySummary.children.length && (
                              <p className="py-2.5 text-xs font-medium text-primary">
                                + {familySummary.childrenCount - familySummary.children.length} további gyermek vagy unoka
                              </p>
                            )}
                            {familySummary.adults.length === 0 && familySummary.childrenCount === 0 && (
                              <p className="py-3 text-xs text-muted-foreground">A családhoz még nincs aktív személykapcsolat rögzítve.</p>
                            )}
                          </div>
                        </div>
                      ) : familyId ? (
                        <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                          A család részletes kapcsolatai most nem elérhetők.
                        </p>
                      ) : (
                        <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                          Nincs családhoz rendelve.
                        </p>
                      )}

                      <div className="mt-3 grid gap-x-6 border-t border-border/45 pt-1 sm:grid-cols-2">
                        <SummaryDefinitionRow label="Édesapa" value={member.apjaneve || 'Nincs rögzítve'} />
                        <SummaryDefinitionRow label="Édesanya" value={member.anyjaneve || 'Nincs rögzítve'} />
                      </div>
                      <div className="mt-3 flex flex-col gap-2 border-t border-border/45 pt-3 min-[420px]:flex-row">
                        {familyId && onOpenFamily ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11 flex-1 justify-start rounded-xl bg-background/80"
                            onClick={() => {
                              onOpenChange(false)
                              setTimeout(() => onOpenFamily(familyId), 150)
                            }}
                          >
                            <Users className="size-4" />
                            Családi karton · #{familyId}
                          </Button>
                        ) : (
                          <p className="flex min-h-11 flex-1 items-center rounded-xl border border-dashed border-border px-3 text-xs text-muted-foreground">
                            Nincs családhoz rendelve
                          </p>
                        )}
                        {onShowFamilyTree && (
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11 rounded-xl bg-background/80"
                            onClick={() => onShowFamilyTree(member.id)}
                          >
                            <GitBranch className="size-4" />
                            Családfa
                          </Button>
                        )}
                      </div>
                    </SummaryPanel>

                    <SummaryPanel eyebrow="Gyülekezeti törzsadatok" title="Gyülekezeti adatok" icon={<BookOpen className="size-4" />}>
                      <div className="divide-y divide-border/45">
                        <SummaryDefinitionRow label="Tagsági állapot" value={membership.label} />
                        <SummaryDefinitionRow label="Vallás" value={member.vallas || 'Nincs rögzítve'} />
                        <SummaryDefinitionRow
                          label="Keresztelés"
                          value={details?.kereszteles?.datum ? formatDisplayDate(details.kereszteles.datum) : 'Nincs rögzítve'}
                        />
                        <SummaryDefinitionRow
                          label="Konfirmáció"
                          value={details?.konfirmacio?.datum ? formatDisplayDate(details.konfirmacio.datum) : 'Nincs rögzítve'}
                        />
                      </div>
                      <div className="mt-4 border-t border-border/60 pt-3">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Személyes törzsadatok</p>
                        <div className="divide-y divide-border/45">
                          <SummaryDefinitionRow
                            icon={<CalendarDays className="size-4" />}
                            label="Születési dátum"
                            value={member.sz_datum ? formatDisplayDate(member.sz_datum) : 'Nincs rögzítve'}
                          />
                          <SummaryDefinitionRow
                            icon={<MapPin className="size-4" />}
                            label="Születési hely"
                            value={member.birthLocality?.name || 'Nincs rögzítve'}
                          />
                          <SummaryDefinitionRow
                            icon={<User className="size-4" />}
                            label="Foglalkozás"
                            value={member.foglalkozas || 'Nincs rögzítve'}
                          />
                        </div>
                      </div>
                    </SummaryPanel>

                    <SummaryPanel eyebrow="Lelkipásztori emlékeztető" title="Megjegyzés" icon={<BookOpen className="size-4" />} tone="amber">
                      <EditableNote
                        initial={member.megjegyzes}
                        placeholder="Pl. látogatási emlékeztető, családi körülmények, imatéma…"
                        onSave={async (note) => {
                          const res = await updateMemberNote(member.id, note)
                          if (!('error' in res && res.error)) onDataChanged?.()
                          return res
                        }}
                      />
                    </SummaryPanel>
                  </div>
                )}

                {tab === 'registry' && (
                  <div className="space-y-4">
                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <RegistryEventCard
                        eyebrow="Keresztelés"
                        title={details?.kereszteles ? formatDisplayDate(details.kereszteles.datum) : 'Nincs rögzítve'}
                        description={[
                          details?.kereszteles?.adrlocality?.name ? `Helyszín: ${details.kereszteles.adrlocality.name}` : null,
                          details?.kereszteles?.lelkeszneve ? `Lelkész: ${details.kereszteles.lelkeszneve}` : null,
                        ].filter(Boolean) as string[]}
                        tone="sky"
                        note={details?.kereszteles?.megjegyzes}
                        onSaveNote={details?.kereszteles ? (n) => updateRegistryEventNote('keresztseg', details.kereszteles.id, n) : undefined}
                      />
                      <RegistryEventCard
                        eyebrow="Konfirmáció"
                        title={details?.konfirmacio ? formatDisplayDate(details.konfirmacio.datum) : 'Nincs rögzítve'}
                        description={[
                          details?.konfirmacio?.adrlocality?.name ? `Helyszín: ${details.konfirmacio.adrlocality.name}` : null,
                          details?.konfirmacio?.lelkeszneve ? `Lelkész: ${details.konfirmacio.lelkeszneve}` : null,
                        ].filter(Boolean) as string[]}
                        tone="violet"
                        note={details?.konfirmacio?.megjegyzes}
                        onSaveNote={details?.konfirmacio ? (n) => updateRegistryEventNote('konfirmalas', details.konfirmacio.id, n) : undefined}
                      />
                      <RegistryEventCard
                        eyebrow="Esküvő"
                        title={details?.hazassag ? formatDisplayDate(details.hazassag.datum) : 'Nincs rögzítve'}
                        description={[
                          getRelationName(details?.hazassag?.adrlocality) ? `Helyszín: ${getRelationName(details?.hazassag?.adrlocality)}` : null,
                          details?.hazassag?.lelkeszneve ? `Lelkész: ${details.hazassag.lelkeszneve}` : null,
                        ].filter(Boolean) as string[]}
                        tone="amber"
                        note={details?.hazassag?.megjegyzes}
                        onSaveNote={details?.hazassag?.id ? (n) => updateRegistryEventNote('hazassag', details.hazassag!.id, n) : undefined}
                      />
                      <RegistryEventCard
                        eyebrow="Beköltözött"
                        title={details?.bekoltozott ? formatDisplayDate(details.bekoltozott.mikor) : 'Nincs rögzítve'}
                        description={[
                          details?.bekoltozott?.adrlocality?.name ? `Honnan: ${details.bekoltozott.adrlocality.name}` : null,
                        ].filter(Boolean) as string[]}
                        tone="teal"
                        note={details?.bekoltozott?.megjegyzes}
                        onSaveNote={details?.bekoltozott ? (n) => updateRegistryEventNote('bekoltozott', details.bekoltozott.id, n) : undefined}
                      />
                      <RegistryEventCard
                        eyebrow="Áttért"
                        title={details?.attert ? formatDisplayDate(details.attert.mikor) : 'Nincs rögzítve'}
                        description={[
                          details?.attert?.adrlocality?.name ? `Honnan: ${details.attert.adrlocality.name}` : null,
                        ].filter(Boolean) as string[]}
                        tone="amber"
                        note={details?.attert?.megjegyzes}
                        onSaveNote={details?.attert ? (n) => updateRegistryEventNote('attert', details.attert.id, n) : undefined}
                      />
                      <RegistryEventCard
                        eyebrow="Temetés"
                        title={details?.temetes ? formatDisplayDate(details.temetes.tdatum || details.temetes.hdatum || null) : 'Nincs rögzítve'}
                        description={[
                          details?.temetes?.adrlocality?.name ? `Helyszín: ${details.temetes.adrlocality.name}` : null,
                          details?.temetes?.lelkeszneve ? `Lelkész: ${details.temetes.lelkeszneve}` : null,
                          details?.temetes?.hoka ? `Halál oka: ${details.temetes.hoka}` : null,
                        ].filter(Boolean) as string[]}
                        tone="rose"
                        note={details?.temetes?.megjegyzes}
                        onSaveNote={details?.temetes ? (n) => updateRegistryEventNote('temetes', details.temetes.id, n) : undefined}
                      />
                    </div>

                    {!details?.kereszteles && !details?.konfirmacio && !details?.hazassag && !details?.bekoltozott && !details?.attert && !details?.temetes && (
                      <EmptyState
                        icon={<BookOpen className="size-10" />}
                        title="Nincs anyakönyvi adat"
                        description="Ehhez a személyhez még nem került rögzítésre keresztelés, konfirmáció vagy más egyházi esemény."
                      />
                    )}
                  </div>
                )}

                {tab === 'payments' && (
                  <div className="space-y-4">
                    <SoftPanel eyebrow="Kapcsolódó pénzügyek" title="Befizetési összkép" icon={<CreditCard className="size-4" />}>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <MiniFact label="Összes tétel" value={`${details?.befizetesek.length || 0} befizetés`} />
                        <MiniFact label="Összeg" value={`${paymentTotal.toFixed(2)} RON`} />
                        <MiniFact
                          label="Legutóbbi év"
                          value={
                            details?.befizetesek[0]?.fizetettev
                              ? `${details.befizetesek[0].fizetettev}. év`
                              : 'Nincs évhez kötve'
                          }
                        />
                      </div>
                    </SoftPanel>

                    {details && details.befizetesek.length > 0 ? (
                      <>
                        <div className="space-y-2 lg:hidden">
                          {details.befizetesek.map((payment) => (
                            <article key={payment.id} className={`rounded-2xl border border-border/60 bg-card p-4 shadow-sm ${payment.stornozott ? 'opacity-60' : ''}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Dátum</p>
                                  <p className="mt-1 font-semibold text-foreground">{formatDisplayDate(payment.datum)}</p>
                                </div>
                                {/* 2026-07-24 (PR-4 F5.4): a stornózott tétel áthúzva + jelölve */}
                                <p className={`shrink-0 font-semibold tabular-nums ${payment.stornozott ? 'text-muted-foreground line-through' : 'text-emerald-700'}`}>{Number(payment.osszeg).toFixed(2)} RON</p>
                              </div>
                              <p className="mt-3 text-sm font-medium text-foreground">
                                {payment.befizetescel?.nev || 'Általános befizetés'}
                                {payment.stornozott && <span className="ml-2 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">STORNÓ</span>}
                              </p>
                              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/50 pt-3 text-xs">
                                <div>
                                  <p className="text-muted-foreground">Év</p>
                                  <p className="mt-0.5 font-medium text-foreground">{payment.fizetettev ? `${payment.fizetettev}. év` : 'Nincs megadva'}</p>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-muted-foreground">Bizonylat</p>
                                  <p className="mt-0.5 break-all font-medium text-foreground">{getTransactionDocumentNumber(payment) || 'Nincs rögzítve'}</p>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                        <div className="hidden overflow-x-auto rounded-2xl border border-border/60 bg-card shadow-[0_18px_45px_-38px_rgba(18,60,54,0.4)] lg:block">
                          <table className="min-w-[760px] w-full text-left text-sm">
                          <thead className="border-b border-border/60 bg-muted/45">
                            <tr>
                              <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Dátum</th>
                              <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Befizetés típusa</th>
                              <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Év</th>
                              <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Bizonylat</th>
                              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Összeg</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/45">
                            {details.befizetesek.map((payment) => (
                              <tr key={payment.id} className={`transition-colors hover:bg-primary/[0.035] motion-reduce:transition-none ${payment.stornozott ? 'opacity-60' : ''}`}>
                                <td className="px-4 py-3 font-medium text-foreground">{formatDisplayDate(payment.datum)}</td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {payment.befizetescel?.nev || 'Általános befizetés'}
                                  {/* 2026-07-24 (PR-4 F5.4): stornó-jelölés */}
                                  {payment.stornozott && <span className="ml-2 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">STORNÓ</span>}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {payment.fizetettev ? `${payment.fizetettev}. év` : 'Nincs megadva'}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {getTransactionDocumentNumber(payment) || 'Nincs rögzítve'}
                                </td>
                                <td className={`px-4 py-3 text-right font-semibold ${payment.stornozott ? 'text-muted-foreground line-through' : 'text-emerald-700'}`}>
                                  {Number(payment.osszeg).toFixed(2)} RON
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <EmptyState
                        icon={<CreditCard className="size-10" />}
                        title="Nincs rögzített befizetés"
                        description="A személyhez kapcsolódó befizetések a Pénzügy modulból jelennek meg itt."
                      />
                    )}

                    {/* 2026-06-10: megjegyzés-mező ezen az almenün is (személy-szintű jegyzet) */}
                    <SoftPanel eyebrow="Lelkipásztori emlékeztető" title="Megjegyzés" icon={<BookOpen className="size-4" />}>
                      <EditableNote
                        initial={member.megjegyzes}
                        placeholder="Pl. fizetési megállapodás, részletfizetés, egyeztetés…"
                        onSave={async (note) => {
                          const res = await updateMemberNote(member.id, note)
                          if (!('error' in res && res.error)) onDataChanged?.()
                          return res
                        }}
                      />
                    </SoftPanel>
                  </div>
                )}

                {tab === 'privacy' && (
                  <div className="space-y-3.5">
                    <SoftPanel eyebrow="Adatkezelési státusz" title="Adatvédelem" icon={<ShieldCheck className="size-4" />}>
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        <InfoCard
                          icon={<ShieldCheck className="size-4" />}
                          label="Adatkezelés"
                          value={consentSnapshot.gdprConsentAt ? 'Hozzájárult' : 'Nincs hozzájárulás'}
                        />
                        <InfoCard
                          icon={<User className="size-4" />}
                          label="Fénykép"
                          value={consentSnapshot.photoConsent ? 'Engedélyezve' : 'Nincs engedélyezve'}
                        />
                        <InfoCard
                          icon={<Mail className="size-4" />}
                          label="Levelezés"
                          value={consentSnapshot.mailingConsent ? 'Engedélyezve' : 'Nincs engedélyezve'}
                        />
                      </div>
                    </SoftPanel>

                    <SoftPanel eyebrow="Hozzájárulások" title="Adatvédelmi beállítások" icon={<ShieldCheck className="size-4" />}>
                      <ConsentEditor
                        memberId={member.id}
                        gdprConsentAt={consentSnapshot.gdprConsentAt}
                        photoConsent={consentSnapshot.photoConsent}
                        mailingConsent={consentSnapshot.mailingConsent}
                        onSaved={(snapshot) => {
                          setConsentSnapshot(snapshot)
                          onDataChanged?.()
                        }}
                      />
                    </SoftPanel>

                    <div className="rounded-2xl border border-primary/10 bg-primary/[0.045] px-4 py-3 text-xs leading-5 text-muted-foreground">
                      A módosítások a személy kartonjához kerülnek. Kizárólag a gyülekezeti jogosultsággal rendelkező felhasználók férhetnek hozzájuk.
                    </div>
                  </div>
                )}

                {tab === 'arrears' && hasArrears && (
                  <div className="space-y-4">
                    <SoftPanel eyebrow="Éves bontás" title="Hátralékok évekre lebontva" icon={<AlertTriangle className="size-4" />}>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <MiniFact label="Érintett évek" value={`${details?.arrearsBreakdown.length || 0} év`} />
                        <MiniFact label="Összes tartozás" value={`${arrearsTotal.toFixed(2)} RON`} />
                        <MiniFact label="Állapot" value="Hátralékos" />
                      </div>
                    </SoftPanel>

                    {details && details.arrearsBreakdown.length > 0 ? (
                      <>
                        <div className="space-y-2 lg:hidden">
                          {details.arrearsBreakdown.map((item) => (
                            <article key={item.year} className="rounded-2xl border border-rose-200/70 bg-card p-4 shadow-sm dark:border-rose-900/60">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Év</p>
                                  <p className="mt-1 font-heading text-xl font-semibold text-foreground">{item.year}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-600">Tartozás</p>
                                  <p className="mt-1 font-semibold tabular-nums text-rose-600">{item.debt.toFixed(2)} RON</p>
                                </div>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/50 pt-3 text-xs">
                                <div><p className="text-muted-foreground">Elvárt</p><p className="mt-0.5 font-medium text-foreground">{item.yearlyFee.toFixed(2)} RON</p></div>
                                <div><p className="text-muted-foreground">Befizetve</p><p className="mt-0.5 font-medium text-foreground">{item.paid.toFixed(2)} RON</p></div>
                              </div>
                            </article>
                          ))}
                        </div>
                        <div className="hidden overflow-x-auto rounded-2xl border border-border/60 bg-card shadow-[0_18px_45px_-38px_rgba(18,60,54,0.4)] lg:block">
                          <table className="min-w-[620px] w-full text-left text-sm">
                          <thead className="border-b border-border/60 bg-muted/45">
                            <tr>
                              <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Év</th>
                              <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Elvárt</th>
                              <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Befizetve</th>
                              <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tartozás</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/45">
                            {details.arrearsBreakdown.map((item) => (
                              <tr key={item.year} className="transition-colors hover:bg-primary/[0.035] motion-reduce:transition-none">
                                <td className="px-4 py-3 font-semibold text-foreground">{item.year}</td>
                                <td className="px-4 py-3 text-muted-foreground">{item.yearlyFee.toFixed(2)} RON</td>
                                <td className="px-4 py-3 text-muted-foreground">{item.paid.toFixed(2)} RON</td>
                                <td className="px-4 py-3 font-semibold text-red-600">{item.debt.toFixed(2)} RON</td>
                              </tr>
                            ))}
                          </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <EmptyState
                        icon={<AlertTriangle className="size-10" />}
                        title="Nincs listázható hátralék"
                        description="Jelenleg nem található olyan év, ahol a járulék és a befizetés különbsége tartozást mutatna."
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <footer className="sticky bottom-0 z-10 flex shrink-0 items-center gap-2 overflow-x-auto border-t border-border/60 bg-card/95 px-3 py-2.5 [padding-bottom:max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:px-6 [@media(max-height:600px)]:px-2 [@media(max-height:600px)]:py-1 [@media(max-height:600px)]:[padding-bottom:max(0.25rem,env(safe-area-inset-bottom))]">
            <div className="flex min-w-max flex-1 gap-2">
              {familyId && onOpenFamily && (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 rounded-xl bg-background/80"
                  onClick={() => {
                    onOpenChange(false)
                    setTimeout(() => onOpenFamily(familyId), 150)
                  }}
                >
                  <Users className="size-4" />
                  Családi karton
                </Button>
              )}
              {onShowFamilyTree && (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 rounded-xl bg-background/80"
                  onClick={() => onShowFamilyTree(member.id)}
                >
                  <GitBranch className="size-4" />
                  Családfa
                </Button>
              )}
            </div>

            <div className="ml-auto flex min-w-max gap-2">
              <Button variant="outline" size="sm" className="min-h-11 rounded-xl bg-background/80 text-primary hover:bg-primary/5" onClick={() => setCertOpen(true)}>
                <Printer className="mr-1.5 size-3.5" />
                Igazolás
              </Button>
            </div>
          </footer>
        </div>
      </SheetContent>
      {/* 2026-06-10 (Fázis 5, P3-3): nyomtatható tagsági igazolás */}
      <MemberCertificateDialog open={certOpen} onOpenChange={setCertOpen} szemelyId={member.id} />
    </Sheet>
  )
}

function MemberQuickAction({
  icon,
  label,
  href,
  external = false,
}: {
  icon: ReactNode
  label: string
  href: string | null
  external?: boolean
}) {
  const className =
    'inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-primary/12 bg-background/75 px-2 text-xs font-semibold shadow-sm transition motion-reduce:transition-none'

  if (!href) {
    return (
      <span className={`${className} cursor-not-allowed text-muted-foreground opacity-55`} aria-disabled="true" title="Nincs rögzítve">
        {icon}
        <span className="truncate">{label}</span>
      </span>
    )
  }

  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={`${className} text-primary hover:-translate-y-0.5 hover:bg-primary/[0.06] hover:shadow-md motion-reduce:transform-none`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </a>
  )
}

function SummaryPanel({
  eyebrow,
  title,
  icon,
  tone = 'default',
  children,
}: {
  eyebrow: string
  title: string
  icon: ReactNode
  tone?: 'default' | 'amber'
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border bg-card p-4 shadow-[0_18px_45px_-38px_rgba(16,70,63,0.45)] sm:p-5',
        tone === 'amber' && 'border-amber-200/80 bg-amber-50/55 dark:border-amber-900/60 dark:bg-amber-950/15',
        tone === 'default' && 'border-border/60',
      )}
    >
      <div className="mb-3.5 flex items-center gap-3">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl',
            tone === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-primary/10 text-primary',
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>
          <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
        </div>
      </div>
      {children}
    </section>
  )
}

function SummaryContactRow({
  icon,
  label,
  value,
  href,
  external = false,
}: {
  icon: ReactNode
  label: string
  value: string
  href: string | null
  external?: boolean
}) {
  const content = (
    <>
      <span className="row-span-2 flex size-8 items-center justify-center rounded-xl bg-primary/[0.07] text-primary sm:row-span-1">
        {icon}
      </span>
      <span className="min-w-0 break-words text-sm font-medium text-foreground">{value}</span>
      <span className="col-start-2 text-[11px] text-muted-foreground sm:col-start-3 sm:row-start-1 sm:text-xs">{label}</span>
    </>
  )
  const className = 'grid min-h-12 grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 py-2.5 sm:grid-cols-[2rem_minmax(0,1fr)_auto]'

  if (!href) return <div className={className}>{content}</div>

  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={`${className} rounded-xl outline-none transition hover:bg-primary/[0.035] focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none`}
    >
      {content}
    </a>
  )
}

function SummaryDefinitionRow({
  icon,
  label,
  value,
}: {
  icon?: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="grid gap-1 py-2.5 text-sm sm:grid-cols-[minmax(9rem,0.6fr)_minmax(0,1fr)] sm:gap-5">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon && <span className="text-primary/80">{icon}</span>}
        {label}
      </span>
      <span className="break-words font-medium text-foreground sm:text-right">{value}</span>
    </div>
  )
}

function FamilySummaryRow({
  name,
  relation,
  birthDate,
}: {
  name: string
  relation: string
  birthDate: string | null
}) {
  const birthYear = birthDate?.match(/^\d{4}/)?.[0] ?? '—'
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2.5 text-sm">
      <span className="truncate font-medium text-foreground">{name}</span>
      <span className="text-xs text-muted-foreground">{relation}</span>
      <span className="min-w-9 text-right font-mono text-xs tabular-nums text-muted-foreground">{birthYear}</span>
    </div>
  )
}

function SoftPanel({
  eyebrow,
  title,
  icon,
  children,
}: {
  eyebrow: string
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_18px_45px_-38px_rgba(16,70,63,0.45)] sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>
          <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
        </div>
      </div>
      {children}
    </section>
  )
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/30 p-3.5">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-background text-primary shadow-sm ring-1 ring-border/50">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-foreground">{value}</p>
        </div>
      </div>
    </div>
  )
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/35 px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function RegistryEventCard({
  eyebrow,
  title,
  description,
  tone,
  note,
  onSaveNote,
}: {
  eyebrow: string
  title: string
  description: string[]
  tone: 'sky' | 'violet' | 'teal' | 'amber' | 'rose'
  /** 2026-06-10: az eseményhez tartozó megjegyzés (megjegyzes oszlop) */
  note?: string | null
  /** Ha megadva, a kártya alján szerkeszthető megjegyzés-mező jelenik meg. */
  onSaveNote?: (note: string) => Promise<{ error?: string } | { success?: boolean }>
}) {
  const toneClasses = {
    sky: 'from-sky-50/80 to-cyan-50/60 border-sky-100 dark:from-sky-950/25 dark:to-card dark:border-sky-900/50',
    violet: 'from-violet-50/80 to-fuchsia-50/60 border-violet-100 dark:from-violet-950/25 dark:to-card dark:border-violet-900/50',
    teal: 'from-teal-50/80 to-emerald-50/60 border-teal-100 dark:from-teal-950/25 dark:to-card dark:border-teal-900/50',
    amber: 'from-amber-50/80 to-orange-50/60 border-amber-100 dark:from-amber-950/25 dark:to-card dark:border-amber-900/50',
    rose: 'from-rose-50/80 to-pink-50/60 border-rose-100 dark:from-rose-950/25 dark:to-card dark:border-rose-900/50',
  }[tone]

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${toneClasses} p-4 shadow-[0_18px_40px_-36px_rgba(21,84,74,0.35)] sm:p-5`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      <p className="mt-2 font-heading text-lg font-semibold text-foreground">{title}</p>
      <div className="mt-3 space-y-1.5">
        {description.length > 0 ? (
          description.map((line) => (
            <p key={line} className="text-sm text-muted-foreground">
              {line}
            </p>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Nincs további részlet.</p>
        )}
      </div>
      {onSaveNote && (
        <div className="mt-3 border-t border-border/45 pt-3">
          <EditableNote initial={note} placeholder="Megjegyzés ehhez az eseményhez…" onSave={onSaveNote} />
        </div>
      )}
    </div>
  )
}

// 2026-06-10 (Fázis 5, P3-5): GDPR-hozzájárulások szerkesztője.
// Három kapcsoló: adatkezelés / fotó / levelezés. Az adatkezelési hozzájárulás
// dátumát a szerver állítja (első bejelölésnél a mai nap).
function ConsentEditor({
  memberId,
  gdprConsentAt,
  photoConsent,
  mailingConsent,
  onSaved,
}: {
  memberId: number
  gdprConsentAt: string | null
  photoConsent: boolean
  mailingConsent: boolean
  onSaved: (snapshot: ConsentSnapshot) => void
}) {
  const [gdpr, setGdpr] = useState(!!gdprConsentAt)
  const [photo, setPhoto] = useState(!!photoConsent)
  const [mailing, setMailing] = useState(!!mailingConsent)
  const [consentDate, setConsentDate] = useState<string | null>(gdprConsentAt)
  const [baseline, setBaseline] = useState({
    gdpr: Boolean(gdprConsentAt),
    photo: Boolean(photoConsent),
    mailing: Boolean(mailingConsent),
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const nextBaseline = {
        gdpr: Boolean(gdprConsentAt),
        photo: Boolean(photoConsent),
        mailing: Boolean(mailingConsent),
      }
      setGdpr(nextBaseline.gdpr)
      setPhoto(nextBaseline.photo)
      setMailing(nextBaseline.mailing)
      setConsentDate(gdprConsentAt)
      setBaseline(nextBaseline)
    })
    return () => { cancelled = true }
  }, [gdprConsentAt, photoConsent, mailingConsent])

  const dirty = gdpr !== baseline.gdpr || photo !== baseline.photo || mailing !== baseline.mailing

  async function handleSave() {
    setSaving(true)
    const res = await updateMemberConsents(memberId, { gdpr_consent: gdpr, photo_consent: photo, mailing_consent: mailing })
    setSaving(false)
    if (res?.error) { toast.error(res.error); return }
    const nextConsentDate = gdpr ? consentDate || new Date().toISOString() : null
    const nextBaseline = { gdpr, photo, mailing }
    setConsentDate(nextConsentDate)
    setBaseline(nextBaseline)
    onSaved({
      gdprConsentAt: nextConsentDate,
      photoConsent: photo,
      mailingConsent: mailing,
    })
    toast.success('Hozzájárulások mentve.')
  }

  const toggles: { checked: boolean; set: (v: boolean) => void; label: string; hint: string }[] = [
    { checked: gdpr, set: setGdpr, label: 'Adatkezelés', hint: 'Általános adatkezelési hozzájárulás' },
    { checked: photo, set: setPhoto, label: 'Fotó / megjelenés', hint: 'Kép, felvétel közzététele' },
    { checked: mailing, set: setMailing, label: 'Levelezés', hint: 'Hírlevél, körlevél küldése' },
  ]

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-1">
        {toggles.map((t) => (
          <label key={t.label} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/55 bg-muted/30 px-3 py-2.5 transition hover:bg-muted/55 motion-reduce:transition-none">
            <input type="checkbox" checked={t.checked} onChange={(e) => t.set(e.target.checked)} className="mt-0.5 accent-primary" />
            <span className="min-w-0">
              <span className="text-sm font-medium text-foreground">{t.label}</span>
              <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {consentDate ? `Adatkezelési hozzájárulás kelte: ${new Date(consentDate).toLocaleDateString('hu-HU')}` : 'Nincs rögzített adatkezelési hozzájárulás.'}
        </span>
        <Button
          type="button"
          size="sm"
          disabled={saving || !dirty}
          onClick={handleSave}
          className="min-h-11 rounded-xl px-3.5 text-xs"
        >
          {saving ? 'Mentés…' : 'Hozzájárulások mentése'}
        </Button>
      </div>
    </div>
  )
}

// 2026-06-10: kis szerkeszthető megjegyzés-mező — a személyi karton minden
// almenüjében ezt használjuk (személy- és esemény-szintű jegyzetekhez).
function EditableNote({
  initial,
  placeholder,
  onSave,
}: {
  initial?: string | null
  placeholder?: string
  onSave: (note: string) => Promise<{ error?: string } | { success?: boolean }>
}) {
  const [value, setValue] = useState(initial || '')
  const [baseline, setBaseline] = useState(initial || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setValue(initial || '')
      setBaseline(initial || '')
    })
    return () => {
      cancelled = true
    }
  }, [initial])

  const dirty = value !== baseline

  async function handleSave() {
    setSaving(true)
    const res = await onSave(value)
    setSaving(false)
    if (res && 'error' in res && res.error) {
      toast.error(res.error)
    } else {
      setBaseline(value)
      toast.success('Megjegyzés mentve.')
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder || 'Megjegyzés…'}
        rows={2}
        className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-xs outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/20"
      />
      <div className="flex items-center justify-end gap-2">
        {!dirty && baseline && <span className="text-[11px] font-medium text-emerald-600">Mentve ✓</span>}
        <Button
          type="button"
          size="sm"
          disabled={saving || !dirty}
          onClick={handleSave}
          className="min-h-11 rounded-xl px-3.5 text-xs"
        >
          {saving ? 'Mentés…' : 'Megjegyzés mentése'}
        </Button>
      </div>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card px-6 py-10 text-center shadow-[0_18px_45px_-38px_rgba(18,60,54,0.4)]">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-4 font-heading text-lg font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}
