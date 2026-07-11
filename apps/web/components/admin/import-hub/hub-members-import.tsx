'use client'

/**
 * Import-hub — Tagnyilvántartás modul (2026-07-11).
 *
 * A vezetett tagnyilvántartás-varázslót (`TagnyilvantartasImportWizard`) tölti be
 * lustán (`ssr:false`), admin módban, a hub által kiválasztott cél-gyülekezetre
 * szűkítve. A varázsló saját, több-lépéses folyamattal (fájl → oszlopok → helységek →
 * előnézet → eredmény → családok) dolgozik, és a `targetCongregationId`-t maga adja
 * át a szerver-actionnek — a jogosultság + hatókör szerver oldalon ellenőrzött.
 */

import dynamic from 'next/dynamic'

import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'

const TagnyilvantartasImportWizard = dynamic(
  () =>
    import('@/components/members/tagnyilvantartas-import-wizard').then(
      (m) => m.TagnyilvantartasImportWizard,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <AdminSkeleton rows={4} />
      </div>
    ),
  },
)

export function HubMembersImport({
  congregationId,
  congregationName,
}: {
  congregationId: string
  congregationName: string
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
        A vezetett tagnyilvántartás-import a lenti <span className="font-semibold text-foreground">Cél gyülekezet</span>{' '}
        választóban erősítsd meg a(z){' '}
        <span className="font-semibold text-foreground">{congregationName}</span> gyülekezetet, majd töltsd fel a fájlt.
      </div>
      <TagnyilvantartasImportWizard
        mode="admin"
        adminCongregations={[{ id: congregationId, name: congregationName }]}
      />
    </div>
  )
}
