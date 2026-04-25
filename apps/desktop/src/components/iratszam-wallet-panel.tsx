/**
 * IratszamWalletPanel — A-M7.9a (2026-04-25).
 *
 * Iratszám-tárca panel a befizetés/kiadás Készpénzes offline-rögzítéséhez.
 * A `ChitantaWalletPanel` (chitanta-page.tsx inline) általánosított változata:
 *   - `tipus` prop: 'befizetes' vagy 'kiadas' (közös infrastruktúra a két entity között)
 *   - `ev` prop: év-szegmens (a chitantánál sorozat — itt évente indul újra a pool)
 *
 * Háromállapotú UI:
 *   - üres (red): "Online tölts fel, hogy hálózat nélkül is rögzíthess."
 *   - kevés (1-3, amber): "⚠ Kevés szám maradt — érdemes feltölteni."
 *   - rendben (≥4, indigo): "N szabad sorszám · következő: X"
 *
 * Lelkész-informálási alapelv (feedback_lelkesz_informalas.md):
 *   - loading / success / error / offline-state explicit
 *   - pasztorális magyar üzenetek, technikai szleng nélkül
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Plus, RefreshCw, Wallet } from 'lucide-react'

import { Button } from '@kartoteka/ui'
import {
  refillIratszamWalletUseCase,
  type IratszamTipus,
  type RefillIratszamWalletResult,
} from '@kartoteka/core'

import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

interface IratszamWalletPanelProps {
  congregationId: string
  tipus: IratszamTipus
  ev: number
  isOnline: boolean
  /** Értesíti a parent-et az elérhető szám-mennyiségről (a form engedélyezéséhez). */
  onStatusChange?: (availableCount: number) => void
  /** Default-méret a +N gombhoz (10). */
  refillCount?: number
}

const ENTITY_LABEL: Record<IratszamTipus, string> = {
  befizetes: 'befizetés',
  kiadas: 'kiadás',
}

export function IratszamWalletPanel({
  congregationId,
  tipus,
  ev,
  isOnline,
  onStatusChange,
  refillCount = 10,
}: IratszamWalletPanelProps) {
  const [available, setAvailable] = useState<number>(0)
  const [nextNumber, setNextNumber] = useState<number | null>(null)
  const [oldest, setOldest] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refilling, setRefilling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await getTauriSqliteBackend().getIratszamWalletStatus(
        congregationId,
        tipus,
        ev,
      )
      setAvailable(status.availableCount)
      setNextNumber(status.nextNumber)
      setOldest(status.oldestReservedAt)
      onStatusChange?.(status.availableCount)
    } catch (err) {
      setError(`Iratszám-tárca olvasási hiba: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }, [congregationId, tipus, ev, onStatusChange])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  async function handleRefill(count: number) {
    setRefilling(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const supabase = getDesktopSupabase()
      const result: RefillIratszamWalletResult = await refillIratszamWalletUseCase(
        { congregationId, tipus, ev, count },
        { supabase, runtime: 'desktop' },
      )
      if (!result.success) {
        setError(result.error)
        return
      }
      await getTauriSqliteBackend().insertIratszamWalletNumbers(
        congregationId,
        tipus,
        ev,
        result.numbers,
      )
      const first = result.numbers[0]
      const last = result.numbers[result.numbers.length - 1]
      setSuccessMsg(
        `+${result.numbers.length} sorszám a tárcában (${first}–${last}).`,
      )
      setTimeout(() => setSuccessMsg(null), 4000)
      await loadStatus()
    } catch (err) {
      setError(`Foglalási hiba: ${errorMessage(err)}`)
    } finally {
      setRefilling(false)
    }
  }

  const low = available > 0 && available <= 3
  const empty = available === 0

  const toneClasses = empty
    ? 'border-red-200 bg-red-50/60 text-red-900'
    : low
      ? 'border-amber-300 bg-amber-50/70 text-amber-900'
      : 'border-indigo-200 bg-indigo-50/60 text-indigo-900'

  const entityLabel = ENTITY_LABEL[tipus]

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${toneClasses}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Wallet className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
              Offline iratszám-tárca · {ev} · {entityLabel}
            </p>
            {loading ? (
              <p className="mt-1 text-xs italic opacity-70">Betöltés…</p>
            ) : empty ? (
              <p className="mt-1">
                <strong>Üres.</strong> Online-módban tölts fel, hogy hálózat
                nélkül is tudj {entityLabel}t rögzíteni.
              </p>
            ) : (
              <p className="mt-1">
                <span className="font-semibold">{available} szabad sorszám</span>
                {nextNumber !== null && (
                  <span>
                    {' · '}
                    következő: <span className="font-mono">{nextNumber}</span>
                  </span>
                )}
                {oldest && (
                  <span className="block text-[11px] italic opacity-75">
                    Legrégibb foglalás: {oldest.slice(0, 10)}
                  </span>
                )}
              </p>
            )}
            {low && !empty && (
              <p className="mt-1 text-xs font-semibold">
                ⚠ Kevés szám maradt — érdemes feltölteni.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={empty || low ? 'default' : 'outline'}
            onClick={() => handleRefill(refillCount)}
            disabled={!isOnline || refilling}
            title={
              !isOnline
                ? 'Csak online-módban lehet a tárcát feltölteni.'
                : `Foglalj ${refillCount} sorszámot a szerverről.`
            }
          >
            <Plus className="mr-1.5 size-4" />
            {refilling ? 'Foglalás…' : `+${refillCount} szám`}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadStatus()}
            disabled={loading || refilling}
            aria-label="Tárca frissítése"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-rose-700">
          <AlertCircle className="mr-1 inline-block size-3.5" />
          {error}
        </p>
      )}
      {successMsg && (
        <p className="mt-2 text-xs text-emerald-700">
          <CheckCircle2 className="mr-1 inline-block size-3.5" />
          {successMsg}
        </p>
      )}
    </div>
  )
}
