/**
 * Analytics helper — előrejelzés a prezentációhoz.
 *
 * Algoritmus: egyszerű lineáris regresszió (least-squares).
 * Ez MVP — konfidencia-intervallumot nem számol, csak pont-becslést.
 *
 * 2026-08-10: a `buildConclusions()` INNEN ELKÖLTÖZÖTT — a hard-kódolt, 8 fix
 * megállapítást gyártó függvény helyére a kategóriánkénti, rövid/hosszú távú
 * következtetés-motor lépett: `lib/annual-report/conclusions.ts`. Ott javítva
 * a korábbi magyartalan mondatok is („a gyülekezet szemé folytán csökkent",
 * „Tavaly ellenben deficites volt.").
 */

import type { PresentationData } from '@/app/(dashboard)/eves-jelentes/prezentacio/actions'
import { linearRegression } from '@/lib/annual-report/conclusions'

export interface ForecastPoint {
  year: number
  predicted: number
  type: 'actual' | 'forecast'
}

export interface ForecastSeries {
  label: string
  color: string
  data: ForecastPoint[]
  summary: string
  /** Hamis, ha kevés a mért év — ilyenkor NEM rajzolunk trendet. */
  reliable: boolean
}

/** Legalább ennyi nem-nulla év kell egy értelmezhető trendhez. */
const MIN_YEARS_FOR_FORECAST = 3

// ──────────────────────────────────────────────────────────────
// Előrejelzés — a pénzügyi idősorból
// ──────────────────────────────────────────────────────────────

export function buildForecast(data: PresentationData, yearsAhead: number = 5): ForecastSeries[] {
  const historical = [...data.finance.byYear].sort((a, b) => a.year - b.year)
  const lastYear = historical[historical.length - 1]?.year || data.year

  function seriesFor(
    label: string,
    color: string,
    pick: (h: { year: number; income: number; expense: number }) => number,
    copy: { up: (pct: string) => string; down: (pct: string) => string; flat: string },
  ): ForecastSeries {
    const points: ForecastPoint[] = historical.map((h) => ({ year: h.year, predicted: pick(h), type: 'actual' as const }))
    // 2026-08-10 (P2 JAVÍTÁS): a regresszió eddig a rendszer bevezetése ELŐTTI,
    // nulla éveket is beszámította — egy 4 nullás + 1 mért évből ~125%-os
    // növekedést vetített a presbitérium elé. Most csak a tényleges (nem nulla)
    // évek számítanak, és 3 alatt egyáltalán nincs előrejelzés.
    const measured = historical.filter((h) => pick(h) !== 0)
    if (measured.length < MIN_YEARS_FOR_FORECAST) {
      return {
        label,
        color,
        data: points,
        reliable: false,
        summary: `Előrejelzéshez legalább ${MIN_YEARS_FOR_FORECAST} év könyvelt adata szükséges — jelenleg ${measured.length} ilyen év van. A meglévő évek tényadatként szerepelnek a diagramon.`,
      }
    }
    const { slope, intercept } = linearRegression(measured.map((h) => ({ x: h.year, y: pick(h) })))
    for (let i = 1; i <= yearsAhead; i++) {
      const y = lastYear + i
      points.push({ year: y, predicted: Math.round(Math.max(0, slope * y + intercept)), type: 'forecast' })
    }
    const lastActual = pick(historical[historical.length - 1] ?? { year: lastYear, income: 0, expense: 0 })
    const lastForecast = points[points.length - 1].predicted
    const changePct = lastActual > 0 ? ((lastForecast - lastActual) / lastActual) * 100 : 0
    return {
      label,
      color,
      data: points,
      reliable: true,
      summary: changePct > 5 ? copy.up(changePct.toFixed(0)) : changePct < -5 ? copy.down(Math.abs(changePct).toFixed(0)) : copy.flat,
    }
  }

  return [
    seriesFor('Bevétel', '#10b981', (h) => h.income, {
      up: (p) => `A jelenlegi trend alapján ${yearsAhead} év múlva a bevétel mintegy ${p}%-kal lehet magasabb.`,
      down: (p) => `A jelenlegi trend alapján ${yearsAhead} év múlva a bevétel mintegy ${p}%-kal lehet alacsonyabb — érdemes új bevételi forrásokon gondolkodni.`,
      flat: `A bevétel ${yearsAhead} évre előre közel változatlan (±5%).`,
    }),
    seriesFor('Kiadás', '#ef4444', (h) => h.expense, {
      up: (p) => `A kiadások ${yearsAhead} év múlva mintegy ${p}%-kal lehetnek magasabbak — érdemes visszafogottan tervezni.`,
      down: (p) => `A kiadások csökkenő trendje alapján ${yearsAhead} év múlva mintegy ${p}%-kal lehetnek alacsonyabbak.`,
      flat: `A kiadások ${yearsAhead} évre előre közel változatlanok (±5%).`,
    }),
  ]
}
