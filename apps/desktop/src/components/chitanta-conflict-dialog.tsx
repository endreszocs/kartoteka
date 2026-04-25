/**
 * ChitantaConflictDialog — A-M7.2d2d (2026-04-24).
 *
 * Modal a `sync_state='conflict'` állapotú lokális chitantákhoz. Két
 * megoldási útat kínál a lelkésznek:
 *
 *   1. **Másik sorszámra áthelyezés** — új sorszámot vesz a walletből,
 *      a chitanta adatai változatlanok, a push újra-indul.
 *   2. **Törlés** — a chitanta eltűnik lokálisan, a user kézzel újra-
 *      kiállíthatja (friss form-mal).
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

import { resolveChitantaConflict } from '../lib/chitanta-sync'
import { errorMessage } from '../lib/error'

interface ChitantaConflictDialogProps {
  localId: string
  congregationId: string
  /** A conflict-sor megjelenítendő mezői — a modal fejlécébe. */
  chitanta: {
    sorozat: string
    szam: number
    szamla_datum: string
    klienesseg_nev: string
    osszeg_brut: number
    sync_error: string | null
  }
  onClose: () => void
  /** Sikeres feloldás után hívódik (reload trigger). */
  onResolved: () => void
}

export function ChitantaConflictDialog({
  localId,
  congregationId,
  chitanta,
  onClose,
  onResolved,
}: ChitantaConflictDialogProps) {
  const [submitting, setSubmitting] = useState<null | 'reassign' | 'delete'>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function handleReassign() {
    setSubmitting('reassign')
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await resolveChitantaConflict({
        action: 'reassign',
        localId,
        congregationId,
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      if (res.action !== 'reassign') {
        // Elméletileg lehetetlen — a reassign hívásra a backend reassign-t ad
        setError('Váratlan válasz a konfliktus-feloldóból.')
        return
      }
      setSuccessMsg(
        `Új sorszám a walletből: ${res.newSorozat} / ${res.newSzam}. A szinkronizációs sor újra-enqueue-olva.`,
      )
      // 1.5s után zárjuk a modalt, hogy a user elolvassa a sikerüzenetet
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
        `Biztosan törlöd a ${chitanta.sorozat} / ${chitanta.szam} chitantát? Ez a művelet visszaadja a sorszámot a walletbe, de a chitantát teljesen eltávolítja a lokális adatbázisból.`,
      )
    ) {
      return
    }
    setSubmitting('delete')
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await resolveChitantaConflict({
        action: 'delete',
        localId,
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      setSuccessMsg('A chitanta törölve. A wallet-szám visszakerült a pool-ba.')
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
      aria-labelledby="chitanta-conflict-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        // Overlay-click zárja, kivéve ha művelet folyamatban
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
                id="chitanta-conflict-title"
                className="font-serif text-xl font-semibold text-slate-900"
              >
                Szinkronizációs konfliktus
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {chitanta.sorozat} / {chitanta.szam} · {chitanta.szamla_datum}
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

        {/* A chitanta főbb adatai */}
        <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">{chitanta.klienesseg_nev}</p>
          <p className="text-xs text-slate-600">
            {chitanta.osszeg_brut.toLocaleString('hu')} RON
          </p>
        </div>

        {/* Konfliktus oka */}
        {chitanta.sync_error && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
              A szerver üzenete
            </p>
            <p className="mt-1 text-sm text-rose-900">{chitanta.sync_error}</p>
          </div>
        )}

        {/* Magyarázat és választható lépések */}
        <p className="mb-4 text-sm text-slate-700">
          Két lehetőséged van. Nyugodtan dönts — egyik művelet sem érinti a
          szerveren már létező chitantákat; csak a te lokális adatbázisodat.
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
                  ? 'Átállítás új sorszámra…'
                  : 'Másik sorszámra állítás'}
              </p>
              <p className="text-[11px] font-normal opacity-80">
                Új sorszám a walletből, a chitanta adatai változatlanok, újra-
                szinkronizálás automatikus.
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
                {submitting === 'delete' ? 'Törlés folyamatban…' : 'Lokális chitanta törlése'}
              </p>
              <p className="text-[11px] font-normal opacity-80">
                A chitanta eltűnik a gépedről, a wallet-szám visszakerül a
                tárcába. Újra-kiállítás kézzel.
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
