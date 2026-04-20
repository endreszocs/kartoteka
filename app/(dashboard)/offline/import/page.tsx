import { redirect } from 'next/navigation'

import { ModuleHero } from '@/components/shared/module-hero'
import { ExcelImportReviewClient } from '@/components/offline/excel-import-review-client'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * Congregation nev → slug (fájlrendszer-biztonságos).
 * Megegyezik a /offline oldalon használttal.
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

export default async function ExcelImportPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')

  const congregationSlug = slugify(
    access.congregationName || access.effectiveCongregationId || 'ismeretlen',
  )

  return (
    <div className="space-y-5">
      <ModuleHero
        eyebrow="Offline mentés · Excel import"
        title="Excel változások áttekintése"
        description="Ha kézzel módosítottál az Excel fájlokban, itt átnézheted mit olvasott ki a rendszer, és eldöntheted, melyik változást fogadod el. A rendszer SEMMIT nem alkalmaz, amíg te nem erősíted meg."
        pills={[{ label: 'Fázis 4 ✅', tone: 'violet' }]}
      />

      <ExcelImportReviewClient
        congregationId={access.effectiveCongregationId}
        congregationSlug={congregationSlug}
      />
    </div>
  )
}
