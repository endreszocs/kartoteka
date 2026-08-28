'use client'

/**
 * PÁROSÍTATLAN BELSŐ MOZGÁS — figyelmeztető sáv (2026-08-27).
 *
 * Miért külön komponens: a jelzés korábban a `finance-tabs.tsx`-ben, inline élt,
 * ezért CSAK bejelentkezve, éles adaton lehetett megnézni. A `/dev-proba`
 * próbapad mock adattal rendereli, így a látvány (világos/sötét, telefon)
 * auth nélkül is ellenőrizhető — és a jövőben nem kell találgatni, hogyan néz ki.
 *
 * A KÉT ESET KÜLÖNBÖZŐ ÜZENETET KAP:
 *   - „várakozó”: a másik oldal még nincs importálva → magától megoldódik;
 *   - „árva”:     nincs párosító kulcsa (pl. banki importból sima bevételként
 *                 jött be) → NEM oldódik meg magától, emberi döntés kell.
 * A régi szöveg mindkettőre azt ígérte, hogy „magától eltűnik” — az árvákra
 * nézve ez félrevezető volt.
 */

import { AlertTriangle } from 'lucide-react'
import type { InternalMovementHealth } from '@/lib/finance/internal-movement-health'

export function InternalMovementWarning({ health }: { health: InternalMovementHealth }) {
  if (health.unpairedCount <= 0) return null

  // 2026-08-27 (próbapadon derült ki): ha MINDEN tétel árva, akkor az általános
  // „a párja automatikusan létrejön, és ez a jelzés magától eltűnik" mondat
  // ELLENTMOND a két sorral lejjebb álló „ezek nem rendeződnek maguktól"-nak.
  // Ilyenkor a várakozó-szöveget el kell hagyni, különben a lelkész arra vár,
  // ami sosem fog megtörténni.
  const vanVarakozo = health.unpairedCount > health.orphanCount

  return (
    <div className="card-raised mb-4 border border-red-200 bg-red-50/80 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500 text-white shadow-sm">
          <AlertTriangle className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-red-700">
              Párosítatlan belső mozgás ({health.unpairedCount})
            </h3>
            {vanVarakozo ? (
              <p className="text-sm text-red-600/90">
                Olyan kassza ↔ bank (vagy bank ↔ bank) mozgás van, aminek csak az egyik
                oldala szerepel. A párja a banki kivonat importja és egyeztetése után
                automatikusan létrejön, és ez a jelzés magától eltűnik.
              </p>
            ) : (
              <p className="text-sm text-red-600/90">
                Olyan kassza ↔ bank (vagy bank ↔ bank) mozgás van, aminek csak az egyik
                oldala szerepel — a pénz átvezetése egyik saját helyről a másikra.
              </p>
            )}
            {health.orphanCount > 0 && (
              <p className="mt-2 rounded-xl bg-red-100/70 px-3 py-2 text-sm font-medium text-red-800">
                Ebből <strong>{health.orphanCount} tétel</strong> belső mozgás kategóriában
                áll, de <strong>nem a belső mozgás rögzítőn keresztül</strong> készült —
                tipikusan banki importból. Ezek <strong>nem rendeződnek maguktól</strong>:
                amíg pár nélkül állnak, a rendszer új bevételnek látja őket, pedig csak a
                saját pénz átvezetése egyik helyről a másikra. Ellenőrizd őket.
              </p>
            )}
          </div>
          <div className="space-y-1">
            {health.items.slice(0, 5).map((m, i) => (
              <p key={`${m.datum}-${m.osszeg}-${i}`} className="text-xs text-slate-700">
                <strong>{m.datum}</strong> · {m.osszeg.toLocaleString('hu-HU')} RON —{' '}
                {m.orphan ? (
                  <span className="font-medium text-red-700">
                    {m.side === 'expense'
                      ? 'belső mozgás kategória, pár és párosító kulcs nélkül — ellenőrizendő'
                      : 'belső mozgás kategóriába importálva, pár nélkül — felfújja a bevételt'}
                  </span>
                ) : m.side === 'expense' ? (
                  'kiadás-oldal rögzítve, a fogadó (banki) oldal hiányzik'
                ) : (
                  'befizetés-oldal rögzítve, a küldő oldal hiányzik'
                )}
              </p>
            ))}
            {health.items.length > 5 && (
              <p className="text-xs text-slate-500">
                … és további {health.items.length - 5} tétel.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
