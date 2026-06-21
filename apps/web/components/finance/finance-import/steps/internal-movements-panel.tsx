'use client'

/**
 * Belső mozgások (kassza ↔ bank) kereszt-ellenőrző panel (2026-06-20).
 *
 * A belső mozgás MINDKÉT főkönyvben szerepel: kiadás az egyikben, bevétel a másikban,
 * AZONOS összeggel (a pénz nem vész el, csak átkerül). Kötegelt importnál (Kassza + összes
 * bankszámla egyben) ezért teljesülnie kell: Σ KIMENŐ belső mozgás = Σ BEJÖVŐ belső mozgás.
 *
 * Ez a panel:
 *   1) LÁTHATÓVÁ teszi a belső mozgásokat (a Bevétel/Kiadás kártyák ezeket kihagyják),
 *   2) KERESZT-ELLENŐRZI a megmaradást (✓ kiegyenlített / ⚠ hiányzik egy fél),
 *   3) FIGYELMEZTET, ha egy sor belső mozgásnak tűnik, de nem annak lett felismerve.
 */

import { ArrowLeftRight, AlertTriangle, CheckCircle2, Info } from 'lucide-react'

import type { ClassifiedKasszaRow } from '@/app/(dashboard)/penzugy/finance-import-types'

function ron(n: number): string {
  return `${n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`
}

export function InternalMovementsPanel({
  transfersIn,
  transfersOut,
  suspected,
  balanced,
  diff,
  totalIn,
  totalOut,
  multiSource,
}: {
  transfersIn: ClassifiedKasszaRow[]
  transfersOut: ClassifiedKasszaRow[]
  /** Belső mozgásnak TŰNŐ, de bevétel/kiadásként osztályozott sorok (lemaradt jelzés). */
  suspected: ClassifiedKasszaRow[]
  /** Σ kimenő == Σ bejövő (kereszt-ellenőrzés). Csak több-forrású importnál mérvadó. */
  balanced: boolean
  diff: number
  totalIn: number
  totalOut: number
  /** Igaz, ha minden főkönyvet (Kassza + bankszámlák) egyszerre importálunk. */
  multiSource: boolean
}) {
  const hasMovements = transfersIn.length > 0 || transfersOut.length > 0
  if (!hasMovements && suspected.length === 0) return null

  return (
    <div className="rounded-[1.75rem] border border-sky-200 bg-sky-50/40 p-5">
      <div className="flex items-start gap-3">
        <ArrowLeftRight className="mt-0.5 size-5 shrink-0 text-sky-600" />
        <div className="flex-1">
          <p className="font-serif text-lg text-sky-900">
            Belső mozgások (kassza ↔ bank) — kereszt-ellenőrzés
          </p>

          {hasMovements && (
            <>
              <p className="mt-1 text-sm text-sky-800">
                A belső mozgás <strong>mindkét főkönyvben</strong> szerepel (kiadás az egyikben,
                bevétel a másikban, azonos összeggel) — a pénz nem vész el, csak átkerül.
              </p>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-3 ring-1 ring-sky-100">
                  <dt className="text-xs text-slate-500">⬇ Bejövő belső mozgás (összesen)</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-emerald-700">
                    {ron(totalIn)}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {transfersIn.length} tétel
                    </span>
                  </dd>
                </div>
                <div className="rounded-xl bg-white p-3 ring-1 ring-sky-100">
                  <dt className="text-xs text-slate-500">⬆ Kimenő belső mozgás (összesen)</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-rose-700">
                    {ron(totalOut)}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {transfersOut.length} tétel
                    </span>
                  </dd>
                </div>
              </dl>

              {multiSource ? (
                <div
                  className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-sm ${
                    balanced ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
                  }`}
                >
                  {balanced ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  )}
                  <span>
                    {balanced ? (
                      <>
                        <strong>Kiegyenlített</strong> — a kimenő és bejövő belső mozgások összege
                        megegyezik ({ron(totalOut)}). A pénz nem veszett el: minden átvezetés
                        mindkét főkönyvben megvan.
                      </>
                    ) : (
                      <>
                        <strong>Eltérés: {ron(diff)}</strong> a kimenő és bejövő belső mozgás között!
                        Valószínűleg <strong>hiányzik az egyik fél</strong> — nem rendelted hozzá az
                        összes bankszámla-lapot. Menj vissza, és rendeld hozzá mindet.
                      </>
                    )}
                  </span>
                </div>
              ) : (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-sky-100/70 p-3 text-sm text-sky-900">
                  <Info className="mt-0.5 size-4 shrink-0 text-sky-600" />
                  <span>
                    <strong>Ne feledd a párját is importálni!</strong> Most csak az egyik főkönyvet
                    olvastad be. A belső mozgás másik fele (bank ↔ kassza) a másik főkönyvben van —
                    ha azt nem importálod, a pénzmozgás fele hiányozni fog.
                  </span>
                </div>
              )}
            </>
          )}

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
