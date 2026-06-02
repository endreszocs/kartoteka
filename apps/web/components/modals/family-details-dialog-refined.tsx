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
  Heart,
  Home,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Users,
  X,
} from 'lucide-react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { getFamilyDetails } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { getTransactionDocumentNumber } from '@/lib/constants/finance'
import { ageFromDate } from '@/lib/utils/date'

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
type TabKey = 'general' | 'registry' | 'payments'

export function FamilyDetailsDialogRefined({
  open,
  onOpenChange,
  familyId,
}: FamilyDetailsDialogProps) {
  const [data, setData] = useState<FamilyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('general')

  useEffect(() => {
    if (!open || !familyId) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setData(null)
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
                <header className="relative border-b border-slate-100 bg-gradient-to-br from-violet-50/60 via-white to-emerald-50/60 px-6 py-5 sm:px-8 sm:py-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="size-3.5 text-violet-500" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-700">
                      Családi karton
                    </p>
                  </div>

                  <DialogTitle className="font-heading text-3xl text-slate-800 sm:text-4xl">
                    {familyName ? (
                      <>
                        {familyName}{' '}
                        <span className="font-normal text-slate-500">család</span>
                      </>
                    ) : (
                      <span className="italic text-slate-400">— névtelen család —</span>
                    )}
                  </DialogTitle>

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
                        <MemberPanel role="head" member={family.ferfi} />
                      ) : family.no ? (
                        <MemberPanel role="head" member={family.no} />
                      ) : null}

                      {family.ferfi && family.no && (
                        <MemberPanel role="spouse" member={family.no} />
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
                              <div
                                key={c.id}
                                className={`flex items-center gap-2 text-sm ${
                                  c.meghalt ? 'text-slate-400 line-through' : 'text-slate-700'
                                }`}
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
                              </div>
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
                      <div className="space-y-3">
                        {hazassag?.datum && (
                          <RegistryItem
                            icon={<Heart className="size-4 text-rose-500" />}
                            label="Esketés"
                            date={hazassag.datum}
                            location={hazassag.adrlocality?.name}
                            person={hazassag.lelkeszneve ? `Lelkész: ${hazassag.lelkeszneve}` : null}
                          />
                        )}
                        {keresztelesek.map((k, i) => (
                          <RegistryItem
                            key={`baptism-${i}`}
                            icon={<Church className="size-4 text-blue-500" />}
                            label="Keresztelő"
                            date={k.datum}
                            location={k.adrlocality?.name}
                            person={
                              [family.ferfi, family.no, ...children].find(
                                (m) => m?.id === k.id_szemely,
                              )
                                ? `${
                                    [family.ferfi, family.no, ...children].find(
                                      (m) => m?.id === k.id_szemely,
                                    )?.csaladnev
                                  } ${
                                    [family.ferfi, family.no, ...children].find(
                                      (m) => m?.id === k.id_szemely,
                                    )?.k_nev
                                  }`
                                : null
                            }
                          />
                        ))}
                        {konfirmaciok.map((kon, i) => (
                          <RegistryItem
                            key={`conf-${i}`}
                            icon={<Sparkles className="size-4 text-emerald-500" />}
                            label="Konfirmáció"
                            date={kon.datum}
                            location={kon.adrlocality?.name}
                            person={
                              [family.ferfi, family.no, ...children].find(
                                (m) => m?.id === kon.id_szemely,
                              )
                                ? `${
                                    [family.ferfi, family.no, ...children].find(
                                      (m) => m?.id === kon.id_szemely,
                                    )?.csaladnev
                                  } ${
                                    [family.ferfi, family.no, ...children].find(
                                      (m) => m?.id === kon.id_szemely,
                                    )?.k_nev
                                  }`
                                : null
                            }
                          />
                        ))}
                        {temetesek.map((t, i) => (
                          <RegistryItem
                            key={`burial-${i}`}
                            icon={<Cross className="size-4 text-slate-500" />}
                            label="Temetés"
                            date={t.hdatum}
                            location={null}
                            person={
                              [family.ferfi, family.no, ...children].find(
                                (m) => m?.id === t.id_szemely,
                              )
                                ? `${
                                    [family.ferfi, family.no, ...children].find(
                                      (m) => m?.id === t.id_szemely,
                                    )?.csaladnev
                                  } ${
                                    [family.ferfi, family.no, ...children].find(
                                      (m) => m?.id === t.id_szemely,
                                    )?.k_nev
                                  }`
                                : null
                            }
                          />
                        ))}
                      </div>
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
    'inline-flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap '
  const activeClasses = active
    ? 'border-violet-600 text-violet-700'
    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
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
}: {
  role: 'head' | 'spouse'
  member: MemberShape
}) {
  const isHead = role === 'head'
  const Icon = isHead ? Crown : Heart
  const iconTone = isHead ? 'text-amber-600 bg-amber-50' : 'text-rose-600 bg-rose-50'
  const labelText = isHead ? 'Családfő' : 'Házastárs'
  const labelTone = isHead ? 'text-amber-800 bg-amber-50' : 'text-rose-700 bg-rose-50'
  const age = ageFromDate(member.sz_datum)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
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
    </div>
  )
}

function RegistryItem({
  icon,
  label,
  date,
  location,
  person,
}: {
  icon: React.ReactNode
  label: string
  date: string | null | undefined
  location: string | null | undefined
  person: string | null | undefined
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-50">
        {icon}
      </div>
      <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-1 items-baseline">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </span>
          {person && (
            <span className="ml-2 text-sm text-slate-700">{person}</span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          <span className="font-medium text-slate-700">{formatShortDate(date)}</span>
          {location && <span className="ml-2">· {location}</span>}
        </div>
      </div>
    </div>
  )
}

function formatShortDate(value?: string | null) {
  if (!value) return 'Ismeretlen'
  const normalized = value.includes('T') ? value : `${value}T00:00:00`
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }).format(d)
}

// 2026-06-02: a Mail import csak akkor kell, ha emailt mutatunk — most nem,
// de a tree-shake-hez ez nem gond.
void Mail
