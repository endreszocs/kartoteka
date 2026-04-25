import { AlertCircle } from 'lucide-react'

import {
  computeChitantaTombStatus,
  type ChitantaTombRow,
} from '@kartoteka/validations'

/**
 * ActiveChitantaTombPanel — a `rows`-ból deriválva az aktív nyugtatömb státusza.
 *
 * A-M7.2a (2026-04-22): bevezetve a chitanta-tombok-page-en, inline function-ként.
 * A-M7.2c (2026-04-23): extrahálva külön fájlba, hogy a chitanta-kiállítás oldal
 * (a /penzugy/chitanta route) is használhassa ugyanezt a kijelzést.
 *
 * Négy UI-állapot (pasztorálisan, a feedback_lelkesz_informalas.md alapelv szerint):
 *   - 🟢 Rendben (>5 marad)     — "Következő szám: X · Maradék: Y db"
 *   - 🟡 Kevés (≤5 marad)        — "…  ⚠ hamarosan elfogy"
 *   - 🔴 Elfogyott (0 maradék)   — "Elfogyott — új tömböt kell megnyitni"
 *   - 🔴 Nincs aktív tömb         — info-panel: "Új tömb rögzítése szükséges"
 */
export function ActiveChitantaTombPanel({ rows }: { rows: ChitantaTombRow[] }) {
  const active = [...rows]
    .filter((r) => r.aktiv)
    .sort((a, b) => a.szam_kezdet - b.szam_kezdet)[0]

  if (!active) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Nincs aktív nyugtatömb.</p>
            <p className="mt-1 text-red-800">
              A bizonylat-kiállítás csak akkor lehetséges, ha van legalább egy
              aktív tömb. Kattints az „Új tömb" gombra a nyugtatömbök oldalon,
              vagy ellenőrizd a meglévő tömbök aktív státuszát.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const status = computeChitantaTombStatus(active)
  const exhausted = status.maradek === 0
  const low = !exhausted && status.maradek <= 5

  const toneClasses = exhausted
    ? 'border-red-200 bg-red-50 text-red-900'
    : low
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-emerald-200 bg-emerald-50/80 text-emerald-900'

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${toneClasses}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
            Aktív tömb — {active.seria}
            {active.block_nr ? ` (${active.block_nr})` : ''}
          </p>
          {exhausted ? (
            <p className="mt-1 font-semibold">
              Elfogyott — új tömböt kell megnyitni, mielőtt bizonylatot állíthatnál ki.
            </p>
          ) : (
            <p className="mt-1">
              Következő szám:{' '}
              <span className="font-mono text-base font-semibold">
                {status.kovetkezo_szam}
              </span>
              {' · '}
              Maradék: <span className="font-semibold">{status.maradek} db</span>
              {low && <span className="ml-2 font-semibold">⚠ hamarosan elfogy</span>}
            </p>
          )}
        </div>
        <div className="text-[11px] opacity-80">
          {status.felhasznalt_darabszam} / {status.darabszam_ossz} kiállítva
        </div>
      </div>
    </div>
  )
}
