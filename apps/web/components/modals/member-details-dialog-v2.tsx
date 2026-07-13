'use client'

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
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
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { getMemberDetails, updateMemberNote, updateRegistryEventNote, updateMemberConsents } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { getTransactionDocumentNumber } from '@/lib/constants/finance'
import { ageFromDate } from '@/lib/utils/date'
import type { EnrichedMember } from '@/lib/constants/members'
import { toast } from 'sonner'
import { MemberCertificateDialog } from '@/components/members/member-certificate-dialog'
import { MemberStatusBadge } from '@/components/members/member-status-badge'

interface MemberDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: EnrichedMember | null
  familyId: number | null
  onEdit: () => void
  onShowFamilyTree?: (memberId: number) => void
  onOpenFamily?: (familyId: number) => void
}

type Tab = 'personal' | 'registry' | 'payments' | 'arrears'
type MemberDetailsData = Awaited<ReturnType<typeof getMemberDetails>>

const BASE_TABS: Array<{ value: Exclude<Tab, 'arrears'>; label: string; icon: typeof User }> = [
  { value: 'personal', label: 'Személyes adatok', icon: User },
  { value: 'registry', label: 'Anyakönyvi események', icon: BookOpen },
  { value: 'payments', label: 'Befizetések', icon: CreditCard },
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
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

function getRelationName(
  relation?: { name?: string | null } | Array<{ name?: string | null }> | null
) {
  if (!relation) return null
  if (Array.isArray(relation)) return relation[0]?.name ?? null
  return relation.name ?? null
}

export function MemberDetailsDialogV2({
  open,
  onOpenChange,
  member,
  familyId,
  onEdit,
  onShowFamilyTree,
  onOpenFamily,
}: MemberDetailsDialogProps) {
  const [details, setDetails] = useState<MemberDetailsData | null>(null)
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
      setLoading(true)
      setLoadError(false)
      setTab('personal')

      getMemberDetails(member.id, familyId)
        .then((data) => {
          if (cancelled) return
          setDetails(data)
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

  const paymentTotal = useMemo(() => {
    return (details?.befizetesek || []).reduce((sum, item) => sum + Number(item.osszeg || 0), 0)
  }, [details])

  if (!member) return null

  const hasArrears = member.paymentStatus === 'hatralekos'
  const tabs: Array<{ value: Tab; label: string; icon: typeof User | typeof AlertTriangle }> = hasArrears
    ? [...BASE_TABS, { value: 'arrears', label: 'Hátralék', icon: AlertTriangle }]
    : BASE_TABS

  const prefix = getMemberPrefix(member)
  const baseName = getBaseName(member)
  const age = ageFromDate(member.sz_datum)
  const membership = getMembershipPresentation(member)
  const arrearsTotal = (details?.arrearsBreakdown || []).reduce((sum, row) => sum + row.debt, 0)
  const registryEventCount = [
    details?.kereszteles,
    details?.konfirmacio,
    details?.hazassag,
    details?.bekoltozott,
    details?.attert,
    details?.temetes,
  ].filter(Boolean).length
  const directionsUrl = buildDirectionsUrl(member)

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-1rem)] !w-[min(1120px,calc(100vw-1.25rem))] !max-w-[min(1120px,calc(100vw-1.25rem))] overflow-hidden rounded-[1.75rem] border-0 bg-transparent p-0 shadow-none sm:!w-[min(1120px,calc(100vw-3rem))] sm:!max-w-[min(1120px,calc(100vw-3rem))]"
        showCloseButton={false}
      >
        <div className="relative flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-[1.75rem] bg-card shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-border">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-2 top-2 z-20 inline-flex size-11 items-center justify-center rounded-xl border border-border/70 bg-background/85 text-muted-foreground shadow-sm backdrop-blur transition hover:bg-background hover:text-foreground sm:right-4 sm:top-4 motion-reduce:transition-none"
            aria-label="Bezárás"
          >
            <X className="size-4" />
          </button>

          <header className="relative shrink-0 border-b border-border/60 bg-gradient-to-br from-primary/10 via-card to-amber-50/45 px-4 pb-4 pt-4 dark:to-card sm:px-6 sm:pb-5 sm:pt-5 [@media(max-height:600px)]:pb-2 [@media(max-height:600px)]:pt-2">
            <p className="pr-12 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/75">
              Személyi karton
            </p>

            <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start [@media(max-height:600px)]:mt-1 [@media(max-height:600px)]:gap-2">
              <div className="flex min-w-0 items-start gap-4 pr-10 lg:pr-0">
                <MemberAvatar
                  name={baseName}
                  kepUrl={member.photo_url}
                  meghalt={member.meghalt}
                  size={72}
                  ring
                  className="motion-reduce:hover:scale-100 [@media(max-height:600px)]:hidden"
                />
                <div className="min-w-0 pt-0.5">
                  <DialogTitle className="font-heading text-[1.75rem] font-semibold leading-tight text-foreground sm:text-[2.15rem]">
                    {prefix && <span className="mr-2 text-primary">{prefix}</span>}
                    <span className="break-words">{baseName}</span>
                  </DialogTitle>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Badge className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold ${membership.className}`}>
                      Tagság · {membership.label}
                    </Badge>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <span>Pénzügy</span>
                      <MemberStatusBadge status={member.paymentStatus} />
                    </span>
                  </div>

                  {member.cnp && (
                    <p className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.09em] text-muted-foreground">
                      <IdCard className="size-3.5 text-primary/70" /> {member.cnp}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <StatChip label="Befizetés" value={loading ? '…' : `${details?.befizetesek.length ?? 0} tétel`} />
                <StatChip
                  label="Anyakönyv"
                  value={loading ? '…' : registryEventCount > 0 ? `${registryEventCount} esemény` : 'Nincs'}
                />
                <StatChip
                  label={hasArrears ? 'Hátralék' : 'Megjegyzés'}
                  value={loading ? '…' : hasArrears ? `${arrearsTotal.toFixed(2)} RON` : member.megjegyzes ? 'Van' : 'Nincs'}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4 [@media(max-height:600px)]:hidden">
              <HeaderFact
                icon={<CalendarDays className="size-4" />}
                label="Születés és kor"
                value={member.sz_datum ? `${formatDisplayDate(member.sz_datum)}${age !== null ? ` · ${age} év` : ''}` : 'Nincs rögzítve'}
              />
              <HeaderFact icon={<MapPin className="size-4" />} label="Lakcím" value={joinAddress(member)} />
              <HeaderFact icon={<Phone className="size-4" />} label="Telefon" value={member.telefon || 'Nincs rögzítve'} />
              <HeaderFact icon={<Mail className="size-4" />} label="E-mail" value={member.email || 'Nincs rögzítve'} />
            </div>
          </header>

          <nav
            className="sticky top-0 z-10 flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 bg-card/95 px-3 py-2 backdrop-blur-sm sm:px-6"
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
                    className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] font-semibold transition disabled:cursor-wait disabled:opacity-60 sm:px-4 motion-reduce:transition-none ${
                      active
                        ? isArrears
                          ? 'bg-rose-100 text-rose-700 shadow-sm dark:bg-rose-950/40 dark:text-rose-300'
                          : 'bg-background text-primary shadow-sm ring-1 ring-border/60'
                        : 'text-muted-foreground hover:bg-muted/65 hover:text-foreground'
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
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background/70 px-4 py-5 sm:px-6 sm:py-6"
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
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
                    <div className="space-y-4">
                      <SoftPanel eyebrow="Törzsadatok" title="Személyes alapadatok" icon={<IdCard className="size-4" />}>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <InfoCard
                            icon={<CalendarDays className="size-4" />}
                            label="Születési dátum"
                            value={member.sz_datum ? formatDisplayDate(member.sz_datum) : 'Nincs rögzítve'}
                          />
                          <InfoCard
                            icon={<User className="size-4" />}
                            label="Foglalkozás"
                            value={member.foglalkozas || 'Nincs rögzítve'}
                          />
                          <InfoCard
                            icon={<ShieldCheck className="size-4" />}
                            label="Vallás"
                            value={member.vallas || 'Nincs rögzítve'}
                          />
                        </div>
                      </SoftPanel>

                      <SoftPanel eyebrow="Kapcsolattartás" title="Elérhetőségek és lakcím" icon={<Phone className="size-4" />}>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <MiniFact label="Telefonszám" value={member.telefon || 'Nincs rögzítve'} />
                          <MiniFact label="E-mail" value={member.email || 'Nincs rögzítve'} />
                          <div className="sm:col-span-2">
                            <div className="rounded-xl border border-border/50 bg-muted/35 px-3.5 py-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Lakcím</p>
                                  <p className="mt-1 text-sm font-semibold text-foreground">{joinAddress(member)}</p>
                                </div>
                                {directionsUrl && (
                                  <a
                                    href={directionsUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/15 bg-background px-3 py-2 text-xs font-semibold text-primary shadow-sm transition hover:bg-primary/5 motion-reduce:transition-none"
                                  >
                                    <MapPin className="size-3.5" />
                                    Útvonaltervezés
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </SoftPanel>

                      <SoftPanel eyebrow="Szülői adatok" title="Családi háttér" icon={<Users className="size-4" />}>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <MiniFact label="Édesapa" value={member.apjaneve || 'Nincs rögzítve'} />
                          <MiniFact label="Édesanya" value={member.anyjaneve || 'Nincs rögzítve'} />
                        </div>
                      </SoftPanel>
                    </div>

                    <aside className="space-y-4">
                      <SoftPanel eyebrow="Lelkipásztori emlékeztető" title="Megjegyzés" icon={<BookOpen className="size-4" />}>
                        <EditableNote
                          initial={member.megjegyzes}
                          placeholder="Pl. látogatási emlékeztető, családi körülmények, imatéma…"
                          onSave={(note) => updateMemberNote(member.id, note)}
                        />
                      </SoftPanel>

                      <SoftPanel eyebrow="Adatvédelem" title="GDPR-hozzájárulások" icon={<ShieldCheck className="size-4" />}>
                        <ConsentEditor
                          memberId={member.id}
                          gdprConsentAt={member.gdpr_consent_at}
                          photoConsent={member.photo_consent}
                          mailingConsent={member.mailing_consent}
                        />
                      </SoftPanel>
                    </aside>
                  </div>
                )}

                {tab === 'registry' && (
                  <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
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
                            <article key={payment.id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Dátum</p>
                                  <p className="mt-1 font-semibold text-foreground">{formatDisplayDate(payment.datum)}</p>
                                </div>
                                <p className="shrink-0 font-semibold tabular-nums text-emerald-700">{Number(payment.osszeg).toFixed(2)} RON</p>
                              </div>
                              <p className="mt-3 text-sm font-medium text-foreground">{payment.befizetescel?.nev || 'Általános befizetés'}</p>
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
                              <tr key={payment.id} className="transition-colors hover:bg-primary/[0.035] motion-reduce:transition-none">
                                <td className="px-4 py-3 font-medium text-foreground">{formatDisplayDate(payment.datum)}</td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {payment.befizetescel?.nev || 'Általános befizetés'}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {payment.fizetettev ? `${payment.fizetettev}. év` : 'Nincs megadva'}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {getTransactionDocumentNumber(payment) || 'Nincs rögzítve'}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-700">
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
                        onSave={(note) => updateMemberNote(member.id, note)}
                      />
                    </SoftPanel>
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

          <footer className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-2 border-t border-border/60 bg-card/95 px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap gap-2">
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
                  onClick={() => {
                    onOpenChange(false)
                    setTimeout(() => onShowFamilyTree(member.id), 150)
                  }}
                >
                  <GitBranch className="size-4" />
                  Családfa
                </Button>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" className="min-h-11 rounded-xl" onClick={() => onOpenChange(false)}>
                Bezárás
              </Button>
              <Button variant="outline" size="sm" className="min-h-11 rounded-xl bg-background/80 text-primary hover:bg-primary/5" onClick={() => setCertOpen(true)}>
                <Printer className="mr-1.5 size-3.5" />
                Igazolás
              </Button>
              <Button size="sm" className="min-h-11 rounded-xl" onClick={onEdit}>
                <Pencil className="mr-1.5 size-3.5" />
                Szerkesztés
              </Button>
            </div>
          </footer>
        </div>
      </DialogContent>
      {/* 2026-06-10 (Fázis 5, P3-3): nyomtatható tagsági igazolás */}
      <MemberCertificateDialog open={certOpen} onOpenChange={setCertOpen} szemelyId={member.id} />
    </Dialog>
  )
}

function HeaderFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/70 bg-background/70 px-3 py-2.5 shadow-sm backdrop-blur dark:border-border/60">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        <span className="mt-0.5 block text-xs font-semibold text-foreground [overflow-wrap:anywhere]">{value}</span>
      </span>
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/70 bg-background/75 px-3 py-2.5 shadow-sm backdrop-blur dark:border-border/60">
      <p className="text-[9px] font-semibold uppercase leading-tight tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs font-semibold leading-tight text-foreground [overflow-wrap:anywhere] sm:text-sm">{value}</p>
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
}: {
  memberId: number
  gdprConsentAt: string | null
  photoConsent: boolean | null
  mailingConsent: boolean | null
}) {
  const [gdpr, setGdpr] = useState(!!gdprConsentAt)
  const [photo, setPhoto] = useState(!!photoConsent)
  const [mailing, setMailing] = useState(!!mailingConsent)
  const [consentDate, setConsentDate] = useState<string | null>(gdprConsentAt)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setGdpr(!!gdprConsentAt); setPhoto(!!photoConsent); setMailing(!!mailingConsent); setConsentDate(gdprConsentAt)
    })
    return () => { cancelled = true }
  }, [gdprConsentAt, photoConsent, mailingConsent])

  const dirty = gdpr !== !!gdprConsentAt || photo !== !!photoConsent || mailing !== !!mailingConsent

  async function handleSave() {
    setSaving(true)
    const res = await updateMemberConsents(memberId, { gdpr_consent: gdpr, photo_consent: photo, mailing_consent: mailing })
    setSaving(false)
    if (res?.error) { toast.error(res.error); return }
    if (gdpr && !consentDate) setConsentDate(new Date().toISOString())
    if (!gdpr) setConsentDate(null)
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
