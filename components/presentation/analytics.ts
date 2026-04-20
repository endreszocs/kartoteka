/**
 * Analytics helper — következtetések és előrejelzés a prezentációhoz.
 *
 * A lelkészi év-végi beszámolóhoz automatikus elemzés:
 *   1. Következtetések: előző évekkel összehasonlítva mi változott
 *   2. 1 éves előrejelzés: következő évre várt értékek
 *   3. 5 éves előrejelzés: hosszabb távú trend
 *
 * Algoritmus: egyszerű lineáris regresszió (least-squares).
 * Ez MVP — konfidencia-intervallumot nem számol, csak pont-becslést.
 */

import type { PresentationData } from '@/app/(dashboard)/eves-jelentes/prezentacio/actions'

export interface Insight {
  category: 'demographics' | 'anyakonyv' | 'finance' | 'programs'
  direction: 'up' | 'down' | 'stable'
  headline: string
  detail: string
  metricLabel: string
  metricValue: string
  changePercent?: number
}

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
}

// ──────────────────────────────────────────────────────────────
// Következtetések (év/év összehasonlítás)
// ──────────────────────────────────────────────────────────────

export function buildConclusions(data: PresentationData): Insight[] {
  const insights: Insight[] = []

  // Pénzügy: előző évhez képest
  const financeYears = [...data.finance.byYear].sort((a, b) => a.year - b.year)
  if (financeYears.length >= 2) {
    const curr = financeYears[financeYears.length - 1]
    const prev = financeYears[financeYears.length - 2]
    if (prev.income > 0) {
      const incomeChange = ((curr.income - prev.income) / prev.income) * 100
      insights.push({
        category: 'finance',
        direction: incomeChange > 2 ? 'up' : incomeChange < -2 ? 'down' : 'stable',
        headline: incomeChange > 2
          ? `Növekvő bevétel (+${incomeChange.toFixed(1)}%)`
          : incomeChange < -2
            ? `Csökkenő bevétel (${incomeChange.toFixed(1)}%)`
            : 'Stabil bevétel',
        detail: incomeChange > 2
          ? 'A tavalyi évhez képest a bevételek nőttek. Hálás szívvel jelzük, hogy a gyülekezet anyagi stabilitása erősödött.'
          : incomeChange < -2
            ? 'A bevételek csökkentek — érdemes a következő év tervezésénél ezt figyelembe venni.'
            : 'A bevételek közel változatlanok — az év előzetes tervei szerint alakultak.',
        metricLabel: 'Éves bevétel',
        metricValue: `${curr.income.toLocaleString('hu')} RON`,
        changePercent: incomeChange,
      })
    }

    if (prev.expense > 0) {
      const expenseChange = ((curr.expense - prev.expense) / prev.expense) * 100
      insights.push({
        category: 'finance',
        direction: expenseChange > 5 ? 'up' : expenseChange < -5 ? 'down' : 'stable',
        headline: expenseChange > 5
          ? `Növekvő kiadás (+${expenseChange.toFixed(1)}%)`
          : expenseChange < -5
            ? `Csökkenő kiadás (${expenseChange.toFixed(1)}%)`
            : 'Stabil kiadás',
        detail: expenseChange > 5
          ? 'A kiadások jelentősen nőttek — valószínűleg egyszeri nagyobb projekt (pl. épület-javítás) miatt.'
          : expenseChange < -5
            ? 'A kiadások csökkentek — megtakarítás mutatkozik, amit a következő évekre betarthatunk.'
            : 'A kiadások közel változatlanok maradtak.',
        metricLabel: 'Éves kiadás',
        metricValue: `${curr.expense.toLocaleString('hu')} RON`,
        changePercent: expenseChange,
      })
    }

    // Surplus
    const currSurplus = curr.income - curr.expense
    const prevSurplus = prev.income - prev.expense
    insights.push({
      category: 'finance',
      direction: currSurplus > 0 ? 'up' : currSurplus < 0 ? 'down' : 'stable',
      headline: currSurplus > 0 ? 'Pozitív év-egyenleg' : currSurplus < 0 ? 'Deficites év' : 'Nullás egyenleg',
      detail: currSurplus > 0
        ? `A gyülekezet ${currSurplus.toLocaleString('hu')} RON többletet ért el. ${prevSurplus > 0 ? 'Tavaly is pozitív egyenlege volt.' : 'Tavaly ellenben deficites volt.'}`
        : `A gyülekezet ${Math.abs(currSurplus).toLocaleString('hu')} RON deficittel zárta az évet. A tartalékok fedezték, de a következő évre érdemes odafigyelni.`,
      metricLabel: 'Év-egyenleg',
      metricValue: `${currSurplus >= 0 ? '+' : ''}${currSurplus.toLocaleString('hu')} RON`,
    })
  }

  // Anyakönyv: keresztelések vs. temetések
  const birthCount = data.anyakonyv.keresztelo
  const deathCount = data.anyakonyv.temetes
  const netChange = birthCount - deathCount
  insights.push({
    category: 'anyakonyv',
    direction: netChange > 0 ? 'up' : netChange < 0 ? 'down' : 'stable',
    headline: netChange > 0
      ? `Természetes növekedés (+${netChange})`
      : netChange < 0
        ? `Természetes csökkenés (${netChange})`
        : 'Egyensúlyi év',
    detail: netChange > 0
      ? `Az idei évben ${birthCount} keresztelő és ${deathCount} temetés volt — a gyülekezet természetes módon növekedett.`
      : netChange < 0
        ? `Az idei évben ${birthCount} keresztelő mellett ${deathCount} temetés volt — a gyülekezet szemé folytán csökkent.`
        : `A keresztelések és temetések száma egyensúlyban volt (${birthCount}–${deathCount}).`,
    metricLabel: 'Természetes változás',
    metricValue: `${netChange >= 0 ? '+' : ''}${netChange} fő`,
  })

  // Anyakönyvi trend az 5 év átlagához képest
  if (data.anyakonyv.byYear.length >= 3) {
    const avgBirths = data.anyakonyv.byYear.slice(0, -1).reduce((s, y) => s + y.keresztelo, 0) / (data.anyakonyv.byYear.length - 1)
    if (avgBirths > 0 && Math.abs(birthCount - avgBirths) > 1) {
      const birthTrend = ((birthCount - avgBirths) / avgBirths) * 100
      insights.push({
        category: 'anyakonyv',
        direction: birthTrend > 10 ? 'up' : birthTrend < -10 ? 'down' : 'stable',
        headline: birthTrend > 10
          ? 'Több keresztelés, mint az átlag'
          : birthTrend < -10
            ? 'Kevesebb keresztelés, mint az átlag'
            : 'Átlagos keresztelés-szám',
        detail: `Az előző évek átlaga ${avgBirths.toFixed(1)} keresztelés volt. Az idei ${birthCount} ${birthTrend > 0 ? 'magasabb' : 'alacsonyabb'} az átlagnál.`,
        metricLabel: 'Eltérés az átlagtól',
        metricValue: `${birthTrend >= 0 ? '+' : ''}${birthTrend.toFixed(1)}%`,
        changePercent: birthTrend,
      })
    }
  }

  // Egyházfenntartás
  const rate = data.finance.egyhazfenntartas.paymentRate
  insights.push({
    category: 'finance',
    direction: rate > 70 ? 'up' : rate < 40 ? 'down' : 'stable',
    headline: rate > 70
      ? `Erős egyházfenntartás (${Math.round(rate)}%)`
      : rate < 40
        ? `Alacsony teljesítés (${Math.round(rate)}%)`
        : `Közepes teljesítés (${Math.round(rate)}%)`,
    detail: rate > 70
      ? 'A tagok döntő része befizette az éves egyházfenntartást — ez a gyülekezet stabil gerince.'
      : rate < 40
        ? 'A befizetők aránya alacsony. A következő év tervezésénél érdemes a pásztori látogatásokra nagyobb hangsúlyt fektetni.'
        : 'A befizetések közepes szinten érkeztek — van tér a növekedésnek.',
    metricLabel: 'Fizetők aránya',
    metricValue: `${data.finance.egyhazfenntartas.paidMembers} / ${data.finance.egyhazfenntartas.activeMembers}`,
  })

  return insights
}

// ──────────────────────────────────────────────────────────────
// Lineáris regresszió — least-squares módszer
// ──────────────────────────────────────────────────────────────

function linearRegression(data: Array<{ x: number; y: number }>): { slope: number; intercept: number } {
  const n = data.length
  if (n < 2) return { slope: 0, intercept: data[0]?.y || 0 }
  const sumX = data.reduce((s, d) => s + d.x, 0)
  const sumY = data.reduce((s, d) => s + d.y, 0)
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0)
  const sumX2 = data.reduce((s, d) => s + d.x * d.x, 0)
  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) return { slope: 0, intercept: sumY / n }
  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

// ──────────────────────────────────────────────────────────────
// Előrejelzés — 1 év és 5 év
// ──────────────────────────────────────────────────────────────

export function buildForecast(data: PresentationData, yearsAhead: number = 5): ForecastSeries[] {
  const historical = [...data.finance.byYear].sort((a, b) => a.year - b.year)
  const lastYear = historical[historical.length - 1]?.year || data.year

  const series: ForecastSeries[] = []

  // Bevétel előrejelzés
  const incomeData = historical.map((h) => ({ x: h.year, y: h.income }))
  const { slope: iSlope, intercept: iIntercept } = linearRegression(incomeData)
  const incomePoints: ForecastPoint[] = [
    ...historical.map((h) => ({ year: h.year, predicted: h.income, type: 'actual' as const })),
  ]
  for (let i = 1; i <= yearsAhead; i++) {
    const y = lastYear + i
    const predicted = Math.max(0, iSlope * y + iIntercept)
    incomePoints.push({ year: y, predicted: Math.round(predicted), type: 'forecast' })
  }
  const iLastActual = historical[historical.length - 1]?.income || 0
  const iLastForecast = incomePoints[incomePoints.length - 1].predicted
  const iChangePct = iLastActual > 0 ? ((iLastForecast - iLastActual) / iLastActual) * 100 : 0
  series.push({
    label: 'Bevétel',
    color: '#10b981',
    data: incomePoints,
    summary: iChangePct > 5
      ? `A jelenlegi trend alapján ${yearsAhead} év múlva a bevétel ~${iChangePct.toFixed(0)}%-kal lehet magasabb.`
      : iChangePct < -5
        ? `A jelenlegi trend alapján ${yearsAhead} év múlva a bevétel ~${Math.abs(iChangePct).toFixed(0)}%-kal lehet alacsonyabb — érdemes új bevételi forrásokon gondolkodni.`
        : `A bevétel ${yearsAhead} évre előre közel stabil (±5%).`,
  })

  // Kiadás előrejelzés
  const expenseData = historical.map((h) => ({ x: h.year, y: h.expense }))
  const { slope: eSlope, intercept: eIntercept } = linearRegression(expenseData)
  const expensePoints: ForecastPoint[] = [
    ...historical.map((h) => ({ year: h.year, predicted: h.expense, type: 'actual' as const })),
  ]
  for (let i = 1; i <= yearsAhead; i++) {
    const y = lastYear + i
    const predicted = Math.max(0, eSlope * y + eIntercept)
    expensePoints.push({ year: y, predicted: Math.round(predicted), type: 'forecast' })
  }
  const eLastActual = historical[historical.length - 1]?.expense || 0
  const eLastForecast = expensePoints[expensePoints.length - 1].predicted
  const eChangePct = eLastActual > 0 ? ((eLastForecast - eLastActual) / eLastActual) * 100 : 0
  series.push({
    label: 'Kiadás',
    color: '#ef4444',
    data: expensePoints,
    summary: eChangePct > 5
      ? `A kiadások ${yearsAhead} év múlva ~${eChangePct.toFixed(0)}%-kal lehetnek magasabbak — érdemes visszafogott tervezés.`
      : eChangePct < -5
        ? `A kiadások csökkenő trendje azt ígéri, hogy ${yearsAhead} év múlva ~${Math.abs(eChangePct).toFixed(0)}%-kal lehetnek alacsonyabbak.`
        : `A kiadások ${yearsAhead} évre előre közel stabil (±5%).`,
  })

  return series
}
