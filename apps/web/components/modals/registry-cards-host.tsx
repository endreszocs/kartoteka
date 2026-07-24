'use client'

/**
 * RegistryCardsHost (2026-07-24, PR-11, 7. észrevétel).
 *
 * EGYETLEN jobbról beúszó Sheet, amelyben a személyi és a családi karton
 * egymás MELLETT jelenik meg, ha mindkettő nyitva van:
 *   - a személyi karton mindig BALRA,
 *   - a családi karton mindig JOBBRA kerül — attól függetlenül, melyik nyílt előbb.
 *
 * Mobilon (lg alatt) nincs hely két oszlopnak: ilyenkor szegmens-váltó
 * jelenik meg felül, és mindig a legutóbb megnyitott/kért panel látszik.
 */

import { useEffect, useRef, useState } from 'react'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { MemberDetailsDialogV2 } from '@/components/modals/member-details-dialog-v2'
import { FamilyDetailsDialogRefined } from '@/components/modals/family-details-dialog-refined'
import { cn } from '@/lib/utils'
import type { EnrichedMember } from '@/lib/constants/members'

interface RegistryCardsHostProps {
  personOpen: boolean
  member: EnrichedMember | null
  personFamilyId: number | null
  familyOpen: boolean
  familyId: number | null
  /** A személy megjelenített neve — a dialógus hozzáférhető nevéhez. */
  personName?: string | null
  /** A személyi panel bezárása (X a panelen). */
  onClosePerson: () => void
  /** A családi panel bezárása (X a panelen / „Bezárás" gomb). */
  onCloseFamily: () => void
  /** A teljes Sheet bezárása (overlay-kattintás / Esc). */
  onCloseAll: () => void
  /** A személyi kartonról a családi karton megnyitása (a személy NYITVA marad). */
  onOpenFamily: (familyId: number) => void
  /** A családi kartonról egy tag megnyitása a BAL oszlopban. */
  onOpenMember: (memberId: number) => void
  onEditMember?: () => void
  onShowFamilyTree?: (memberId: number) => void
  onDataChanged?: () => void
}

const SHEET_BASE =
  'h-dvh gap-0 overflow-hidden border-primary/15 bg-card p-0 shadow-[-32px_0_90px_-48px_rgba(8,58,54,0.55)] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-[side=right]:w-full data-[side=right]:max-w-none data-[side=right]:data-ending-style:translate-x-full data-[side=right]:data-starting-style:translate-x-full motion-reduce:transition-none'

interface HostViewState {
  personOpen: boolean
  familyOpen: boolean
  member: EnrichedMember | null
  personFamilyId: number | null
  familyId: number | null
  personName: string | null
}

export function RegistryCardsHost({
  personOpen,
  member,
  personFamilyId,
  familyOpen,
  familyId,
  personName,
  onClosePerson,
  onCloseFamily,
  onCloseAll,
  onOpenFamily,
  onOpenMember,
  onEditMember,
  onShowFamilyTree,
  onDataChanged,
}: RegistryCardsHostProps) {
  const anyOpen = personOpen || familyOpen

  // 2026-07-24 (PR-11 review): a kilépő animáció ALATT is a legutóbbi tartalmat
  // rendereljük — különben záráskor a panelek azonnal kiürülnek, és egy üres
  // fehér lap csúszna ki a képernyőről. A latch az utolsó NYITOTT állapotot
  // őrzi (nyitva tartva szinkronban), zárt állapotban abból renderelünk.
  const [lastOpenView, setLastOpenView] = useState<HostViewState>({
    personOpen,
    familyOpen,
    member,
    personFamilyId,
    familyId,
    personName: personName ?? null,
  })
  useEffect(() => {
    if (!anyOpen) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLastOpenView({ personOpen, familyOpen, member, personFamilyId, familyId, personName: personName ?? null })
    })
    return () => {
      cancelled = true
    }
  }, [anyOpen, personOpen, familyOpen, member, personFamilyId, familyId, personName])
  const view: HostViewState = anyOpen
    ? { personOpen, familyOpen, member, personFamilyId, familyId, personName: personName ?? null }
    : lastOpenView

  const dual = view.personOpen && view.familyOpen

  // Mobil-fókusz: a legutóbb MEGNYÍLT panel kerül előre. Az akció-vezérelt
  // váltást (már nyitott panel újra-kérése) a lenti wrapper callbackek adják.
  const [mobileFocus, setMobileFocus] = useState<'person' | 'family'>('person')
  const prevRef = useRef({ personOpen, familyOpen })
  // 2026-07-24 (PR-11 review): részleges zárásnál (kettősből egy panel zárul)
  // a fókuszált bezárás-gomb kiiratkozik a DOM-ból, és a fókusz a body-ra esne —
  // átvisszük a megmaradó panelre.
  const personPanelRef = useRef<HTMLDivElement>(null)
  const familyPanelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = { personOpen, familyOpen }
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (familyOpen && !prev.familyOpen) setMobileFocus('family')
      else if (personOpen && !prev.personOpen) setMobileFocus('person')
      else if (!familyOpen && personOpen) setMobileFocus('person')
      else if (!personOpen && familyOpen) setMobileFocus('family')
    })
    if (prev.familyOpen && !familyOpen && personOpen) {
      requestAnimationFrame(() => {
        const panel = personPanelRef.current
        ;(panel?.querySelector<HTMLElement>('button[aria-label="Személyi karton bezárása"]') ?? panel)?.focus()
      })
    } else if (prev.personOpen && !personOpen && familyOpen) {
      requestAnimationFrame(() => {
        const panel = familyPanelRef.current
        ;(panel?.querySelector<HTMLElement>('button[aria-label="Családi karton bezárása"]') ?? panel)?.focus()
      })
    }
    return () => {
      cancelled = true
    }
  }, [personOpen, familyOpen])

  const widthClass = dual
    ? 'data-[side=right]:sm:w-[min(98vw,112rem)] data-[side=right]:sm:max-w-[112rem]'
    : view.familyOpen
      ? 'data-[side=right]:sm:w-[min(94vw,70rem)] data-[side=right]:sm:max-w-[70rem]'
      : 'data-[side=right]:sm:w-[min(92vw,56rem)] data-[side=right]:sm:max-w-[56rem] data-[side=right]:xl:w-[min(48vw,56rem)] data-[side=right]:xl:max-w-[56rem]'

  // 2026-07-24 (PR-11 review): a dialógus hozzáférhető neve hordozza a
  // tartalom kilétét, ne csak egy általános címkét.
  const accessibleTitle = dual
    ? `${view.personName || 'Személyi karton'} — személyi karton és családi karton`
    : view.personOpen
      ? `${view.personName || 'Személyi karton'} — személyi karton`
      : 'Családi karton'

  return (
    <Sheet
      open={anyOpen}
      onOpenChange={(open) => {
        if (!open) onCloseAll()
      }}
    >
      <SheetContent side="right" showCloseButton={false} className={cn(SHEET_BASE, widthClass)}>
        <SheetTitle className="sr-only">{accessibleTitle}</SheetTitle>
        <SheetDescription className="sr-only">
          Személyi és családi karton — a személy balra, a család jobbra.
        </SheetDescription>

        <div className="flex h-full min-h-0 flex-col">
          {/* Mobil szegmens-váltó — csak ha MINDKÉT panel nyitva van */}
          {dual && (
            <div className="flex shrink-0 gap-1 border-b border-border/60 bg-muted/40 p-1.5 [padding-top:max(0.375rem,env(safe-area-inset-top))] lg:hidden">
              <button
                type="button"
                onClick={() => setMobileFocus('person')}
                className={cn(
                  'min-h-11 flex-1 rounded-xl px-3 text-[13px] font-semibold transition-colors motion-reduce:transition-none',
                  mobileFocus === 'person'
                    ? 'bg-background text-primary shadow-sm ring-1 ring-border/60'
                    : 'text-muted-foreground hover:bg-background/55 hover:text-foreground',
                )}
                aria-pressed={mobileFocus === 'person'}
              >
                Személyi karton
              </button>
              <button
                type="button"
                onClick={() => setMobileFocus('family')}
                className={cn(
                  'min-h-11 flex-1 rounded-xl px-3 text-[13px] font-semibold transition-colors motion-reduce:transition-none',
                  mobileFocus === 'family'
                    ? 'bg-background text-primary shadow-sm ring-1 ring-border/60'
                    : 'text-muted-foreground hover:bg-background/55 hover:text-foreground',
                )}
                aria-pressed={mobileFocus === 'family'}
              >
                Családi karton
              </button>
            </div>
          )}

          <div className="flex min-h-0 flex-1">
            {view.personOpen && (
              <div
                ref={personPanelRef}
                tabIndex={-1}
                className={cn(
                  'h-full min-h-0 min-w-0 flex-1 outline-none',
                  dual && 'lg:border-r lg:border-border/60',
                  dual && (mobileFocus === 'person' ? 'block' : 'hidden lg:block'),
                )}
              >
                <MemberDetailsDialogV2
                  variant="panel"
                  open={view.personOpen}
                  onOpenChange={(open) => {
                    if (!open) onClosePerson()
                  }}
                  member={view.member}
                  familyId={view.personFamilyId}
                  onEdit={onEditMember}
                  onShowFamilyTree={onShowFamilyTree}
                  // 2026-07-24 (PR-11 review): akció-vezérelt mobilfókusz — ha a
                  // családi panel MÁR nyitva van, a gombnak akkor is előre kell
                  // hoznia (nyílt-flag átmenet nélkül nincs, ami váltana).
                  onOpenFamily={(id) => {
                    setMobileFocus('family')
                    onOpenFamily(id)
                  }}
                  onDataChanged={onDataChanged}
                />
              </div>
            )}
            {view.familyOpen && (
              <div
                ref={familyPanelRef}
                tabIndex={-1}
                className={cn(
                  'h-full min-h-0 min-w-0 flex-1 outline-none',
                  dual && (mobileFocus === 'family' ? 'block' : 'hidden lg:block'),
                )}
              >
                <FamilyDetailsDialogRefined
                  variant="panel"
                  open={view.familyOpen}
                  onOpenChange={(open) => {
                    if (!open) onCloseFamily()
                  }}
                  familyId={view.familyId}
                  onOpenMember={(id) => {
                    setMobileFocus('person')
                    onOpenMember(id)
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
