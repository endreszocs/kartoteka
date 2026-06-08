'use client'

/**
 * Cél-metrikák katalógusa — a „jövőbeli célok" számszerű célértékeihez tartozó
 * tényadat automatikus kiszámítása a PresentationData-ból (cél vs. tény).
 */

import type { PresentationData } from '@/app/(dashboard)/eves-jelentes/prezentacio/actions'

export interface GoalMetric {
  key: string
  pillar: 1 | 2 | 3
  label: string
  unit: string
  actual: (d: PresentationData) => number
}

export const GOAL_METRICS: GoalMetric[] = [
  { key: 'lelekszam', pillar: 1, label: 'Lélekszám', unit: 'fő', actual: (d) => d.members.totalActive },
  { key: 'csaladszam', pillar: 1, label: 'Családok', unit: '', actual: (d) => d.members.families },
  { key: 'keresztelo', pillar: 1, label: 'Keresztelések', unit: '', actual: (d) => d.anyakonyv.keresztelo },
  { key: 'latogatottsag', pillar: 2, label: 'Átlagos istentiszteleti jelenlét', unit: 'fő', actual: (d) => d.attendance.worshipAvg },
  { key: 'alkalmak', pillar: 2, label: 'Istentiszteleti alkalmak', unit: '', actual: (d) => d.attendance.worshipOccasions },
  { key: 'bevetel', pillar: 3, label: 'Éves bevétel', unit: 'RON', actual: (d) => d.finance.totalIncome },
  { key: 'adomany_arany', pillar: 3, label: 'Adományok aránya', unit: '%', actual: (d) => Math.round(d.finance.donationRatio) },
  { key: 'egyhazfenntartas', pillar: 3, label: 'Egyházfenntartás teljesítés', unit: '%', actual: (d) => Math.round(d.finance.egyhazfenntartas.paymentRate) },
]

export function metricByKey(key: string | null | undefined): GoalMetric | undefined {
  if (!key) return undefined
  return GOAL_METRICS.find((m) => m.key === key)
}

export function metricsForPillar(pillar: number): GoalMetric[] {
  return GOAL_METRICS.filter((m) => m.pillar === pillar)
}

export function formatGoalValue(n: number, unit: string): string {
  const num = unit === 'RON' ? n.toLocaleString('hu', { maximumFractionDigits: 0 }) : String(n)
  return unit ? `${num} ${unit}` : num
}
