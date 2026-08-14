import { redirect } from 'next/navigation'

import { ModuleHero } from '@/components/shared/module-hero'
import { RecycleBinViewClient } from '@/components/shared/recycle-bin-client'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  TABLE_REGISTRY,
  MODULE_META,
  type TableRegistryEntry,
} from '@/lib/offline/table-registry'

/**
 * Globális Kuka oldal — az összes modul törölt rekordjai egy helyen.
 *
 * A RecycleBinView componens reaktívan figyeli a Dexie-t (useLiveQuery),
 * így a sync-orchestrator által hozott server-side soft-delete-ek azonnal
 * megjelennek.
 */
export default async function KukaPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')

  // Csak a soft-delete támogató táblák jelennek meg a Kukában
  const softDeleteTables: TableRegistryEntry[] = TABLE_REGISTRY.filter(
    t => t.softDelete,
  )

  // 2026-08-14 (6. pont, BLOKKOLÓ-javítás): CSAK sima adat mehet át a
  // Server→Client határon. Korábban itt egy labelBuilder FÜGGVÉNY is átment,
  // amitől az oldal minden betöltésnél kivétellel elszállt („Functions cannot
  // be passed directly to Client Components"). A címkézőt a RecycleBinView
  // állítja elő kliens-oldalon a tábla nevéből.
  const tables = softDeleteTables.map(t => ({
    dexieTable: t.dexieTable,
    label: `${MODULE_META[t.module].label} · ${t.label}`,
  }))

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Kuka"
        title="Törölt rekordok visszaállítása"
        description="Itt találod a legutóbb törölt rekordokat. 30 napon belül bármelyiket visszaállíthatod — utána a szerver automatikusan véglegesen törli őket. A kuka csak azokat a modulokat mutatja, amelyek soft-delete-et használnak."
        pills={[
          { label: 'Fázis 5 — Új', tone: 'amber' },
          { label: `${softDeleteTables.length} tábla`, tone: 'neutral' },
        ]}
      />

      <RecycleBinViewClient
        tables={tables}
        congregationId={access.effectiveCongregationId}
        backHref="/"
        backLabel="Kezdőoldal"
        moduleLabel="Minden modul"
      />
    </div>
  )
}
