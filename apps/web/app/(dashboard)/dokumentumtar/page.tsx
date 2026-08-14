import { DokumentumtarMain } from '@/components/dokumentumtar/dokumentumtar-main'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * Dokumentumtár — gyülekezeti fájl-terület (7. pont A szelet, 2026-08-15).
 *
 * Endre döntése: a fájlok a MEGLÉVŐ tárolón (Supabase Storage) élnek,
 * gyülekezet-ID-hez kötött útvonalakkal ('gyulekezeti-dokumentumok' privát
 * bucket) — a korábbi Google Drive-os ötletet ez váltja.
 *
 * A hozzáférés-ellenőrzés a leltar/page.tsx mintáját követi: gyülekezeti
 * scope nélkül (admin/esperesi/kerületi profil) tájékoztató jelenik meg a
 * néma üres oldal helyett (fail-closed).
 */
export default async function DokumentumtarPage() {
  const access = await getEffectiveAccessContext()
  const { user, effectiveCongregationId, congregationName } = access
  if (!user) return null
  if (!effectiveCongregationId) {
    const scope = access.activeProfileRole?.scope === 'diocese' ? 'diocese'
      : access.activeProfileRole?.scope === 'district' ? 'district'
      : (access.admin || access.master) ? 'admin' : 'other'
    return <CongregationOnlyNotice module="A Dokumentumtár modul" currentScope={scope} />
  }

  return (
    <div className="space-y-4">
      <DokumentumtarMain congregationName={congregationName || ''} />
    </div>
  )
}
