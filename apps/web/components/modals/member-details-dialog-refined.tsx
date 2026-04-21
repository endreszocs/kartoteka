'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BookOpen,
  CalendarDays,
  CreditCard,
  GitBranch,
  Home,
  Mail,
  MessageSquareText,
  Phone,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { MemberStatusBadge } from '@/components/members/member-status-badge'
import { getMemberDetails } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { getTransactionDocumentNumber } from '@/lib/constants/finance'
import { formatNameWithPrefix } from '@/lib/utils/member-helpers'
import { ageFromDate } from '@/lib/utils/date'
import type { EnrichedMember } from '@/lib/constants/members'

interface MemberDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: EnrichedMember | null
  familyId: number | null
  onEdit: () => void
  onShowFamilyTree?: (memberId: number) => void
}

type Tab = 'personal' | 'registry' | 'payments'
type MemberDetailsData = Awaited<ReturnType<typeof getMemberDetails>>

const TABS: Array<{ value: Tab; label: string; icon: typeof User }> = [
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

function joinAddress(member: EnrichedMember) {
  const parts = [
    member.adrlocality?.name,
    member.adrstreet?.name,
    member.c_szam,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : 'Nincs rögzítve'
}

function getInitials(member: EnrichedMember) {
  return `${(member.csaladnev || '?')[0]}${(member.k_nev || '?')[0]}`.toUpperCase()
}

function getAvatarClasses(member: EnrichedMember) {
  return member.ferfi
    ? 'from-sky-400 to-blue-600 text-white'
    : 'from-rose-400 to-pink-600 text-white'
}

export function MemberDetailsDialogRefined({
  open,
  onOpenChange,
  member,
  familyId,
  onEdit,
  onShowFamilyTree,
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

      getMemberDetails(member.id).then((data) => {
        if (cancelled) return
        setDetails(data)
        setLoading(false)
      })
    })

    return () => {
      cancelled = true
    }
  }, [open, member])

  const paymentTotal = useMemo(() => {
    return (details?.befizetesek || []).reduce((sum, item) => sum + Number(item.osszeg || 0), 0)
  }, [details])

  if (!member) return null

  const name = formatNameWithPrefix(member)
  const age = ageFromDate(member.sz_datum)
  const initials = getInitials(member)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[1.75rem] border-0 bg-transparent p-0 shadow-none sm:w-[calc(100vw-3rem)] sm:!max-w-[calc(100vw-3rem)] lg:w-[calc(100vw-5rem)] lg:!max-w-[calc(100vw-5rem)] xl:w-[1080px] xl:!max-w-[1080px]"
        showCloseButton={false}
      >
        <div className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,250,249,0.98)_100%)] shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-slate-200/70">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-amber-200/40 blur-3xl" />
            <div className="absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-teal-200/35 blur-3xl" />
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
              <div className="min-w-0 pr-12 sm:pr-14">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">Személyi karton</p>
                <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className={`flex size-14 shrink-0 items-center justify-center rounded-[1.2rem] bg-gradient-to-br text-lg font-bold shadow-[0_20px_40px_-26px_rgba(15,74,66,0.55)] sm:size-16 sm:rounded-[1.35rem] ${getAvatarClasses(member)}`}>
                    {initials}
                  </div>

                  <div className="min-w-0">
                    <DialogTitle className="font-heading break-words text-[1.75rem] leading-[1.08] text-slate-800 sm:text-[2rem]">
                      {name}
                    </DialogTitle>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <MemberStatusBadge status={member.paymentStatus} />
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                        <CalendarDays className="size-3.5 text-teal-600" />
                        {member.sz_datum ? `${formatDisplayDate(member.sz_datum)}${age !== null ? ` • ${age} éves` : ''}` : 'Születési dátum nincs'}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
                        <ShieldCheck className="size-3.5" />
                        {member.vallas || 'Református'}
                      </span>
                      {familyId && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 shadow-sm">
                          <Users className="size-3.5" />
                          Kapcsolt család
                        </span>
                      )}
                    </div>

                    {member.cnp && (
                      <p className="mt-3 text-xs font-medium tracking-[0.18em] text-slate-400">
                        CNP: <span className="font-mono tracking-[0.12em] text-slate-500">{member.cnp}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                <StatChip label="Befizetés" value={`${details?.befizetesek.length || 0} tétel`} />
                <StatChip
                  label="Anyakönyv"
                  value={
                    [
                      details?.kereszteles ? 'keresztelés' : null,
                      details?.konfirmacio ? 'konfirmáció' : null,
                      details?.temetes ? 'temetés' : null,
                    ].filter(Boolean).length > 0
                      ? `${[
                          details?.kereszteles ? 'keresztelés' : null,
                          details?.konfirmacio ? 'konfirmáció' : null,
                          details?.temetes ? 'temetés' : null,
                        ].filter(Boolean).length} esemény`
                      : 'Nincs'
                  }
                />
                <StatChip label="Megjegyzés" value={member.megjegyzes ? 'Van' : 'Nincs'} />
              </div>
            </div>

            {!loading && (
              <div className="mt-5 flex flex-wrap gap-2">
                {TABS.map(({ value, label, icon: Icon }) => {
                  const active = tab === value

                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTab(value)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
                        active
                          ? 'border-teal-200 bg-teal-600 text-white shadow-[0_16px_30px_-22px_rgba(13,115,102,0.55)]'
                          : 'border-white/70 bg-white/82 text-slate-600 shadow-sm hover:border-teal-100 hover:text-teal-700'
                      }`}
                    >
                      <Icon className="size-4" />
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

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
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <InfoCard icon={<User className="size-4" />} label="Teljes név" value={name} />
                      <InfoCard icon={<Phone className="size-4" />} label="Telefonszám" value={member.telefon || 'Nincs rögzítve'} />
                      <InfoCard icon={<Mail className="size-4" />} label="E-mail" value={member.email || 'Nincs rögzítve'} />
                      <InfoCard icon={<Home className="size-4" />} label="Lakcím" value={joinAddress(member)} />
                      <InfoCard icon={<CalendarDays className="size-4" />} label="Születési dátum" value={member.sz_datum ? formatDisplayDate(member.sz_datum) : 'Nincs rögzítve'} />
                      <InfoCard icon={<ShieldCheck className="size-4" />} label="Foglalkozás" value={member.foglalkozas || 'Nincs rögzítve'} />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                      <SoftPanel eyebrow="Szülői adatok" title="Családi háttér" icon={<Users className="size-4" />}>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <MiniFact label="Édesapa" value={member.apjaneve || 'Nincs rögzítve'} />
                          <MiniFact label="Édesanya" value={member.anyjaneve || 'Nincs rögzítve'} />
                        </div>
                      </SoftPanel>

                      <SoftPanel eyebrow="Nyilvántartási összkép" title="Kapcsolódó állapot" icon={<ShieldCheck className="size-4" />}>
                        <div className="grid gap-3">
                          <MiniFact label="Státusz" value={member.member_status || 'Aktív'} />
                          <MiniFact label="Befizetési jelzés" value={member.paymentStatus} />
                          <MiniFact label="Családhoz kapcsolva" value={familyId ? 'Igen' : 'Nem'} />
                        </div>
                      </SoftPanel>
                    </div>

                    {member.megjegyzes && (
                      <SoftPanel eyebrow="Lelkipásztori emlékeztető" title="Megjegyzés" icon={<MessageSquareText className="size-4" />}>
                        <p className="text-sm leading-6 text-slate-600">{member.megjegyzes}</p>
                      </SoftPanel>
                    )}
                  </div>
                )}

                {tab === 'registry' && (
                  <div className="space-y-4">
                    <div className="grid gap-4 xl:grid-cols-2">
                      <RegistryEventCard
                        eyebrow="Keresztelés"
                        title={details?.kereszteles ? formatDisplayDate(details.kereszteles.datum) : 'Nincs rögzítve'}
                        description={[
                          details?.kereszteles?.adrlocality?.name ? `Helyszín: ${details.kereszteles.adrlocality.name}` : null,
                          details?.kereszteles?.lelkeszneve ? `Lelkész: ${details.kereszteles.lelkeszneve}` : null,
                        ].filter(Boolean) as string[]}
                        tone="sky"
                      />
                      <RegistryEventCard
                        eyebrow="Konfirmáció"
                        title={details?.konfirmacio ? formatDisplayDate(details.konfirmacio.datum) : 'Nincs rögzítve'}
                        description={[
                          details?.konfirmacio?.adrlocality?.name ? `Helyszín: ${details.konfirmacio.adrlocality.name}` : null,
                          details?.konfirmacio?.lelkeszneve ? `Lelkész: ${details.konfirmacio.lelkeszneve}` : null,
                        ].filter(Boolean) as string[]}
                        tone="violet"
                      />
                      <RegistryEventCard
                        eyebrow="Beköltözött"
                        title={details?.bekoltozott ? formatDisplayDate(details.bekoltozott.mikor) : 'Nincs rögzítve'}
                        description={[
                          details?.bekoltozott?.adrlocality?.name ? `Honnan: ${details.bekoltozott.adrlocality.name}` : null,
                        ].filter(Boolean) as string[]}
                        tone="teal"
                      />
                      <RegistryEventCard
                        eyebrow="Áttért"
                        title={details?.attert ? formatDisplayDate(details.attert.mikor) : 'Nincs rögzítve'}
                        description={[
                          details?.attert?.adrlocality?.name ? `Honnan: ${details.attert.adrlocality.name}` : null,
                        ].filter(Boolean) as string[]}
                        tone="amber"
                      />
                    </div>

                    {details?.temetes && (
                      <SoftPanel eyebrow="Lezárt anyakönyvi esemény" title="Temetés" icon={<BookOpen className="size-4" />}>
                        <MiniFact label="Időpont" value={formatDisplayDate(details.temetes.tdatum || details.temetes.hdatum || null)} />
                      </SoftPanel>
                    )}

                    {!details?.kereszteles && !details?.konfirmacio && !details?.bekoltozott && !details?.attert && !details?.temetes && (
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
                    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                      <SoftPanel eyebrow="Kapcsolódó pénzügyek" title="Befizetési összkép" icon={<CreditCard className="size-4" />}>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <MiniFact label="Összes tétel" value={`${details?.befizetesek.length || 0} befizetés`} />
                          <MiniFact label="Összeg" value={`${paymentTotal.toFixed(2)} RON`} />
                        </div>
                      </SoftPanel>

                      <SoftPanel eyebrow="Gyors áttekintés" title="Éves ritmus" icon={<CalendarDays className="size-4" />}>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {details?.befizetesek.slice(0, 4).map((payment) => (
                            <MiniFact
                              key={payment.id}
                              label={`${payment.fizetettev}. év`}
                              value={`${Number(payment.osszeg).toFixed(2)} RON`}
                            />
                          ))}
                          {(!details || details.befizetesek.length === 0) && (
                            <MiniFact label="Minta" value="Még nincs rögzített befizetés" />
                          )}
                        </div>
                      </SoftPanel>
                    </div>

                    {details && details.befizetesek.length > 0 ? (
                      <div className="grid gap-3">
                        {details.befizetesek.map((payment) => (
                          <div
                            key={payment.id}
                            className="rounded-[1.35rem] bg-white/88 p-4 shadow-[0_18px_36px_-30px_rgba(21,84,74,0.3)] ring-1 ring-slate-200/70"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-start gap-3">
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                                  <CreditCard className="size-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{formatDisplayDate(payment.datum)}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {getTransactionDocumentNumber(payment) || 'Nincs iratszám'}
                                    {payment.fizetettev ? ` • ${payment.fizetettev}. évre` : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="text-left sm:text-right">
                                <p className="text-base font-semibold text-emerald-700">{Number(payment.osszeg).toFixed(2)} RON</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={<CreditCard className="size-10" />}
                        title="Nincs rögzített befizetés"
                        description="A személyhez kapcsolódó befizetések a Pénzügy modulból jelennek meg itt."
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-200/70 bg-white/72 px-5 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap gap-2">
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
    <div className="min-w-0 rounded-[1.15rem] bg-white/82 px-3 py-2 shadow-sm ring-1 ring-slate-200/70">
      <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-slate-400">{label}</p>
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
}: {
  eyebrow: string
  title: string
  description: string[]
  tone: 'sky' | 'violet' | 'teal' | 'amber'
}) {
  const toneClasses = {
    sky: 'from-sky-50 to-cyan-50 text-sky-700 ring-sky-100',
    violet: 'from-violet-50 to-fuchsia-50 text-violet-700 ring-violet-100',
    teal: 'from-teal-50 to-emerald-50 text-teal-700 ring-teal-100',
    amber: 'from-amber-50 to-orange-50 text-amber-700 ring-amber-100',
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
