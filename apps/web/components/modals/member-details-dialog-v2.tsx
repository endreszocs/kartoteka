'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CreditCard,
  GitBranch,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { getMemberDetails, updateMemberNote, updateRegistryEventNote } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { getTransactionDocumentNumber } from '@/lib/constants/finance'
import { ageFromDate } from '@/lib/utils/date'
import type { EnrichedMember } from '@/lib/constants/members'
import { toast } from 'sonner'

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

function getInitials(member: EnrichedMember) {
  return `${(member.csaladnev || '?')[0]}${(member.k_nev || '?')[0]}`.toUpperCase()
}

function getAvatarClasses(member: EnrichedMember) {
  return member.ferfi
    ? 'from-sky-400 to-blue-600 text-white'
    : 'from-rose-400 to-pink-600 text-white'
}

function joinAddress(member: EnrichedMember) {
  const parts = [
    member.adrlocality?.name,
    member.adrstreet?.name,
    member.c_szam,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : 'Nincs rögzítve'
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
  const [tab, setTab] = useState<Tab>('personal')

  useEffect(() => {
    if (!open || !member) return

    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      setDetails(null)
      setLoading(true)
      setTab('personal')

      getMemberDetails(member.id, familyId).then((data) => {
        if (cancelled) return
        setDetails(data)
        setLoading(false)
      })
    })

    return () => {
      cancelled = true
    }
  }, [open, member, familyId])

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
  const initials = getInitials(member)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] !w-[min(1080px,calc(100vw-2rem))] !max-w-[min(1080px,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] border-0 bg-transparent p-0 shadow-none sm:!w-[min(1120px,calc(100vw-3rem))] sm:!max-w-[min(1120px,calc(100vw-3rem))]"
        showCloseButton={false}
      >
        <div className="relative overflow-hidden rounded-[1.75rem] bg-card shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-border">
          {/* 2026-06-02: háttér-blob-ok csillapítva (30% → 15%, 25% → 12%) —
              a "kaotikus" érzéshez jelentősen hozzájárultak. */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--accent) 15%, transparent)' }} />
            <div className="absolute -left-8 bottom-0 h-28 w-28 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--primary) 12%, transparent)' }} />
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-20 inline-flex size-9 items-center justify-center rounded-2xl border border-white/70 bg-white/90 text-slate-500 shadow-sm transition hover:text-slate-700 sm:right-4 sm:top-4"
            aria-label="Bezárás"
          >
            <X className="size-4" />
          </button>

          <div className="relative border-b border-slate-200/70 px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 pr-12 sm:pr-14">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">Személyi karton</p>

                  <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className={`flex size-14 shrink-0 items-center justify-center rounded-[1.2rem] bg-gradient-to-br text-lg font-bold shadow-[0_20px_40px_-26px_rgba(15,74,66,0.55)] sm:size-16 sm:rounded-[1.35rem] ${getAvatarClasses(member)}`}>
                      {initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 pr-2 sm:pr-4 lg:pr-8">
                        {prefix && (
                          <span className="font-heading text-[1.8rem] leading-[1.08] text-violet-600 sm:text-[2.1rem]">
                            {prefix}
                          </span>
                        )}
                        <DialogTitle className="font-heading break-words text-[1.8rem] leading-[1.08] text-slate-800 sm:text-[2.1rem]">
                          {baseName}
                        </DialogTitle>
                        {age !== null && (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 font-heading text-[1.35rem] leading-none text-amber-700 shadow-sm ring-1 ring-amber-100 sm:text-[1.55rem]">
                            {age} éves
                          </span>
                        )}
                      </div>

                      {member.cnp && (
                        <p className="mt-3 text-xs font-medium tracking-[0.18em] text-slate-400">
                          <span className="font-mono tracking-[0.12em] text-slate-500">{member.cnp}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid w-full grid-cols-3 gap-2 pr-12 sm:pr-14 xl:mr-10 xl:w-[29rem] xl:pr-0">
                  <StatChip label="Befizetés" value={`${details?.befizetesek.length || 0} tétel`} />
                  <StatChip
                    label="Anyakönyv"
                    value={registryEventCount > 0 ? `${registryEventCount} esemény` : 'Nincs'}
                  />
                  <StatChip
                    label={hasArrears ? 'Hátralék' : 'Megjegyzés'}
                    value={hasArrears ? `${arrearsTotal.toFixed(2)} RON` : member.megjegyzes ? 'Van' : 'Nincs'}
                  />
                </div>
              </div>

            </div>
          </div>

          {/* 2026-06-02 redesign: prémium tab-bar — gradient underline, mint
              a családi kartonon. Csendesebb, jobb hierarchy. */}
          {!loading && (
            <nav className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 backdrop-blur-sm sm:px-6">
              {tabs.map(({ value, label, icon: Icon }) => {
                const active = tab === value
                const isArrears = value === 'arrears'
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTab(value)}
                    className={`relative inline-flex items-center gap-2 whitespace-nowrap px-3 py-3 text-[13px] font-medium transition-all sm:px-4 ${
                      active
                        ? isArrears
                          ? 'text-red-700'
                          : 'text-teal-700'
                        : 'text-slate-500 hover:bg-slate-50/80 hover:text-slate-700'
                    }`}
                  >
                    <Icon className="size-4" />
                    <span>{label}</span>
                    {active && (
                      <span
                        aria-hidden
                        className={`absolute inset-x-2 bottom-0 h-[3px] rounded-t-full ${
                          isArrears
                            ? 'bg-gradient-to-r from-red-500 via-rose-500 to-pink-500 shadow-[0_-1px_4px_rgba(244,63,94,0.4)]'
                            : 'bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500 shadow-[0_-1px_4px_rgba(20,184,166,0.4)]'
                        }`}
                      />
                    )}
                  </button>
                )
              })}
            </nav>
          )}

          <div className="max-h-[calc(92vh-12.5rem)] overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-[1.4rem] bg-white/80 shadow-sm ring-1 ring-slate-200/60" />
                ))}
              </div>
            ) : (
              <>
                {tab === 'personal' && (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
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
                        value={member.vallas || 'Református'}
                      />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                      <SoftPanel eyebrow="Szülői adatok" title="Családi háttér" icon={<Users className="size-4" />}>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <MiniFact label="Édesapa" value={member.apjaneve || 'Nincs rögzítve'} />
                          <MiniFact label="Édesanya" value={member.anyjaneve || 'Nincs rögzítve'} />
                        </div>
                      </SoftPanel>

                      <SoftPanel eyebrow="Kapcsolattartás" title="Elérhetőségek" icon={<Phone className="size-4" />}>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <MiniFact label="Telefonszám" value={member.telefon || 'Nincs rögzítve'} />
                          <MiniFact label="E-mail" value={member.email || 'Nincs rögzítve'} />
                          <div className="sm:col-span-2">
                            <div className="rounded-[1.1rem] bg-secondary/60 px-3.5 py-3 ring-1 ring-white/70">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Lakcím</p>
                                  <p className="mt-1 text-sm font-semibold text-slate-700">{joinAddress(member)}</p>
                                </div>
                                {directionsUrl && (
                                  <a
                                    href={directionsUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-teal-100 bg-white/90 px-3 py-1.5 text-xs font-semibold text-teal-700 shadow-sm transition hover:border-teal-200 hover:bg-teal-50"
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
                    </div>

                    {/* 2026-06-10: szerkeszthető megjegyzés-mező (a családi kartonon is megjelenik) */}
                    <SoftPanel eyebrow="Lelkipásztori emlékeztető" title="Megjegyzés" icon={<BookOpen className="size-4" />}>
                      <EditableNote
                        initial={member.megjegyzes}
                        placeholder="Pl. látogatási emlékeztető, családi körülmények, imatéma…"
                        onSave={(note) => updateMemberNote(member.id, note)}
                      />
                    </SoftPanel>
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
                      <div className="overflow-x-auto rounded-[1.4rem] bg-white/88 shadow-[0_24px_48px_-38px_rgba(18,60,54,0.28)] ring-1 ring-slate-200/70">
                        <table className="min-w-[760px] w-full text-left text-sm">
                          <thead className="border-b border-slate-200/70 bg-slate-50/85">
                            <tr>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Dátum</th>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Befizetés típusa</th>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Év</th>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Bizonylat</th>
                              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Összeg</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/60">
                            {details.befizetesek.map((payment) => (
                              <tr key={payment.id}>
                                <td className="px-4 py-3 font-medium text-slate-700">{formatDisplayDate(payment.datum)}</td>
                                <td className="px-4 py-3 text-slate-600">
                                  {payment.befizetescel?.nev || 'Általános befizetés'}
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  {payment.fizetettev ? `${payment.fizetettev}. év` : 'Nincs megadva'}
                                </td>
                                <td className="px-4 py-3 text-slate-500">
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
                      <div className="overflow-x-auto rounded-[1.4rem] bg-white/88 shadow-[0_24px_48px_-38px_rgba(18,60,54,0.28)] ring-1 ring-slate-200/70">
                        <table className="min-w-[620px] w-full text-left text-sm">
                          <thead className="border-b border-slate-200/70 bg-slate-50/80">
                            <tr>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Év</th>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Elvárt</th>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Befizetve</th>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Tartozás</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/60">
                            {details.arrearsBreakdown.map((item) => (
                              <tr key={item.year}>
                                <td className="px-4 py-3 font-semibold text-slate-800">{item.year}</td>
                                <td className="px-4 py-3 text-slate-600">{item.yearlyFee.toFixed(2)} RON</td>
                                <td className="px-4 py-3 text-slate-600">{item.paid.toFixed(2)} RON</td>
                                <td className="px-4 py-3 font-semibold text-red-600">{item.debt.toFixed(2)} RON</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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

          <div className="flex flex-col gap-2 border-t border-slate-200/70 bg-white/72 px-5 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap gap-2">
              {familyId && onOpenFamily && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-slate-200 bg-white/85"
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
                  className="rounded-xl border-slate-200 bg-white/85"
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
              <Button variant="outline" size="sm" className="rounded-xl border-slate-200 bg-white/85" onClick={() => onOpenChange(false)}>
                Bezárás
              </Button>
              <Button size="sm" className="rounded-xl bg-teal-600 text-white hover:bg-teal-700" onClick={onEdit}>
                Szerkesztés
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/70 bg-white/85 px-3 py-2 shadow-sm transition hover:bg-white">
      <p className="text-[10px] font-medium uppercase leading-tight tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-tight text-slate-700">{value}</p>
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
    <section className="rounded-[1.45rem] bg-white/86 p-4 shadow-[0_24px_50px_-36px_rgba(19,73,66,0.34)] ring-1 ring-slate-200/70 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-secondary text-teal-700">
          {icon}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</p>
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
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
    <div className="rounded-[1.25rem] bg-white/86 p-4 shadow-[0_22px_40px_-34px_rgba(21,84,74,0.28)] ring-1 ring-slate-200/70">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-secondary text-teal-700">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{value}</p>
        </div>
      </div>
    </div>
  )
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.1rem] bg-secondary/60 px-3.5 py-3 ring-1 ring-white/70">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{value}</p>
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
    sky: 'from-sky-50 to-cyan-50 text-sky-700 ring-sky-100',
    violet: 'from-violet-50 to-fuchsia-50 text-violet-700 ring-violet-100',
    teal: 'from-teal-50 to-emerald-50 text-teal-700 ring-teal-100',
    amber: 'from-amber-50 to-orange-50 text-amber-700 ring-amber-100',
    rose: 'from-rose-50 to-pink-50 text-rose-700 ring-rose-100',
  }[tone]

  return (
    <div className={`rounded-[1.45rem] bg-gradient-to-br ${toneClasses} p-4 shadow-[0_24px_42px_-36px_rgba(21,84,74,0.28)] ring-1 sm:p-5`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{eyebrow}</p>
      <p className="mt-2 text-lg font-semibold text-slate-800">{title}</p>
      <div className="mt-3 space-y-1.5">
        {description.length > 0 ? (
          description.map((line) => (
            <p key={line} className="text-sm text-slate-600">
              {line}
            </p>
          ))
        ) : (
          <p className="text-sm text-slate-500">Nincs további részlet.</p>
        )}
      </div>
      {onSaveNote && (
        <div className="mt-3 border-t border-white/60 pt-3">
          <EditableNote initial={note} placeholder="Megjegyzés ehhez az eseményhez…" onSave={onSaveNote} />
        </div>
      )}
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
        className="w-full resize-y rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200/50"
      />
      <div className="flex items-center justify-end gap-2">
        {!dirty && baseline && <span className="text-[11px] font-medium text-emerald-600">Mentve ✓</span>}
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={handleSave}
          className="rounded-full bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-40"
        >
          {saving ? 'Mentés…' : 'Megjegyzés mentése'}
        </button>
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
    <div className="rounded-[1.45rem] bg-white/88 px-6 py-10 text-center shadow-[0_24px_48px_-38px_rgba(18,60,54,0.28)] ring-1 ring-slate-200/70">
      <div className="mx-auto flex size-16 items-center justify-center rounded-[1.4rem] bg-secondary text-teal-700">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
    </div>
  )
}
