'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getMemberDetails } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { getTransactionDocumentNumber } from '@/lib/constants/finance'
import type { PaymentDetailsRow } from '@/lib/finance/payment-compat'
import { formatNameWithPrefix } from '@/lib/utils/member-helpers'
import { ageFromDate } from '@/lib/utils/date'
import { MemberStatusBadge } from '@/components/members/member-status-badge'
import type { EnrichedMember } from '@/lib/constants/members'
import { User, MapPin, Phone, Mail, Briefcase, BookOpen, CreditCard, Cross, Calendar, GitBranch } from 'lucide-react'

interface MemberDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: EnrichedMember | null
  familyId: number | null
  onEdit: () => void
  onShowFamilyTree?: (memberId: number) => void
}

type Tab = 'personal' | 'registry' | 'payments'

export function MemberDetailsDialog({ open, onOpenChange, member, familyId, onEdit, onShowFamilyTree }: MemberDetailsDialogProps) {
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getMemberDetails>> | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('personal')

  useEffect(() => {
    if (open && member) {
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        setLoading(true)
        setTab('personal')
        getMemberDetails(member.id).then(d => {
          if (!cancelled) {
            setDetails(d)
            setLoading(false)
          }
        })
      })
      return () => {
        cancelled = true
      }
    }
  }, [open, member])

  if (!member) return null
  const name = formatNameWithPrefix(member)
  const age = ageFromDate(member.sz_datum)
  const initials = `${(member.csaladnev || '?')[0]}${(member.k_nev || '?')[0]}`.toUpperCase()

  const TABS: { value: Tab; label: string; icon: typeof User }[] = [
    { value: 'personal', label: 'Személyes', icon: User },
    { value: 'registry', label: 'Anyakönyv', icon: BookOpen },
    { value: 'payments', label: 'Befizetések', icon: CreditCard },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden p-0 flex flex-col" showCloseButton={false}>

        {/* ═══ Header ═══ */}
        <div className="px-6 pt-6 pb-0 border-b border-zinc-100 shrink-0">
          {/* X bezáró gomb */}
          <button onClick={() => onOpenChange(false)} className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors z-10" aria-label="Bezárás">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>

          <DialogHeader>
            <div className="flex items-start gap-3 mb-4 pr-10">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shadow-md shrink-0 ${member.ferfi ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-[#fce7f3] text-[#be185d]'}`}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="font-heading text-xl font-bold">{name}</DialogTitle>
                {member.cnp && <p className="text-xs text-zinc-400 font-mono mt-0.5">CNP: {member.cnp}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-zinc-500">
                    {member.sz_datum || '—'}{age !== null ? ` (${age} éves)` : ''}
                  </span>
                  <span className="text-xs text-zinc-400">·</span>
                  <span className="text-xs text-zinc-500">{member.vallas || 'Református'}</span>
                  <MemberStatusBadge status={member.paymentStatus} />
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Fülek */}
          {!loading && (
            <div className="flex">
              {TABS.map(t => {
                const Icon = t.icon
                const isActive = tab === t.value
                return (
                  <button key={t.value} onClick={() => setTab(t.value)}
                    className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${isActive ? 'text-emerald-600' : 'text-zinc-400 hover:text-zinc-600'}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                    {isActive && <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-emerald-600" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ═══ Body ═══ */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="py-12 text-center">
              <div className="w-10 h-10 rounded-full bg-zinc-100 mx-auto mb-3 animate-pulse" />
              <p className="text-sm text-zinc-400">Adatlap betöltése...</p>
            </div>
          ) : (
            <>
              {/* ─── Személyes fül ─── */}
              {tab === 'personal' && (
                <div className="space-y-4">
                  {/* Fő adatok grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <DataCard icon={<User className="w-4 h-4" />} label="CNP" value={member.cnp} mono />
                    <DataCard icon={<Calendar className="w-4 h-4" />} label="Születési dátum" value={member.sz_datum} />
                    <DataCard icon={<Briefcase className="w-4 h-4" />} label="Foglalkozás" value={member.foglalkozas} />
                    <DataCard icon={<Phone className="w-4 h-4" />} label="Telefon" value={member.telefon} />
                    <DataCard icon={<Mail className="w-4 h-4" />} label="E-mail" value={member.email} />
                    <DataCard icon={<MapPin className="w-4 h-4" />} label="Lakcím"
                      value={`${member.adrlocality?.name || ''}, ${member.adrstreet?.name || ''} ${member.c_szam || ''}`.trim()} />
                  </div>

                  {/* Szülők */}
                  <div className="bg-zinc-50 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Szülők</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-zinc-400">Édesapja</p>
                        <p className="text-sm font-medium text-zinc-700 mt-0.5">{member.apjaneve || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400">Édesanyja</p>
                        <p className="text-sm font-medium text-zinc-700 mt-0.5">{member.anyjaneve || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {member.megjegyzes && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-amber-800 uppercase tracking-widest mb-1">Megjegyzés</p>
                      <p className="text-sm text-amber-900">{member.megjegyzes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Anyakönyv fül ─── */}
              {tab === 'registry' && details && (
                <div className="space-y-3">
                  <RegistryCard label="Keresztelés" date={details.kereszteles?.datum} place={details.kereszteles?.adrlocality?.name} pastor={details.kereszteles?.lelkeszneve} color="blue" />
                  <RegistryCard label="Konfirmáció" date={details.konfirmacio?.datum} place={details.konfirmacio?.adrlocality?.name} pastor={details.konfirmacio?.lelkeszneve} color="violet" />

                  {details.temetes && (
                    <div className="bg-zinc-100 rounded-2xl p-4 flex items-center gap-3">
                      <Cross className="w-5 h-5 text-zinc-500" />
                      <div>
                        <p className="text-xs text-zinc-400">Temetés</p>
                        <p className="text-sm font-medium text-zinc-700">{details.temetes.tdatum?.split('T')[0] || '—'}</p>
                      </div>
                    </div>
                  )}

                  {(details.bekoltozott || details.attert) && (
                    <div className={`rounded-2xl p-4 flex items-center gap-3 ${details.bekoltozott ? 'bg-cyan-50 border border-cyan-100' : 'bg-orange-50 border border-orange-100'}`}>
                      <Calendar className="w-5 h-5 text-zinc-500" />
                      <div>
                        <p className="text-xs text-zinc-400">{details.bekoltozott ? 'Beköltözött' : 'Áttért'}</p>
                        <p className="text-sm font-medium text-zinc-700">{(details.bekoltozott || details.attert)?.mikor?.split('T')[0] || '—'}</p>
                      </div>
                    </div>
                  )}

                  {!details.kereszteles && !details.konfirmacio && !details.temetes && !details.bekoltozott && !details.attert && (
                    <div className="py-8 text-center">
                      <BookOpen className="w-10 h-10 text-zinc-200 mx-auto mb-2" />
                      <p className="text-sm text-zinc-400">Nincs anyakönyvi adat rögzítve.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Befizetések fül ─── */}
              {tab === 'payments' && details && (
                <div>
                  {details.befizetesek.length > 0 ? (
                    <div className="space-y-2">
                      {details.befizetesek.map((p: PaymentDetailsRow) => (
                        <div key={p.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-zinc-50 transition-colors">
                          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                            <CreditCard className="w-4 h-4 text-emerald-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-700">{p.datum?.split('T')[0]}</p>
                            <p className="text-[11px] text-zinc-400">{getTransactionDocumentNumber(p) || '—'} · {p.fizetettev ?? 'ismeretlen'}. évre</p>
                          </div>
                          <span className="text-sm font-bold text-emerald-600 shrink-0">{Number(p.osszeg).toFixed(2)} RON</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <CreditCard className="w-10 h-10 text-zinc-200 mx-auto mb-2" />
                      <p className="text-sm text-zinc-400">Nincs rögzített befizetés.</p>
                      <p className="text-xs text-zinc-300 mt-1">A befizetések a Pénzügy modulból kerülnek ide.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ═══ Footer ═══ */}
        <div className="px-6 py-3 border-t border-zinc-100 flex flex-wrap gap-2 shrink-0">
          {onShowFamilyTree && (
            <Button variant="outline" size="sm" className="rounded-xl border-zinc-200 gap-1.5" onClick={() => { onOpenChange(false); setTimeout(() => onShowFamilyTree(member.id), 150) }}>
              <GitBranch className="w-3.5 h-3.5" /> Családfa
            </Button>
          )}
          {familyId && (
            <Button variant="outline" size="sm" className="rounded-xl border-zinc-200" onClick={() => onOpenChange(false)}>
              Család megtekintése
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600 border-zinc-200" onClick={() => onOpenChange(false)}>
            Bezárás
          </Button>
          <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onEdit}>
            Szerkesztés
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Alkomponensek ──────────────────────────────────────────

function DataCard({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="bg-zinc-50 rounded-xl p-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-white border border-zinc-100 flex items-center justify-center text-zinc-400 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-400">{label}</p>
        <p className={`text-sm font-medium text-zinc-700 mt-0.5 ${mono ? 'font-mono text-xs' : ''} truncate`}>{value || '—'}</p>
      </div>
    </div>
  )
}

function RegistryCard({ label, date, place, pastor, color }: { label: string; date?: string | null; place?: string | null; pastor?: string | null; color: 'blue' | 'violet' }) {
  const hasData = !!date
  const colors = color === 'blue'
    ? { bg: 'bg-blue-50', border: 'border-blue-100', dot: 'bg-blue-400' }
    : { bg: 'bg-violet-50', border: 'border-violet-100', dot: 'bg-violet-400' }

  return (
    <div className={`rounded-2xl p-4 border ${hasData ? `${colors.bg} ${colors.border}` : 'bg-zinc-50 border-zinc-100'}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${hasData ? colors.dot : 'bg-zinc-300'}`} />
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</p>
      </div>
      {hasData ? (
        <div>
          <p className="text-sm font-semibold text-zinc-800">{date?.split('T')[0]}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {place && <p className="text-xs text-zinc-500">{place}</p>}
            {pastor && <p className="text-xs text-zinc-400">Lelkész: {pastor}</p>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-400 italic">Nincs rögzítve</p>
      )}
    </div>
  )
}
