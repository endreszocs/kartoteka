import { redirect } from 'next/navigation'

import { ModuleHero } from '@/components/shared/module-hero'
import { CacheOverview } from '@/components/offline/cache-overview'
import { DeveloperDownloadsCard } from '@/components/offline/developer-downloads-card'
import { ExcelExportPanelClient } from '@/components/offline/excel-export-panel-client'
import { ExcelImportLinkCard } from '@/components/offline/excel-import-link-card'
import { FullBackupPanelClient } from '@/components/offline/full-backup-panel-client'
import { MutationQueuePanel } from '@/components/offline/mutation-queue-panel'
import { OfflineDashboardStats } from '@/components/offline/offline-dashboard-stats'
import { OfflineHelpCard } from '@/components/offline/offline-help-card'
import { LicenseStatusCard } from '@/components/standalone/license-status-card'
import { MonthlySyncPanel } from '@/components/standalone/monthly-sync-panel'
import { isStandaloneMode } from '@/lib/standalone/runtime-detect'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * Congregation nev → slug (fájlrendszer-biztonságos).
 * Pl. "Kolozsvári Belvárosi Református Egyházközség" → "kolozsvari-belvarosi-reformatus-egyhazkozseg"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/[óöő]/g, 'o')
    .replace(/[úüű]/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export default async function OfflineDiagnosticsPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')

  const congregationSlug = slugify(
    access.congregationName || access.effectiveCongregationId || 'ismeretlen',
  )

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Offline mentés"
        title="Offline cache és szinkronizáció"
        description="A helyi adatmentés, a feltöltésre váró változtatások és az Excel export egy helyen. A rendszer folyamatosan szinkronizálja az adatokat a Supabase-zel és egy általad választott mappába."
        pills={[
          { label: 'Fázis 1 ✅', tone: 'emerald' },
          { label: 'Fázis 2 ✅', tone: 'violet' },
          { label: 'Fázis 3 ✅', tone: 'sky' },
          { label: 'Fázis 4 ✅', tone: 'amber' },
          { label: 'Fázis 5 ✅', tone: 'teal' },
          { label: 'Fázis 6 ✅', tone: 'red' },
        ]}
      />

      {/* KPI dashboard — 4 kártya: online / cache / pending / konfliktus */}
      <OfflineDashboardStats />

      {/* Fázis 7 — Licensz állapot (csak standalone módban látszik) */}
      <LicenseStatusCard />

      {/* Fázis 7d — Havi szinkronizáció panel (csak standalone módban) */}
      {isStandaloneMode() && <MonthlySyncPanel />}

      {/* 2 oszlopos fő szekciók lg+ méretben, egymás alatt kisebb képernyőn */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Fázis 3 — Excel export (ssr:false, browser-only) */}
        <ExcelExportPanelClient
          congregationId={access.effectiveCongregationId}
          congregationSlug={congregationSlug}
          exportedBy={access.fullName || 'Ismeretlen'}
        />

        {/* Fázis 2 — pending mutations + conflicts */}
        <MutationQueuePanel />
      </div>

      {/* Fázis 4 — Excel import review oldalra link */}
      <ExcelImportLinkCard />

      {/* Fázis 6 — Teljes ZIP backup */}
      <FullBackupPanelClient
        congregationId={access.effectiveCongregationId}
        congregationSlug={congregationSlug}
        congregationName={access.congregationName}
        exportedBy={access.fullName || 'Ismeretlen'}
      />

      {/* Fázis 1 — cache áttekintés (teljes szélesség) */}
      <CacheOverview />

      {/* Fejlesztői letöltések — csak rendszergazdai / egyházkerületi admin látja */}
      <DeveloperDownloadsCard show={!!access.admin || !!access.master || !!access.egyhazkeruletiAdmin} />

      {/* Összecsukható súgó kártya */}
      <OfflineHelpCard />
    </div>
  )
}
