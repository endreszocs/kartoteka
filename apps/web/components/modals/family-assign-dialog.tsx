'use client'

/**
 * Családhoz rendelés a SZEMÉLYI KARTONRÓL (2026-08-01, PR-18).
 *
 * Eddig a személyi kartonon a „Nincs családhoz rendelve" zsákutca volt —
 * hozzárendelni csak a Családok fül szerkesztőjéből lehetett. Ez a dialógus:
 *   - családot keres a felnőtt tagok neve alapján (searchAssignableFamilies),
 *   - szerepet választ (felnőtt/gyermek — a felnőtt slotot a tag neme dönti el),
 *   - dupla-tagságnál FIGYELMEZTET és explicit áthelyezést kér (assignMemberToFamily),
 *   - új családot is tud nyitni a taggal mint felnőtt féllel (saveFamily).
 */

import { useEffect, useRef, useState } from 'react'
import { Baby, Home, Search, TriangleAlert, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  assignMemberToFamily,
  getMemberFamilyMemberships,
  saveFamily,
  searchAssignableFamilies,
  type AssignConflict,
  type AssignableFamily,
  type FamilyMembershipInfo,
} from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import type { EnrichedMember } from '@/lib/constants/members'

interface FamilyAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: EnrichedMember | null
  /** A tag jelenlegi családja (ha van) — áthelyezésnél informatív */
  currentFamilyId: number | null
  /** Sikeres hozzárendelés után hívjuk az új család id-jával */
  onAssigned: (familyId: number) => void
}

type Mode = 'felnott' | 'gyermek'

export function FamilyAssignDialog({ open, onOpenChange, member, currentFamilyId, onAssigned }: FamilyAssignDialogProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AssignableFamily[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<AssignableFamily | null>(null)
  const [mode, setMode] = useState<Mode>('felnott')
  const [memberships, setMemberships] = useState<FamilyMembershipInfo[]>([])
  const [conflicts, setConflicts] = useState<AssignConflict[] | null>(null)
  const [conflictWarning, setConflictWarning] = useState<string | null>(null)
  const [pendingNewFamily, setPendingNewFamily] = useState(false)
  const [saving, setSaving] = useState(false)
  const searchTokenRef = useRef(0)

  const age = member?.sz_datum
    ? Math.floor((Date.now() - new Date(member.sz_datum).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null

  // Nyitáskor: állapot-reset + a tag meglévő tagságai (figyelmeztető sávhoz)
  useEffect(() => {
    if (!open || !member) return
    let cancelled = false
    setQuery('')
    setResults([])
    setSelected(null)
    setMode(age != null && age < 18 ? 'gyermek' : 'felnott')
    setConflicts(null)
    setConflictWarning(null)
    setPendingNewFamily(false)
    getMemberFamilyMemberships(member.id)
      .then((list) => { if (!cancelled) setMemberships(list) })
      .catch(() => { if (!cancelled) setMemberships([]) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member?.id])

  // Debounce-olt család-keresés
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const token = ++searchTokenRef.current
    const t = setTimeout(() => {
      searchAssignableFamilies(q)
        .then((rows) => {
          if (searchTokenRef.current !== token) return
          setResults(rows)
          setSearching(false)
        })
        .catch(() => {
          if (searchTokenRef.current !== token) return
          setResults([])
          setSearching(false)
        })
    }, 300)
    return () => clearTimeout(t)
  }, [query, open])

  // A kiválasztott családban foglalt felnőtt-slot → automatikusan gyermek-mód
  const adultSlotTakenForSelected = selected && member
    ? (member.ferfi === true ? selected.hasFerfi : member.ferfi === false ? selected.hasNo : true)
    : false
  useEffect(() => {
    if (selected && adultSlotTakenForSelected) setMode('gyermek')
  }, [selected, adultSlotTakenForSelected])

  if (!member) return null

  const memberName = [member.csaladnev, member.k_nev].filter(Boolean).join(' ').trim()
  const otherMemberships = memberships.filter((m) => m.familyId !== currentFamilyId)
  const adultDisabledReason = member.ferfi == null
    ? 'A tag neme nincs rögzítve'
    : adultSlotTakenForSelected
      ? (member.ferfi ? 'A családban már van férj/családfő' : 'A családban már van feleség/házastárs')
      : null

  function resetConflict() {
    setConflicts(null)
    setConflictWarning(null)
    setPendingNewFamily(false)
  }

  async function runAssign(confirmMove: boolean) {
    if (!member || !selected) return
    setSaving(true)
    try {
      const res = await assignMemberToFamily({
        memberId: member.id,
        familyId: selected.id,
        mode,
        confirmMove,
      })
      if (res.error) {
        toast.error(res.error)
        resetConflict()
        return
      }
      if (res.conflicts && res.conflicts.length > 0) {
        setConflicts(res.conflicts)
        setConflictWarning(res.warning ?? 'A tag már egy másik család tagja.')
        setPendingNewFamily(false)
        return
      }
      if (res.success && res.familyId) {
        toast.success(`${memberName} hozzárendelve: ${selected.displayName}.`)
        if (res.warning) toast.warning(res.warning, { duration: 8000 })
        onAssigned(res.familyId)
        onOpenChange(false)
      }
    } catch {
      toast.error('A hozzárendelés nem sikerült. Próbáld újra.')
    } finally {
      setSaving(false)
    }
  }

  async function runCreateNewFamily(allowMoves: boolean) {
    if (!member) return
    if (member.ferfi == null) {
      toast.error('A tag neme nincs rögzítve — új család így nem hozható létre vele.')
      return
    }
    if (!member.c_utcaid) {
      toast.error('A taghoz nincs rögzített utca — előbb add meg a lakcímét a tag szerkesztőjében.')
      return
    }
    setSaving(true)
    try {
      const res = await saveFamily({
        id_ferfi: member.ferfi ? member.id : null,
        id_no: member.ferfi ? null : member.id,
        gyerekIds: [],
        c_utcaid: member.c_utcaid ?? undefined,
        c_szam: member.c_szam || undefined,
        id_csoport: null,
        allowMoves,
      })
      if (res.error) {
        toast.error(res.error)
        resetConflict()
        return
      }
      if (res.conflicts && res.conflicts.length > 0) {
        setConflicts(res.conflicts)
        setConflictWarning(res.warning ?? 'A tag már egy másik család tagja.')
        setPendingNewFamily(true)
        return
      }
      if (res.success) {
        toast.success(`Új család létrehozva ${memberName} taggal.`)
        if (res.warning) toast.warning(res.warning, { duration: 8000 })
        // A saveFamily nem adja vissza az új család id-ját — a hívó teljes
        // frissítést végez (onAssigned(-1) helyett zárás + adatfrissítés).
        onAssigned(0)
        onOpenChange(false)
      }
    } catch {
      toast.error('A család létrehozása nem sikerült. Próbáld újra.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-[1.5rem] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <UserPlus className="size-5 text-primary" />
            Családhoz rendelés
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* A tag */}
          <div className="rounded-2xl border border-border/60 bg-background/50 p-3">
            <p className="text-sm font-semibold text-foreground">{memberName}</p>
            <p className="text-xs text-muted-foreground">
              {age != null ? `${age} éves` : 'Ismeretlen életkor'}
              {member.ferfi === true ? ' · férfi' : member.ferfi === false ? ' · nő' : ''}
            </p>
          </div>

          {/* Meglévő tagság — informatív figyelmeztetés már a keresés előtt */}
          {otherMemberships.length > 0 && !conflicts && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                {memberName} jelenleg a(z) <strong>{otherMemberships[0].familyName}</strong> tagja
                ({otherMemberships[0].role === 'felnott' ? 'családfő / házastárs' : 'gyermek'}).
                Egy személy egyszerre csak egy család tagja lehet — új hozzárendelésnél a rendszer
                megerősítést kér az áthelyezéshez.
              </p>
            </div>
          )}

          {/* ÜTKÖZÉS — a szerver visszadobta megerősítésre */}
          {conflicts && (
            <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="text-sm leading-6 text-amber-900 dark:text-amber-100">
                  <p className="font-semibold">Figyelem: a tag már máshol szerepel!</p>
                  <p className="mt-1 text-xs leading-5">{conflictWarning}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 min-[420px]:flex-row">
                <Button
                  className="min-h-11 flex-1 rounded-xl bg-amber-600 text-white hover:bg-amber-700"
                  disabled={saving}
                  onClick={() => (pendingNewFamily ? void runCreateNewFamily(true) : void runAssign(true))}
                >
                  {saving ? 'Áthelyezés…' : 'Áthelyezés — a korábbi tagság lezárul'}
                </Button>
                <Button variant="outline" className="min-h-11 rounded-xl" disabled={saving} onClick={resetConflict}>
                  Mégse
                </Button>
              </div>
            </div>
          )}

          {!conflicts && (
            <>
              {/* Család-kereső */}
              <div className="space-y-2">
                <Label htmlFor="family-assign-search" className="font-semibold text-foreground">
                  Meglévő család keresése
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="family-assign-search"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
                    placeholder="Családnév (2+ karakter)…"
                    className="h-11 rounded-xl pl-9"
                  />
                </div>
                {searching && <p className="text-xs text-muted-foreground">Keresés…</p>}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nincs találat — próbáld a családfő vezetéknevével.</p>
                )}
                {results.length > 0 && (
                  <div className="max-h-56 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5" role="listbox" aria-label="Család-találatok">
                    {results.map((fam) => (
                      <button
                        key={fam.id}
                        type="button"
                        role="option"
                        aria-selected={selected?.id === fam.id}
                        onClick={() => setSelected(fam)}
                        className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                          selected?.id === fam.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border/60 bg-background/60 hover:border-primary/30 hover:bg-primary/5'
                        }`}
                      >
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Users className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-foreground">{fam.displayName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[fam.address, `${fam.childrenCount} gyermek`].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Szerep-választás */}
              {selected && (
                <div className="space-y-2">
                  <Label className="font-semibold text-foreground">Milyen szerepben?</Label>
                  <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                    <button
                      type="button"
                      disabled={!!adultDisabledReason}
                      onClick={() => setMode('felnott')}
                      className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none ${
                        mode === 'felnott' && !adultDisabledReason
                          ? 'border-primary bg-primary/10'
                          : 'border-border/60 bg-background/60'
                      }`}
                    >
                      <Home className="size-4 shrink-0 text-primary" />
                      <span>
                        <span className="block font-semibold">Felnőttként</span>
                        <span className="block text-xs text-muted-foreground">
                          {adultDisabledReason ?? (member.ferfi ? 'férj / családfő' : 'feleség / házastárs')}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('gyermek')}
                      className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                        mode === 'gyermek'
                          ? 'border-primary bg-primary/10'
                          : 'border-border/60 bg-background/60'
                      }`}
                    >
                      <Baby className="size-4 shrink-0 text-amber-600" />
                      <span>
                        <span className="block font-semibold">Gyermekként</span>
                        <span className="block text-xs text-muted-foreground">a család gyermeke</span>
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Akciók */}
              <div className="space-y-2 border-t border-border/60 pt-3">
                <Button
                  className="min-h-11 w-full rounded-xl"
                  disabled={!selected || saving || (mode === 'felnott' && !!adultDisabledReason)}
                  onClick={() => void runAssign(false)}
                >
                  {saving ? 'Mentés…' : selected ? `Hozzárendelés: ${selected.displayName}` : 'Válassz családot a kereséssel'}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 w-full rounded-xl"
                  disabled={saving}
                  onClick={() => void runCreateNewFamily(false)}
                >
                  <UserPlus className="size-4" />
                  Új család létrehozása {memberName ? `— ${memberName}` : ''} felnőtt taggal
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
