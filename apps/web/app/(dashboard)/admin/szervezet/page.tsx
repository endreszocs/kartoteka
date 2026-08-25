import { Network } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { SzervezetiFa } from '@/components/admin/szervezet/szervezeti-fa'

/**
 * SZERVEZETI ÁTTEKINTŐ — /admin/szervezet (2026-08-22, 7. pont).
 *
 * Az első felület, amely a szervezet MINDHÁROM szintjét együtt mutatja
 * (egyházkerület → egyházmegye → egyházközség). Eddig az admin Gyülekezetek
 * oldala két szintig jutott, az /admin Áttekintés egyházmegye-bontása pedig
 * kerület-vak volt — így két egyházkerület 24 egyházmegyéje egyetlen,
 * rendezetlen listában olvadt össze.
 *
 * JOGOSULTSÁG: az /admin layout közös kapuja (master / teljes admin / kerületi
 * admin). A SZŰKÍTÉST a `getSzervezetiFa()` szerver-akció végzi, fail-closed —
 * a kerületi admin a saját kerülete fáját látja, beállítás-hiányok nélkül (K4).
 *
 * SQL: az alap-fa meglévő táblákból és RPC-kből jön. A 2026-08-25-ös
 * gyülekezeti-egységek réteg (típus-jelvény, anya–leány kötés, egységek,
 * lelkész-nevek) a `gyulekezeti_hierarchia()` RPC-re épül — amíg a
 * 2026-08-25-gyulekezeti-egysegek.sql migráció nem fut le, a fa e mezők
 * nélkül működik, és ezt sávban jelzi (nem némán).
 */
export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Szervezeti áttekintő"
        description="Egyházkerület → egyházmegye → egyházközség egy képernyőn: hány egyházmegye, hány gyülekezet, hány tag és hány felhasználó tartozik az egyes szintekhez — a gyülekezetek hivatalos szervezeti formája (anya, leány, missziói) és az anya–leány kapcsolatok is itt kezelhetők."
        icon={Network}
      />
      <div className="card-raised p-4 sm:p-5">
        <SzervezetiFa />
      </div>
    </>
  )
}
