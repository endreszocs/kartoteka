'use client'

/**
 * Belső mozgások (kassza ↔ bank) panel az importáló áttekintőjén (2026-06-20).
 *
 * A hivatalos könyvelésben a belső mozgás MINDKÉT főkönyvben szerepel: kiadás az
 * egyikben, bevétel a másikban, AZONOS összeggel (a pénz nem vész el, csak átkerül).
 *   - Kassza → Bank: a Kasszában KIADÁS (400.xx), a Bankban BEVÉTEL (301.xx)
 *   - Bank → Kassza: a Kasszában BEVÉTEL (300.xx), a Bankban KIADÁS (401.xx)
 *
 * Ez a panel (1) LÁTHATÓVÁ teszi a felismert belső mozgásokat (a Bevétel/Kiadás
 * kártyák ezeket kihagyják), és (2) FIGYELMEZTET, ha egy belső mozgásnak tűnő sor
 * mégsem lett annak felismerve (hiányzó/téves kód) — különben a pénz fele hiányozna.
 */

import { ArrowLeftRight, AlertTriangle, Info } from 'lucide-react'

import type { ClassifiedKasszaRow } from '@/app/(dashboard)/penzugy/finance-import-types'

function ron(n: number): string {
  return `${n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`
}
function sum(rows: ClassifiedKasszaRow[]): number {
  return rows.reduce((s, r) => s + (r.amount ?? 0), 0)
}

export function InternalMovementsPanel({
  transfersIn,
  transfersOut,
  suspected,
  isBankSource,
  counterpartHint,
}: {
  /** Bejövő belső mozgás (ebbe a főkönyvbe érkezett másik számláról). */
  transfersIn: ClassifiedKasszaRow[]
  /** Kimenő belső mozgás (ebből a főkönyvből távozott másik számlára). */
  transfersOut: ClassifiedKasszaRow[]
  /** Belső mozgásnak TŰNŐ, de bevétel/kiadásként osztályozott sorok (lemaradt jelzés). */
  suspected: ClassifiedKasszaRow[]
  isBankSource: boolean
  /** A párját adó másik főkönyv neve (pl. „Bank „A"" vagy „Kassza"), vagy null. */
  counterpartHint: string | null
}) {
  const hasMovements = transfersIn.length > 0 || transfersOut.length > 0
  if (!hasMovements && suspected.length === 0) return null

  const inLabel = isBankSource ? 'Beérkezett a számlára (pl. készpénzletét)' : 'Bank → Kassza (készpénzfelvét)'
  const outLabel = isBankSource ? 'Kiment a számláról (pl. készpénzfelvét)' : 'Kassza → Bank (készpénzletét)'

  return (
    <div className="rounded-[1.75rem] border border-sky-200 bg-sky-50/40 p-5">
      <div className="flex items-start gap-3">
        <ArrowLeftRight className="mt-0.5 size-5 shrink-0 text-sky-600" />
        <div className="flex-1">
          <p className="font-serif text-lg text-sky-900">Belső mozgások (kassza ↔ bank)</p>

          {hasMovements ? (
            <>
              <p className="mt-1 text-sm text-sky-800">
                Ezek a tételek <strong>mindkét főkönyvben</strong> szerepelnek (kiadás az egyikben,
                bevétel a másikban, azonos összeggel) — a pénz nem vész el, csak átkerül.
              </p>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-3 ring-1 ring-sky-100">
                  <dt className="text-xs text-slate-500">⬇ {inLabel}</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-emerald-700">
                    {ron(sum(transfersIn))}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {transfersIn.length} tétel
                    </span>
                  </dd>
                </div>
                <div className="rounded-xl bg-white p-3 ring-1 ring-sky-100">
                  <dt className="text-xs text-slate-500">⬆ {outLabel}</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-rose-700">
                    {ron(sum(transfersOut))}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {transfersOut.length} tétel
                    </span>
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-sky-100/70 p-3 text-sm text-sky-900">
                <Info className="mt-0.5 size-4 shrink-0 text-sky-600" />
                <span>
                  <strong>Ne feledd a párját is importálni!</strong> A belső mozgás másik fele
                  {counterpartHint ? (
                    <> a(z) <strong>{counterpartHint}</strong> lapon van</>
                  ) : (
                    <> a másik főkönyvben (bank ↔ kassza) van</>
                  )}
                  . Ha csak az egyik oldalt importálod, a pénzmozgás fele hiányozni fog a könyvelésből.
                </span>
              </div>
            </>
          ) : null}

          {suspected.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div className="flex-1 text-sm text-amber-900">
                  <p>
                    <strong>{suspected.length} sor belső mozgásnak tűnik, de NEM annak lett felismerve</strong>{' '}
                    (hiányzó vagy téves költségvetési kód). Ellenőrizd — különben tévesen sima
                    bevétel/kiadásként könyvelődik, és a pénzmozgás párja hiányozni fog!
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs">
                    {suspected.slice(0, 8).map((r, i) => (
                      <li key={i}>
                        {r.datum || '—'} · {typeof r.amount === 'number' ? ron(r.amount) : '—'} ·{' '}
                        {r.donorString || r.celNev || r.megjegyzes || '—'} · kód: {r.budgetCode || '(nincs)'}
                      </li>
                    ))}
                    {suspected.length > 8 && (
                      <li className="text-amber-700">… és további {suspected.length - 8} sor.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
