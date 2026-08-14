import { KifizetetlenMain } from '@/components/dokumentumtar/kifizetetlen-main'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * Kifizetetlen számlák (7. pont C szelet, 2026-08-15).
 *
 * Két forrás egyesítve: a feltöltött szállítói számlák (szallitoi_szamla,
 * kifizetve=false) + az Oblio API collected=0 listája (ha van beállított
 * Oblio-kapcsolat). A hozzáférés-ellenőrzés a dokumentumtar/page.tsx mintáját
 * követi: gyülekezeti scope nélkül tájékoztató jelenik meg a néma üres oldal
 * helyett (fail-closed).
 */
export default async function KifizetetlenSzamlakPage() {
  const access = await getEffectiveAccessContext()
  const { user, effectiveCongregationId, congregationName } = access
  if (!user) return null
  if (!effectiveCongregationId) {
    const scope = access.activeProfileRole?.scope === 'diocese' ? 'diocese'
      : access.activeProfileRole?.scope === 'district' ? 'district'
      : (access.admin || access.master) ? 'admin' : 'other'
    return <CongregationOnlyNotice module="A Kifizetetlen számlák ablak" currentScope={scope} />
  }

  return (
    <div className="space-y-4">
      <KifizetetlenMain
        congregationName={congregationName || ''}
        congregationId={effectiveCongregationId}
      />
    </div>
  )
}
