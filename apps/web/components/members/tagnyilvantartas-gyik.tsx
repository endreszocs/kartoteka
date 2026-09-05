'use client'

import { HelpCircle } from 'lucide-react'

import {
  GYIK_ALLAPOT_FELIRAT,
  GYIK_CSOPORTOK,
  GYIK_TETELEK,
  type GyikAllapot,
} from './tagnyilvantartas-gyik-adatok'

/**
 * Gyakori kérdések rovat a Tagnyilvántartás súgójában (2026-09-05).
 *
 * A tartalom a `tagnyilvantartas-gyik-adatok.ts`-ben él: az átvilágítás 38
 * kérdésére adott lelkészi válasz, a SZABÁLY formájában. Az állapot-jelölés
 * őszintén mondja meg, hogy a szoftver ma követi-e a szabályt — a súgó nem
 * ígérhet olyat, amit a rendszer még nem tesz.
 */

const ALLAPOT_STILUS: Record<GyikAllapot, string> = {
  kesz: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  reszben: 'bg-amber-50 text-amber-800 ring-amber-200',
  fejlesztes: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function AllapotJelzes({ allapot }: { allapot: GyikAllapot }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${ALLAPOT_STILUS[allapot]}`}
    >
      {GYIK_ALLAPOT_FELIRAT[allapot]}
    </span>
  )
}

export function GyikContent() {
  const darab = {
    kesz: GYIK_TETELEK.filter((t) => t.allapot === 'kesz').length,
    reszben: GYIK_TETELEK.filter((t) => t.allapot === 'reszben').length,
    fejlesztes: GYIK_TETELEK.filter((t) => t.allapot === 'fejlesztes').length,
  }

  return (
    <>
      <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
        <p className="flex items-start gap-2 text-sm text-slate-700">
          <HelpCircle className="mt-0.5 size-4 shrink-0 text-teal-700" />
          <span>
            Ezek a tagnyilvántartás és az anyakönyv <strong>egyházi szabályai</strong>, ahogy a
            2026. szeptemberi átvilágítás 38 kérdésére a lelkipásztor válaszolt. Minden válasz a
            helyes eljárást írja le. A jelölés megmondja, hogy a rendszer ma követi-e:
          </span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <AllapotJelzes allapot="kesz" /> a rendszer így működik ({darab.kesz})
          </span>
          <span className="flex items-center gap-1.5">
            <AllapotJelzes allapot="reszben" /> részben, a megjegyzés mondja meg, mi hiányzik ({darab.reszben})
          </span>
          <span className="flex items-center gap-1.5">
            <AllapotJelzes allapot="fejlesztes" /> a szabály eldőlt, a rendszer igazítása folyamatban ({darab.fejlesztes})
          </span>
        </div>
      </div>

      {GYIK_CSOPORTOK.map((csoport) => {
        const tetelek = GYIK_TETELEK.filter((t) => t.csoport === csoport.id)
        return (
          <section key={csoport.id} aria-labelledby={`gyik-${csoport.id}`}>
            <h4
              id={`gyik-${csoport.id}`}
              className="mt-6 font-heading text-base font-semibold text-slate-800 first:mt-0"
            >
              {csoport.cim}
            </h4>
            <p className="mt-1 text-xs text-slate-500">{csoport.bevezeto}</p>
            <div className="mt-2 space-y-2">
              {tetelek.map((t) => (
                <details
                  key={t.sorszam}
                  id={`gyik-${t.sorszam}`}
                  className="group rounded-xl border border-slate-200 bg-white p-3"
                >
                  <summary className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                    <span className="mt-0.5 w-6 shrink-0 font-mono text-xs font-normal text-slate-400 tabular-nums">
                      {t.sorszam}.
                    </span>
                    <span className="min-w-0 flex-1">{t.kerdes}</span>
                    <AllapotJelzes allapot={t.allapot} />
                  </summary>
                  <div className="mt-2 space-y-2 pl-9">
                    <p className="text-sm leading-relaxed text-slate-700">{t.valasz}</p>
                    {t.megjegyzes ? (
                      <p className="text-xs leading-relaxed text-slate-500">
                        <span className="font-medium text-slate-600">Ma: </span>
                        {t.megjegyzes}
                      </p>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}
