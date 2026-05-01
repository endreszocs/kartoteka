import { AdminOverviewDashboard } from '@/components/admin/admin-overview-dashboard'

/**
 * Admin Központ — áttekintő főoldal (Sprint U.4, 2026-05-02).
 *
 * Az auth-guard és a gradient header a `layout.tsx`-ben van.
 * Itt csak a tartalom: KPI kártyák, modul-rács, statisztikák.
 *
 * A korábbi 13-fülű AdminTabsV3 helyett minden szakasz önálló /admin/<slug>
 * oldal a sidebar almenüből.
 */
export default function AdminPage() {
  return <AdminOverviewDashboard />
}
