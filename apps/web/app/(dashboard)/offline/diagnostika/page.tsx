import { redirect } from 'next/navigation'

import { CacheOverview } from '@/components/offline/cache-overview'
import { DeveloperDownloadsCard } from '@/components/offline/developer-downloads-card'
import { ExcelExportPanelClient } from '@/components/offline/excel-export-panel-client'
import { ExcelImportLinkCard } from '@/components/offline/excel-import-link-card'
import { FullBackupPanelClient } from '@/components/offline/full-backup-panel-client'
import { MutationQueuePanel } from '@/components/offline/mutation-queue-panel'
import { ModuleHero } from '@/components/shared/module-hero'
import { OfflineDashboardStats } from '@/components/offline/offline-dashboard-stats'
import { OfflineHelpCard } from '@/components/offline/offline-help-card'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * Congregation nev → slug (fájlrendszer-biztonságos).
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

/**
 * Offline diagnosztika (fejlesztői / admin nézet).
 *
 * A korábbi `/offline` oldal tartalma — a webes PWA Dexie-alapú offline
 * rétegének 6-fázisos diagnosztikai eszközei. A napi lelkészi munkához
 * nem közvetlenül szükséges; a `/offline` fő oldal pasztorálisan egyszerűbb,
 * és a desktop letöltést helyezi középpontba.
 *
 * Hozzáférés: admin / egyházmegyei admin / master. Lelkész redirect a /offline-ra.
 */
export default async function OfflineDiagnostikaPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')

  const isAdmin = !!access.admin || !!access.master || !!access.egyhazkeruletiAdmin
  if (!isAdmin) redirect('/offline')

  const congregationSlug = slugify(
    access.congregationName || access.effectiveCongregationId || 'ismeretlen',
  )

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Offline diagnosztika"
        title="Webes offline réteg — fejlesztői eszközök"
        description="A böngésző-oldali Dexie cache, a pending mutations queue és a teljes backup / Excel export eszközei. Csak admin-szintű felhasználók számára."
        pills={[
          { label: 'Cache', tone: 'sky' },
          { label: 'Queue', tone: 'violet' },
          { label: 'Export', tone: 'amber' },
          { label: 'Backup', tone: 'teal' },
        ]}
      />

      <OfflineDashboardStats />

      <div className="grid gap-5 lg:grid-cols-2">
        <ExcelExportPanelClient
          congregationId={access.effectiveCongregationId}
          congregationSlug={congregationSlug}
          exportedBy={access.fullName || 'Ismeretlen'}
        />
        <MutationQueuePanel />
      </div>

      <ExcelImportLinkCard />

      <FullBackupPanelClient
        congregationId={access.effectiveCongregationId}
        congregationSlug={congregationSlug}
        congregationName={access.congregationName}
        exportedBy={access.fullName || 'Ismeretlen'}
      />

      <CacheOverview />

      <DeveloperDownloadsCard show={isAdmin} />

      <OfflineHelpCard />
    </div>
  )
}
