import { FileLock2 } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdatvedelemPanel } from '@/components/admin/adatvedelem/adatvedelem-panel'

/**
 * Adatvédelmi napló admin-aloldal (2026-08-23).
 *
 * KÉT bizonyíték egy helyen:
 *
 *  1. ÉRINTETTI KÉRELMEK. Az Adatvédelmi tájékoztató EGY HÓNAPOS határidőt
 *     ígér a hozzáférési, helyesbítési, törlési, korlátozási, tiltakozási,
 *     adathordozhatósági és hozzájárulás-visszavonási kérelmekre. A GDPR
 *     5(2) cikke ELSZÁMOLTATHATÓSÁGOT követel: bizonyítani kell tudni, hogy
 *     teljesítettük. Eddig sem felület, sem napló, sem határidő-követés nem
 *     volt — a határidő így senkinek nem „ketyegett" láthatóan.
 *
 *  2. ÁSZF-ELFOGADÁSOK. Az ÁSZF 13. pontja szerint „a további használat
 *     elfogadásnak minősül" — ezt is igazolni kell tudni: ki, mikor, MELYIK
 *     verziót.
 *
 * ⚠️ EZ AZ OLDAL ELŐBB MENT ÉLESBE, MINT A HOZZÁ TARTOZÓ SQL. Ha a
 * `migration-docs/sql/2026-08-23-adatvedelmi-kerelmek.sql` még nem futott le,
 * a felület NYUGODT MAGYAR MAGYARÁZATOT ír ki (42P01 → „ez a napló még nincs
 * bekapcsolva"), és NEM fest piros hibaoldalt.
 *
 * A jogosultságot az admin layout (kerületi ÍRÓ kapu) + a szerver-akciók
 * kettős, fail-closed ellenőrzése kezeli. A kerületi szint SZÁNDÉKOSAN nem lát
 * gyülekezeti sorokat (2026-08-16, K4 döntés) — a felület ezt ki is írja.
 */
export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Adatvédelmi napló"
        description="Érintetti kérelmek határidő-követéssel és ÁSZF-elfogadások — a GDPR elszámoltathatósági kötelezettségének bizonyítéka egy helyen."
        icon={FileLock2}
      />
      <div className="card-raised p-4 sm:p-5">
        <AdatvedelemPanel />
      </div>
    </>
  )
}
