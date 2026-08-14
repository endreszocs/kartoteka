import { SzamlakEgyeztetesTabs } from '@/components/dokumentumtar/szamlak-egyeztetese-tabs'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * Számlák egyeztetése — hub-oldal (Endre 2026-08-15).
 *
 * Endre kérésére a korábbi „Dokumentumtár" oldal „Számlák egyeztetése" néven
 * hárompilléres hub lett: (a) Oblio egyeztetés (a megszokott, sablonos
 * Oblio-feltöltő felület, ami eddig a /penzugy modáljában élt), (b) a
 * gyülekezeti Dokumentumtár, (c) a Kifizetetlen számlák nézet. Felül
 * visszalépő gomb a Pénzügyhöz.
 *
 * A fájlok továbbra is a MEGLÉVŐ tárolón (Supabase Storage) élnek,
 * gyülekezet-ID-hez kötött útvonalakkal ('gyulekezeti-dokumentumok' privát
 * bucket).
 *
 * A hozzáférés-ellenőrzés a leltar/page.tsx mintáját követi: gyülekezeti
 * scope nélkül (admin/esperesi/kerületi profil) tájékoztató jelenik meg a
 * néma üres oldal helyett (fail-closed). Diocese-hatókörben az
 * effectiveCongregationId mindig null (effective-access.ts), így az egész
 * oldal rejtve marad — ahogy a /penzugy Oblio-gombja is rejtve volt ott.
 */
export default async function DokumentumtarPage() {
  const access = await getEffectiveAccessContext()
  const { user, effectiveCongregationId, congregationName } = access
  if (!user) return null
  if (!effectiveCongregationId) {
    const scope = access.activeProfileRole?.scope === 'diocese' ? 'diocese'
      : access.activeProfileRole?.scope === 'district' ? 'district'
      : (access.admin || access.master) ? 'admin' : 'other'
    return <CongregationOnlyNotice module="A Számlák egyeztetése modul" currentScope={scope} />
  }

  return (
    <div className="space-y-4">
      <SzamlakEgyeztetesTabs
        congregationName={congregationName || ''}
        congregationId={effectiveCongregationId}
        // Az Oblio-egyeztetés éve itt a folyó naptári év — a /penzugy oldali
        // év-választó erre az oldalra nem terjed ki (ha visszamenőleges év
        // kell, az Endre jelezni fogja; a fül belső év-kezelése a meglévő
        // OblioEllenorzesTab-é).
        currentYear={new Date().getFullYear()}
      />
    </div>
  )
}
