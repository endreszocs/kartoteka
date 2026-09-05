/**
 * WriteSyncConflictDialog — A-M7.9c (2026-04-25).
 *
 * Modal a `sync_state='conflict'` állapotú lokális befizetésekhez és
 * kiadásokhoz. A `ChitantaConflictDialog` általánosítása `entity` prop-pal,
 * hogy egy közös komponens szolgálja ki mindkét entitást.
 *
 * Két megoldási útat kínál a lelkésznek:
 *
 *   1. **Másik iratszámra áthelyezés** — új sorszámot vesz a walletből,
 *      a tétel adatai változatlanok, a push újra-indul.
 *   2. **Törlés** — a tétel eltűnik lokálisan, a user kézzel újra-rögzítheti.
 *
 * UX-alapelvek (feedback_modal_design_system, feedback_lelkesz_informalas):
 *   - Serif cím: „Szinkronizációs konfliktus"
 *   - A hiba-ok (`sync_error`) idézőjelben, nem technikai szleng
 *   - Két nagy CTA gomb, a destruktív (törlés) jobbra, halványabban
 *   - Loading-state, error-state, success-state
 */

import { useState } from 'react'
import { AlertTriangle, RefreshCw, Trash2, X } from 'lucide-react'

import { Button } from '@kartoteka/ui'

import { resolveBefizetesConflict } from '../lib/befizetes-write-sync'
import { resolveKiadasConflict } from '../lib/kiadas-write-sync'
import { errorMessage } from '../lib/error'
import {
  elvetOutboxSorSzerverValtozattal,
  retryOutboxRowFrissRevisionnel,
  type OutboxRow,
} from '../lib/sync'
import { notifyLocalDataChanged } from '../lib/sync-orchestrator'
import { runAllWriteSyncsNow } from '../lib/write-sync-registry'

export type WriteSyncEntity = 'befizetes' | 'kiadas'

interface WriteSyncConflictDialogProps {
  entity: WriteSyncEntity
  localId: string
  congregationId: string
  ev: number
  /** A conflict-sor megjelenítendő mezői — a modal fejlécébe és testébe. */
  display: {
    iratszam: string
    datum: string                  // ISO 'YYYY-MM-DD' (befizetés) vagy 'YYYY-MM-DDTHH:MM:SS' (kiadás)
    osszeg: number
    /** Címzett magyarázó címke — befizetés: tag/család név, kiadás: átvevő. */
    label?: string | null
    sync_error: string | null
  }
  onClose: () => void
  /** Sikeres feloldás után hívódik (reload trigger). */
  onResolved: () => void
}

const ENTITY_LABEL: Record<WriteSyncEntity, { name: string; nameAcc: string }> = {
  befizetes: { name: 'befizetés', nameAcc: 'befizetést' },
  kiadas: { name: 'kiadás', nameAcc: 'kiadást' },
}

export function WriteSyncConflictDialog({
  entity,
  localId,
  congregationId,
  ev,
  display,
  onClose,
  onResolved,
}: WriteSyncConflictDialogProps) {
  const [submitting, setSubmitting] = useState<null | 'reassign' | 'delete'>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const entityLabel = ENTITY_LABEL[entity]

  async function handleReassign() {
    setSubmitting('reassign')
    setError(null)
    setSuccessMsg(null)
    try {
      const res =
        entity === 'befizetes'
          ? await resolveBefizetesConflict({
              action: 'reassign',
              localId,
              congregationId,
              ev,
            })
          : await resolveKiadasConflict({
              action: 'reassign',
              localId,
              congregationId,
              ev,
            })
      if (!res.success) {
        setError(res.error)
        return
      }
      if (res.action !== 'reassign') {
        setError('Váratlan válasz a konfliktus-feloldóból.')
        return
      }
      setSuccessMsg(
        `Új iratszám a tárcából: ${res.newSzam}. A szinkronizációs sor újra-enqueue-olva.`,
      )
      setTimeout(() => {
        onResolved()
        onClose()
      }, 1500)
    } catch (err) {
      setError(`Váratlan hiba: ${errorMessage(err)}`)
    } finally {
      setSubmitting(null)
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Biztosan törlöd a ${display.iratszam} sz. ${entityLabel.nameAcc}? A tétel teljesen eltávolítódik a lokális adatbázisból. A sorszám csak akkor kerül vissza a tárcába, ha nem a szerveren már foglalt szám okozta az ütközést — foglalt számot nem adunk ki újra. (A szerveren lévő tételeket nem érinti.)`,
      )
    ) {
      return
    }
    setSubmitting('delete')
    setError(null)
    setSuccessMsg(null)
    try {
      const res =
        entity === 'befizetes'
          ? await resolveBefizetesConflict({ action: 'delete', localId })
          : await resolveKiadasConflict({ action: 'delete', localId })
      if (!res.success) {
        setError(res.error)
        return
      }
      setSuccessMsg(`A ${entityLabel.name} törölve a gépről.`)
      setTimeout(() => {
        onResolved()
        onClose()
      }, 1200)
    } catch (err) {
      setError(`Váratlan hiba: ${errorMessage(err)}`)
    } finally {
      setSubmitting(null)
    }
  }

  // A datum-megjelenítés: a befizetés ISO 'YYYY-MM-DD', a kiadás
  // 'YYYY-MM-DDTHH:MM:SS' — mindkettőből 10 karakter elég.
  const datumDisplay = display.datum.slice(0, 10)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="write-sync-conflict-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        {/* Fejléc */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 size-6 shrink-0 text-rose-600" />
            <div>
              <h2
                id="write-sync-conflict-title"
                className="font-serif text-xl font-semibold text-slate-900"
              >
                Szinkronizációs konfliktus
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {entityLabel.name} · iratszám {display.iratszam} · {datumDisplay}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting !== null}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            aria-label="Bezárás"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* A tétel főbb adatai */}
        <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          {display.label && (
            <p className="font-medium text-slate-900">{display.label}</p>
          )}
          <p className={display.label ? 'text-xs text-slate-600' : 'font-medium text-slate-900'}>
            {display.osszeg.toLocaleString('hu')} RON
          </p>
        </div>

        {/* Konfliktus oka */}
        {display.sync_error && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
              A szerver üzenete
            </p>
            <p className="mt-1 text-sm text-rose-900">{display.sync_error}</p>
          </div>
        )}

        <p className="mb-4 text-sm text-slate-700">
          Két lehetőséged van. Nyugodtan dönts — egyik művelet sem érinti a
          szerveren már létező {entityLabel.name}eket; csak a te lokális
          adatbázisodat.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </div>
        )}
        {successMsg && (
          <div
            role="status"
            className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
          >
            {successMsg}
          </div>
        )}

        <div className="space-y-2">
          {/* Reassign — primary action */}
          <Button
            type="button"
            onClick={handleReassign}
            disabled={submitting !== null}
            className="w-full justify-start"
          >
            <RefreshCw
              className={`mr-2 size-4 ${submitting === 'reassign' ? 'animate-spin' : ''}`}
            />
            <div className="text-left">
              <p className="font-semibold">
                {submitting === 'reassign'
                  ? 'Átállítás új iratszámra…'
                  : 'Másik iratszámra állítás'}
              </p>
              <p className="text-[11px] font-normal opacity-80">
                Új szám a walletből, a {entityLabel.name} adatai változatlanok,
                újra-szinkronizálás automatikus.
              </p>
            </div>
          </Button>

          {/* Delete — destructive */}
          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={submitting !== null}
            className="w-full justify-start border-rose-200 text-rose-800 hover:bg-rose-50"
          >
            <Trash2
              className={`mr-2 size-4 ${submitting === 'delete' ? 'animate-pulse' : ''}`}
            />
            <div className="text-left">
              <p className="font-semibold">
                {submitting === 'delete'
                  ? 'Törlés folyamatban…'
                  : `Lokális ${entityLabel.name} törlése`}
              </p>
              <p className="text-[11px] font-normal opacity-80">
                A {entityLabel.name} eltűnik a gépedről (a szerveren foglalt sorszám
                nem kerül vissza a tárcába). Újra-rögzítés kézzel.
              </p>
            </div>
          </Button>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={submitting !== null}
          >
            Mégse
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
//  OutboxConflictDialog — a KLASSZIKUS outbox revision-ütközése (2026-09-05,
//  desk-sync-6). Tag-módosítás / munkanapló / saját profil: a szerveren a sor
//  időközben változott, a feltételes UPDATE 0 sort ért. Eddig ez néma `failed`
//  volt, és a következő delta-pull felülírta a lelkész módosítását.
//
//  Két út — egyik sem néma felülírás:
//    1. „Megtartom az enyémet": a patch újraküldése a FRISS szerver-változat-
//       számmal (csak a módosított mezők; ha közben megint változik, újra
//       ütközik és újra kérdezünk).
//    2. „A szerver változata marad": a várólista-sor törlése + a szerver-sor
//       célzott újratöltése a tükörbe.
// ─────────────────────────────────────────────────────────────────────────

const OUTBOX_TABLA_CIMKE: Record<string, string> = {
  szemely: 'tag adatlapja',
  munkanaplo: 'munkanapló-bejegyzés',
  profiles: 'saját profil',
}

export function OutboxConflictDialog({
  row,
  userId,
  onClose,
  onResolved,
}: {
  row: Pick<OutboxRow, 'id' | 'op' | 'target_table' | 'target_id' | 'last_error' | 'created_at' | 'payload'>
  userId: string
  onClose: () => void
  onResolved: () => void
}) {
  const [submitting, setSubmitting] = useState<null | 'enyem' | 'szerver'>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const cimke = OUTBOX_TABLA_CIMKE[row.target_table] ?? row.target_table
  let mezok: string[] = []
  try {
    const p = JSON.parse(row.payload) as { patch?: Record<string, unknown> }
    mezok = Object.keys(p.patch ?? {})
  } catch {
    mezok = []
  }

  async function megtartom() {
    setSubmitting('enyem')
    setError(null)
    try {
      const res = await retryOutboxRowFrissRevisionnel(row.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSuccessMsg(`Újraküldés a friss szerver-változattal (${res.ujRevision}). A felküldés azonnal indul.`)
      void runAllWriteSyncsNow()
      setTimeout(() => {
        onResolved()
        onClose()
      }, 1200)
    } catch (err) {
      setError(`Váratlan hiba: ${errorMessage(err)}`)
    } finally {
      setSubmitting(null)
    }
  }

  async function szerverValtozat() {
    setSubmitting('szerver')
    setError(null)
    try {
      const res = await elvetOutboxSorSzerverValtozattal(row.id, userId)
      notifyLocalDataChanged()
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSuccessMsg('A helyi módosítás elvetve, a szerver változata visszatöltve.')
      setTimeout(() => {
        onResolved()
        onClose()
      }, 1200)
    } catch (err) {
      setError(`Váratlan hiba: ${errorMessage(err)}`)
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="outbox-conflict-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 size-6 shrink-0 text-rose-600" />
            <div>
              <h2 id="outbox-conflict-title" className="font-serif text-xl font-semibold">
                Ütközés a szerverrel
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {cimke} · azonosító {row.target_id ?? '—'} · rögzítve{' '}
                {row.created_at.slice(0, 16).replace('T', ' ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting !== null}
            className="min-h-11 min-w-11 rounded p-1 text-muted-foreground hover:bg-secondary disabled:opacity-40"
            aria-label="Bezárás"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="text-sm leading-relaxed">
          Ezt a sort a gépeden módosítottad, de közben a szerveren is változott (valaki más, vagy
          te a weben). A módosításod NEM veszett el — döntsd el, melyik maradjon.
        </p>
        {mezok.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            A gépeden módosított mezők: {mezok.join(', ')}
          </p>
        )}
        {row.last_error && (
          <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
              A szinkron üzenete
            </p>
            <p className="mt-1 text-sm">{row.last_error}</p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </div>
        )}
        {successMsg && (
          <div
            role="status"
            className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs"
          >
            {successMsg}
          </div>
        )}

        <div className="mt-4 space-y-2">
          <Button
            type="button"
            onClick={megtartom}
            disabled={submitting !== null}
            className="min-h-11 w-full justify-start"
          >
            <RefreshCw className={`mr-2 size-4 ${submitting === 'enyem' ? 'animate-spin' : ''}`} />
            <div className="text-left">
              <p className="font-semibold">
                {submitting === 'enyem' ? 'Újraküldés…' : 'Megtartom az enyémet'}
              </p>
              <p className="text-[11px] font-normal opacity-80">
                A módosított mezők újra felmennek a szerver friss változatára.
              </p>
            </div>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={szerverValtozat}
            disabled={submitting !== null}
            className="min-h-11 w-full justify-start"
          >
            <Trash2 className={`mr-2 size-4 ${submitting === 'szerver' ? 'animate-pulse' : ''}`} />
            <div className="text-left">
              <p className="font-semibold">
                {submitting === 'szerver' ? 'Visszatöltés…' : 'A szerver változata marad'}
              </p>
              <p className="text-[11px] font-normal opacity-80">
                A helyi módosítás elvetése, a szerver sora visszakerül a gépre.
              </p>
            </div>
          </Button>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={submitting !== null}
          >
            Később döntök
          </Button>
        </div>
      </div>
    </div>
  )
}
