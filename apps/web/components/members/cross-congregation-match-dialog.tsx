'use client'

/**
 * Cross-congregation match dialog — felugró ablak amikor a rendszer
 * detektálja, hogy egy hasonló nevű+telefonú tag már létezik egy másik
 * gyülekezetben.
 *
 * Két használati eset:
 *   1. ÚJ tag mentése előtt (member-form-dialog meghívja a `findPotentialCrossMatch`-et,
 *      és ha van találat, megnyitja ezt a dialogot)
 *   2. Utólagos módosítás detection (a `cross_congregation_match_notifications` tábla
 *      új sora — a `useCrossCongregationNotifications` hook észleli és felnyitja)
 *
 * Adatvédelem (`feedback_gyulekezeti_autonomia`):
 * - Csak a gyülekezet neve + egyházi CNP látszik
 * - A másik gyülekezet egyéb adatait sose mutatjuk
 *
 * 3 döntési opció:
 *   - "Igen, ugyanaz a személy" — ugyanazzal a CNP-vel folytatjuk (összevonás)
 *   - "Nem, más személy" — saját CNP marad/generálódik
 *   - "Most nem foglalkozom" — dismissed (visszavonható)
 */

import { useState } from 'react'
import { AlertCircle, Building2, CheckCircle2, KeyRound, Loader2, PhoneCall, Users, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type {
  CrossMatchCandidate,
  CrossMatchConfidence,
  CrossMatchPastorContact,
} from '@/lib/members/cross-congregation-actions'

// ─── Típusok ─────────────────────────────────────────────────────────────

export type CrossMatchAction =
  | { kind: 'same_person'; useCnp: string }
  | { kind: 'different_person' }
  | { kind: 'dismissed' }

export interface CrossMatchTriggeringPerson {
  csaladnev: string
  k_nev: string
  telefon?: string | null
  c_szcim?: string | null
}

interface CrossCongregationMatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Az új vagy módosított személy (akit éppen mentenénk) */
  triggeringPerson: CrossMatchTriggeringPerson
  /** A találatok listája (a `findPotentialCrossMatch` eredménye) */
  candidates: CrossMatchCandidate[]
  /** A talált gyülekezet(ek) lelkész-elérhetősége (kapcsolatfelvételhez) */
  contacts?: CrossMatchPastorContact[]
  /** Triggered context: 'new_member' vagy 'update' */
  context?: 'new_member' | 'update'
  /** Visszahívás a felhasználó döntésével */
  onDecide: (action: CrossMatchAction) => void | Promise<void>
  /** Loading state amíg a parent menti */
  isPending?: boolean
}

// ─── Komponens ───────────────────────────────────────────────────────────

export function CrossCongregationMatchDialog({
  open,
  onOpenChange,
  triggeringPerson,
  candidates,
  contacts = [],
  context = 'new_member',
  onDecide,
  isPending = false,
}: CrossCongregationMatchDialogProps) {
  const [selectedCandidate, setSelectedCandidate] = useState<CrossMatchCandidate | null>(
    candidates[0] ?? null,
  )
  const selectedContact = selectedCandidate
    ? contacts.find((c) => c.congregation_id === selectedCandidate.matched_congregation_id) ?? null
    : null

  const triggerName = `${triggeringPerson.csaladnev} ${triggeringPerson.k_nev}`.trim()
  const hasCandidates = candidates.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-xl text-slate-800">
            <AlertCircle className="size-5 text-amber-500" />
            Hasonló tag már létezik más gyülekezetben
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-600">
            {context === 'new_member'
              ? 'Ezt az új tagot szeretnéd hozzáadni:'
              : 'Ennek a tagnak frissítetted a nevét vagy a telefonszámát:'}
          </DialogDescription>
        </DialogHeader>

        {/* Triggering person kártya */}
        <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="text-base font-semibold text-slate-800">{triggerName}</p>
          {triggeringPerson.telefon && (
            <p className="mt-1 text-sm text-slate-600">
              <span className="text-slate-400">Telefon:</span> {triggeringPerson.telefon}
            </p>
          )}
          {triggeringPerson.c_szcim && (
            <p className="mt-1 text-sm text-slate-600">
              <span className="text-slate-400">Lakcím:</span> {triggeringPerson.c_szcim}
            </p>
          )}
        </div>

        {/* Találatok */}
        {hasCandidates ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-100">
              <Users className="mt-0.5 size-4 shrink-0" />
              <p className="leading-relaxed">
                {candidates.length === 1
                  ? 'Egy hasonló tag már szerepel egy másik gyülekezetben.'
                  : `${candidates.length} hasonló tag szerepel más gyülekezetekben.`}{' '}
                <strong>Ugyanaz a személy?</strong>
              </p>
            </div>

            <div className="space-y-2">
              {candidates.map((c) => {
                const isSelected =
                  selectedCandidate?.matched_szemely_id === c.matched_szemely_id
                return (
                  <button
                    key={c.matched_szemely_id}
                    type="button"
                    onClick={() => setSelectedCandidate(c)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-amber-300 bg-amber-50/80 shadow-[0_8px_20px_-14px_rgba(217,119,6,0.5)]'
                        : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">
                          {c.matched_csaladnev} {c.matched_k_nev}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                          <Building2 className="size-3.5 shrink-0 text-amber-600" />
                          {c.matched_congregation_name}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <KeyRound className="size-3.5 shrink-0 text-emerald-600" />
                          Egyházi CNP: <span className="font-mono">{c.egyhazi_cnp}</span>
                        </p>
                      </div>
                      <ConfidenceBadge confidence={c.confidence} />
                      {isSelected && (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-600" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Lelkész-elérhetőség — kapcsolatfelvételhez */}
            {selectedCandidate && (
              <div className="space-y-2 rounded-2xl bg-emerald-50/50 p-3.5 ring-1 ring-emerald-100">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                  <PhoneCall className="size-3.5" />
                  Vedd fel a kapcsolatot a(z) {selectedCandidate.matched_congregation_name} lelkészével
                </p>
                {selectedContact
                  && (selectedContact.pastor_name
                    || selectedContact.pastor_email
                    || selectedContact.pastor_phone
                    || selectedContact.congregation_email
                    || selectedContact.congregation_phone) ? (
                  <div className="space-y-1 text-sm text-slate-700">
                    {selectedContact.pastor_name && (
                      <p><span className="text-slate-400">Lelkész:</span> <strong>{selectedContact.pastor_name}</strong></p>
                    )}
                    {(selectedContact.pastor_email || selectedContact.congregation_email) && (
                      <p>
                        <span className="text-slate-400">E-mail:</span>{' '}
                        <a className="font-medium text-emerald-700 hover:underline" href={`mailto:${selectedContact.pastor_email || selectedContact.congregation_email}`}>
                          {selectedContact.pastor_email || selectedContact.congregation_email}
                        </a>
                      </p>
                    )}
                    {(selectedContact.pastor_phone || selectedContact.congregation_phone) && (
                      <p>
                        <span className="text-slate-400">Telefon:</span>{' '}
                        <a className="font-medium text-emerald-700 hover:underline" href={`tel:${(selectedContact.pastor_phone || selectedContact.congregation_phone || '').replace(/\s+/g, '')}`}>
                          {selectedContact.pastor_phone || selectedContact.congregation_phone}
                        </a>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    A lelkész elérhetősége nincs rögzítve ehhez a gyülekezethez — egyeztess az
                    egyházmegyei hivatallal.
                  </p>
                )}
                <p className="pt-1 text-xs leading-relaxed text-slate-500">
                  Ha <strong>ugyanaz a személy</strong>, egyeztess az ottani lelkésszel a kettős
                  tagságról. A rendszer a döntést rögzíti; az egységes lélekszám a végleges
                  összevonáskor egyszer számolja majd.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-emerald-50/60 p-4 text-sm text-emerald-900 ring-1 ring-emerald-100">
            Nincs hasonló tag — biztonságosan menthető.
          </div>
        )}

        {/* Adatvédelmi info */}
        <p className="mt-2 text-xs italic text-slate-500">
          🔒 A másik tag SEMMILYEN személyes adatát (cím, születési dátum, családi viszony) NEM
          látjuk — csak a gyülekezet neve, az egyházi CNP, és a kapcsolatfelvételhez a lelkész
          HIVATALOS elérhetősége jelenik meg.
        </p>

        {/* Akció gombok */}
        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onDecide({ kind: 'dismissed' })}
            disabled={isPending}
            className="rounded-full text-slate-500 hover:text-slate-700"
          >
            <X className="mr-1 size-4" />
            Most nem
          </Button>
          {hasCandidates && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onDecide({ kind: 'different_person' })}
                disabled={isPending}
                className="rounded-full"
              >
                Nem, más személy
              </Button>
              <Button
                type="button"
                onClick={() =>
                  selectedCandidate &&
                  onDecide({ kind: 'same_person', useCnp: selectedCandidate.egyhazi_cnp })
                }
                disabled={!selectedCandidate || isPending}
                className="rounded-full bg-amber-600 hover:bg-amber-700"
              >
                {isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                Igen, ugyanaz a személy
              </Button>
            </>
          )}
          {!hasCandidates && (
            <Button
              type="button"
              onClick={() => onDecide({ kind: 'different_person' })}
              disabled={isPending}
              className="rounded-full bg-emerald-600 hover:bg-emerald-700"
            >
              Folytatom a mentést
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Sub-komponens: confidence badge ─────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: CrossMatchConfidence }) {
  const config = {
    name_phone: {
      label: 'Név + telefon',
      bg: 'bg-rose-50 text-rose-700 ring-rose-100',
      title: 'Biztos egyezés — név és telefon is megegyezik',
    },
    name_birth: {
      label: 'Név + szül.dát.',
      bg: 'bg-amber-50 text-amber-700 ring-amber-100',
      title: 'Nagyon valószínű egyezés — név és születési dátum egyezik',
    },
    phone_only: {
      label: 'Csak telefon',
      bg: 'bg-sky-50 text-sky-700 ring-sky-100',
      title: 'Telefonszám egyezés (a név eltérhet)',
    },
    name_only: {
      label: 'Csak név',
      bg: 'bg-slate-50 text-slate-600 ring-slate-100',
      title: 'Csak névegyezés — gyenge jel',
    },
  } as const

  const c = config[confidence]
  return (
    <span
      title={c.title}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ring-1 ${c.bg}`}
    >
      {c.label}
    </span>
  )
}
