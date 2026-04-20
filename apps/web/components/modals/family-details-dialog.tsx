'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getFamilyDetails } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { getTransactionDocumentNumber } from '@/lib/constants/finance'
import { formatNameWithPrefix } from '@/lib/utils/member-helpers'
import { ageFromDate } from '@/lib/utils/date'
import {
  MapPin, Users, BookOpen, Heart, CreditCard, ChevronRight,
  Check, X, Minus, Cross,
} from 'lucide-react'

interface FamilyDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  familyId: number | null
}

type FamilyData = Awaited<ReturnType<typeof getFamilyDetails>>

const TAB_LIST = [
  { value: 'members', label: 'Családtagok', icon: Users },
  { value: 'registry', label: 'Anyakönyv', icon: BookOpen },
  { value: 'payments', label: 'Befizetések', icon: CreditCard },
] as const

export function FamilyDetailsDialog({ open, onOpenChange, familyId }: FamilyDetailsDialogProps) {
  const [data, setData] = useState<FamilyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<string>('members')

  useEffect(() => {
    if (open && familyId) {
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        setData(null)
        setLoading(true)
        setTab('members')
        getFamilyDetails(familyId).then(d => {
          if (!cancelled) {
            setData(d)
            setLoading(false)
          }
        })
      })
      return () => {
        cancelled = true
      }
    }
  }, [open, familyId])

  if (!open) return null

  const family = data?.family
  const children = data?.children || []
  const payments = data?.payments || []
  const keresztelesek = data?.keresztelesek || []
  const konfirmaciok = data?.konfirmaciok || []
  const hazassag = data?.hazassag
  const temetesek = data?.temetesek || []

  let title = 'Családi Kartoték'
  if (family?.ferfi && family?.no) title = `${formatNameWithPrefix(family.ferfi, family.no?.meghalt)} és ${family.no.k_nev} családja`
  else if (family?.ferfi) title = `${formatNameWithPrefix(family.ferfi)} családja`
  else if (family?.no) title = `${formatNameWithPrefix(family.no)} családja`

  const allMembers = [family?.ferfi, family?.no, ...children].filter(Boolean) as {
    id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; meghalt: boolean;
    vallas?: string | null; foglalkozas?: string; namepattern?: string | null; allapot?: string | null
  }[]

  const payTotal = payments.reduce((s, p) => s + Number(p.osszeg || 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden p-0 flex flex-col" showCloseButton={false}>

        {/* ═══ Fejléc ═══ */}
        <div className="px-6 pt-6 pb-0 border-b border-zinc-100 shrink-0">
          {/* X bezáró */}
          <button onClick={() => onOpenChange(false)} className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors z-10" aria-label="Bezárás">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>

          <DialogHeader>
            <div className="flex items-start gap-3 mb-4 pr-10">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shrink-0">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="font-heading text-base sm:text-lg leading-tight">{title}</DialogTitle>
                {family && (
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                      <MapPin className="w-3 h-3" /> {family.utca?.name || ''} {family.c_szam || ''}
                    </span>
                    {family.csoport && <Badge variant="outline" className="text-[10px]">{family.csoport.nev}</Badge>}
                    {family.isaktiv
                      ? <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">Aktív</Badge>
                      : <Badge className="text-[10px] bg-zinc-100 text-zinc-500 border-0">Inaktív</Badge>}
                  </div>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* ═══ Fülek — zinc-100 wrapper tabs stílus ═══ */}
          {!loading && family && (
            <div className="flex border-b border-zinc-200/60">
              {TAB_LIST.map(t => {
                const Icon = t.icon
                const isActive = tab === t.value
                const count = t.value === 'members' ? allMembers.length : t.value === 'payments' ? payments.length : undefined
                return (
                  <button
                    key={t.value}
                    onClick={() => setTab(t.value)}
                    className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t.label}</span>
                    {count !== undefined && count > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>{count}</span>
                    )}
                    {isActive && <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-indigo-600" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ═══ Tartalom — scrollable ═══ */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 mx-auto mb-3 animate-pulse" />
              <p className="text-sm text-slate-400">Kartoték betöltése...</p>
            </div>
          ) : !family ? (
            <div className="py-16 text-center">
              <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Nem található család.</p>
            </div>
          ) : (
            <>
              {/* ─── Családtagok fül ─── */}
              {tab === 'members' && (
                <div className="space-y-5">
                  {/* Házaspár */}
                  <div className="space-y-2">
                    {family.ferfi && <MemberCard member={family.ferfi} role="Családfő" color="blue" spouse={family.no} />}
                    {family.no && <MemberCard member={family.no} role="Feleség" color="pink" spouse={family.ferfi} />}
                  </div>

                  {/* Házasságkötés — ha van */}
                  {hazassag?.datum && (
                    <div className="rounded-2xl bg-gradient-to-r from-pink-50/80 to-rose-50/60 p-4 border border-pink-100/50">
                      <div className="flex items-center gap-2 mb-2.5">
                        <Heart className="w-4 h-4 text-pink-500" />
                        <span className="text-sm font-semibold text-slate-700">Házasságkötés</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <InfoPill label="Dátum" value={hazassag.datum.split('T')[0]} />
                        <InfoPill label="Helyszín" value={hazassag.adrlocality?.name} />
                        <InfoPill label="Lelkész" value={hazassag.lelkeszneve} />
                      </div>
                    </div>
                  )}

                  {/* Gyermekek */}
                  {children.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Gyermekek ({children.length})</p>
                      <div className="space-y-1.5">
                        {children.map(c => <MemberCard key={c.id} member={c} role="Gyermek" color="emerald" />)}
                      </div>
                    </div>
                  )}

                  {allMembers.length === 0 && (
                    <EmptyState icon={<Users className="w-10 h-10" />} text="Még nincsenek családtagok rögzítve." />
                  )}
                </div>
              )}

              {/* ─── Anyakönyv fül ─── */}
              {tab === 'registry' && (
                <div className="space-y-3">
                  {allMembers.length > 0 ? (
                    allMembers.map(m => {
                      const k = keresztelesek.find(x => x.id_szemely === m.id)
                      const f = konfirmaciok.find(x => x.id_szemely === m.id)
                      const t = temetesek.find(x => x.id_szemely === m.id)
                      const isParent = m.id === family.id_ferfi || m.id === family.id_no

                      return (
                        <div key={m.id} className="rounded-2xl bg-white border border-slate-100 p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                          <p className="text-sm font-semibold text-slate-700 mb-3">
                            {m.ferfi ? <span className="text-blue-500 mr-1">♂</span> : <span className="text-pink-500 mr-1">♀</span>}
                            {m.csaladnev} {m.k_nev}
                            <span className="text-xs text-slate-400 font-normal ml-2">{m.vallas || 'Református'}</span>
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <RegistryCell label="Születés" value={m.sz_datum} />
                            <RegistryCell label="Keresztelés" value={k?.datum?.split('T')[0]} place={k?.adrlocality?.name} ok={!!k} />
                            <RegistryCell label="Konfirmáció" value={f?.datum?.split('T')[0]} place={f?.adrlocality?.name} ok={!!f} />
                            {t && <RegistryCell label="Temetés" value={t.hdatum?.split('T')[0]} dark />}
                            {isParent && hazassag?.datum && <RegistryCell label="Esküvő" value={hazassag.datum.split('T')[0]} place={hazassag.adrlocality?.name} ok />}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <EmptyState icon={<BookOpen className="w-10 h-10" />} text="Nincs anyakönyvi adat a családban." />
                  )}
                </div>
              )}

              {/* ─── Befizetések fül ─── */}
              {tab === 'payments' && (
                <div>
                  {payments.length > 0 ? (
                    <>
                      {/* Összesítő */}
                      <div className="rounded-2xl bg-gradient-to-r from-emerald-50/80 to-green-50/60 p-4 border border-emerald-100/50 mb-4 flex items-center justify-between">
                        <span className="text-sm text-slate-600">Összes befizetés</span>
                        <span className="text-lg font-bold text-emerald-600">{payTotal.toFixed(2)} RON</span>
                      </div>

                      <div className="space-y-1.5">
                        {payments.map((p, i) => (
                          <div key={i} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-slate-50/80 transition-colors">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                              <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700 truncate">
                                {p.szemely ? `${p.szemely.csaladnev} ${p.szemely.k_nev}` : (p.forrasa || 'Családi befizetés')}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {p.datum?.split('T')[0]} · {p.befizetescel?.nev || 'Egyházi befizetés'}
                                {p.fizetettev ? ` · ${p.fizetettev}. évre` : ''}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-emerald-600">{Number(p.osszeg).toFixed(2)} RON</p>
                              <p className="text-[10px] text-slate-400">{getTransactionDocumentNumber(p) || ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <EmptyState icon={<CreditCard className="w-10 h-10" />} text="Még nincs befizetés rögzítve a családhoz." helper="A befizetések a Pénzügy modulból kerülnek ide automatikusan." />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ═══ Footer ═══ */}
        {!loading && family && (
          <div className="px-6 py-3 border-t border-zinc-100 flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600 border-zinc-200" onClick={() => onOpenChange(false)}>Bezárás</Button>
            <Button size="sm" className="flex-[2] rounded-xl bg-violet-600 hover:bg-violet-700 text-white" onClick={() => onOpenChange(false)}>Szerkesztés</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Alkomponensek ──────────────────────────────────────────

function MemberCard({ member, role, color, spouse }: {
  member: { id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; meghalt: boolean; foglalkozas?: string | null; namepattern?: string | null; allapot?: string | null }
  role: string; color: string; spouse?: { meghalt: boolean } | null
}) {
  const age = ageFromDate(member.sz_datum)
  const colorStyles: Record<string, { bg: string; text: string; border: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    pink: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  }
  const cs = colorStyles[color] || colorStyles.blue
  const fmtMember = { ...member, allapot: member.allapot || null, namepattern: member.namepattern || null }
  const name = formatNameWithPrefix(fmtMember, spouse?.meghalt)

  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-slate-100 hover:shadow-sm transition-all cursor-pointer group"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
      <div className={`px-2.5 py-1 rounded-xl text-[10px] font-semibold border ${cs.bg} ${cs.text} ${cs.border} shrink-0`}>
        {role}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-700 truncate">{name}</span>
          {member.meghalt && <Badge className="text-[9px] bg-slate-200 text-slate-500 border-0 px-1.5">elhunyt</Badge>}
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {age !== null ? `${age} éves` : ''}
          {member.foglalkozas ? ` · ${member.foglalkozas}` : ''}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="bg-white rounded-xl p-2.5 border border-slate-100/80">
      <p className="text-[10px] font-medium text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-700 mt-0.5">{value || <span className="text-slate-300 italic text-xs">Nem rögzített</span>}</p>
    </div>
  )
}

function RegistryCell({ label, value, place, ok, dark }: { label: string; value?: string | null; place?: string | null; ok?: boolean; dark?: boolean }) {
  return (
    <div className={`rounded-xl p-2.5 ${dark ? 'bg-slate-100' : value ? 'bg-emerald-50/60' : 'bg-slate-50'}`}>
      <p className="text-[10px] font-medium text-slate-400 mb-0.5">{label}</p>
      {value ? (
        <>
          <p className={`text-xs font-semibold flex items-center gap-1 ${dark ? 'text-slate-600' : 'text-emerald-700'}`}>
            {ok && <Check className="w-3 h-3" />}
            {dark && <Cross className="w-3 h-3" />}
            {value}
          </p>
          {place && <p className="text-[10px] text-slate-400 mt-0.5">{place}</p>}
        </>
      ) : (
        <p className="text-xs text-slate-300 flex items-center gap-1">
          {dark ? <Minus className="w-3 h-3" /> : <X className="w-3 h-3" />} Nincs
        </p>
      )}
    </div>
  )
}

function EmptyState({ icon, text, helper }: { icon: React.ReactNode; text: string; helper?: string }) {
  return (
    <div className="py-12 text-center">
      <div className="text-slate-200 mx-auto mb-3 flex justify-center">{icon}</div>
      <p className="text-sm text-slate-400">{text}</p>
      {helper && <p className="text-xs text-slate-300 mt-1">{helper}</p>}
    </div>
  )
}
