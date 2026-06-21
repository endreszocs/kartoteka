'use client'

/**
 * Egyenleg-összegző + hitelesítő kártya az importáló áttekintőjén (2026-06-20).
 *
 * Megmutatja a lap tetejéről kiolvasott NYITÓ („Előző évi") és ÉV VÉGI („Egyenleg:")
 * egyenleget, és levezeti: nyitó + bevétel − kiadás = SZÁMÍTOTT záró. Ezt összeveti a
 * hivatalos (xlsx) záró egyenleggel — ha egyezik, a könyvelés hiteles (✓); ha eltér,
 * figyelmeztet (a fájl belső ellentmondása vagy hiányzó/téves nyitó).
 */

import { CheckCircle2, AlertTriangle, Scale } from 'lucide-react'

function ron(n: number): string {
  return `${n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`
}

export function BalanceSummaryCard({
  opening,
  closing,
  incoming,
  outgoing,
  title,
}: {
  /** Nyitó (előző évi) egyenleg az xlsx-ből, vagy null ha nincs. */
  opening: number | null
  /** Év végi (záró) egyenleg az xlsx-ből, vagy null ha nincs. */
  closing: number | null
  /** Összes bevétel (befizetés + bejövő átvezetés). */
  incoming: number
  /** Összes kiadás (kiadás + kimenő átvezetés). */
  outgoing: number
  title?: string
}) {
  if (opening == null && closing == null) return null

  const calc = Math.round(((opening ?? 0) + incoming - outgoing) * 100) / 100
  const diff = closing != null ? Math.round((calc - closing) * 100) / 100 : null
  const ok = diff != null && Math.abs(diff) < 0.01
  const hasOpening = opening != null

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <Scale className="mt-0.5 size-5 shrink-0 text-slate-500" />
        <div className="flex-1">
          <p className="font-serif text-lg text-slate-800">{title || 'Egyenleg-levezetés'}</p>

          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-600">
                Nyitó egyenleg <span className="text-xs text-slate-400">(előző évi maradvány)</span>
              </dt>
              <dd className={`font-mono font-semibold ${hasOpening ? 'text-slate-800' : 'text-amber-600'}`}>
                {hasOpening ? ron(opening as number) : 'nincs az xlsx-ben'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-emerald-700">+ Összes bevétel <span className="text-xs text-emerald-500">(átvezetéssel)</span></dt>
              <dd className="font-mono text-emerald-700">{ron(incoming)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-rose-700">− Összes kiadás <span className="text-xs text-rose-400">(átvezetéssel)</span></dt>
              <dd className="font-mono text-rose-700">{ron(outgoing)}</dd>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5">
              <dt className="font-medium text-slate-700">= Számított év végi egyenleg</dt>
              <dd className="font-mono font-bold text-slate-900">{ron(calc)}</dd>
            </div>
            {closing != null && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-600">Hivatalos (xlsx) év végi egyenleg</dt>
                <dd className="font-mono font-semibold text-slate-800">{ron(closing)}</dd>
              </div>
            )}
          </dl>

          {closing != null && (
            <div
              className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-sm ${
                ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
              }`}
            >
              {ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              )}
              <span>
                {ok ? (
                  <>A levezetett egyenleg <strong>pontosan egyezik</strong> a hivatalos záró egyenleggel — a könyvelés hiteles.</>
                ) : (
                  <>
                    Eltérés: <strong>{ron(diff as number)}</strong> a számított és a hivatalos záró között.
                    {!hasOpening && ' Hiányzik a nyitó (előző évi) egyenleg — enélkül az év végi egyenleg nem hiteles.'}
                    {hasOpening && ' Ellenőrizd a fájlt (lehet kihagyott/téves sor).'}
                  </>
                )}
              </span>
            </div>
          )}

          {closing == null && hasOpening && (
            <p className="mt-2 text-xs text-slate-500">
              A fájl tetején nincs külön záró egyenleg érték — csak a számított érték látható.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
