'use client'

/**
 * Szülő-összekötés eredménye — felugró ablak a tag-mentés után (2026-08-02, PR-20).
 *
 * A tag kartonjára beírt szülő-NÉV alapján a mentés megpróbálja a szülőket a
 * gyülekezet tagjaival összekötni (és a családot automatikusan létrehozni):
 *   - egyértelmű találat → automatikusan összekötve (itt csak megerősítjük),
 *   - TÖBB találat → itt kell választani, melyik személy a szülő,
 *   - ütközés (a tag már másik család tagja) → elmagyarázzuk, mit és hogyan
 *     kell javítani (a felhasználó explicit kérése: elugró ablak + útmutató).
 */

import { useEffect, useState } from 'react'
import { ArrowRightLeft, CheckCircle2, HelpCircle, TriangleAlert, UserRound } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  linkMemberParents,
  type SaveMemberParentLink,
  type SaveMemberParentPart,
} from '@/app/(dashboard)/tagnyilvantartas/actions'

export interface ParentLinkResultData extends SaveMemberParentLink {
  memberId: number
  memberName: string
}

interface ParentLinkResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: ParentLinkResultData | null
  /** Sikeres utólagos összekötés után (lista-frissítéshez) */
  onLinked?: () => void
}

function PartRow({ label, part, selected, onSelect }: {
  label: string
  part: SaveMemberParentPart
  selected: number | null
  onSelect: (id: number | null) => void
}) {
  if (part.status === 'linked' && part.matched) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div className="text-sm leading-5">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">{label}: összekötve</p>
          <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90">
            „{part.input}” → <strong>{part.matched.name}</strong>
            {part.matched.birthYear ? ` (${part.matched.birthYear})` : ''} — a családfa és a családi karton frissült.
          </p>
        </div>
      </div>
    )
  }
  if (part.status === 'ambiguous' && part.candidates?.length) {
    return (
      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/40">
        <div className="flex items-start gap-2.5">
          <HelpCircle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm leading-5">
            <p className="font-semibold text-amber-900 dark:text-amber-200">{label}: több egyező tag</p>
            <p className="text-xs text-amber-800/90 dark:text-amber-300/90">
              A(z) „{part.input}” névre több tag is illik — válaszd ki, melyikük a szülő
              (vagy hagyd üresen, ha egyik sem):
            </p>
          </div>
        </div>
        <div className="space-y-1.5 pl-7">
          {part.candidates.map((c) => (
            <label key={c.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-3 text-sm">
              <input
                type="radio"
                name={`parent-pick-${label}`}
                checked={selected === c.id}
                onChange={() => onSelect(c.id)}
                className="size-4"
              />
              <UserRound className="size-4 text-muted-foreground" />
              <span>
                {c.name}
                {c.birthYear ? <span className="text-muted-foreground"> ({c.birthYear})</span> : null}
              </span>
            </label>
          ))}
          <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground">
            <input
              type="radio"
              name={`parent-pick-${label}`}
              checked={selected === null}
              onChange={() => onSelect(null)}
              className="size-4"
            />
            Egyik sem — most nem kötöm össze
          </label>
        </div>
      </div>
    )
  }
  // 'none' — nincs találat / átmeneti kereső-hiba: csendes információ
  if (part.lookupFailed) {
    return (
      <div className="rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
        {label}: a tag-keresés átmeneti hiba miatt nem futott le — a beírt
        „{part.input}” név szövegként elmentve. A tag szerkesztőjéből később
        újra összekötheted.
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
      {label}: a beírt „{part.input}” névhez nem találtunk gyülekezeti tagot — a név
      szövegként elmentve. Ha a szülő is tag, a nevét pontosan úgy írd be, ahogy a
      nyilvántartásban szerepel, vagy használd a kereső-legördülőt a tag szerkesztőjében.
    </div>
  )
}

/** Az automatikus rendezés eredménye — a mentésből vagy az utólagos összekötésből. */
interface FamilyOutcome {
  moves: string[]
  notes: string[]
  closed: string[]
}

export function ParentLinkResultDialog({ open, onOpenChange, data, onLinked }: ParentLinkResultDialogProps) {
  const [apaPick, setApaPick] = useState<number | null>(null)
  const [anyaPick, setAnyaPick] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  /** Az utólagos összekötés (gomb) eredménye — felülírja a mentéskori állapotot */
  const [outcome, setOutcome] = useState<FamilyOutcome | null>(null)

  useEffect(() => {
    if (!open) return
    setApaPick(null)
    setAnyaPick(null)
    setOutcome(null)
  }, [open, data?.memberId])

  if (!data) return null

  const moveLines = outcome?.moves ?? data.familyMoves ?? []
  const noteLines = outcome?.notes ?? data.familyNotes ?? []
  const closedLines = outcome?.closed ?? data.familyClosed ?? []

  const needsPick =
    (data.apa?.status === 'ambiguous' && (data.apa.candidates?.length ?? 0) > 0) ||
    (data.anya?.status === 'ambiguous' && (data.anya.candidates?.length ?? 0) > 0)

  async function handleLink() {
    if (!data) return
    if (!apaPick && !anyaPick) {
      onOpenChange(false)
      return
    }
    setSaving(true)
    try {
      const res = await linkMemberParents({ memberId: data.memberId, apaId: apaPick, anyaId: anyaPick })
      if ('error' in res && res.error) {
        toast.error(res.error)
        return
      }
      const nextOutcome: FamilyOutcome = {
        moves: ('moves' in res && res.moves) || [],
        notes: ('notes' in res && res.notes) || [],
        closed: ('closed' in res && res.closed) || [],
      }
      if (!('linked' in res) || res.linked) {
        toast.success('Szülő összekötve — a családfa és a családi karton frissült.')
      } else {
        toast.info('A rokonsági kapcsolat rögzült a családfán, de a családi kartonhoz nem rendeltük hozzá a tagot — lásd az észrevételeket.')
      }
      onLinked?.()
      // 2026-08-03 (PR-23): ha volt tényleges áthelyezés vagy észrevétel, az
      // ablak NYITVA marad, hogy a lelkész el tudja olvasni, mi hová került.
      if (nextOutcome.moves.length > 0 || nextOutcome.notes.length > 0) {
        setOutcome(nextOutcome)
      } else {
        onOpenChange(false)
      }
    } catch {
      toast.error('Az összekötés nem sikerült. Próbáld újra.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-[1.5rem] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Szülők összekötése — {data.memberName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {data.apa && <PartRow label="Édesapa" part={data.apa} selected={apaPick} onSelect={setApaPick} />}
          {data.anya && <PartRow label="Édesanya" part={data.anya} selected={anyaPick} onSelect={setAnyaPick} />}

          {moveLines.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
              <ArrowRightLeft className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              <div className="min-w-0 text-sm leading-5 text-emerald-900 dark:text-emerald-100">
                <p className="font-semibold">Ezt rendeztük automatikusan</p>
                <ul className="mt-1 space-y-1 text-xs leading-5">
                  {moveLines.map((line) => (
                    <li key={line} className="break-words">• {line}</li>
                  ))}
                </ul>
                {closedLines.length > 0 && (
                  <p className="mt-1.5 text-xs leading-5 text-emerald-800/90 dark:text-emerald-300/90">
                    Lezárt (kiürült) családi karton: {closedLines.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {noteLines.length > 0 ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div className="min-w-0 text-sm leading-5 text-amber-900 dark:text-amber-100">
                <p className="font-semibold">Észrevételek — ezt nézd át</p>
                <ul className="mt-1 space-y-1.5 text-xs leading-5">
                  {noteLines.map((line) => (
                    <li key={line} className="break-words">• {line}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : data.familyWarning ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div className="text-sm leading-5 text-amber-900 dark:text-amber-100">
                <p className="font-semibold">Mit kell tenni?</p>
                <p className="mt-1 text-xs leading-5">{data.familyWarning}</p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-border/60 pt-3 min-[420px]:flex-row min-[420px]:justify-end">
            {needsPick && !outcome && (
              <Button className="min-h-11 rounded-xl" disabled={saving || (!apaPick && !anyaPick)} onClick={() => void handleLink()}>
                {saving ? 'Összekötés…' : 'Kiválasztott szülő összekötése'}
              </Button>
            )}
            <Button variant="outline" className="min-h-11 rounded-xl" disabled={saving} onClick={() => onOpenChange(false)}>
              Bezárás
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
