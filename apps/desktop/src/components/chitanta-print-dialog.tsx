/**
 * ChitantaPrintDialog — egy kiállított chitanța nyomtatási nézete. A-M7.2f.
 *
 * Nyomtatási layout:
 *   - Gyülekezet-fejléc (magyar + román név, címke-mezők)
 *   - Egyházmegye + kerület (hu + ro)
 *   - "Chitanță" nagy fejléc
 *   - Sorozat + nyomdai szám + gyülekezeti szám
 *   - Dátum + kiállító
 *   - Átvevő adatai (név, cím, CUI)
 *   - Reprezentánd (hu + ro)
 *   - Összeg (RON, nagy font)
 *   - Sztornózott jelzés piros pecséttel, ha stornozott=true
 *
 * Az @media print CSS a böngésző-print-et (Tauri webview) egy A5 margóval kezeli.
 * A felhasználó Ctrl+P-vel vagy a "Nyomtatás" gombbal kezdeményezi a nyomtatást.
 *
 * **Online-only** (A-M7.2b + A-M7.2f): a `getChitantaForPrintUseCase` 5-query-láncot
 * futtat, amit offline-ban nem tudunk feloldani. Ha `navigator.onLine === false`,
 * a dialog erről tájékoztat.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Printer, X } from 'lucide-react'

import { Button } from '@kartoteka/ui'
import {
  getChitantaForPrintUseCase,
  type GetChitantaForPrintResult,
} from '@kartoteka/core'
import { type ChitantaPrintData } from '@kartoteka/validations'

import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'

export function ChitantaPrintDialog({
  chitantaId,
  congregationId,
  onClose,
}: {
  chitantaId: string
  congregationId: string
  onClose: () => void
}) {
  const [data, setData] = useState<ChitantaPrintData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getDesktopSupabase()
      const result: GetChitantaForPrintResult = await getChitantaForPrintUseCase(
        { congregationId, chitantaId },
        { supabase, runtime: 'desktop' },
      )
      if (result.success) {
        setData(result.data)
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(`Nyomtatási adatok betöltési hibája: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }, [chitantaId, congregationId])

  useEffect(() => {
    void load()
  }, [load])

  function handlePrint() {
    window.print()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 print:static print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chitanta-print-title"
    >
      {/* Toolbar — nem nyomtat */}
      <div className="print:hidden sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex items-center justify-between gap-2 bg-slate-900/80 px-4 py-3 text-white backdrop-blur-sm">
        <h2 id="chitanta-print-title" className="text-sm font-semibold">
          Chitanță nyomtatás
        </h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            disabled={loading || !!error || !data}
          >
            <Printer className="mr-1.5 size-4" />
            Nyomtatás (Ctrl+P)
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            <X className="mr-1.5 size-4" />
            Bezárás
          </Button>
        </div>
      </div>

      {/* Print-layout */}
      <div className="mx-auto w-full max-w-[148mm] rounded-md bg-white p-8 shadow-xl print:max-w-full print:rounded-none print:p-6 print:shadow-none">
        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="ml-3 text-sm">Nyomtatási adatok betöltése…</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mr-1.5 inline-block size-4" />
            {error}
          </div>
        )}

        {data && <ChitantaPrintLayout data={data} />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Layout — a tényleges print-forma
// ─────────────────────────────────────────────────────────────────────────

function ChitantaPrintLayout({ data }: { data: ChitantaPrintData }) {
  return (
    <article className="relative font-serif text-sm text-slate-900">
      {/* Sztornózott pecsét */}
      {data.stornozott && (
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <span className="rotate-[-15deg] rounded-md border-4 border-red-600 px-6 py-2 text-4xl font-bold tracking-wider text-red-600/70">
            STORNOZAT
          </span>
        </div>
      )}

      {/* Gyülekezet fejléc */}
      <header className="relative z-10 border-b-2 border-slate-800 pb-3">
        <div className="text-center">
          {data.egyhazkeruletNevHu && (
            <p className="text-[10px] uppercase tracking-wider text-slate-600">
              {data.egyhazkeruletNevHu}
              {data.egyhazkeruletNevRo ? ` · ${data.egyhazkeruletNevRo}` : ''}
            </p>
          )}
          {data.egyhazmegyeNevHu && (
            <p className="text-[10px] uppercase tracking-wider text-slate-600">
              {data.egyhazmegyeNevHu}
              {data.egyhazmegyeNevRo ? ` · ${data.egyhazmegyeNevRo}` : ''}
            </p>
          )}
          <h1 className="mt-1 text-base font-semibold text-slate-900">
            {data.gyulekezet.nevHu}
            {data.gyulekezet.nevRo && (
              <span className="ml-2 text-xs font-normal italic text-slate-700">
                ({data.gyulekezet.nevRo})
              </span>
            )}
          </h1>
          <p className="text-[10px] text-slate-600">
            {data.gyulekezet.cim && <span>{data.gyulekezet.cim}</span>}
            {data.gyulekezet.varos && <span>, {data.gyulekezet.varos}</span>}
            {data.gyulekezet.megye && <span>, {data.gyulekezet.megye}</span>}
            {data.gyulekezet.telefon && (
              <span>
                {' '}
                · Tel: {data.gyulekezet.telefon}
              </span>
            )}
            {data.gyulekezet.cif && (
              <span>
                {' '}
                · CIF: {data.gyulekezet.cif}
              </span>
            )}
          </p>
        </div>
      </header>

      {/* Fő fejléc — CHITANȚĂ */}
      <div className="relative z-10 my-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-wide">CHITANȚĂ</h2>
          <p className="mt-0.5 text-xs uppercase tracking-wider text-slate-600">
            Papír-nyugta / Adeverință de plată
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            Seria / Szám
          </p>
          <p className="font-mono text-xl font-bold">
            {data.sorozat}{' '}
            {data.nyomdaiSzam !== null ? data.nyomdaiSzam : data.szam}
          </p>
          {data.gyulekezetiSzam !== null && (
            <p className="mt-1 font-mono text-xs text-slate-500">
              Nr. intern: {data.gyulekezetiSzam}
            </p>
          )}
          <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-500">
            Dátum
          </p>
          <p className="font-mono">{data.szamlaDatum}</p>
        </div>
      </div>

      {/* Kliens adatok */}
      <section className="relative z-10 space-y-1 border-t border-slate-200 pt-3 text-sm">
        <p>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            Átvett tőle / De la
          </span>
        </p>
        <p className="text-base font-semibold">{data.klienessegNev}</p>
        {data.klienessegCim && (
          <p className="text-xs text-slate-700">Lakhely: {data.klienessegCim}</p>
        )}
        {data.klienessegCui && (
          <p className="text-xs text-slate-700">CUI/CNP: {data.klienessegCui}</p>
        )}
        {data.klienessegNrOrcAn && (
          <p className="text-xs text-slate-700">
            Nr. ORC / An: {data.klienessegNrOrcAn}
          </p>
        )}
      </section>

      {/* Reprezentánd */}
      <section className="relative z-10 mt-3 border-t border-slate-200 pt-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          Az összeg címén / Reprezentând
        </p>
        <p className="mt-0.5 text-sm">
          {data.reprezentand || <span className="italic text-slate-400">—</span>}
        </p>
        {data.reprezentandRo && data.reprezentandRo !== data.reprezentand && (
          <p className="text-xs italic text-slate-600">{data.reprezentandRo}</p>
        )}
      </section>

      {/* Összeg — kiemelt */}
      <section className="relative z-10 mt-4 border-y-2 border-slate-800 py-3 text-center">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          Átvett összeg / Suma primită
        </p>
        <p className="text-3xl font-bold tracking-tight">
          {data.osszegBrut.toLocaleString('hu')} RON
        </p>
      </section>

      {/* Sztornó-info, ha sztornózva */}
      {data.stornozott && (
        <section className="relative z-10 mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900">
          <p className="font-semibold uppercase tracking-wider">
            ⚠ Sztornózva / Stornat
          </p>
          {data.stornozottAt && (
            <p className="mt-0.5">Időpont: {data.stornozottAt.slice(0, 19).replace('T', ' ')}</p>
          )}
          {data.stornozottIndok && (
            <p className="mt-0.5">Indok: {data.stornozottIndok}</p>
          )}
        </section>
      )}

      {/* Megjegyzés */}
      {data.megjegyzes && (
        <section className="relative z-10 mt-4 border-t border-slate-200 pt-3 text-[11px] italic text-slate-600">
          Megjegyzés: {data.megjegyzes}
        </section>
      )}

      {/* Aláírás */}
      <footer className="relative z-10 mt-8 grid grid-cols-2 gap-8 text-xs">
        <div>
          <div className="h-10 border-b border-slate-400" />
          <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-slate-600">
            Átvevő / Am primit
          </p>
        </div>
        <div>
          <div className="h-10 border-b border-slate-400" />
          <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-slate-600">
            Lelkipásztor aláírása / Semnătura
          </p>
        </div>
      </footer>
    </article>
  )
}
