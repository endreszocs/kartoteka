import { LayoutDashboard } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AttekintesOldal } from '@/components/admin/attekintes/attekintes-oldal'
import { getAdminOverviewTiles } from './overview-actions'

/**
 * Admin Központ — áttekintő főoldal.
 *
 * 2026-08-12 ÚJRATERVEZÉS. A korábbi felület EGYETLEN, teljes egészében
 * `'use client'` komponens volt, ami betöltéskor `useEffect`-ből indított négy
 * szerver-akciót — a lelkész előbb csontvázat látott, és a 12 modul-kártya
 * egyikén sem volt egyetlen élő szám sem. A „Sürgős figyelmeztetések" doboz
 * ráadásul nem figyelmeztetett: ugyanazt a három KPI-t ismételte meg más
 * csomagolásban.
 *
 * MOST: SZERVER-KOMPONENS, ELŐRE betöltött adattal (SSR) — nincs csontváz-
 * villanás. Az adatot EGYETLEN köteg adja (`getAdminOverviewTiles`), ágankénti
 * hibaállapottal és 60 másodperces gyorsítótárral.
 *
 * Az auth-guard a `layout.tsx`-ben van.
 */
export default async function AdminPage() {
  const { data, error } = await getAdminOverviewTiles()

  if (!data) {
    // ⚠️ Nem üres oldal és nem nulla: KIMONDJUK, hogy nem tudjuk, mi a helyzet.
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="Admin Központ"
          description="Az áttekintés adatait most nem sikerült betölteni."
          icon={LayoutDashboard}
          eyebrow="Rendszerszint"
          hideBackLink
        />
        <p
          role="alert"
          className="card-raised p-4 text-sm leading-relaxed text-foreground sm:p-5"
          style={{ border: '2px solid var(--destructive)' }}
        >
          Az áttekintés nem tölthető be, ezért NEM tudjuk, van-e ma teendőd.{' '}
          {error || 'Ismeretlen hiba.'} Az egyes admin modulok a bal oldali menüből továbbra is
          elérhetők.
        </p>
      </div>
    )
  }

  return <AttekintesOldal adat={data} />
}
