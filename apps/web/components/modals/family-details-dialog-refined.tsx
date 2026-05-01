'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  BookOpen,
  Check,
  CreditCard,
  Heart,
  Home,
  MapPin,
  Minus,
  Users,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { getFamilyDetails } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { getTransactionDocumentNumber } from '@/lib/constants/finance'
import { formatNameWithPrefix } from '@/lib/utils/member-helpers'
import { ageFromDate } from '@/lib/utils/date'

interface FamilyDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  familyId: number | null
}

type FamilyData = Awaited<ReturnType<typeof getFamilyDetails>>
type Tab = 'members' | 'registry' | 'payments'

const TABS: Array<{ value: Tab; label: string; icon: typeof Users }> = [
  { value: 'members', label: 'Családtagok', icon: Users },
  { value: 'registry', label: 'Anyakönyv', icon: BookOpen },
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

export function FamilyDetailsDialogRefined({
  open,
  onOpenChange,
  familyId,
}: FamilyDetailsDialogProps) {
  const [data, setData] = useState<FamilyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('members')

  useEffect(() => {
    if (!open || !familyId) return

    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      setData(null)
      setLoading(true)
      setTab('members')

      getFamilyDetails(familyId).then((value) => {
        if (cancelled) return
        setData(value)
        setLoading(false)
      })
    })

    return () => {
      cancelled = true
    }
  }, [open, familyId])

  const family = data?.family
  const children = data?.children || []
  const payments = data?.payments || []
  const keresztelesek = data?.keresztelesek || []
  const konfirmaciok = data?.konfirmaciok || []
  const hazassag = data?.hazassag
  const temetesek = data?.temetesek || []

  const title = !family
    ? 'Családi karton'
    : family.ferfi && family.no
      ? `${formatNameWithPrefix(family.ferfi, family.no?.meghalt)} és ${family.no.k_nev} családja`
      : family.ferfi
        ? `${formatNameWithPrefix(family.ferfi)} családja`
        : family.no
          ? `${formatNameWithPrefix(family.no)} családja`
          : 'Családi karton'

  const members = [family?.ferfi, family?.no, ...children].filter(Boolean) as Array<{
    id: number
    csaladnev: string
    k_nev: string
    ferfi: boolean
    sz_datum: string | null
    meghalt: boolean
    vallas?: string | null
    foglalkozas?: string | null
    namepattern?: string | null
    allapot?: string | null
  }>

  const totalPayments = payments.reduce((sum, item) => sum + Number(item.osszeg || 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] !w-[min(1140px,calc(100vw-2rem))] !max-w-[min(1140px,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] border-0 bg-transparent p-0 shadow-none sm:!w-[min(1180px,calc(100vw-3rem))] sm:!max-w-[min(1180px,calc(100vw-3rem))]"
        showCloseButton={false}
      >
        <div className="relative overflow-hidden rounded-[1.75rem] bg-card shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-border">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--accent2) 30%, transparent)' }} />
            <div className="absolute -left-8 bottom-0 h-28 w-28 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--primary) 25%, transparent)' }} />
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
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">Családi karton</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_20px_40px_-26px_rgba(15,74,66,0.55)] sm:size-16 sm:rounded-[1.35rem]">
                    <Users className="size-7" />
                  </div>

                  <div className="min-w-0">
                    <DialogTitle className="font-heading text-[1.8rem] leading-[1.08] text-slate-800 sm:text-[2rem]">
                      {title}
                    </DialogTitle>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {family?.isaktiv ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
                          <Check className="size-3.5" />
                          Aktív család
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                          <Minus className="size-3.5" />
                          Inaktív család
                        </span>
                      )}
                      {family?.csoport?.nev && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                          <MapPin className="size-3.5 text-teal-600" />
                          {family.csoport.nev}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 shadow-sm">
                        <Home className="size-3.5" />
                        {family ? `${family.utca?.name || 'Ismeretlen cím'} ${family.c_szam || ''}`.trim() : 'Nincs cím'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                <StatChip label="Tagok" value={`${members.length} fő`} />
                <StatChip label="Befizetés" value={`${payments.length} tétel`} />
                <StatChip label="Összeg" value={`${totalPayments.toFixed(2)} RON`} />
              </div>
            </div>

            {!loading && family && (
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
                          ? 'border-violet-200 bg-violet-600 text-white shadow-[0_16px_30px_-22px_rgba(109,40,217,0.55)]'
                          : 'border-white/70 bg-white/82 text-slate-600 shadow-sm hover:border-violet-100 hover:text-violet-700'
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

          <div className="max-h-[calc(92vh-12.5rem)] overflow-y-auto overscroll-y-contain px-4 py-5 pr-3 sm:px-6 sm:py-6 sm:pr-5">
            {loading ? (
              <div className="rounded-[1.45rem] bg-white/88 px-6 py-10 text-center shadow-[0_24px_48px_-38px_rgba(18,60,54,0.28)] ring-1 ring-slate-200/70">
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-[1.4rem] bg-secondary text-violet-700">
                  <Users className="size-8 animate-pulse" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Családi kartoték betöltése folyamatban</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Összerendezzük a családtagokat, az anyakönyvi adatokat és a befizetési áttekintést.
                </p>
              </div>
            ) : !family ? (
              <EmptyState
                icon={<Users className="size-10" />}
                title="Nem található család"
                description="A kiválasztott család nem érhető el az aktuális gyülekezeti nézetben."
              />
            ) : (
              <>
                {tab === 'members' && (
                  <div className="space-y-4">
                    {hazassag?.datum && (
                      <SoftPanel eyebrow="Családi esemény" title="Házasságkötés" icon={<Heart className="size-4" />}>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <MiniFact label="Dátum" value={formatDisplayDate(hazassag.datum)} />
                          <MiniFact label="Helyszín" value={hazassag.adrlocality?.name || 'Nincs rögzítve'} />
                          <MiniFact label="Lelkész" value={hazassag.lelkeszneve || 'Nincs rögzítve'} />
                        </div>
                      </SoftPanel>
                    )}

                    <SoftPanel eyebrow="Családi mag" title="Szülők és házastársi kapcsolat" icon={<Users className="size-4" />}>
                      <div className="grid gap-4 xl:grid-cols-2">
                        {family.ferfi && (
                          <MemberCard
                            label="Családfő"
                            tone="sky"
                            member={family.ferfi}
                            spouse={family.no}
                          />
                        )}
                        {family.no && (
                          <MemberCard
                            label="Feleség"
                            tone="rose"
                            member={family.no}
                            spouse={family.ferfi}
                          />
                        )}
                        {!family.ferfi && !family.no && (
                          <div className="rounded-[1.15rem] bg-secondary/50 px-4 py-5 text-sm text-slate-500 ring-1 ring-white/70 xl:col-span-2">
                            A családhoz még nincs rögzítve szülő vagy házastárs.
                          </div>
                        )}
                      </div>
                    </SoftPanel>

                    {children.length > 0 && (
                      <SoftPanel eyebrow="Gyermekek" title={`${children.length} gyermek a családban`} icon={<Users className="size-4" />}>
                        <div className="mb-4 grid gap-3 sm:grid-cols-3">
                          <MiniFact label="Összes gyermek" value={`${children.length} fő`} />
                          <MiniFact
                            label="Kiskorú"
                            value={`${children.filter((child) => {
                              const childAge = ageFromDate(child.sz_datum)
                              return childAge !== null && childAge < 18
                            }).length} fő`}
                          />
                          <MiniFact
                            label="Felnőtt"
                            value={`${children.filter((child) => {
                              const childAge = ageFromDate(child.sz_datum)
                              return childAge !== null && childAge >= 18
                            }).length} fő`}
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {children.map((child) => (
                            <MemberCard key={child.id} label="Gyermek" tone="emerald" member={child} />
                          ))}
                        </div>
                      </SoftPanel>
                    )}
                  </div>
                )}

                {tab === 'registry' && (
                  <div className="space-y-4">
                    {members.length > 0 ? (
                      <SoftPanel
                        eyebrow="Személyhez kötött események"
                        title="Családi anyakönyvi áttekintés"
                        icon={<BookOpen className="size-4" />}
                      >
                        <div className="overflow-x-auto">
                          <table className="min-w-[760px] w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-slate-200/70 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                <th className="px-3 py-3 font-semibold">Név</th>
                                <th className="px-3 py-3 font-semibold">Szerep</th>
                                <th className="px-3 py-3 font-semibold">Születés</th>
                                <th className="px-3 py-3 font-semibold">Keresztelés</th>
                                <th className="px-3 py-3 font-semibold">Konfirmáció</th>
                                <th className="px-3 py-3 font-semibold">Esketés</th>
                                <th className="px-3 py-3 font-semibold">Temetés</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/60">
                              {members.map((member) => {
                                const kereszteles = keresztelesek.find((item) => item.id_szemely === member.id)
                                const konfirmacio = konfirmaciok.find((item) => item.id_szemely === member.id)
                                const temetes = temetesek.find((item) => item.id_szemely === member.id)
                                const isParent = member.id === family.id_ferfi || member.id === family.id_no
                                const roleLabel = member.id === family.id_ferfi
                                  ? 'Családfő'
                                  : member.id === family.id_no
                                    ? 'Feleség'
                                    : 'Gyermek'

                                return (
                                  <tr key={member.id} className="align-top">
                                    <td className="px-3 py-3">
                                      <div className="font-semibold text-slate-800">{member.csaladnev} {member.k_nev}</div>
                                      <div className="mt-1 text-xs text-slate-500">{member.vallas || 'Református'}</div>
                                    </td>
                                    <td className="px-3 py-3">
                                      <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-slate-600">
                                        {roleLabel}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3 text-slate-700">
                                      {member.sz_datum ? formatDisplayDate(member.sz_datum) : 'Nincs rögzítve'}
                                    </td>
                                    <td className="px-3 py-3">
                                      <TableCellValue
                                        value={kereszteles ? formatDisplayDate(kereszteles.datum) : 'Nincs rögzítve'}
                                        helper={kereszteles?.adrlocality?.name || undefined}
                                        active={Boolean(kereszteles)}
                                      />
                                    </td>
                                    <td className="px-3 py-3">
                                      <TableCellValue
                                        value={konfirmacio ? formatDisplayDate(konfirmacio.datum) : 'Nincs rögzítve'}
                                        helper={konfirmacio?.adrlocality?.name || undefined}
                                        active={Boolean(konfirmacio)}
                                      />
                                    </td>
                                    <td className="px-3 py-3">
                                      <TableCellValue
                                        value={isParent && hazassag?.datum ? formatDisplayDate(hazassag.datum) : 'Nincs rögzítve'}
                                        helper={isParent && hazassag?.adrlocality?.name ? hazassag.adrlocality.name : undefined}
                                        active={Boolean(isParent && hazassag?.datum)}
                                      />
                                    </td>
                                    <td className="px-3 py-3">
                                      <TableCellValue
                                        value={temetes ? formatDisplayDate(temetes.hdatum) : 'Nincs rögzítve'}
                                        helper={temetes ? 'Temetés' : undefined}
                                        active={Boolean(temetes)}
                                      />
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </SoftPanel>
                    ) : (
                      <EmptyState
                        icon={<BookOpen className="size-10" />}
                        title="Nincs anyakönyvi adat"
                        description="A családhoz még nem került rögzítésre megjeleníthető anyakönyvi esemény."
                      />
                    )}
                  </div>
                )}

                {tab === 'payments' && (
                  <div className="space-y-4">
                    <SoftPanel eyebrow="Pénzügyi összkép" title="Családi befizetések" icon={<CreditCard className="size-4" />}>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <MiniFact label="Összes tétel" value={`${payments.length} befizetés`} />
                        <MiniFact label="Összeg" value={`${totalPayments.toFixed(2)} RON`} />
                        <MiniFact label="Kapcsolt családtagok" value={`${members.length} fő`} />
                      </div>
                    </SoftPanel>

                    {payments.length > 0 ? (
                      <div className="overflow-x-auto rounded-[1.4rem] bg-white/88 shadow-[0_24px_48px_-38px_rgba(18,60,54,0.28)] ring-1 ring-slate-200/70">
                        <table className="min-w-[860px] w-full text-left text-sm">
                          <thead className="border-b border-slate-200/70 bg-slate-50/85">
                            <tr>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Befizető</th>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Dátum</th>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Típus</th>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Év</th>
                              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Bizonylat</th>
                              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Összeg</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/60">
                            {payments.map((payment) => (
                              <tr key={`${payment.id}-${payment.datum}`}>
                                <td className="px-4 py-3 font-medium text-slate-700">
                                  {payment.szemely ? `${payment.szemely.csaladnev} ${payment.szemely.k_nev}` : payment.forrasa || 'Családi befizetés'}
                                </td>
                                <td className="px-4 py-3 text-slate-600">{formatDisplayDate(payment.datum)}</td>
                                <td className="px-4 py-3 text-slate-600">{payment.befizetescel?.nev || 'Általános befizetés'}</td>
                                <td className="px-4 py-3 text-slate-600">{payment.fizetettev ? `${payment.fizetettev}. év` : 'Nincs megadva'}</td>
                                <td className="px-4 py-3 text-slate-500">{getTransactionDocumentNumber(payment) || 'Nincs rögzítve'}</td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-700">{Number(payment.osszeg).toFixed(2)} RON</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState
                        icon={<CreditCard className="size-10" />}
                        title="Még nincs befizetés"
                        description="A családhoz kapcsolódó befizetések automatikusan a Pénzügy modulból érkeznek ide."
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200/70 bg-white/72 px-5 py-4 backdrop-blur-sm sm:px-6">
            <Button variant="outline" size="sm" className="rounded-xl border-slate-200 bg-white/85" onClick={() => onOpenChange(false)}>
              Bezárás
            </Button>
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
        <div className="flex size-10 items-center justify-center rounded-2xl bg-secondary text-violet-700">
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

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.1rem] bg-secondary/60 px-3.5 py-3 ring-1 ring-white/70">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{value}</p>
    </div>
  )
}

function MemberCard({
  label,
  tone,
  member,
  spouse,
}: {
  label: string
  tone: 'sky' | 'rose' | 'emerald'
  member: {
    id: number
    csaladnev: string
    k_nev: string
    ferfi: boolean
    sz_datum: string | null
    meghalt: boolean
    foglalkozas?: string | null
    namepattern?: string | null
    allapot?: string | null
  }
  spouse?: { meghalt: boolean } | null
}) {
  const toneClasses = {
    sky: 'from-sky-50 to-cyan-50 text-sky-700 ring-sky-100',
    rose: 'from-rose-50 to-pink-50 text-rose-700 ring-rose-100',
    emerald: 'from-emerald-50 to-teal-50 text-emerald-700 ring-emerald-100',
  }[tone]

  const formattedMember = {
    ...member,
    allapot: member.allapot || null,
    namepattern: member.namepattern || null,
  }
  const age = ageFromDate(member.sz_datum)
  const name = formatNameWithPrefix(formattedMember, spouse?.meghalt)

  return (
    <div className={`rounded-[1.45rem] bg-gradient-to-br ${toneClasses} p-4 shadow-[0_24px_42px_-36px_rgba(21,84,74,0.28)] ring-1 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
          <h3 className="mt-2 break-words text-lg font-semibold text-slate-800">{name}</h3>
          <p className="mt-2 text-sm text-slate-600">
            {member.sz_datum ? formatDisplayDate(member.sz_datum) : 'Születési dátum nincs'}
            {age !== null ? ` • ${age} éves` : ''}
          </p>
          <p className="mt-1 text-sm text-slate-500">{member.foglalkozas || 'Foglalkozás nincs rögzítve'}</p>
        </div>

        {member.meghalt && (
          <Badge className="border-0 bg-slate-200 text-slate-600">Elhunyt</Badge>
        )}
      </div>
    </div>
  )
}

function TableCellValue({
  value,
  helper,
  active,
}: {
  value: string
  helper?: string
  active?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className={`text-sm font-semibold leading-6 ${active ? 'text-emerald-700' : 'text-slate-600'}`}>{value}</p>
      {helper && <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>}
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
      <div className="mx-auto flex size-16 items-center justify-center rounded-[1.4rem] bg-secondary text-violet-700">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
    </div>
  )
}


