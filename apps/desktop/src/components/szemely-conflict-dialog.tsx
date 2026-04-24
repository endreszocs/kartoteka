/**
 * SzemelyConflictDialog — M8.1 polish (2026-04-24).
 *
 * A `szemely_pending_local` sor `conflict` állapotba került (a szerver-oldali
 * CNP UNIQUE ütközött, vagy max_attempts elérve). A lelkésznek 2 opciója:
 *
 *   1. **Törlés** — a lokális pending sor törlődik. Ha a conflict CNP-dup
 *      miatt van (a szerveren már van ilyen tag), akkor a szerver-oldali
 *      marad, a kliens újra-frissítheti a `szemely_local` cache-t a
 *      következő pullnál.
 *
 *   2. **Újrapróbálkozás** — a `sync_state`-et vissza `pending`-re állítjuk,
 *      a `retry_count`-ot nullázzuk. A `szemely-write-sync.ts` a következő
 *      poll-on újra megpróbálja feltölteni. Hasznos, ha a conflict csak
 *      hálózati hibafolyamat volt (max_attempts elért, de a szerver már
 *      felszabadult).
 *
 * Nincs "reassign" ág a pénzügyi `WriteSyncConflictDialog`-hoz képest:
 * szemely-nél nincs iratszám-cseréje, a CNP pedig ténylegesen a tag
 * azonosítója — másik CNP-re állítani tévedés lenne. Ha új CNP-vel akar
 * felvenni egy tagot a lelkész, az "Új tag" gombbal megteheti.
 */

import { useState } from 'react'
import { AlertCircle, RotateCw, Trash2, X } from 'lucide-react'

import { Button } from '@kartoteka/ui'

import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

interface SzemelyConflictDialogProps {
  pendingRow: {
    id: string
    cnp: string
    csaladnev: string | null
    k_nev: string | null
    ferjk_nev: string | null
    sync_error: string | null
    retry_count: number
  }
  onResolved: () => void
  onClose: () => void
}

type ActionState =
  | { state: 'idle' }
  | { state: 'deleting' }
  | { state: 'retrying' }
  | { state: 'error'; message: string }
  | { state: 'done'; action: 'delete' | 'retry' }

export function SzemelyConflictDialog({
  pendingRow,
  onResolved,
  onClose,
}: SzemelyConflictDialogProps) {
  const [action, setAction] = useState<ActionState>({ state: 'idle' })

  const fullName =
    [(pendingRow.ferjk_nev ?? pendingRow.csaladnev) || '', pendingRow.k_nev || '']
      .filter(Boolean)
      .join(' ') || '(névtelen)'

  async function handleDelete() {
    if (!confirm(`Biztos, hogy törlöd a "${fullName}" (CNP: ${pendingRow.cnp}) lokális pending sorát?\n\nA szerver-oldali tag (ha létezik) NEM törlődik — csak a te helyi másolatod tűnik el, ami ütközött.`)) {
      return
    }
    setAction({ state: 'deleting' })
    try {
      await getTauriSqliteBackend().deleteLocalPendingSzemely(pendingRow.id)
      setAction({ state: 'done', action: 'delete' })
      setTimeout(() => {
        onResolved()
        onClose()
      }, 900)
    } catch (err) {
      setAction({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function handleRetry() {
    setAction({ state: 'retrying' })
    try {
      // A sync_state-et pending-re állítjuk, retry_count nullázva.
      // A szemely-write-sync a következő poll-on (max 30s) újra próbálja.
      await getTauriSqliteBackend().resetSzemelyPendingStatus(pendingRow.id)
      setAction({ state: 'done', action: 'retry' })
      setTimeout(() => {
        onResolved()
        onClose()
      }, 900)
    } catch (err) {
      setAction({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const busy = action.state === 'deleting' || action.state === 'retrying'
  const done = action.state === 'done'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="szemely-conflict-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Fejléc */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
              <AlertCircle className="size-5" />
            </div>
            <div>
              <h2
                id="szemely-conflict-title"
                className="font-serif text-xl font-semibold text-slate-900"
              >
                Ütközés a szinkronizálásnál
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {fullName} · CNP: <span className="font-mono">{pendingRow.cnp}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Bezárás"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tartalom */}
        <div className="space-y-4 p-5">
          {/* Szerver-üzenet */}
          <div className="rounded-md border border-rose-200 bg-rose-50/60 p-3 text-sm">
            <p className="font-semibold text-rose-900">A szerver üzenete:</p>
            <p className="mt-1 text-rose-800">
              {pendingRow.sync_error ?? 'Ismeretlen hiba'}
            </p>
            {pendingRow.retry_count > 0 && (
              <p className="mt-1 text-xs italic text-rose-700">
                Eddig {pendingRow.retry_count} próbálkozás
              </p>
            )}
          </div>

          {/* Útmutatás */}
          <div className="text-sm text-slate-700">
            <p>Mit szeretnél tenni?</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              <li>
                <strong>Törlés:</strong> ha tudod, hogy valaki más már felvette ezt
                a taget — a helyi pending sor eltűnik, és a következő szinkronnál a
                szerver-verzió megjelenik a listádban.
              </li>
              <li>
                <strong>Újrapróbálkozás:</strong> ha csak hálózati gond volt — a
                szinkron a következő percben újra próbálja.
              </li>
            </ul>
          </div>

          {/* Kész-szalag */}
          {done && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {action.action === 'delete'
                ? '✅ A lokális pending sor törölve.'
                : '✅ A sor újra szinkronizálásra beállítva. Hamarosan a háttérben új próbálkozás indul.'}
            </div>
          )}

          {/* Hiba-szalag */}
          {action.state === 'error' && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              Hiba: {action.message}
            </div>
          )}
        </div>

        {/* Akciók */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/50 p-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Mégse
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleRetry}
              disabled={busy || done}
              className="border-sky-300 text-sky-900 hover:bg-sky-50"
            >
              <RotateCw className={`mr-2 size-4 ${action.state === 'retrying' ? 'animate-spin' : ''}`} />
              Újrapróbálkozás
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={busy || done}
              className="bg-rose-700 text-white hover:bg-rose-800"
            >
              <Trash2 className="mr-2 size-4" />
              Törlés
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
