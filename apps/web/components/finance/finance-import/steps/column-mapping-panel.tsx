'use client'

/**
 * Oszlop-egyeztetés ELLENŐRZŐ panel (FÁZIS 2, 2026-06-19).
 *
 * Megmutatja, hogy az importáló a fájl MELYIK fejléc-oszlopát melyik cél-mezőhöz
 * rendelte (automatikus, fejléc-alapú felismerés). Ugyanazt a `detectKasszaColumns`
 * logikát használja, mint a tényleges beolvasás → amit itt látsz, az pontosan az,
 * amivel a rendszer dolgozik. Ha egy KÖTELEZŐ oszlopot nem ismert fel (pl. más
 * gyülekezet eltérő sablonja), feltűnő figyelmeztetés jelenik meg.
 */

import { CheckCircle2, AlertTriangle, Columns3 } from 'lucide-react'

import {
  detectKasszaColumns,
  KASSZA_FIELDS,
} from '../helpers/kassza-column-mapping'

export function ColumnMappingPanel({ headers }: { headers: string[] }) {
  if (!headers || headers.length === 0) return null
  const det = detectKasszaColumns(headers)
  const hasMissing = det.missingRequired.length > 0

  return (
    <div
      className={`rounded-2xl border p-4 md:p-5 ${
        hasMissing ? 'border-amber-300 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <Columns3 className={`mt-0.5 size-5 shrink-0 ${hasMissing ? 'text-amber-600' : 'text-emerald-600'}`} />
        <div className="flex-1">
          <h3 className="font-heading text-base text-slate-800">
            Oszlop-egyeztetés — automatikus felismerés
          </h3>
          <p className="mt-0.5 text-xs text-slate-600">
            A rendszer a fájl fejléceiből ismerte fel az oszlopokat. Ellenőrizd, hogy minden a
            helyére került — így más gyülekezet eltérő táblázatánál sem dolgozik rossz adatokkal.
          </p>
        </div>
      </div>

      {hasMissing && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-100/60 px-3 py-2 text-xs font-medium text-amber-900">
          ⚠️ Nem ismertünk fel {det.missingRequired.length} kötelező oszlopot. Ellenőrizd az
          Excel fejlécsorát (a hivatalos sablonban: Dátum, Iratszám, Név, Bev. - Összeg,
          Kiad. - Összeg, Költségvetési szám). Hibás fejléc esetén az import téves lehet.
        </p>
      )}

      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {KASSZA_FIELDS.map((field) => {
          const matched = det.mapping[field.key]
          const ok = !!matched
          return (
            <div
              key={field.key}
              className="flex items-center gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs ring-1 ring-slate-100"
            >
              {ok ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle
                  className={`size-3.5 shrink-0 ${field.required ? 'text-amber-600' : 'text-slate-400'}`}
                />
              )}
              <span className="font-medium text-slate-700">
                {field.label}
                {field.required && <span className="ml-0.5 text-rose-500">*</span>}
              </span>
              <span className="ml-auto truncate text-slate-500">
                {ok ? `„${matched}"` : field.required ? 'nincs felismerve!' : 'nincs (opcionális)'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
