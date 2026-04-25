'use client'

/**
 * Webes Pénzügy-dashboard wrapper.
 *
 * 2026-04-25 (Sprint Q Fázis 1): a vizuális réteg átkerült a `@kartoteka/ui-app`
 * shared package `FinanceDashboard` komponensébe, hogy a desktop is ugyanazt a
 * dashboard-look-ot használhassa. Itt csak a webes `TvaPlafonWidget`-et adjuk át
 * slot-prop-ként, hogy a TVA-plafon számítás (server action) a webes oldalon
 * fusson, az UI maga pedig megosztott.
 */

import { FinanceDashboard, type FinanceDashboardProps } from '@kartoteka/ui-app'
import { TvaPlafonWidget } from './tva-plafon-widget'

export function FinanceDashboard_Web(props: FinanceDashboardProps) {
  return <FinanceDashboard {...props} tvaPlafonSlot={<TvaPlafonWidget />} />
}

// Backward compatibility — a régi `import { FinanceDashboard }` a webben
// továbbra is működik, de már a wrapper-t (TVA widget-tel) adja vissza.
export { FinanceDashboard_Web as FinanceDashboard }
